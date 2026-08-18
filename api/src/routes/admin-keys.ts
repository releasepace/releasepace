import { SupabaseClient } from "@supabase/supabase-js";
import { KeyContext } from "../lib/auth";
import { json, err } from "../lib/response";
import { generateApiKey, hashKey } from "../lib/auth";

export async function handleAdminKeys(
  request: Request,
  supabase: SupabaseClient,
  ctx: KeyContext,
  corsHeaders: HeadersInit
): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.replace("/api/admin/keys", "").split("/").filter(Boolean);
  const keyId = parts[0];
  const method = request.method;

  if (!keyId && method === "GET") {
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, type, environment_id, last_used_at, expires_at, created_at, environments(slug)")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false });
    if (error) return err(error.message, 500, corsHeaders);
    return json(data, 200, corsHeaders);
  }

  if (!keyId && method === "POST") {
    if (!["owner", "admin"].includes(ctx.role ?? "")) return err("Forbidden", 403, corsHeaders);
    const body = await request.json() as any;
    const { name, type, environment_id, expires_at } = body;
    if (!name || !type) return err("name and type required", 400, corsHeaders);

    const rawKey = generateApiKey(type, environment_id || "");
    const keyHash = await hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 14) + "…";

    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        org_id: ctx.orgId,
        name,
        type,
        environment_id: environment_id || null,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        expires_at: expires_at || null,
        created_by: ctx.userId,
      })
      .select().single();

    if (error) return err(error.message, 400, corsHeaders);
    // Return the raw key ONCE – it's never stored
    return json({ ...data, raw_key: rawKey }, 201, corsHeaders);
  }

  if (keyId && method === "DELETE") {
    if (!["owner", "admin"].includes(ctx.role ?? "")) return err("Forbidden", 403, corsHeaders);
    await supabase.from("api_keys").delete().eq("id", keyId).eq("org_id", ctx.orgId);
    return json({ deleted: true }, 200, corsHeaders);
  }

  return err("Not found", 404, corsHeaders);
}
