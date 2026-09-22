-- Organise flags by product/application within an organisation.
create table public.apps (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  name        text not null,
  slug        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(org_id, name),
  unique(org_id, slug)
);

alter table public.flags add column app_id uuid references public.apps(id) on delete set null;
create index on public.apps(org_id, name);
create index on public.flags(org_id, app_id) where archived = false;

create trigger apps_updated_at before update on public.apps
  for each row execute function public.set_updated_at();

alter table public.apps enable row level security;
alter table public.apps force row level security;
create policy "app_read" on public.apps for select using (is_org_member(org_id));
create policy "app_write" on public.apps for insert with check (org_role(org_id) in ('owner','admin','editor'));
create policy "app_update" on public.apps for update using (org_role(org_id) in ('owner','admin','editor'));
create policy "app_delete" on public.apps for delete using (org_role(org_id) in ('owner','admin'));
