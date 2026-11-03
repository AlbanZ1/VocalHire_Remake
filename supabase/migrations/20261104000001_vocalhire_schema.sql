-- VocalHire schema
-- Profiles, organisations, interview campaigns, interview sessions, turns and integrity events.
-- Security model:
--   * Browsers use the publishable key + the user's JWT; RLS limits them to their own data
--     (candidates) or their organisation's data (business members).
--   * ALL interview writes (sessions, turns, scores, events) go through the `interview` edge
--     function using the service role, so nobody can write their own scores via the REST API.
--   * Anonymous candidates never touch tables directly; they hold a per-session secret token that
--     the edge function verifies (only its SHA-256 hash is stored).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------
create type public.account_type as enum ('candidate', 'business');
create type public.org_role as enum ('owner', 'admin', 'member');
create type public.session_mode as enum ('practice', 'business');
create type public.session_status as enum ('created', 'in_progress', 'completed', 'abandoned');
create type public.campaign_status as enum ('draft', 'active', 'closed');
create type public.review_status as enum ('new', 'shortlisted', 'advanced', 'rejected', 'hired');

-- ---------------------------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  account_type public.account_type not null default 'candidate',
  target_role text check (char_length(target_role) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Organisations
-- ---------------------------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- ---------------------------------------------------------------------------------------------
-- Campaigns (a job position a business interviews applicants for)
-- ---------------------------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  department text check (char_length(department) <= 120),
  location text check (char_length(location) <= 120),
  description text check (char_length(description) <= 6000),
  seniority text not null default 'mid',
  competencies text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  status public.campaign_status not null default 'active',
  public_token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  closes_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_org_idx on public.campaigns (org_id);

-- ---------------------------------------------------------------------------------------------
-- Interview sessions
-- ---------------------------------------------------------------------------------------------
create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  mode public.session_mode not null,
  user_id uuid references auth.users (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete cascade,
  candidate_name text check (char_length(candidate_name) <= 120),
  candidate_email text check (char_length(candidate_email) <= 254),
  role_title text not null check (char_length(role_title) <= 120),
  config jsonb not null,
  plan jsonb,
  state jsonb,
  status public.session_status not null default 'created',
  engine text,
  started_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz,
  overall_score numeric(5, 2),
  starr_scores jsonb,
  competency_scores jsonb,
  integrity_score numeric(5, 2),
  integrity_level text,
  recommendation text,
  report jsonb,
  review_status public.review_status not null default 'new',
  reviewer_notes text check (char_length(reviewer_notes) <= 5000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint business_sessions_have_org check (mode = 'practice' or (org_id is not null and campaign_id is not null))
);
create index interview_sessions_user_idx on public.interview_sessions (user_id, created_at desc);
create index interview_sessions_campaign_idx on public.interview_sessions (campaign_id, created_at desc);
create index interview_sessions_org_idx on public.interview_sessions (org_id);

-- Secrets for token-based (guest / applicant) access. No RLS policies → service role only.
create table public.interview_session_secrets (
  session_id uuid primary key references public.interview_sessions (id) on delete cascade,
  access_token_hash text not null,
  client_ip_hash text,
  created_at timestamptz not null default now()
);
create index interview_session_secrets_ip_idx on public.interview_session_secrets (client_ip_hash, created_at desc);

create table public.interview_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  seq integer not null,
  kind text not null check (kind in ('intro', 'main', 'follow_up')),
  parent_seq integer,
  competency text,
  question text not null,
  preface text,
  asked_at timestamptz not null default now(),
  answer text,
  answer_mode text check (answer_mode in ('voice', 'text')),
  answered_at timestamptz,
  metrics jsonb,
  analysis jsonb,
  score numeric(5, 2),
  flags text[] not null default '{}',
  unique (session_id, seq)
);

create table public.integrity_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  turn_seq integer,
  type text not null check (char_length(type) <= 40),
  severity smallint not null default 1 check (severity between 1 and 3),
  detail jsonb not null default '{}'::jsonb,
  client_ts timestamptz,
  created_at timestamptz not null default now()
);
create index integrity_events_session_idx on public.integrity_events (session_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- New user → profile
-- ---------------------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, account_type)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    case when new.raw_user_meta_data ->> 'account_type' = 'business'
      then 'business'::public.account_type else 'candidate'::public.account_type end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Membership helpers (security definer so RLS policies don't recurse)
-- ---------------------------------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_view_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.interview_sessions s
    where s.id = p_session
      and (
        s.user_id = (select auth.uid())
        or (s.org_id is not null and public.is_org_member(s.org_id))
      )
  );
$$;

-- Create an organisation and make the caller its owner, atomically.
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select count(*) into v_count from public.organization_members where user_id = v_uid and role = 'owner';
  if v_count >= 5 then
    raise exception 'organisation limit reached' using errcode = '54000';
  end if;
  insert into public.organizations (name, created_by) values (trim(p_name), v_uid) returning id into v_org;
  insert into public.organization_members (org_id, user_id, role) values (v_org, v_uid, 'owner');
  update public.profiles set account_type = 'business' where id = v_uid;
  return v_org;
end;
$$;

-- Add an existing VocalHire user to an organisation by email (admins only).
create or replace function public.add_org_member(p_org uuid, p_email text, p_role public.org_role default 'member')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'cannot grant owner' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    raise exception 'no VocalHire account with that email' using errcode = 'P0002';
  end if;
  insert into public.organization_members (org_id, user_id, role)
  values (p_org, v_user, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role;
  return v_user;
end;
$$;

-- List members with their emails/names (members only).
create or replace function public.list_org_members(p_org uuid)
returns table (user_id uuid, email text, full_name text, role public.org_role, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, p.full_name, m.role, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.org_id = p_org and public.is_org_member(p_org)
  order by m.created_at;
$$;

-- Remove a member (admins only; the last owner cannot be removed).
create or replace function public.remove_org_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_admin(p_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.organization_members where org_id = p_org and user_id = p_user and role = 'owner') then
    raise exception 'cannot remove an owner' using errcode = '42501';
  end if;
  delete from public.organization_members where org_id = p_org and user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_turns enable row level security;
alter table public.integrity_events enable row level security;
alter table public.interview_session_secrets enable row level security;

-- Anonymous visitors never read or write tables directly.
revoke all on public.profiles, public.organizations, public.organization_members, public.campaigns,
  public.interview_sessions, public.interview_turns, public.integrity_events, public.interview_session_secrets from anon;
revoke all on public.interview_session_secrets from authenticated;

-- profiles
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- organizations
create policy "organizations: members read" on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy "organizations: admins update" on public.organizations
  for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));
revoke insert, delete on public.organizations from authenticated;

-- organization_members (writes go through the security-definer functions above)
create policy "members: members read" on public.organization_members
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.organization_members from authenticated;

-- campaigns
create policy "campaigns: members read" on public.campaigns
  for select to authenticated using (public.is_org_member(org_id));
create policy "campaigns: members create" on public.campaigns
  for insert to authenticated with check (public.is_org_member(org_id) and created_by = (select auth.uid()));
create policy "campaigns: members update" on public.campaigns
  for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "campaigns: admins delete" on public.campaigns
  for delete to authenticated using (public.is_org_admin(org_id));
-- Members may edit campaign content but never its org, owner or public link token.
revoke update on public.campaigns from authenticated;
grant update (title, department, location, description, seniority, competencies, settings, status, closes_at)
  on public.campaigns to authenticated;

-- interview_sessions: read own practice sessions or your organisation's candidates.
create policy "sessions: owner or org read" on public.interview_sessions
  for select to authenticated using (
    user_id = (select auth.uid()) or (org_id is not null and public.is_org_member(org_id))
  );
-- Reviewers may update review fields only (column privileges below).
create policy "sessions: org reviewers update" on public.interview_sessions
  for update to authenticated
  using (org_id is not null and public.is_org_member(org_id))
  with check (org_id is not null and public.is_org_member(org_id));
create policy "sessions: owner deletes practice" on public.interview_sessions
  for delete to authenticated using (mode = 'practice' and user_id = (select auth.uid()));
revoke insert, update on public.interview_sessions from authenticated;
grant update (review_status, reviewer_notes, reviewed_by, reviewed_at) on public.interview_sessions to authenticated;

-- interview_turns / integrity_events: read-only through the API.
create policy "turns: viewers read" on public.interview_turns
  for select to authenticated using (public.can_view_session(session_id));
revoke insert, update, delete on public.interview_turns from authenticated;

create policy "events: viewers read" on public.integrity_events
  for select to authenticated using (public.can_view_session(session_id));
revoke insert, update, delete on public.integrity_events from authenticated;

-- Function execution: only signed-in users can call the org helpers.
revoke execute on function public.create_organization(text) from public, anon;
revoke execute on function public.add_org_member(uuid, text, public.org_role) from public, anon;
revoke execute on function public.list_org_members(uuid) from public, anon;
revoke execute on function public.remove_org_member(uuid, uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.add_org_member(uuid, text, public.org_role) to authenticated;
grant execute on function public.list_org_members(uuid) to authenticated;
grant execute on function public.remove_org_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Campaign overview (security invoker → RLS of the caller applies)
-- ---------------------------------------------------------------------------------------------
create view public.campaign_overview
with (security_invoker = on) as
select
  c.id,
  c.org_id,
  c.title,
  c.department,
  c.location,
  c.seniority,
  c.status,
  c.public_token,
  c.closes_at,
  c.created_at,
  count(s.id) filter (where s.status in ('in_progress', 'completed')) as candidates,
  count(s.id) filter (where s.status = 'completed') as completed,
  round(avg(s.overall_score) filter (where s.status = 'completed'), 1) as avg_score,
  count(s.id) filter (where s.integrity_level = 'high_risk') as flagged,
  count(s.id) filter (where s.review_status = 'shortlisted' or s.review_status = 'advanced') as shortlisted,
  max(s.completed_at) as last_completed_at
from public.campaigns c
left join public.interview_sessions s on s.campaign_id = c.id
group by c.id;

revoke all on public.campaign_overview from anon;
grant select on public.campaign_overview to authenticated;
