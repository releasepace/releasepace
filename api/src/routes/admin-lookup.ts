import { SupabaseClient } from "@supabase/supabase-js";
import { KeyContext } from "../lib/auth";
import { json, err } from "../lib/response";
import { bucketOf } from "../lib/bucketing";
import {
  evaluate,
  EvalContext,
  FlagStateInput,
  SegmentIndex,
  TargetingRule,
  BucketBy,
} from "../lib/evaluate";

/**
 * POST /api/admin/lookup
 *
 * "Why can't Acme see the new report builder?"
 *
 * Evaluates every flag in one environment for a given context and
 * returns the decision plus the reason behind it. This is the screen a
 * support engineer opens when a customer reports a missing feature —
 * without it, answering the question means reading rule JSON by hand.
 *
 * Body: { environment_id?: string, context: { tenantId?, userId?, ... } }
 */

interface LookupFlag {
  key: string;
  name: string;
  type: string;
  enabled: boolean;
  value: unknown;
  reason: string;
  rule_id?: string;
  rule_description?: string;
  /** Populated only when a rollout actually decided the outcome. */
  rollout_pct?: number | null;
  bucket_by?: BucketBy | null;
  bucket?: number;
}

export async function handleAdminLookup(
  request: Request,
  supabase: SupabaseClient,
  ctx: KeyContext,
  corsHeaders: HeadersInit
): Promise<Response> {
  if (request.method !== "POST") return err("Not found", 404, corsHeaders);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body", 400, corsHeaders);
  }

  const evalContext: EvalContext = body?.context ?? {};
  if (typeof evalContext !== "object" || Array.isArray(evalContext)) {
    return err("context must be an object", 400, corsHeaders);
  }
  if (!Object.values(evalContext).some((v) => typeof v === "string" && v.trim())) {
    return err("Provide at least one context attribute, such as tenantId", 400, corsHeaders);
  }

  // ── Environment ──────────────────────────────────────────────
  let environment: { id: string; slug: string; name: string } | null = null;

  if (body?.environment_id) {
    const { data } = await supabase
      .from("environments")
      .select("id, slug, name")
      .eq("id", body.environment_id)
      .eq("org_id", ctx.orgId)
      .single();
    environment = data ?? null;
  } else {
    const { data } = await supabase
      .from("environments")
      .select("id, slug, name")
      .eq("org_id", ctx.orgId)
      .eq("protected", true)
      .limit(1)
      .single();
    environment = data ?? null;

    if (!environment) {
      const { data: fallback } = await supabase
        .from("environments")
        .select("id, slug, name")
        .eq("org_id", ctx.orgId)
        .limit(1)
        .single();
      environment = fallback ?? null;
    }
  }

  if (!environment) return err("Environment not found", 404, corsHeaders);

  // ── Flags + state ────────────────────────────────────────────
  const { data: rows, error } = await supabase
    .from("flags")
    .select(
      `key, name, type,
       flag_states!inner(enabled, value, rollout_pct, bucket_by, targeting_rules, environment_id)`
    )
    .eq("org_id", ctx.orgId)
    .eq("archived", false)
    .eq("flag_states.environment_id", environment.id)
    .order("key");

  if (error) return err(error.message, 500, corsHeaders);

  const states: FlagStateInput[] = (rows ?? []).map((row: any) => {
    const s = Array.isArray(row.flag_states) ? row.flag_states[0] : row.flag_states;
    return {
      key: row.key,
      type: row.type,
      enabled: s?.enabled ?? false,
      value: s?.value ?? null,
      rollout_pct: s?.rollout_pct ?? null,
      bucket_by: s?.bucket_by ?? null,
      targeting_rules: (s?.targeting_rules ?? []) as TargetingRule[],
    };
  });

  // ── Segments ─────────────────────────────────────────────────
  // Unlike the SDK path this loads every segment in the org, because
  // we also want to report which ones this entity belongs to — that
  // is often the answer on its own ("Acme was never added").
  const { data: segmentRows } = await supabase
    .from("segments")
    .select("key, name, segment_members(entity_key)")
    .eq("org_id", ctx.orgId);

  const segmentIndex: SegmentIndex = {};
  const memberOf: { key: string; name: string }[] = [];

  for (const seg of (segmentRows ?? []) as any[]) {
    const keys = new Set<string>(
      (seg.segment_members ?? []).map((m: any) => m.entity_key as string)
    );
    segmentIndex[seg.key] = keys;

    const tenantId = evalContext.tenantId?.trim();
    if (tenantId && keys.has(tenantId)) {
      memberOf.push({ key: seg.key, name: seg.name });
    }
  }

  // ── Evaluate ─────────────────────────────────────────────────
  const nameByKey = new Map((rows ?? []).map((r: any) => [r.key, r.name as string]));

  const flags: LookupFlag[] = states.map((state) => {
    const result = evaluate(state, evalContext, segmentIndex);
    const matched = state.targeting_rules?.find((r) => r.id === result.rule_id);

    const out: LookupFlag = {
      key: state.key,
      name: nameByKey.get(state.key) ?? state.key,
      type: state.type,
      enabled: result.enabled,
      value: result.value,
      reason: result.reason,
      rule_id: result.rule_id,
      rule_description: matched?.description,
    };

    // Show the arithmetic when a rollout is what decided it. "Acme is
    // bucket 96 and the rollout is 20" ends the conversation; "the
    // rollout excluded them" starts another one.
    const rolloutDecided =
      result.reason === "DEFAULT_ROLLOUT_INCLUDED" ||
      result.reason === "DEFAULT_ROLLOUT_EXCLUDED" ||
      result.reason === "TARGETING_MATCH_ROLLOUT_EXCLUDED" ||
      (result.reason === "TARGETING_MATCH" && matched?.rollout_pct != null);

    if (rolloutDecided) {
      const bucketBy = matched?.bucket_by ?? state.bucket_by ?? "userId";
      const entityId =
        bucketBy === "tenantId" ? evalContext.tenantId?.trim() : evalContext.userId?.trim();

      out.rollout_pct = matched?.rollout_pct ?? state.rollout_pct;
      out.bucket_by = bucketBy;
      if (entityId) out.bucket = bucketOf(state.key, entityId);
    }

    if (result.reason === "MISSING_BUCKET_ATTRIBUTE") {
      out.bucket_by = result.missing_attribute as BucketBy;
      out.rollout_pct = state.rollout_pct;
    }

    return out;
  });

  return json(
    {
      environment,
      context: evalContext,
      segments: memberOf,
      flags,
    },
    200,
    corsHeaders
  );
}
