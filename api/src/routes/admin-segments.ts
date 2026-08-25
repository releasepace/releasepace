import { SupabaseClient } from "@supabase/supabase-js";
import { KeyContext } from "../lib/auth";
import { json, err } from "../lib/response";

/**
 * Segments — named, reusable audiences.
 *
 *   GET    /api/admin/segments
 *   POST   /api/admin/segments
 *   GET    /api/admin/segments/:id
 *   PATCH  /api/admin/segments/:id
 *   DELETE /api/admin/segments/:id
 *   GET    /api/admin/segments/:id/members
 *   POST   /api/admin/segments/:id/members    { entity_keys: [...] }
 *   DELETE /api/admin/segments/:id/members    { entity_keys: [...] }
 */

const WRITE_ROLES = ["owner", "admin", "editor"];
const MAX_BULK_MEMBERS = 5000;

export async function handleAdminSegments(
  request: Request,
  supabase: SupabaseClient,
  ctx: KeyContext,
  corsHeaders: HeadersInit
): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname
    .replace("/api/admin/segments", "")
    .split("/")
    .filter(Boolean);
  const segmentId = parts[0];
  const sub = parts[1];
  const method = request.method;

  const canWrite = WRITE_ROLES.includes(ctx.role ?? "");

  // ── GET /api/admin/segments ─────────────────────────────────
  if (!segmentId && method === "GET") {
    const { data, error } = await supabase
      .from("segments")
      .select("*, segment_members(count)")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false });

    if (error) return err(error.message, 500, corsHeaders);

    const segments = (data ?? []).map((s: any) => ({
      ...s,
      member_count: s.segment_members?.[0]?.count ?? 0,
      segment_members: undefined,
    }));
    return json({ segments }, 200, corsHeaders);
  }

  // ── POST /api/admin/segments ────────────────────────────────
  if (!segmentId && method === "POST") {
    if (!canWrite) return err("Forbidden", 403, corsHeaders);
    const body = (await request.json()) as any;
    const { key, name, description, rules, entity_keys } = body;

    if (!key || !name) return err("key and name are required", 400, corsHeaders);
    if (!/^[a-z0-9-]+$/.test(key)) {
      return err("key must be lowercase letters, numbers, hyphens", 400, corsHeaders);
    }

    const { data: segment, error } = await supabase
      .from("segments")
      .insert({
        org_id: ctx.orgId,
        key,
        name,
        description,
        rules: rules ?? [],
        created_by: ctx.userId,
      })
      .select()
      .single();

    if (error) return err(error.message, 400, corsHeaders);

    // Optional members supplied at creation time.
    if (Array.isArray(entity_keys) && entity_keys.length) {
      const cleaned = normaliseKeys(entity_keys);
      if (cleaned.length) {
        await supabase.from("segment_members").insert(
          cleaned.map((k) => ({
            segment_id: segment.id,
            entity_key: k,
            added_by: ctx.userId,
          }))
        );
      }
    }

    await writeAudit(supabase, ctx, "segment.created", null, segment);
    return json(segment, 201, corsHeaders);
  }

  // ── GET /api/admin/segments/:id ─────────────────────────────
  if (segmentId && !sub && method === "GET") {
    const { data, error } = await supabase
      .from("segments")
      .select("*, segment_members(entity_key, label, added_at)")
      .eq("id", segmentId)
      .eq("org_id", ctx.orgId)
      .single();
    if (error) return err("Segment not found", 404, corsHeaders);
    return json(data, 200, corsHeaders);
  }

  // ── PATCH /api/admin/segments/:id ───────────────────────────
  if (segmentId && !sub && method === "PATCH") {
    if (!canWrite) return err("Forbidden", 403, corsHeaders);
    const body = (await request.json()) as any;
    const allowed = ["name", "description", "rules"];
    const update = Object.fromEntries(
      Object.entries(body).filter(([k]) => allowed.includes(k))
    );

    const { data: old } = await supabase
      .from("segments")
      .select()
      .eq("id", segmentId)
      .eq("org_id", ctx.orgId)
      .single();

    const { data, error } = await supabase
      .from("segments")
      .update(update)
      .eq("id", segmentId)
      .eq("org_id", ctx.orgId)
      .select()
      .single();

    if (error) return err(error.message, 400, corsHeaders);
    await writeAudit(supabase, ctx, "segment.updated", old, data);
    return json(data, 200, corsHeaders);
  }

  // ── DELETE /api/admin/segments/:id ──────────────────────────
  if (segmentId && !sub && method === "DELETE") {
    if (!["owner", "admin"].includes(ctx.role ?? "")) {
      return err("Forbidden", 403, corsHeaders);
    }

    // A segment referenced by a live rule cannot be deleted — doing so
    // would silently change who sees a flag. Name the flags instead so
    // the user knows exactly what to unpick.
    const referencing = await flagsReferencingSegment(supabase, ctx.orgId, segmentId);
    if (referencing.length) {
      return err(
        `Segment is used by targeting rules on: ${referencing.join(", ")}. Remove those rules first.`,
        409,
        corsHeaders
      );
    }

    const { data: old } = await supabase
      .from("segments")
      .select()
      .eq("id", segmentId)
      .eq("org_id", ctx.orgId)
      .single();

    const { error } = await supabase
      .from("segments")
      .delete()
      .eq("id", segmentId)
      .eq("org_id", ctx.orgId);

    if (error) return err(error.message, 400, corsHeaders);
    await writeAudit(supabase, ctx, "segment.deleted", old, null);
    return json({ deleted: true }, 200, corsHeaders);
  }

  // ── GET /api/admin/segments/:id/members ─────────────────────
  if (segmentId && sub === "members" && method === "GET") {
    const owned = await assertOwned(supabase, ctx.orgId, segmentId);
    if (!owned) return err("Segment not found", 404, corsHeaders);

    const { data, error } = await supabase
      .from("segment_members")
      .select("entity_key, label, added_at")
      .eq("segment_id", segmentId)
      .order("added_at", { ascending: false });

    if (error) return err(error.message, 500, corsHeaders);
    return json({ members: data ?? [] }, 200, corsHeaders);
  }

  // ── POST /api/admin/segments/:id/members ────────────────────
  if (segmentId && sub === "members" && method === "POST") {
    if (!canWrite) return err("Forbidden", 403, corsHeaders);
    const owned = await assertOwned(supabase, ctx.orgId, segmentId);
    if (!owned) return err("Segment not found", 404, corsHeaders);

    const body = (await request.json()) as any;
    const keys = normaliseKeys(body?.entity_keys ?? []);
    if (!keys.length) return err("entity_keys must be a non-empty array", 400, corsHeaders);
    if (keys.length > MAX_BULK_MEMBERS) {
      return err(`Add at most ${MAX_BULK_MEMBERS} members per request`, 400, corsHeaders);
    }

    const { error } = await supabase.from("segment_members").upsert(
      keys.map((k) => ({
        segment_id: segmentId,
        entity_key: k,
        added_by: ctx.userId,
      })),
      { onConflict: "segment_id,entity_key", ignoreDuplicates: true }
    );

    if (error) return err(error.message, 400, corsHeaders);

    // Audit the tenant keys themselves — "who turned this on for Acme
    // and when" has to be answerable months later.
    await writeAudit(supabase, ctx, "segment.members.added", null, {
      segment_id: segmentId,
      entity_keys: keys,
    });
    return json({ added: keys.length }, 200, corsHeaders);
  }

  // ── DELETE /api/admin/segments/:id/members ──────────────────
  if (segmentId && sub === "members" && method === "DELETE") {
    if (!canWrite) return err("Forbidden", 403, corsHeaders);
    const owned = await assertOwned(supabase, ctx.orgId, segmentId);
    if (!owned) return err("Segment not found", 404, corsHeaders);

    const body = (await request.json()) as any;
    const keys = normaliseKeys(body?.entity_keys ?? []);
    if (!keys.length) return err("entity_keys must be a non-empty array", 400, corsHeaders);

    const { error } = await supabase
      .from("segment_members")
      .delete()
      .eq("segment_id", segmentId)
      .in("entity_key", keys);

    if (error) return err(error.message, 400, corsHeaders);

    await writeAudit(supabase, ctx, "segment.members.removed", { entity_keys: keys }, null);
    return json({ removed: keys.length }, 200, corsHeaders);
  }

  return err("Not found", 404, corsHeaders);
}

/** Trim, drop blanks, de-duplicate. */
function normaliseKeys(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const k = raw.trim();
    if (k) seen.add(k);
  }
  return [...seen];
}

async function assertOwned(
  supabase: SupabaseClient,
  orgId: string,
  segmentId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("segments")
    .select("id")
    .eq("id", segmentId)
    .eq("org_id", orgId)
    .single();
  return !!data;
}

/** Flag keys whose targeting rules reference this segment. */
async function flagsReferencingSegment(
  supabase: SupabaseClient,
  orgId: string,
  segmentId: string
): Promise<string[]> {
  const { data: segment } = await supabase
    .from("segments")
    .select("key")
    .eq("id", segmentId)
    .eq("org_id", orgId)
    .single();
  if (!segment) return [];

  const { data: states } = await supabase
    .from("flag_states")
    .select("targeting_rules, flags(key)")
    .eq("org_id", orgId);

  const hits = new Set<string>();
  for (const row of (states ?? []) as any[]) {
    const rules = row.targeting_rules ?? [];
    const referenced = rules.some((r: any) =>
      (r.conditions ?? []).some(
        (c: any) =>
          (c.op === "in_segment" || c.op === "not_in_segment") &&
          c.value === segment.key
      )
    );
    if (referenced && row.flags?.key) hits.add(row.flags.key);
  }
  return [...hits];
}

async function writeAudit(
  supabase: SupabaseClient,
  ctx: KeyContext,
  action: string,
  oldValue: unknown,
  newValue: unknown
) {
  await supabase.from("audit_log").insert({
    org_id: ctx.orgId,
    action,
    actor_id: ctx.userId,
    actor_email: ctx.userEmail,
    old_value: oldValue,
    new_value: newValue,
  });
}
