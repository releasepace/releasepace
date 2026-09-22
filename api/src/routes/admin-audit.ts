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

  const flagIds = [...new Set((data ?? []).map((entry: any) => entry.flag_id).filter(Boolean))];
  const appNameByFlagId = new Map<string, string>();
  if (flagIds.length) {
    const { data: flags, error: flagError } = await supabase
      .from("flags")
      .select("id, app_id")
      .eq("org_id", ctx.orgId)
      .in("id", flagIds);
    if (flagError) return err(flagError.message, 500, corsHeaders);
    const appIds = [...new Set((flags ?? []).map((flag: any) => flag.app_id).filter(Boolean))];
    if (appIds.length) {
      const { data: apps, error: appError } = await supabase
        .from("apps")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .in("id", appIds);
      if (appError) return err(appError.message, 500, corsHeaders);
      const appNames = new Map((apps ?? []).map((app: any) => [app.id, app.name]));
      for (const flag of flags ?? []) {
        const name = appNames.get(flag.app_id);
        if (name) appNameByFlagId.set(flag.id, name);
      }
    }
  }

  const entries = (data ?? []).map((entry: any) => ({
    ...entry,
    app_name: entry.flag_id ? appNameByFlagId.get(entry.flag_id) ?? null : null,
  }));
  return json({ entries, total: count }, 200, corsHeaders);
}
