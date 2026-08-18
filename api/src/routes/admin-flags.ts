import { SupabaseClient } from "@supabase/supabase-js";
import { KeyContext } from "../lib/auth";
import { json, err, paginate } from "../lib/response";

const WRITE_ROLES = ["owner", "admin", "editor"];

export async function handleAdminFlags(
  request: Request,
  supabase: SupabaseClient,
  ctx: KeyContext,
  corsHeaders: HeadersInit
): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.replace("/api/admin/flags", "").split("/").filter(Boolean);
  const flagId = parts[0];
  const sub = parts[1]; // e.g. "state"
  const method = request.method;

  // ── GET /api/admin/flags ────────────────────────────────────
  if (!flagId && method === "GET") {
    const { from, to } = paginate(url);
    const env = url.searchParams.get("environment");
    const archived = url.searchParams.get("archived") === "true";
    const search = url.searchParams.get("q");

    let query = supabase
      .from("flags")
      .select(`*, flag_states(enabled, value, rollout_pct, environment_id, environments(slug, color))`, { count: "exact" })
      .eq("org_id", ctx.orgId)
      .eq("archived", archived)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) query = query.ilike("name", `%${search}%`);

    const { data, error, count } = await query;
    if (error) return err(error.message, 500, corsHeaders);
    return json({ flags: data, total: count }, 200, corsHeaders);
  }

  // ── POST /api/admin/flags ───────────────────────────────────
  if (!flagId && method === "POST") {
    if (!WRITE_ROLES.includes(ctx.role ?? "")) return err("Forbidden", 403, corsHeaders);
    const body = await request.json() as any;
    const { key, name, description, type, tags } = body;

    if (!key || !name) return err("key and name are required", 400, corsHeaders);
    if (!/^[a-z0-9-]+$/.test(key)) return err("key must be lowercase letters, numbers, hyphens", 400, corsHeaders);

    // Create flag
    const { data: flag, error: flagErr } = await supabase
      .from("flags")
      .insert({ org_id: ctx.orgId, key, name, description, type: type || "boolean", tags: tags || [], created_by: ctx.userId })
      .select()
      .single();

    if (flagErr) return err(flagErr.message, 400, corsHeaders);

    // Create default state for all environments
    const { data: envs } = await supabase
      .from("environments")
      .select("id")
      .eq("org_id", ctx.orgId);

    if (envs?.length) {
      const states = envs.map((e: any) => ({
        flag_id: flag.id,
        environment_id: e.id,
        org_id: ctx.orgId,
        enabled: false,
        value: null,
      }));
      await supabase.from("flag_states").insert(states);
    }

    await writeAudit(supabase, ctx, flag.id, null, "flag.created", null, flag);
    return json(flag, 201, corsHeaders);
  }

  // ── GET /api/admin/flags/:id ────────────────────────────────
  if (flagId && !sub && method === "GET") {
    const { data, error } = await supabase
      .from("flags")
      .select(`*, flag_states(*, environments(id, slug, name, color))`)
      .eq("id", flagId)
      .eq("org_id", ctx.orgId)
      .single();
    if (error) return err("Flag not found", 404, corsHeaders);
    return json(data, 200, corsHeaders);
  }

  // ── PATCH /api/admin/flags/:id ──────────────────────────────
  if (flagId && !sub && method === "PATCH") {
    if (!WRITE_ROLES.includes(ctx.role ?? "")) return err("Forbidden", 403, corsHeaders);
    const body = await request.json() as any;
    const allowed = ["name", "description", "tags", "archived"];
    const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

    const { data: old } = await supabase.from("flags").select().eq("id", flagId).eq("org_id", ctx.orgId).single();
    const { data, error } = await supabase.from("flags").update(update).eq("id", flagId).eq("org_id", ctx.orgId).select().single();
    if (error) return err(error.message, 400, corsHeaders);

    await writeAudit(supabase, ctx, flagId, null, "flag.updated", old, data);
    return json(data, 200, corsHeaders);
  }

  // ── PUT /api/admin/flags/:id/state ─────────────────────────
  // Update enabled/value/rollout for a specific environment
  if (flagId && sub === "state" && method === "PUT") {
    if (!WRITE_ROLES.includes(ctx.role ?? "")) return err("Forbidden", 403, corsHeaders);
    const body = await request.json() as any;
    const { environment_id, enabled, value, rollout_pct, strategies } = body;
    if (!environment_id) return err("environment_id required", 400, corsHeaders);

    const update: any = { updated_by: ctx.userId, updated_at: new Date().toISOString() };
    if (enabled !== undefined) update.enabled = enabled;
    if (value !== undefined) update.value = value;
    if (rollout_pct !== undefined) update.rollout_pct = rollout_pct;
    if (strategies !== undefined) update.strategies = strategies;

    const { data: old } = await supabase.from("flag_states")
      .select().eq("flag_id", flagId).eq("environment_id", environment_id).single();

    const { data, error } = await supabase.from("flag_states")
      .update(update)
      .eq("flag_id", flagId)
      .eq("environment_id", environment_id)
      .eq("org_id", ctx.orgId)
      .select().single();

    if (error) return err(error.message, 400, corsHeaders);

    await writeAudit(supabase, ctx, flagId, environment_id, "flag.state.updated", old, data);
    return json(data, 200, corsHeaders);
  }

  // ── DELETE /api/admin/flags/:id ─────────────────────────────
  if (flagId && !sub && method === "DELETE") {
    if (!["owner", "admin"].includes(ctx.role ?? "")) return err("Forbidden", 403, corsHeaders);
    const { error } = await supabase.from("flags").update({ archived: true }).eq("id", flagId).eq("org_id", ctx.orgId);
    if (error) return err(error.message, 400, corsHeaders);
    await writeAudit(supabase, ctx, flagId, null, "flag.archived", null, null);
    return json({ archived: true }, 200, corsHeaders);
  }

  return err("Not found", 404, corsHeaders);
}

async function writeAudit(
  supabase: SupabaseClient,
  ctx: KeyContext,
  flagId: string | null,
  environmentId: string | null,
  action: string,
  oldValue: any,
  newValue: any
) {
  await supabase.from("audit_log").insert({
    org_id: ctx.orgId,
    flag_id: flagId,
    environment_id: environmentId,
    action,
    actor_id: ctx.userId,
    actor_email: ctx.userEmail,
    old_value: oldValue,
    new_value: newValue,
  });
}
