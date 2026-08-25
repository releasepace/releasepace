-- ─────────────────────────────────────────────────────────────
-- ReleasePace  –  002_targeting_and_bucketing.sql
--
-- Adds a third targeting axis: flag x environment x entity attributes.
-- Lets a flag be turned on for specific tenants (the customer's own
-- customers) without creating one ReleasePace org per tenant.
--
-- Also makes bucketing explicit: a partial rollout cannot be saved
-- without stating whether the percentage counts users or tenants.
-- ─────────────────────────────────────────────────────────────

-- ── Segments ─────────────────────────────────────────────────
-- A named, reusable audience. Two flavours, freely combined:
--   * rule-based   – attributes evaluated at request time
--   * explicit     – a hand-picked list in segment_members
create table public.segments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  key         text not null,
  name        text not null,
  description text,
  rules       jsonb not null default '[]',
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(org_id, key),
  constraint segment_key_format check (key ~ '^[a-z0-9-]+$')
);

-- ── Explicit segment membership ──────────────────────────────
-- entity_key is the customer's own identifier for one of their
-- tenants. ReleasePace never interprets it, only matches on it.
create table public.segment_members (
  segment_id  uuid not null references public.segments(id) on delete cascade,
  entity_key  text not null,
  label       text,
  added_by    uuid references auth.users(id),
  added_at    timestamptz not null default now(),
  primary key (segment_id, entity_key)
);

-- ── Targeting + bucketing on per-environment flag state ──────
alter table public.flag_states
  add column targeting_rules jsonb not null default '[]';

-- Deliberately nullable with no default. NULL means "nobody has
-- been asked yet" — an honest absence rather than a guess that
-- later reads as a decision the user made.
alter table public.flag_states
  add column bucket_by text
  check (bucket_by in ('userId', 'tenantId'));

-- Backfill BEFORE the constraint below — adding a CHECK validates
-- every existing row immediately, so any live partial rollout with a
-- NULL bucket_by would abort the migration.
--
-- These rows were bucketed by userId, because that is the only
-- behaviour the SDKs ever implemented. Recording it explicitly keeps
-- the hash input identical and stops in-flight rollouts reshuffling.
update public.flag_states
   set bucket_by = 'userId'
 where rollout_pct is not null
   and rollout_pct not in (0, 100)
   and bucket_by is null;

-- A rollout of exactly 0 or 100 never reaches the hash, so it does
-- not need a bucketing choice. Anything in between does.
alter table public.flag_states
  add constraint rollout_requires_bucket_by check (
    rollout_pct is null
    or rollout_pct in (0, 100)
    or bucket_by is not null
  );

-- ── Indexes ──────────────────────────────────────────────────
create index on public.segments(org_id);
create index on public.segment_members(segment_id);
-- Reverse lookup: "which segments is tenant acme-corp in?"
create index on public.segment_members(entity_key);

-- ── updated_at trigger ───────────────────────────────────────
create trigger segments_updated_at before update on public.segments
  for each row execute function public.set_updated_at();

-- ── Row Level Security ───────────────────────────────────────
alter table public.segments        enable row level security;
alter table public.segment_members enable row level security;

create policy "segment_read"  on public.segments
  for select using (is_org_member(org_id));
create policy "segment_write" on public.segments
  for all using (org_role(org_id) in ('owner','admin','editor'));

-- Membership inherits its parent segment's org.
create policy "segment_member_read" on public.segment_members
  for select using (exists (
    select 1 from public.segments s
    where s.id = segment_id and is_org_member(s.org_id)
  ));
create policy "segment_member_write" on public.segment_members
  for all using (exists (
    select 1 from public.segments s
    where s.id = segment_id
      and org_role(s.org_id) in ('owner','admin','editor')
  ));
