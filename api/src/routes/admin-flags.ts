import { SupabaseClient } from "@supabase/supabase-js";
import { KeyContext } from "../lib/auth";
import { json, err, paginate } from "../lib/response";

const WRITE_ROLES = ["owner", "admin", "editor"];
const BUCKET_BY_VALUES = ["userId", "tenantId"];
const VALID_OPERATORS = [
  "in", "not_in", "in_segment", "not_in_segment",
  "equals", "contains", "starts_with", "semver_gte",
];
const MAX_RULES_PER_STATE = 50;

/** Returns an error message, or null when the rules are well-formed. */
function validateTargetingRules(rules: unknown): string | null {
  if (!Array.isArray(rules)) return "targeting_rules must be an array";
  if (rules.length > MAX_RULES_PER_STATE) {
    return `At most ${MAX_RULES_PER_STATE} targeting rules per environment`;
  }

  const seenIds = new Set<string>();

  for (const [i, rule] of rules.entries()) {
    const at = `Rule ${i + 1}`;
    if (!rule || typeof rule !== "object") return `${at} must be an object`;

    const r = rule as any;
    if (!r.id || typeof r.id !== "string") return `${at} is missing an id`;
    // Rule order is meaningful and ids identify a rule in the audit
    // log, so duplicates would make "which rule matched" unanswerable.
    if (seenIds.has(r.id)) return `${at} reuses id "${r.id}"`;
    seenIds.add(r.id);

    if (!Array.isArray(r.conditions) || r.conditions.length === 0) {
      return `${at} needs at least one condition`;
    }
    if (!r.serve || typeof r.serve.enabled !== "boolean") {
      return `${at} must serve an explicit enabled value`;
    }

    for (const cond of r.conditions) {
      if (!cond?.attribute || typeof cond.attribute !== "string") {
        return `${at} has a condition with no attribute`;
      }
      if (!VALID_OPERATORS.includes(cond.op)) {
        return `${at} uses unknown operator "${cond.op}"`;
      }
      if (cond.op === "in" || cond.op === "not_in") {
        if (!Array.isArray(cond.values) || cond.values.length === 0) {
          return `${at}: "${cond.op}" needs a non-empty values array`;
        }
      } else if (typeof cond.value !== "string" || !cond.value) {
        return `${at}: "${cond.op}" needs a value`;
      }
    }

    if (r.rollout_pct !== undefined && r.rollout_pct !== null) {
      const pct = r.rollout_pct;
      if (typeof pct !== "number" || pct < 0 || pct > 100) {
        return `${at} has an invalid rollout_pct`;
      }
      // Same rule as the flag default: a partial rollout inside a rule
      // still has to say what it counts.
      const bucketBy = r.bucket_by ?? null;
      if (pct > 0 && pct < 100 && !bucketBy) {
        return `${at} has a partial rollout and needs a bucket_by of userId or tenantId`;
      }
      if (bucketBy && !BUCKET_BY_VALUES.includes(bucketBy)) {
        return `${at} has an invalid bucket_by`;
      }
    }
  }
  return null;
}

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
    const { environment_id, enabled, value, rollout_pct, strategies, bucket_by, targeting_rules } = body;
    if (!environment_id) return err("environment_id required", 400, corsHeaders);

    const { data: old } = await supabase.from("flag_states")
      .select().eq("flag_id", flagId).eq("environment_id", environment_id).single();

    if (!old) return err("Flag state not found for this environment", 404, corsHeaders);

    if (bucket_by !== undefined && bucket_by !== null && !BUCKET_BY_VALUES.includes(bucket_by)) {
      return err(`bucket_by must be one of: ${BUCKET_BY_VALUES.join(", ")}`, 400, corsHeaders);
    }

    if (targeting_rules !== undefined) {
      const problem = validateTargetingRules(targeting_rules);
      if (problem) return err(problem, 400, corsHeaders);
    }

    // A partial rollout has to say what the percentage counts. The DB
    // enforces this too, but catching it here returns a message a
    // person can act on instead of a raw constraint violation.
    const nextRollout = rollout_pct !== undefined ? rollout_pct : old.rollout_pct;
    const nextBucketBy = bucket_by !== undefined ? bucket_by : old.bucket_by;
    const isPartial =
      nextRollout !== null && nextRollout !== undefined && nextRollout > 0 && nextRollout < 100;

    if (isPartial && !nextBucketBy) {
      return err(
        "bucket_by is required for a partial rollout. Send 'userId' to roll out to a percentage of users, or 'tenantId' for a percentage of organisations.",
        400,
        corsHeaders
      );
    }

    const update: any = { updated_by: ctx.userId, updated_at: new Date().toISOString() };
    if (enabled !== undefined) update.enabled = enabled;
    if (value !== undefined) update.value = value;
    if (rollout_pct !== undefined) update.rollout_pct = rollout_pct;
    if (strategies !== undefined) update.strategies = strategies;
    if (bucket_by !== undefined) update.bucket_by = bucket_by;
    if (targeting_rules !== undefined) update.targeting_rules = targeting_rules;

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
