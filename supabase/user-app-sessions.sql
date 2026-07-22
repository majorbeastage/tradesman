-- App-level session registry for common login (main = 1 device, messaging = up to 3).
-- Soft takeover: supersede rows without killing all Supabase refresh tokens (so Messaging
-- can stay signed in when Main switches devices). Run in Supabase SQL editor.

create table if not exists public.user_app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app text not null check (app in ('main', 'messaging')),
  device_id text not null,
  device_label text null,
  status text not null default 'active' check (status in ('active', 'superseded', 'revoked')),
  in_call boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, app, device_id)
);

create index if not exists user_app_sessions_user_app_status_idx
  on public.user_app_sessions (user_id, app, status);

create index if not exists user_app_sessions_user_last_seen_idx
  on public.user_app_sessions (user_id, last_seen desc);

alter table public.user_app_sessions enable row level security;

drop policy if exists user_app_sessions_select_own on public.user_app_sessions;
create policy user_app_sessions_select_own on public.user_app_sessions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists user_app_sessions_insert_own on public.user_app_sessions;
create policy user_app_sessions_insert_own on public.user_app_sessions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_app_sessions_update_own on public.user_app_sessions;
create policy user_app_sessions_update_own on public.user_app_sessions
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Register / promote this device. Main: only one active. Messaging: max 3 active (LRU supersede).
create or replace function public.register_app_session(
  p_app text,
  p_device_id text,
  p_device_label text default null,
  p_max_messaging int default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_superseded int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_app not in ('main', 'messaging') then
    raise exception 'Invalid app';
  end if;
  if p_device_id is null or length(trim(p_device_id)) < 8 then
    raise exception 'Invalid device_id';
  end if;

  insert into public.user_app_sessions (user_id, app, device_id, device_label, status, last_seen, in_call)
  values (v_uid, p_app, trim(p_device_id), nullif(trim(coalesce(p_device_label, '')), ''), 'active', now(), false)
  on conflict (user_id, app, device_id) do update
    set status = 'active',
        device_label = coalesce(excluded.device_label, public.user_app_sessions.device_label),
        last_seen = now()
  returning id into v_id;

  if p_app = 'main' then
    -- Soft-supersede other main devices (they sign out locally after call if in_call).
    update public.user_app_sessions
      set status = 'superseded'
      where user_id = v_uid
        and app = 'main'
        and device_id <> trim(p_device_id)
        and status = 'active';
    get diagnostics v_superseded = row_count;
  else
    -- Messaging: keep newest N by last_seen; supersede older actives.
    with ranked as (
      select id,
             row_number() over (order by last_seen desc, created_at desc) as rn
      from public.user_app_sessions
      where user_id = v_uid and app = 'messaging' and status = 'active'
    )
    update public.user_app_sessions s
      set status = 'superseded'
      from ranked r
      where s.id = r.id and r.rn > greatest(1, coalesce(p_max_messaging, 3));
    get diagnostics v_superseded = row_count;
  end if;

  return jsonb_build_object(
    'session_id', v_id,
    'app', p_app,
    'device_id', trim(p_device_id),
    'superseded_others', v_superseded
  );
end;
$$;

revoke all on function public.register_app_session(text, text, text, int) from public;
grant execute on function public.register_app_session(text, text, text, int) to authenticated;

create or replace function public.heartbeat_app_session(p_app text, p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_in_call boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.user_app_sessions
    set last_seen = now()
    where user_id = v_uid and app = p_app and device_id = trim(p_device_id)
  returning status, in_call into v_status, v_in_call;

  if v_status is null then
    return jsonb_build_object('ok', false, 'missing', true);
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'in_call', coalesce(v_in_call, false),
    'superseded', v_status = 'superseded'
  );
end;
$$;

revoke all on function public.heartbeat_app_session(text, text) from public;
grant execute on function public.heartbeat_app_session(text, text) to authenticated;

create or replace function public.set_app_session_in_call(p_app text, p_device_id text, p_in_call boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.user_app_sessions
    set in_call = coalesce(p_in_call, false),
        last_seen = now()
    where user_id = auth.uid() and app = p_app and device_id = trim(p_device_id);
end;
$$;

revoke all on function public.set_app_session_in_call(text, text, boolean) from public;
grant execute on function public.set_app_session_in_call(text, text, boolean) to authenticated;

create or replace function public.revoke_app_session(p_app text, p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.user_app_sessions
    set status = 'revoked', in_call = false, last_seen = now()
    where user_id = auth.uid() and app = p_app and device_id = trim(p_device_id);
end;
$$;

revoke all on function public.revoke_app_session(text, text) from public;
grant execute on function public.revoke_app_session(text, text) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.user_app_sessions; exception when others then null; end;
end $$;

comment on table public.user_app_sessions is 'Common login registry: main=1 active device (soft supersede); messaging<=3; in_call protects live voice.';
