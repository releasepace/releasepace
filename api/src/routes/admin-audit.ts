import { SupabaseClient } from "@supabase/supabase-js";
import { KeyContext } from "../lib/auth";
import { json, err, paginate } from "../lib/response";

export async function handleAdminAudit(
  request: Request,
  supabase: SupabaseClient,
  ctx: KeyContext,
  corsHeaders: HeadersInit
): Promise<Response> {
  if (request.method !== "GET") return err("Method not allowed", 405, corsHeaders);

  const url = new URL(request.url);
  const { from, to } = paginate(url);
  const flagId = url.searchParams.get("flag_id");
  const envId  = url.searchParams.get("environment_id");

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (flagId) query = query.eq("flag_id", flagId);
  if (envId)  query = query.eq("environment_id", envId);

  const { data, error, count } = await query;
  if (error) return err(error.message, 500, corsHeaders);
  return json({ entries: data, total: count }, 200, corsHeaders);
}
