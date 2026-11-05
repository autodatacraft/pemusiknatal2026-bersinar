-- Password-only gateway: apply in Supabase SQL Editor before deploying the update.
-- Keeps the existing preparation and revision intact; retires all email access.
begin;
create table if not exists public.preparations (
  id text primary key check (id = 'natal2026'),
  payload jsonb not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.preparations enable row level security;
revoke all on public.preparations from public, anon, authenticated;
grant select on public.preparations to service_role;
drop policy if exists team_read on public.preparations;
-- Remove access to the old email RPCs without touching the preparation or Auth users.
do $$ begin
  if to_regprocedure('public.save_preparation(bigint,jsonb)') is not null then
    execute 'revoke all on function public.save_preparation(bigint,jsonb) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.is_team_member()') is not null then
    execute 'revoke all on function public.is_team_member() from public, anon, authenticated';
  end if;
end $$;

create or replace function public.save_preparation_server(p_revision bigint, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
  if p_revision is null or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or (p_payload->>'version') is distinct from '1'
    or jsonb_typeof(p_payload->'songs') is distinct from 'array'
    or octet_length(p_payload::text) > 500000 then
    raise invalid_parameter_value using message = 'Invalid preparation payload';
  end if;
  if jsonb_array_length(p_payload->'songs') <> 5
    or jsonb_typeof(p_payload->'decisions') is distinct from 'array'
    or jsonb_typeof(p_payload->'open') is distinct from 'array' then
    raise invalid_parameter_value using message = 'Invalid preparation structure';
  end if;
  update public.preparations
    set payload = p_payload, revision = preparations.revision + 1,
      updated_at = now(), updated_by = null
    where id = 'natal2026' and preparations.revision = p_revision
    returning preparations.revision into next_revision;
  if not found then
    raise sqlstate 'PT409' using message = 'The team has saved a newer revision';
  end if;
  return jsonb_build_object('revision', next_revision);
end;
$$;
revoke all on function public.save_preparation_server(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_preparation_server(bigint, jsonb) to service_role;

create table if not exists public.login_attempts (
  fingerprint text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from public, anon, authenticated;
create or replace function public.check_login_limit(p_fingerprint text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise invalid_parameter_value using message = 'Invalid fingerprint';
  end if;
  delete from public.login_attempts where window_start < now() - interval '1 day';
  insert into public.login_attempts as a (fingerprint, window_start, attempts)
    values (p_fingerprint, now(), 1)
  on conflict (fingerprint) do update set
    window_start = case when a.window_start < now() - interval '15 minutes' then now() else a.window_start end,
    attempts = case when a.window_start < now() - interval '15 minutes' then 1 else least(a.attempts + 1, 1000000) end
  returning attempts into total;
  return total <= 20;
end;
$$;
revoke all on function public.check_login_limit(text) from public, anon, authenticated;
grant execute on function public.check_login_limit(text) to service_role;
commit;
