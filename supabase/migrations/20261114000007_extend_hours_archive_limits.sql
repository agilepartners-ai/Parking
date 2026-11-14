-- Extend a running session, area closing time, archive an area, and a start-rate limit.

-- ---------- columns -------------------------------------------------------------
alter table parking_area
  add column if not exists closing_time time,          -- operator-local; null = never closes
  add column if not exists archived_at  timestamptz;   -- hidden from the console list; history is kept

alter table parking_area_version drop constraint if exists parking_area_version_action_check;
alter table parking_area_version add constraint parking_area_version_action_check
  check (action in ('save', 'publish', 'unpublish', 'archive', 'hours'));

-- ---------- area JSON now carries the closing time -------------------------------
create or replace function _area_json(p_area_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'name', a.name, 'level', a.level, 'active', a.active,
    'operator_id', o.id, 'operator_name', o.name, 'timezone', o.timezone,
    'service_fee_bps', o.service_fee_bps, 'max_stay_minutes', a.max_stay_minutes,
    'closing_time', left(a.closing_time::text, 5),
    'geometry', st_asgeojson(a.geom)::jsonb,
    'plan', (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'currency', p.currency,
        'min_charge_cents', p.min_charge_cents, 'daily_max_cents', p.daily_max_cents,
        'grace_minutes', p.grace_minutes,
        'rules', coalesce((
          select jsonb_agg(jsonb_build_object(
            'days_of_week', r.days_of_week,
            'start_time', left(r.start_time::text, 5),
            'end_time', left(r.end_time::text, 5),
            'price_per_hour_cents', r.price_per_hour_cents,
            'priority', r.priority) order by r.priority desc, r.start_time)
          from rate_rule r where r.rate_plan_id = p.id), '[]'::jsonb))
      from rate_plan p
      where p.active and (p.area_id = a.id or (p.area_id is null and p.operator_id = a.operator_id))
      order by (p.area_id is not null) desc, p.created_at desc
      limit 1)
  )
  from parking_area a join operator o on o.id = a.operator_id
  where a.id = p_area_id;
$$;

create or replace function operator_areas() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  return coalesce((select jsonb_agg(_area_json(a.id) order by a.level, a.name)
                   from parking_area a
                   where a.archived_at is null
                     and (v_me.operator_id is null or a.operator_id = v_me.operator_id)), '[]'::jsonb);
end $$;

-- ---------- closing time ----------------------------------------------------------
create or replace function operator_set_area_hours(p_area_id uuid, p_closing_time text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me app_user; v_t time;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  if not _can_manage_area(v_me, p_area_id) then raise exception 'area_not_found' using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p_closing_time, '')), '') is not null then
    begin
      v_t := btrim(p_closing_time)::time;
    exception when others then
      raise exception 'invalid_time' using errcode = 'P0001';
    end;
  end if;
  update parking_area set closing_time = v_t where id = p_area_id;
  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'parking_area', p_area_id::text, 'hours', jsonb_build_object('closing_time', v_t));
  perform _snapshot_area(p_area_id, 'hours', v_me.id);
  return _area_json(p_area_id);
end $$;

-- ---------- archive ---------------------------------------------------------------
-- An archived area disappears from drivers and from the console list. Sessions, receipts and versions stay.
create or replace function operator_archive_area(p_area_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  if not _can_manage_area(v_me, p_area_id) then raise exception 'area_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from parking_session where area_id = p_area_id and status = 'active') then
    raise exception 'area_has_active_sessions' using errcode = 'P0001';
  end if;
  perform _snapshot_area(p_area_id, 'archive', v_me.id);
  update parking_area set active = false, archived_at = now(), valid_to = coalesce(valid_to, now()) where id = p_area_id;
  insert into audit_log (actor_user_id, entity, entity_id, action) values (v_me.id, 'parking_area', p_area_id::text, 'archive');
end $$;

-- An archived area can never be published again by mistake.
create or replace function operator_publish_area(p_area_id uuid, p_publish boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  if not _can_manage_area(v_me, p_area_id) or exists (select 1 from parking_area where id = p_area_id and archived_at is not null) then
    raise exception 'area_not_found' using errcode = 'P0001';
  end if;
  if p_publish and _plan_for_area(p_area_id) is null then raise exception 'no_rate_plan' using errcode = 'P0001'; end if;
  update parking_area set active = p_publish where id = p_area_id;
  insert into audit_log (actor_user_id, entity, entity_id, action)
  values (v_me.id, 'parking_area', p_area_id::text, case when p_publish then 'publish' else 'unpublish' end);
  perform _snapshot_area(p_area_id, case when p_publish then 'publish' else 'unpublish' end, v_me.id);
  return _area_json(p_area_id);
end $$;

-- ---------- extend (or shorten) the planned time of a running session ---------------
-- planned_minutes is counted from the start of the session. null = "until I end it".
create or replace function extend_session(p_session_id uuid, p_planned_minutes integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me app_user; s parking_session; v_max integer; v_elapsed integer; v_new integer;
begin
  v_me := _me();
  select * into s from parking_session where id = p_session_id and user_id = v_me.id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;
  if s.status <> 'active' then raise exception 'session_not_active' using errcode = 'P0001'; end if;
  select max_stay_minutes into v_max from parking_area where id = s.area_id;
  v_elapsed := ceil(extract(epoch from (now() - s.started_at)) / 60.0)::integer;
  if p_planned_minutes is null or p_planned_minutes < 1 then
    v_new := null;
  else
    v_new := least(greatest(p_planned_minutes, v_elapsed + 1), coalesce(v_max, 1440));
    if v_max is not null and v_elapsed >= v_max then raise exception 'max_stay_reached' using errcode = 'P0001'; end if;
  end if;
  update parking_session set planned_minutes = v_new where id = s.id;
  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'parking_session', s.id::text, 'extend', jsonb_build_object('from', s.planned_minutes, 'to', v_new));
  return _session_json(s.id);
end $$;

-- ---------- start_session: same as before plus a rate limit ---------------------------
create or replace function start_session(p_vehicle_id uuid, p_lat double precision, p_lng double precision,
                                         p_accuracy numeric default null, p_speed numeric default null,
                                         p_idempotency_key text default null,
                                         p_planned_minutes integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me app_user; v_veh vehicle; v_area uuid; v_plan uuid; v_cur char(3); v_id uuid; v_key text;
  v_max integer; v_planned integer;
begin
  v_me := _me();
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;
  v_key := coalesce(nullif(p_idempotency_key, ''), gen_random_uuid()::text);

  select id into v_id from parking_session where user_id = v_me.id and idempotency_key = v_key;
  if found then return _session_json(v_id); end if;      -- retry of the same request: same answer

  -- A person parks a few times a day. Thirty starts in an hour is a script or a stuck client.
  if (select count(*) from parking_session where user_id = v_me.id and started_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if p_accuracy is not null and p_accuracy > 150 then
    raise exception 'location_too_inaccurate' using errcode = 'P0001';
  end if;

  select * into v_veh from vehicle
   where id = p_vehicle_id and archived_at is null and account_id in (select _my_account_ids());
  if not found then raise exception 'vehicle_not_found' using errcode = 'P0001'; end if;

  select area_id into v_area from find_parking_area(p_lat, p_lng);
  if v_area is null then raise exception 'no_parking_area' using errcode = 'P0001'; end if;
  v_plan := _plan_for_area(v_area);
  if v_plan is null then raise exception 'no_rate_plan' using errcode = 'P0001'; end if;
  select currency into v_cur from rate_plan where id = v_plan;

  select max_stay_minutes into v_max from parking_area where id = v_area;
  v_planned := case when p_planned_minutes is null or p_planned_minutes < 1 then null
                    when v_max is not null then least(p_planned_minutes, v_max)
                    else least(p_planned_minutes, 1440) end;

  begin
    insert into parking_session (user_id, account_id, vehicle_id, plate_snapshot, area_id, rate_plan_id,
                                 start_location, start_accuracy_m, start_speed_mps, currency, idempotency_key,
                                 planned_minutes)
    values (v_me.id, v_veh.account_id, v_veh.id, v_veh.plate, v_area, v_plan,
            st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_accuracy, p_speed, v_cur, v_key,
            v_planned)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'session_already_active' using errcode = 'P0001';
  end;

  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'parking_session', v_id::text, 'start',
          jsonb_build_object('lat', p_lat, 'lng', p_lng, 'accuracy', p_accuracy, 'area_id', v_area,
                             'planned_minutes', v_planned));
  return _session_json(v_id);
end $$;

-- ---------- permissions ------------------------------------------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any (array[
             'operator_areas','operator_set_area_hours','operator_archive_area','operator_publish_area',
             'extend_session','start_session']) loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
  execute 'revoke execute on function _area_json(uuid) from public, anon, authenticated';
end $$;
