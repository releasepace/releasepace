import { SupabaseClient } from "@supabase/supabase-js";
import { KeyContext } from "../lib/auth";
import { json, err } from "../lib/response";

/**
 * GET /api/client/features
 *
 * The single endpoint all SDKs (JS, Python, Java, Go, etc.) call.
 * Returns all non-archived flags for this org+environment with their
 * current enabled state and value.
 *
 * Supports:
 *   ?environment=production   (override env from API key)
 *   ?keys=flag-a,flag-b       (fetch only specific flags)
 *
 * Response shape (v1):
 * {
 *   "version": 1,
 *   "environment": "production",
 *   "features": [
 *     { "key": "my-flag", "enabled": true, "value": null, "type": "boolean", "rollout_pct": null, "strategies": [] },
 *     { "key": "banner-text", "enabled": true, "value": "Hello!", "type": "string", ... }
 *   ]
 * }
 */
export async function handleClientFeatures(
  request: Request,
  supabase: SupabaseClient,
  ctx: KeyContext,
  corsHeaders: HeadersInit
): Promise<Response> {
  const url = new URL(request.url);
  const envSlug = url.searchParams.get("environment");
  const keysParam = url.searchParams.get("keys");
  const specificKeys = keysParam ? keysParam.split(",").map((k) => k.trim()) : null;

  // Resolve environment
  let environmentId = ctx.environmentId;
  let environmentSlug = "";

  if (envSlug) {
    const { data: env } = await supabase
      .from("environments")
      .select("id, slug")
      .eq("org_id", ctx.orgId)
      .eq("slug", envSlug)
      .single();
    if (!env) return err("Environment not found", 404, corsHeaders);
    environmentId = env.id;
    environmentSlug = env.slug;
  } else if (environmentId) {
    const { data: env } = await supabase
      .from("environments")
      .select("slug")
      .eq("id", environmentId)
      .single();
    environmentSlug = env?.slug ?? "";
  } else {
    // Default to first environment (production if exists)
    const { data: env } = await supabase
      .from("environments")
      .select("id, slug")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!env) return err("No environments found", 404, corsHeaders);
    environmentId = env.id;
    environmentSlug = env.slug;
  }

  // Fetch flags with their state for this environment
  let query = supabase
    .from("flags")
    .select(`
      key, name, type, description,
      flag_states!inner(
        enabled, value, rollout_pct, strategies, environment_id
      )
    `)
    .eq("org_id", ctx.orgId)
    .eq("archived", false)
    .eq("flag_states.environment_id", environmentId);

  if (specificKeys?.length) {
    query = query.in("key", specificKeys);
  }

  const { data: flags, error } = await query;
  if (error) return err(error.message, 500, corsHeaders);

  const features = (flags ?? []).map((f: any) => {
    const state = Array.isArray(f.flag_states) ? f.flag_states[0] : f.flag_states;
    return {
      key: f.key,
      name: f.name,
      type: f.type,
      description: f.description,
      enabled: state?.enabled ?? false,
      value: state?.value ?? null,
      rollout_pct: state?.rollout_pct ?? null,
      strategies: state?.strategies ?? [],
    };
  });

  return json(
    { version: 1, environment: environmentSlug, features },
    200,
    {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "X-ReleasePace-Environment": environmentSlug,
    }
  );
}
