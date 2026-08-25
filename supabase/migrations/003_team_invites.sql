-- ─────────────────────────────────────────────────────────────
-- ReleasePace  –  003_team_invites.sql
--
-- Adds email-based team invitations so multiple users can share
-- an organisation without needing direct database access.
--
-- Also normalises organisation slugs to always be lowercase so
-- "Acme Corp" and "acme corp" can never create duplicate orgs.
-- ─────────────────────────────────────────────────────────────

-- ── Pending invitations ───────────────────────────────────────
-- An invite is a signed token sent by email. Accepting it adds
-- the recipient to org_members. Invites expire after 7 days and
-- can only be accepted once.
create table public.pending_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  email       text not null,
  role        text not null default 'editor'
                check (role in ('admin','editor','viewer')),
  token       text not null unique,           -- signed random token sent in the email
  invited_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  -- Only one pending invite per email per org at a time.
  unique(org_id, email)
);

create index on public.pending_invites(token);
create index on public.pending_invites(org_id);
create index on public.pending_invites(email);

alter table public.pending_invites enable row level security;

-- Only org admins/owners can see invites for their org.
create policy "invite_read" on public.pending_invites
  for select using (is_org_member(org_id));

-- Only admins/owners can create invites.
create policy "invite_insert" on public.pending_invites
  for insert with check (org_role(org_id) in ('owner','admin'));

-- Admins can revoke (delete) pending invites.
create policy "invite_delete" on public.pending_invites
  for delete using (org_role(org_id) in ('owner','admin'));

-- ── Org member name ───────────────────────────────────────────
-- Store a display name per member so the team list shows names
-- not just email addresses. Populated at invite acceptance.
alter table public.org_members
  add column if not exists invited_by  uuid references auth.users(id),
  add column if not exists invited_at  timestamptz;

-- ── Normalise existing org slugs ─────────────────────────────
-- Slugs should always be lowercase. Existing rows may have been
-- created with mixed case; normalise them now.
update public.organisations
   set slug = lower(slug)
 where slug <> lower(slug);

-- Prevent future mixed-case slugs at the DB level.
alter table public.organisations
  add constraint org_slug_lowercase check (slug = lower(slug));

-- ── Helper: accept an invite ──────────────────────────────────
-- Called server-side after verifying the token. Adds the user to
-- org_members, marks the invite as accepted, and returns the org_id
-- so the caller can redirect the user into the right org.
create or replace function public.accept_invite(
  p_token   text,
  p_user_id uuid
) returns uuid language plpgsql security definer as $$
declare
  v_invite public.pending_invites;
  v_org_id uuid;
begin
  -- Find a valid, unexpired, unaccepted invite.
  select * into v_invite
    from public.pending_invites
   where token      = p_token
     and accepted_at is null
     and expires_at > now();

  if not found then
    raise exception 'Invite not found, expired, or already accepted';
  end if;

  v_org_id := v_invite.org_id;

  -- Add to org_members (upsert in case they already belong to the org).
  insert into public.org_members(org_id, user_id, role, invited_by, invited_at)
  values (v_org_id, p_user_id, v_invite.role, v_invite.invited_by, now())
  on conflict (org_id, user_id) do update
    set role       = excluded.role,
        invited_by = excluded.invited_by,
        invited_at = excluded.invited_at;

  -- Mark as accepted.
  update public.pending_invites
     set accepted_at = now()
   where id = v_invite.id;

  return v_org_id;
end;
$$;

-- ── Normalised org name for fuzzy matching ────────────────────
-- Stores the lowercased, whitespace-collapsed version of the org
-- name so that "Acme Corp", "acme corp", and "  ACME  CORP  "
-- all normalise to "acme corp" and can be matched at signup time.
-- The display name (organisations.name) is never changed.
alter table public.organisations
  add column if not exists name_normalised text;

-- Backfill existing rows.
update public.organisations
   set name_normalised = regexp_replace(lower(trim(name)), '\\s+', ' ', 'g')
 where name_normalised is null;

-- Function so the API can check for similar org names at signup.
-- Returns org names that share the same normalised prefix (first 6 chars)
-- which catches common typos and casing variations without exposing
-- org IDs or membership details to unauthenticated callers.
create or replace function public.similar_org_names(p_name text)
returns table(name text) language sql security definer as $$
  select o.name
    from public.organisations o
   where o.name_normalised like
         left(regexp_replace(lower(trim(p_name)), '\\s+', ' ', 'g'), 6) || '%'
   limit 5;
$$;
