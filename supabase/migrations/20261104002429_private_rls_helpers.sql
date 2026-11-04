-- Move RLS helper functions out of the exposed `public` API schema (Supabase advisor 0029):
-- they are used by policies but should not be callable as /rest/v1/rpc endpoints.
-- Policies reference functions by OID, so they keep working after the schema change; function
-- bodies that call the helpers by name are recreated to point at the new schema.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_org_member(uuid) set schema private;
alter function public.is_org_admin(uuid) set schema private;
alter function public.can_view_session(uuid) set schema private;

revoke execute on function private.is_org_member(uuid) from public, anon;
revoke execute on function private.is_org_admin(uuid) from public, anon;
revoke execute on function private.can_view_session(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;
grant execute on function private.can_view_session(uuid) to authenticated;

create or replace function private.can_view_session(p_session uuid)
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
        or (s.org_id is not null and private.is_org_member(s.org_id))
      )
  );
$$;

create or replace function public.add_org_member(p_org uuid, p_email text, p_role public.org_role default 'member')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not private.is_org_admin(p_org) then
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
  where m.org_id = p_org and private.is_org_member(p_org)
  order by m.created_at;
$$;

create or replace function public.remove_org_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_org_admin(p_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.organization_members where org_id = p_org and user_id = p_user and role = 'owner') then
    raise exception 'cannot remove an owner' using errcode = '42501';
  end if;
  delete from public.organization_members where org_id = p_org and user_id = p_user;
end;
$$;
