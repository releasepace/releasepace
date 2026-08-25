import { SupabaseClient } from "@supabase/supabase-js";
import { KeyContext } from "../lib/auth";
import { json, err } from "../lib/response";
import { evaluate, EvalContext, FlagStateInput, TargetingRule } from "../lib/evaluate";

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
    if (ctx.environmentId) {
      const { data: scopedEnvironment } = await supabase
        .from("environments")
        .select("slug")
        .eq("id", ctx.environmentId)
        .single();
      if (!scopedEnvironment || scopedEnvironment.slug !== envSlug) {
        return err("SDK key is not authorized for this environment", 403, corsHeaders);
      }
    }

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
    .select(
      `key, name, type, description,
       flag_states!inner(
         enabled, value, rollout_pct, bucket_by, targeting_rules, strategies, environment_id
       )`
    )
    .eq("org_id", ctx.orgId)
    .eq("archived", false)
    .eq("flag_states.environment_id", environmentId);

  if (specificKeys?.length) query = query.in("key", specificKeys);

  const { data: flags, error } = await query;
  if (error) return err(error.message, 500, corsHeaders);

  const features = (flags ?? []).map((f: any) => {
    const s = Array.isArray(f.flag_states) ? f.flag_states[0] : f.flag_states;
    return {
      key: f.key,
      name: f.name,
      type: f.type,
      description: f.description,
      enabled: s?.enabled ?? false,
      value: s?.value ?? null,
      rollout_pct: s?.rollout_pct ?? null,
      bucket_by: s?.bucket_by ?? null,
      targeting_rules: s?.targeting_rules ?? [],
      strategies: s?.strategies ?? [],
    };
  });

  return json(
    { version: 2, environment: environmentSlug, features },
    200,
    { ...corsHeaders, "Cache-Control": "no-store", "X-ReleasePace-Environment": environmentSlug }
  );
}

/**
 * POST /api/client/evaluate
 *
 * Evaluates every flag server-side for a given context. Useful for
 * lightweight clients, CI scripts, or any caller without a local SDK.
 *
 * Body: { environment?: string, keys?: string[], context: { tenantId?, userId?, ... } }
 */
export async function handleClientEvaluate(
  request: Request,
  supabase: SupabaseClient,
  ctx: KeyContext,
  corsHeaders: HeadersInit
): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body", 400, corsHeaders);
  }

  const evalContext: EvalContext = body?.context ?? {};
  if (typeof evalContext !== "object" || Array.isArray(evalContext))
    return err("context must be an object", 400, corsHeaders);

  let environmentId = ctx.environmentId;
  let environmentSlug = "";

  if (body?.environment) {
    const { data: env } = await supabase
      .from("environments")
      .select("id, slug")
      .eq("org_id", ctx.orgId)
      .eq("slug", body.environment)
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

  let query = supabase
    .from("flags")
    .select(
      `key, type,
       flag_states!inner(
         enabled, value, rollout_pct, bucket_by, targeting_rules, environment_id
       )`
    )
    .eq("org_id", ctx.orgId)
    .eq("archived", false)
    .eq("flag_states.environment_id", environmentId);

  if (Array.isArray(body?.keys) && body.keys.length) query = query.in("key", body.keys);

  const { data: flags, error } = await query;
  if (error) return err(error.message, 500, corsHeaders);

  const states: FlagStateInput[] = (flags ?? []).map((f: any) => {
    const s = Array.isArray(f.flag_states) ? f.flag_states[0] : f.flag_states;
    return {
      key: f.key,
      type: f.type,
      enabled: s?.enabled ?? false,
      value: s?.value ?? null,
      rollout_pct: s?.rollout_pct ?? null,
      bucket_by: s?.bucket_by ?? null,
      targeting_rules: (s?.targeting_rules ?? []) as TargetingRule[],
    };
  });

  // Load only segments referenced by the rules in play
  const referencedSegments = new Set<string>();
  for (const state of states) {
    for (const rule of state.targeting_rules ?? []) {
      for (const cond of (rule as any).conditions ?? []) {
        if ((cond.op === "in_segment" || cond.op === "not_in_segment") && cond.value)
          referencedSegments.add(cond.value);
      }
    }
  }

  const segmentIndex: Record<string, Set<string>> = {};
  if (referencedSegments.size > 0) {
    const { data: segs } = await supabase
      .from("segments")
      .select("key, segment_members(entity_key)")
      .eq("org_id", ctx.orgId)
      .in("key", [...referencedSegments]);
    for (const seg of (segs ?? []) as any[]) {
      segmentIndex[seg.key] = new Set(
        (seg.segment_members ?? []).map((m: any) => m.entity_key as string)
      );
    }
  }

  const features = states.map((s) => {
    const r = evaluate(s, evalContext, segmentIndex);
    return { key: r.key, enabled: r.enabled, value: r.value, reason: r.reason };
  });

  const missingAttrs = [
    ...new Set(
      features
        .filter((f) => f.reason === "MISSING_BUCKET_ATTRIBUTE")
        .map((f: any) => f.missing_attribute)
        .filter(Boolean)
    ),
  ];

  return json(
    {
      version: 2,
      environment: environmentSlug,
      features,
      ...(missingAttrs.length
        ? { warnings: missingAttrs.map((attr) => ({
              code: "MISSING_BUCKET_ATTRIBUTE",
              message: `Some flags bucket by "${attr}" but no "${attr}" was provided in context. Those flags served off.`,
            })) }
        : {}),
    },
    200,
    { ...corsHeaders, "Cache-Control": "no-store" }
  );
}
