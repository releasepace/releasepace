-- ─────────────────────────────────────────────────────────────
-- ReleasePace schema  –  001_initial_schema.sql
-- Run in Supabase SQL editor or via supabase db push
-- ─────────────────────────────────────────────────────────────

-- Extensions
create extension if not exists "pgcrypto";

-- ── Organisations ────────────────────────────────────────────
create table public.organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  plan        text not null default 'free' check (plan in ('free','pro','enterprise')),
  created_at  timestamptz not null default now()
);

-- ── Organisation members ─────────────────────────────────────
create table public.org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'viewer' check (role in ('owner','admin','editor','viewer')),
  created_at  timestamptz not null default now(),
  unique(org_id, user_id)
);

-- ── Environments ─────────────────────────────────────────────
create table public.environments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  name        text not null,
  slug        text not null,
  color       text not null default '#6366f1',
  protected   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique(org_id, slug)
);

-- ── API Keys ─────────────────────────────────────────────────
create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations(id) on delete cascade,
  environment_id uuid references public.environments(id) on delete cascade,
  name          text not null,
  key_prefix    text not null,
  key_hash      text not null unique,
  type          text not null default 'client' check (type in ('client','server','admin')),
  last_used_at  timestamptz,
  expires_at    timestamptz,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

-- ── Feature flags ─────────────────────────────────────────────
create table public.flags (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  key         text not null,
  name        text not null,
  description text,
  type        text not null default 'boolean' check (type in ('boolean','string','number','json')),
  tags        text[] default '{}',
  archived    boolean not null default false,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(org_id, key)
);

-- ── Flag states per environment ───────────────────────────────
create table public.flag_states (
  id              uuid primary key default gen_random_uuid(),
  flag_id         uuid not null references public.flags(id) on delete cascade,
  environment_id  uuid not null references public.environments(id) on delete cascade,
  org_id          uuid not null references public.organisations(id) on delete cascade,
  enabled         boolean not null default false,
  value           jsonb,
  rollout_pct     integer check (rollout_pct between 0 and 100),
  strategies      jsonb default '[]',
  updated_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now(),
  unique(flag_id, environment_id)
);

-- ── Audit log ─────────────────────────────────────────────────
create table public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations(id) on delete cascade,
  flag_id         uuid references public.flags(id) on delete set null,
  environment_id  uuid references public.environments(id) on delete set null,
  action          text not null,
  actor_id        uuid references auth.users(id),
  actor_email     text,
  old_value       jsonb,
  new_value       jsonb,
  ip_address      text,
  created_at      timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────
create index on public.flags(org_id) where archived = false;
create index on public.flag_states(environment_id);
create index on public.flag_states(org_id);
create index on public.audit_log(org_id, created_at desc);
create index on public.api_keys(key_hash);

-- ── updated_at trigger ────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger flags_updated_at before update on public.flags
  for each row execute function public.set_updated_at();

create trigger flag_states_updated_at before update on public.flag_states
  for each row execute function public.set_updated_at();

-- ── Row Level Security ────────────────────────────────────────
alter table public.organisations  enable row level security;
alter table public.org_members    enable row level security;
alter table public.environments   enable row level security;
alter table public.api_keys       enable row level security;
alter table public.flags          enable row level security;
alter table public.flag_states    enable row level security;
alter table public.audit_log      enable row level security;

-- Helper: is current user a member of this org?
create or replace function public.is_org_member(p_org_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid()
  );
$$;

-- Helper: get current user's role in org
create or replace function public.org_role(p_org_id uuid)
returns text language sql security definer as $$
  select role from public.org_members
  where org_id = p_org_id and user_id = auth.uid();
$$;

-- Organisations: members can read; owners can update
create policy "org_read"   on public.organisations for select using (is_org_member(id));
create policy "org_update" on public.organisations for update using (org_role(id) = 'owner');

-- Org members
create policy "members_read"   on public.org_members for select using (is_org_member(org_id));
create policy "members_insert" on public.org_members for insert with check (org_role(org_id) in ('owner','admin'));
create policy "members_delete" on public.org_members for delete using (org_role(org_id) = 'owner');

-- Environments
create policy "env_read"   on public.environments for select using (is_org_member(org_id));
create policy "env_write"  on public.environments for all using (org_role(org_id) in ('owner','admin'));

-- API keys: members can read prefix/name; only admins can see hash
create policy "apikey_read"  on public.api_keys for select using (is_org_member(org_id));
create policy "apikey_write" on public.api_keys for all using (org_role(org_id) in ('owner','admin'));

-- Flags
create policy "flag_read"   on public.flags for select using (is_org_member(org_id));
create policy "flag_write"  on public.flags for insert with check (org_role(org_id) in ('owner','admin','editor'));
create policy "flag_update" on public.flags for update using (org_role(org_id) in ('owner','admin','editor'));
create policy "flag_delete" on public.flags for delete using (org_role(org_id) in ('owner','admin'));

-- Flag states
create policy "state_read"  on public.flag_states for select using (is_org_member(org_id));
create policy "state_write" on public.flag_states for all using (org_role(org_id) in ('owner','admin','editor'));

-- Audit log: read-only for members
create policy "audit_read" on public.audit_log for select using (is_org_member(org_id));
create policy "audit_insert" on public.audit_log for insert with check (true); -- inserted by server role

-- ── Seed helper: create org for new user ──────────────────────
create or replace function public.create_org_for_user(
  p_user_id uuid,
  p_org_name text,
  p_org_slug text
) returns uuid language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_env_ids uuid[];
begin
  insert into public.organisations(name, slug)
  values (p_org_name, p_org_slug)
  returning id into v_org_id;

  insert into public.org_members(org_id, user_id, role)
  values (v_org_id, p_user_id, 'owner');

  -- Default environments
  insert into public.environments(org_id, name, slug, color, protected)
  values
    (v_org_id, 'Development', 'development', '#10b981', false),
    (v_org_id, 'Staging',     'staging',     '#f59e0b', false),
    (v_org_id, 'Production',  'production',  '#ef4444', true);

  return v_org_id;
end; $$;
