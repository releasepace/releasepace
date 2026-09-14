-- Browser SDKs can evaluate only flags explicitly marked safe for clients.
alter table public.flags
  add column client_side boolean not null default false;
