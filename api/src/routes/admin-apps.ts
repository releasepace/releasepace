import { SupabaseClient } from "@supabase/supabase-js";
import { KeyContext } from "../lib/auth";
import { json, err } from "../lib/response";

const WRITE_ROLES = ["owner", "admin", "editor"];

export async function handleAdminApps(request: Request, supabase: SupabaseClient, ctx: KeyContext, corsHeaders: HeadersInit) {
  const id = new URL(request.url).pathname.split("/").filter(Boolean).pop();

  if (request.method === "GET") {
    const { data, error } = await supabase.from("apps").select("*").eq("org_id", ctx.orgId).order("name");
    if (error) return err(error.message, 500, corsHeaders);
    return json(data ?? [], 200, corsHeaders);
  }

  if (!WRITE_ROLES.includes(ctx.role ?? "")) return err("Forbidden", 403, corsHeaders);
  if (request.method === "POST") {
    const body = await request.json() as { name?: string };
    const name = body.name?.trim();
    if (!name) return err("name is required", 400, corsHeaders);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return err("name must contain letters or numbers", 400, corsHeaders);
    const { data, error } = await supabase.from("apps").insert({ org_id: ctx.orgId, name, slug }).select().single();
    if (error) return err(error.message, 400, corsHeaders);
    return json(data, 201, corsHeaders);
  }

  if (request.method === "PATCH" && id) {
    const body = await request.json() as { name?: string };
    const name = body.name?.trim();
    if (!name) return err("name is required", 400, corsHeaders);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data, error } = await supabase.from("apps").update({ name, slug }).eq("id", id).eq("org_id", ctx.orgId).select().single();
    if (error) return err(error.message, 400, corsHeaders);
    return json(data, 200, corsHeaders);
  }

  if (request.method === "DELETE" && id) {
    const { count, error: countError } = await supabase
      .from("flags")
      .select("id", { count: "exact", head: true })
      .eq("app_id", id)
      .eq("archived", false)
      .eq("org_id", ctx.orgId);
    if (countError) return err(countError.message, 500, corsHeaders);
    if ((count ?? 0) > 0) {
      return err("Cannot delete an app with active flags. Move or archive its flags first.", 409, corsHeaders);
    }

    const { error } = await supabase.from("apps").delete().eq("id", id).eq("org_id", ctx.orgId);
    if (error) return err(error.message, 400, corsHeaders);
    return json({ deleted: true }, 200, corsHeaders);
  }

  return err("Not found", 404, corsHeaders);
}
