-- Geofence hardening and unattended-session clean-up.
--   1. A guard on every write to parking_area: sane coordinates, size limits per level, and no
--      published lot may overlap another operator's published lot (smallest-area-wins would
--      otherwise let one operator collect another's fees).
--   2. Area matching ignores areas that have no tariff, so a driver falls through to the next
--      area instead of getting "no rates". The list the app shows uses the same rules as the match.
--   3. Sessions cannot start from a very inaccurate position.
--   4. A pre-save check for the console (size, overlaps) so the operator sees problems while drawing.
--   5. Overdue sessions are closed by the server (nobody pays for a week because they forgot).

-- ---------- 1. guard ----------------------------------------------------------
create or replace function parking_area_guard() returns trigger
language plpgsql as $$
declare v_m2 double precision; v_other text;
begin
  if tg_op = 'UPDATE' and new.geom = old.geom and new.level = old.level
     and new.active = old.active and new.operator_id = old.operator_id then
    return new;                                   -- nothing geofence-relevant changed
  end if;
  if new.geom is null or st_isempty(new.geom) or not st_isvalid(new.geom) then
    raise exception 'invalid_geometry' using errcode = 'P0001';
  end if;
  if st_xmin(new.geom) < -180 or st_xmax(new.geom) > 180 or st_ymin(new.geom) < -90 or st_ymax(new.geom) > 90 then
    raise exception 'invalid_geometry' using errcode = 'P0001';
  end if;
  if st_npoints(new.geom) > 5000 then raise exception 'area_too_complex' using errcode = 'P0001'; end if;

  v_m2 := st_area(new.geom::geography);
  if new.level = 3 and v_m2 < 10 then raise exception 'area_too_small' using errcode = 'P0001'; end if;        -- under a parking bay
  if new.level = 3 and v_m2 > 5e6 then raise exception 'area_too_large' using errcode = 'P0001'; end if;       -- over 5 km2: use a zone
  if new.level = 2 and v_m2 > 5e10 then raise exception 'area_too_large' using errcode = 'P0001'; end if;      -- over 50,000 km2

  if new.active and new.level = 3 then
    select a.name into v_other from parking_area a
     where a.active and a.level = 3 and a.operator_id <> new.operator_id and a.id <> new.id
       and a.geom && new.geom and st_intersects(a.geom, new.geom)
       and st_area(st_intersection(a.geom, new.geom)::geography) > 1
     limit 1;
    if v_other is not null then
      raise exception 'area_overlaps_other_operator' using errcode = 'P0001', detail = v_other;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_parking_area_guard on parking_area;
create trigger trg_parking_area_guard before insert or update on parking_area
  for each row execute function parking_area_guard();

-- ---------- 2. matching: one rule for "which area is this point in" -----------
-- Most specific level wins (3, then 2, then 1); among equals the smallest; then the oldest (stable).
create or replace function find_parking_area(p_lat double precision, p_lng double precision)
returns table (area_id uuid, area_name text, area_level smallint, area_operator_id uuid)
language sql stable security definer set search_path = public as $$
  with p as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as pt)
  select a.id, a.name, a.level, a.operator_id
  from parking_area a, p
  where a.active
    and (a.valid_from is null or a.valid_from <= now())
    and (a.valid_to   is null or a.valid_to   >  now())
    and a.geom && p.pt
    and st_covers(a.geom, p.pt)
    and _plan_for_area(a.id) is not null
  order by a.level desc, st_area(a.geom::geography) asc, a.created_at asc, a.id asc
  limit 1;
$$;

create or replace function list_areas(p_lat double precision default null, p_lng double precision default null,
                                      p_radius_m integer default 5000)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform _me();
  select coalesce(jsonb_agg(_area_json(a.id) order by a.level, a.name), '[]'::jsonb) into v
  from parking_area a
  where a.active
    and (a.valid_from is null or a.valid_from <= now())
    and (a.valid_to   is null or a.valid_to   >  now())
    and (p_lat is null or p_lng is null
         or st_dwithin(a.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
                       least(greatest(coalesce(p_radius_m, 5000), 100), 50000)))
    and _plan_for_area(a.id) is not null;
  return v;
end $$;

-- ---------- 3. start_session: refuse a position that is too vague ---------------
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

  -- Phone GPS is normally 5 to 25 m. Beyond 150 m the fix could be in the wrong street or lot.
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

-- ---------- 4. console: check a drawing before saving --------------------------
-- Returns {"area_m2":..,"valid":bool,"problems":[codes],"overlaps":[{"name","same_operator","overlap_m2","published"}]}
create or replace function operator_check_area(p_area_id uuid, p_level integer, p_geojson jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me app_user; v_op uuid; g geometry; v_m2 double precision; v_problems text[] := '{}'; v_over jsonb;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  v_op := v_me.operator_id;
  if p_area_id is not null then select operator_id into v_op from parking_area where id = p_area_id; end if;
  begin
    g := st_setsrid(st_geomfromgeojson(p_geojson::text), 4326);
    if not st_isvalid(g) then g := st_makevalid(g); v_problems := array_append(v_problems, 'self_intersecting'); end if;
    g := st_multi(st_collectionextract(g, 3));
  exception when others then
    return jsonb_build_object('valid', false, 'area_m2', 0, 'problems', jsonb_build_array('invalid_geometry'), 'overlaps', '[]'::jsonb);
  end;
  if g is null or st_isempty(g) then
    return jsonb_build_object('valid', false, 'area_m2', 0, 'problems', jsonb_build_array('invalid_geometry'), 'overlaps', '[]'::jsonb);
  end if;
  v_m2 := st_area(g::geography);
  if p_level = 3 and v_m2 < 10 then v_problems := array_append(v_problems, 'area_too_small'); end if;
  if (p_level = 3 and v_m2 > 5e6) or (p_level = 2 and v_m2 > 5e10) then v_problems := array_append(v_problems, 'area_too_large'); end if;
  if st_npoints(g) > 5000 then v_problems := array_append(v_problems, 'area_too_complex'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'same_operator', a.operator_id = v_op,
           'published', a.active, 'overlap_m2', round(st_area(st_intersection(a.geom, g)::geography)::numeric, 1))), '[]'::jsonb)
    into v_over
  from parking_area a
  where a.level = 3 and p_level = 3 and a.id is distinct from p_area_id
    and a.geom && g and st_intersects(a.geom, g)
    and st_area(st_intersection(a.geom, g)::geography) > 1;
  if exists (select 1 from jsonb_array_elements(v_over) o where not (o ->> 'same_operator')::boolean and (o ->> 'published')::boolean) then
    v_problems := array_append(v_problems, 'area_overlaps_other_operator');
  end if;
  return jsonb_build_object(
    'area_m2', round(v_m2::numeric, 1),
    'valid', not (v_problems && array['area_too_small','area_too_large','area_too_complex','area_overlaps_other_operator']),
    'problems', to_jsonb(v_problems), 'overlaps', v_over);
end $$;

-- ---------- 5. overdue sessions -------------------------------------------------
-- A session is overdue one hour after the area's maximum stay, or after 24 hours where there is no maximum.
-- It is closed at the limit (not at "now"), charged for that time, and marked 'expired'.
create or replace function expire_overdue_sessions() returns integer
language plpgsql security definer set search_path = public as $$
declare s record; v_end timestamptz; v_fee integer; v_bps integer; v_split record; n integer := 0;
begin
  for s in
    select ps.*, a.max_stay_minutes as area_max, o.service_fee_bps as bps
    from parking_session ps join parking_area a on a.id = ps.area_id join operator o on o.id = a.operator_id
    where ps.status = 'active'
      and now() > ps.started_at + make_interval(mins => coalesce(a.max_stay_minutes, 1440) + 60)
    for update of ps skip locked
  loop
    v_end := s.started_at + make_interval(mins => coalesce(s.area_max, 1440));
    v_fee := compute_fee_cents(s.rate_plan_id, s.started_at, v_end);
    select * into v_split from split_fee(v_fee, coalesce(s.bps, 0));
    update parking_session set
      status = 'expired', ended_at = v_end,
      duration_minutes = greatest(1, ceil(extract(epoch from (v_end - started_at)) / 60.0)::integer),
      fee_cents = v_fee, service_fee_cents = v_split.service_fee_cents,
      operator_payout_cents = v_split.operator_payout_cents,
      receipt_no = 'PP-' || to_char(v_end, 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 6, '0')
    where id = s.id;
    insert into payment (account_id, session_id, provider, provider_payment_id, amount_cents, currency, status)
    values (s.account_id, s.id, 'mock', 'mock_' || gen_random_uuid()::text, v_fee, s.currency, 'captured');
    insert into audit_log (actor_user_id, entity, entity_id, action, request)
    values (null, 'parking_session', s.id::text, 'auto_expire', jsonb_build_object('fee_cents', v_fee, 'ended_at', v_end));
    n := n + 1;
  end loop;
  -- location breadcrumbs are kept 30 days
  delete from location_ping where recorded_at < now() - interval '30 days';
  return n;
end $$;

-- ---------- permissions ---------------------------------------------------------
revoke execute on function expire_overdue_sessions() from public, anon, authenticated;
revoke execute on function parking_area_guard() from public, anon, authenticated;
revoke execute on function find_parking_area(double precision, double precision) from public, anon, authenticated;
revoke execute on function operator_check_area(uuid, integer, jsonb) from public, anon;
grant  execute on function operator_check_area(uuid, integer, jsonb) to authenticated;
revoke execute on function start_session(uuid, double precision, double precision, numeric, numeric, text, integer) from public, anon;
grant  execute on function start_session(uuid, double precision, double precision, numeric, numeric, text, integer) to authenticated;
revoke execute on function list_areas(double precision, double precision, integer) from public, anon;
grant  execute on function list_areas(double precision, double precision, integer) to authenticated;

-- Run the clean-up every 10 minutes where pg_cron is available (Supabase). Plain Postgres skips this.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'parkpay-expire-overdue';
  perform cron.schedule('parkpay-expire-overdue', '*/10 * * * *', 'select public.expire_overdue_sessions()');
exception when others then
  raise notice 'pg_cron not available (%). Schedule expire_overdue_sessions() another way.', sqlerrm;
end $$;
