-- Phase 1: richer vehicle details (collected once at sign-up) and an optional planned parking time.

alter table vehicle
  add column if not exists make       text,
  add column if not exists model      text,
  add column if not exists colour     text,
  add column if not exists size_class text not null default 'standard'
    check (size_class in ('compact', 'standard', 'large'));

alter table parking_session
  add column if not exists planned_minutes integer
    check (planned_minutes is null or planned_minutes between 1 and 1440);

-- The session JSON the apps read now includes the planned time.
create or replace function _session_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', s.id, 'vehicle_id', s.vehicle_id, 'plate', s.plate_snapshot,
    'area_id', s.area_id, 'area_name', a.name, 'rate_plan_id', s.rate_plan_id,
    'status', s.status, 'started_at', s.started_at, 'ended_at', s.ended_at,
    'duration_minutes', s.duration_minutes, 'fee_cents', s.fee_cents,
    'service_fee_cents', s.service_fee_cents, 'operator_payout_cents', s.operator_payout_cents,
    'currency', s.currency, 'max_stay_minutes', a.max_stay_minutes, 'receipt_no', s.receipt_no,
    'planned_minutes', s.planned_minutes)
  from parking_session s join parking_area a on a.id = s.area_id
  where s.id = p_id;
$$;

-- start_session gains p_planned_minutes. Drop the old signature first so there is no ambiguous overload.
drop function if exists start_session(uuid, double precision, double precision, numeric, numeric, text);

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

  select * into v_veh from vehicle
   where id = p_vehicle_id and archived_at is null and account_id in (select _my_account_ids());
  if not found then raise exception 'vehicle_not_found' using errcode = 'P0001'; end if;

  select area_id into v_area from find_parking_area(p_lat, p_lng);
  if v_area is null then raise exception 'no_parking_area' using errcode = 'P0001'; end if;
  v_plan := _plan_for_area(v_area);
  if v_plan is null then raise exception 'no_rate_plan' using errcode = 'P0001'; end if;
  select currency into v_cur from rate_plan where id = v_plan;

  -- planned time: optional, never longer than the area's maximum stay
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

revoke execute on function start_session(uuid, double precision, double precision, numeric, numeric, text, integer) from public, anon;
grant  execute on function start_session(uuid, double precision, double precision, numeric, numeric, text, integer) to authenticated;
