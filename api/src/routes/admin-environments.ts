import { SupabaseClient } from "@supabase/supabase-js";
import { KeyContext } from "../lib/auth";
import { json, err } from "../lib/response";

export async function handleAdminEnvironments(
  request: Request,
  supabase: SupabaseClient,
  ctx: KeyContext,
  corsHeaders: HeadersInit
): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.replace("/api/admin/environments", "").split("/").filter(Boolean);
  const envId = parts[0];
  const method = request.method;

  if (!envId && method === "GET") {
    const { data, error } = await supabase
      .from("environments")
      .select("*")
      .eq("org_id", ctx.orgId)
      .order("created_at");
    if (error) return err(error.message, 500, corsHeaders);
    return json(data, 200, corsHeaders);
  }

  if (!envId && method === "POST") {
    if (!["owner", "admin"].includes(ctx.role ?? "")) return err("Forbidden", 403, corsHeaders);
    const body = await request.json() as any;
    const { name, slug, color } = body;
    if (!name || !slug) return err("name and slug required", 400, corsHeaders);
    if (!/^[a-z0-9-]+$/.test(slug)) return err("slug must be lowercase letters, numbers, hyphens", 400, corsHeaders);

    const { data, error } = await supabase
      .from("environments")
      .insert({ org_id: ctx.orgId, name, slug, color: color || "#6366f1" })
      .select().single();
    if (error) return err(error.message, 400, corsHeaders);

    // Create default flag states for all existing flags in this new environment
    const { data: flags } = await supabase.from("flags").select("id").eq("org_id", ctx.orgId).eq("archived", false);
    if (flags?.length) {
      const states = flags.map((f: any) => ({
        flag_id: f.id, environment_id: data.id, org_id: ctx.orgId, enabled: false,
      }));
      await supabase.from("flag_states").insert(states);
    }

    return json(data, 201, corsHeaders);
  }

  if (envId && method === "PATCH") {
    if (!["owner", "admin"].includes(ctx.role ?? "")) return err("Forbidden", 403, corsHeaders);
    const body = await request.json() as any;
    const { data, error } = await supabase
      .from("environments")
      .update({ name: body.name, color: body.color })
      .eq("id", envId).eq("org_id", ctx.orgId).select().single();
    if (error) return err(error.message, 400, corsHeaders);
    return json(data, 200, corsHeaders);
  }

  if (envId && method === "DELETE") {
    if (ctx.role !== "owner") return err("Only owners can delete environments", 403, corsHeaders);
    const { data: env } = await supabase.from("environments").select("protected").eq("id", envId).single();
    if (env?.protected) return err("Cannot delete a protected environment", 400, corsHeaders);
    await supabase.from("environments").delete().eq("id", envId).eq("org_id", ctx.orgId);
    return json({ deleted: true }, 200, corsHeaders);
  }

  return err("Not found", 404, corsHeaders);
}
