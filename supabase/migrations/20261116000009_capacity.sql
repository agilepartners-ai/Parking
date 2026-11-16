-- Capacity: how many cars an area holds, how many are parked now, and no overbooking.
--
-- Why per area and not per bay: phone GPS is good to 5-25 m, a parking bay is 2.5 m wide, so the server cannot know
-- WHICH bay a car is in. It can know reliably how many sessions are running in an area. An area therefore has a
-- number of spaces (parking_area.total_spaces, already in the schema), and each running session uses one of them.
--
-- Occupancy is never stored as a counter. It is counted from running sessions (indexed:
-- parking_session_area_active_idx), so it cannot drift when a phone dies mid-session, a session is ended by the
-- overdue job, or a refund voids one. Ending a session frees its space by definition.
--
-- No overbooking: start_session locks the area row before counting, so two drivers racing for the last space are
-- served one after the other; the second gets 'area_full'.

-- ---------- area JSON: spaces, occupied, available ---------------------------------------------------------------
create or replace function _area_occupied(p_area_id uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from parking_session where area_id = p_area_id and status = 'active';
$$;

create or replace function _area_json(p_area_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'name', a.name, 'level', a.level, 'active', a.active,
    'operator_id', o.id, 'operator_name', o.name, 'timezone', o.timezone,
    'service_fee_bps', o.service_fee_bps, 'max_stay_minutes', a.max_stay_minutes,
    'closing_time', left(a.closing_time::text, 5),
    'total_spaces', a.total_spaces,
    'occupied', occ.n,
    'available', case when a.total_spaces is null then null else greatest(a.total_spaces - occ.n, 0) end,
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
  cross join lateral (select _area_occupied(a.id) as n) occ
  where a.id = p_area_id;
$$;

-- Version snapshots record the area's configuration, not how full it happened to be at that moment.
create or replace function _snapshot_area(p_area_id uuid, p_action text, p_actor uuid) returns void
language sql security definer set search_path = public as $$
  insert into parking_area_version (area_id, version, action, snapshot, actor_user_id)
  select p_area_id, coalesce((select max(version) from parking_area_version where area_id = p_area_id), 0) + 1,
         p_action, _area_json(p_area_id) - 'occupied' - 'available', p_actor;
$$;

-- ---------- set the number of spaces ------------------------------------------------------------------------------
-- null = not counted (street zones, city zones): drivers can always start. Lowering it below the cars parked now is
-- allowed: those sessions continue, new ones are refused until enough have ended.
create or replace function operator_set_area_capacity(p_area_id uuid, p_total_spaces integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me app_user; v_old integer;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  if not _can_manage_area(v_me, p_area_id) then raise exception 'area_not_found' using errcode = 'P0001'; end if;
  if p_total_spaces is not null and (p_total_spaces < 1 or p_total_spaces > 100000) then
    raise exception 'invalid_capacity' using errcode = 'P0001';
  end if;
  select total_spaces into v_old from parking_area where id = p_area_id;
  if v_old is not distinct from p_total_spaces then return _area_json(p_area_id); end if;
  update parking_area set total_spaces = p_total_spaces where id = p_area_id;
  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'parking_area', p_area_id::text, 'capacity', jsonb_build_object('from', v_old, 'to', p_total_spaces));
  perform _snapshot_area(p_area_id, 'capacity', v_me.id);
  return _area_json(p_area_id);
end $$;

-- ---------- start_session: same as before plus the capacity check ---------------------------------------------------
create or replace function start_session(p_vehicle_id uuid, p_lat double precision, p_lng double precision,
                                         p_accuracy numeric default null, p_speed numeric default null,
                                         p_idempotency_key text default null,
                                         p_planned_minutes integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me app_user; v_veh vehicle; v_area uuid; v_plan uuid; v_cur char(3); v_id uuid; v_key text;
  v_max integer; v_planned integer; v_spaces integer;
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

  -- Lock the area row: starts in the same area queue here for a moment, so the count below is exact and the last
  -- space can be taken only once. Areas without a capacity are not counted.
  select max_stay_minutes, total_spaces into v_max, v_spaces from parking_area where id = v_area for update;
  if v_spaces is not null and _area_occupied(v_area) >= v_spaces then
    raise exception 'area_full' using errcode = 'P0001';
  end if;

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

-- ---------- permissions -------------------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any (array['operator_set_area_capacity','start_session']) loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
  execute 'revoke execute on function _area_json(uuid) from public, anon, authenticated';
  execute 'revoke execute on function _area_occupied(uuid) from public, anon, authenticated';
  execute 'revoke execute on function _snapshot_area(uuid, text, uuid) from public, anon, authenticated';
end $$;
