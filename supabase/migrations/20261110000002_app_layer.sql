-- =============================================================================
-- App layer: signup hook, row-level security, and the functions the apps call.
-- All business rules live here (server decides area, time and fee). Clients are never trusted.
-- Auth: uses auth.uid() (Supabase Auth). Tests on plain Postgres use supabase/tests/shim.sql.
-- =============================================================================

-- ---------- extra columns ----------------------------------------------------
alter table app_user add column if not exists operator_id uuid references operator(id);  -- staff belong to one operator
alter table vehicle add column if not exists archived_at timestamptz;
alter table parking_session add column if not exists receipt_no text unique;
create sequence if not exists receipt_seq;

create unique index if not exists vehicle_unique_plate_per_account
  on vehicle (account_id, plate_country, coalesce(plate_region, ''), plate) where archived_at is null;

-- normalise plates so the check constraint always passes and lookups are exact
create or replace function normalise_vehicle_plate() returns trigger language plpgsql as $$
begin
  new.plate := upper(regexp_replace(new.plate, '[^A-Za-z0-9]', '', 'g'));
  if length(new.plate) < 2 or length(new.plate) > 10 then
    raise exception 'invalid_plate' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_vehicle_plate on vehicle;
create trigger trg_vehicle_plate before insert or update of plate on vehicle
  for each row execute function normalise_vehicle_plate();

-- ---------- signup: every auth user gets a profile + personal account --------
create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_acc uuid;
begin
  insert into app_user (id, auth_subject, email, phone_e164, full_name)
  values (
    new.id, new.id::text,
    nullif(new.email, ''),
    case when new.phone is null or new.phone = '' then null else '+' || ltrim(new.phone, '+') end,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Driver')
  );
  insert into account (owner_user_id, kind, name) values (new.id, 'individual', 'Personal') returning id into v_acc;
  insert into account_member (account_id, user_id, is_admin) values (v_acc, new.id, true);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ---------- internal helpers (not callable by clients) -----------------------
create or replace function _me() returns app_user
language plpgsql stable security definer set search_path = public as $$
declare v app_user;
begin
  select * into v from app_user where id = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  return v;
end $$;

create or replace function _my_account_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select account_id from account_member where user_id = auth.uid();
$$;

create or replace function _area_json(p_area_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'name', a.name, 'level', a.level, 'active', a.active,
    'operator_id', o.id, 'operator_name', o.name, 'timezone', o.timezone,
    'service_fee_bps', o.service_fee_bps, 'max_stay_minutes', a.max_stay_minutes,
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

create or replace function _session_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', s.id, 'vehicle_id', s.vehicle_id, 'plate', s.plate_snapshot,
    'area_id', s.area_id, 'area_name', a.name, 'rate_plan_id', s.rate_plan_id,
    'status', s.status, 'started_at', s.started_at, 'ended_at', s.ended_at,
    'duration_minutes', s.duration_minutes, 'fee_cents', s.fee_cents,
    'service_fee_cents', s.service_fee_cents, 'operator_payout_cents', s.operator_payout_cents,
    'currency', s.currency, 'max_stay_minutes', a.max_stay_minutes, 'receipt_no', s.receipt_no)
  from parking_session s join parking_area a on a.id = s.area_id
  where s.id = p_id;
$$;

create or replace function _plan_for_area(p_area_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from rate_plan p join parking_area a on a.id = p_area_id
  where p.active and (p.area_id = a.id or (p.area_id is null and p.operator_id = a.operator_id))
  order by (p.area_id is not null) desc, p.created_at desc limit 1;
$$;

create or replace function _require_staff(p_roles user_role[]) returns app_user
language plpgsql stable security definer set search_path = public as $$
declare v app_user;
begin
  v := _me();
  if not (v.role = any (p_roles)) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- ---------- row-level security -----------------------------------------------
alter table app_user          enable row level security;
alter table account           enable row level security;
alter table account_member    enable row level security;
alter table vehicle           enable row level security;
alter table payment_method    enable row level security;
alter table operator          enable row level security;
alter table parking_area      enable row level security;
alter table rate_plan         enable row level security;
alter table rate_rule         enable row level security;
alter table parking_session   enable row level security;
alter table location_ping     enable row level security;
alter table payment           enable row level security;
alter table citation          enable row level security;
alter table enforcement_check enable row level security;
alter table notification      enable row level security;
alter table fraud_flag        enable row level security;
alter table audit_log         enable row level security;
alter table toll_road         enable row level security;
alter table toll_trip         enable row level security;

-- drivers see only their own data
create policy app_user_self    on app_user       for select to authenticated using (id = auth.uid());
create policy account_mine     on account        for select to authenticated using (id in (select _my_account_ids()));
create policy member_mine      on account_member for select to authenticated using (user_id = auth.uid());
create policy vehicle_select   on vehicle        for select to authenticated using (account_id in (select _my_account_ids()));
create policy vehicle_insert   on vehicle        for insert to authenticated with check (account_id in (select _my_account_ids()));
create policy vehicle_update   on vehicle        for update to authenticated
  using (account_id in (select _my_account_ids())) with check (account_id in (select _my_account_ids()));
create policy session_mine     on parking_session for select to authenticated using (user_id = auth.uid());
create policy payment_mine     on payment        for select to authenticated using (account_id in (select _my_account_ids()));
create policy citation_mine    on citation       for select to authenticated
  using (plate in (select v.plate from vehicle v where v.account_id in (select _my_account_ids())));
create policy notification_mine on notification  for select to authenticated using (user_id = auth.uid());
-- public reference data (what a driver needs to see a map and prices)
create policy operator_read    on operator       for select to authenticated using (true);
create policy area_read        on parking_area   for select to authenticated using (active);
create policy plan_read        on rate_plan      for select to authenticated using (active);
create policy rule_read        on rate_rule      for select to authenticated using (true);
-- no policy = no access (payment_method, location_ping, enforcement_check, fraud_flag, audit_log, toll_*)

revoke all on repeat_offender from public, anon, authenticated;   -- views bypass RLS: keep it staff/service only

-- ---------- driver functions -------------------------------------------------
create or replace function list_areas(p_lat double precision default null, p_lng double precision default null,
                                      p_radius_m integer default 5000)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform _me();
  select coalesce(jsonb_agg(_area_json(a.id) order by a.level, a.name), '[]'::jsonb) into v
  from parking_area a
  where a.active
    and (p_lat is null or p_lng is null
         or st_dwithin(a.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m))
    and _plan_for_area(a.id) is not null;
  return v;
end $$;

create or replace function detect_area(p_lat double precision, p_lng double precision)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _me();
  select area_id into v_id from find_parking_area(p_lat, p_lng);
  if v_id is null or _plan_for_area(v_id) is null then return null; end if;
  return _area_json(v_id);
end $$;

create or replace function update_profile(p_full_name text) returns void
language plpgsql security definer set search_path = public as $$
declare v app_user;
begin
  v := _me();
  if p_full_name is null or length(btrim(p_full_name)) < 1 or length(p_full_name) > 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  update app_user set full_name = btrim(p_full_name) where id = v.id;
end $$;

create or replace function my_profile() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v app_user;
begin
  v := _me();
  return jsonb_build_object('id', v.id, 'full_name', v.full_name, 'email', v.email, 'phone', v.phone_e164,
                            'role', v.role, 'operator_id', v.operator_id);
end $$;

create or replace function start_session(p_vehicle_id uuid, p_lat double precision, p_lng double precision,
                                         p_accuracy numeric default null, p_speed numeric default null,
                                         p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me app_user; v_veh vehicle; v_area uuid; v_plan uuid; v_cur char(3); v_id uuid; v_key text;
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

  begin
    insert into parking_session (user_id, account_id, vehicle_id, plate_snapshot, area_id, rate_plan_id,
                                 start_location, start_accuracy_m, start_speed_mps, currency, idempotency_key)
    values (v_me.id, v_veh.account_id, v_veh.id, v_veh.plate, v_area, v_plan,
            st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_accuracy, p_speed, v_cur, v_key)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'session_already_active' using errcode = 'P0001';
  end;

  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'parking_session', v_id::text, 'start',
          jsonb_build_object('lat', p_lat, 'lng', p_lng, 'accuracy', p_accuracy, 'area_id', v_area));
  return _session_json(v_id);
end $$;

create or replace function end_session(p_session_id uuid, p_lat double precision default null,
                                       p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me app_user; s parking_session; v_fee integer; v_split record; v_bps integer; v_end timestamptz := now();
begin
  v_me := _me();
  select * into s from parking_session where id = p_session_id and user_id = v_me.id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;
  if s.status <> 'active' then raise exception 'session_not_active' using errcode = 'P0001'; end if;

  v_fee := compute_fee_cents(s.rate_plan_id, s.started_at, v_end);
  select o.service_fee_bps into v_bps from parking_area a join operator o on o.id = a.operator_id where a.id = s.area_id;
  select * into v_split from split_fee(v_fee, coalesce(v_bps, 0));

  update parking_session set
    status = 'completed', ended_at = v_end,
    duration_minutes = greatest(1, ceil(extract(epoch from (v_end - started_at)) / 60.0)::integer),
    fee_cents = v_fee, service_fee_cents = v_split.service_fee_cents,
    operator_payout_cents = v_split.operator_payout_cents,
    end_location = case when p_lat is null or p_lng is null then null
                        else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end,
    receipt_no = 'PP-' || to_char(v_end, 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 6, '0')
  where id = s.id;

  -- MOCK PAYMENT: no money moves. Replace with a Stripe PaymentIntent capture in production.
  insert into payment (account_id, session_id, provider, provider_payment_id, amount_cents, currency, status)
  values (s.account_id, s.id, 'mock', 'mock_' || gen_random_uuid()::text, v_fee, s.currency, 'captured');

  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'parking_session', s.id::text, 'end', jsonb_build_object('fee_cents', v_fee));
  return _session_json(s.id);
end $$;

create or replace function my_active_session() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from parking_session where user_id = (_me()).id and status = 'active'
   order by started_at desc limit 1;
  if v_id is null then return null; end if;
  return _session_json(v_id);
end $$;

create or replace function my_sessions(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _me();
  return coalesce((select jsonb_agg(_session_json(x.id) order by x.started_at desc)
                   from (select id, started_at from parking_session where user_id = v_me.id
                         order by started_at desc limit least(greatest(p_limit, 1), 200)) x), '[]'::jsonb);
end $$;

-- [P1] breadcrumbs while a session is open; tells the app whether the car is still inside the area
create or replace function session_ping(p_session_id uuid, p_lat double precision, p_lng double precision,
                                        p_accuracy numeric default null, p_speed numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me app_user; s parking_session; v_in boolean;
begin
  v_me := _me();
  select * into s from parking_session where id = p_session_id and user_id = v_me.id and status = 'active';
  if not found then raise exception 'session_not_active' using errcode = 'P0001'; end if;
  insert into location_ping (session_id, recorded_at, location, accuracy_m, speed_mps)
  values (s.id, now(), st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_accuracy, p_speed);
  select exists (select 1 from parking_area a where a.id = s.area_id
                 and st_dwithin(a.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, 40))
    into v_in;                       -- 40 m tolerance for GPS error
  return jsonb_build_object('in_area', v_in, 'speed_mps', p_speed);
end $$;

-- privacy / store requirement: users can delete their account from inside the app
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare v app_user;
begin
  v := _me();
  if exists (select 1 from parking_session where user_id = v.id and status = 'active') then
    raise exception 'end_active_session_first' using errcode = 'P0001';
  end if;
  update vehicle set archived_at = coalesce(archived_at, now()), nickname = null
   where account_id in (select account_id from account_member where user_id = v.id);
  delete from notification where user_id = v.id;
  update app_user set deleted_at = now(), full_name = 'Deleted user',
         email = 'deleted-' || v.id::text || '@deleted.invalid', phone_e164 = null,
         auth_subject = 'deleted:' || v.id::text, role = 'driver', operator_id = null
   where id = v.id;
  insert into audit_log (actor_user_id, entity, entity_id, action) values (v.id, 'app_user', v.id::text, 'delete_account');
  delete from auth.users where id = v.id;
end $$;

-- ---------- officer functions ([P1] claim 1: officer device talks to the server) --
create or replace function officer_check_plate(p_plate text, p_region text default null,
                                               p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me app_user; v_plate text; s record; v_off_area uuid; v_result check_result; v_msg text; v_found boolean;
begin
  v_me := _require_staff(array['officer','operator_admin','platform_admin']::user_role[]);
  v_plate := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_plate) < 2 then raise exception 'invalid_plate' using errcode = 'P0001'; end if;
  if p_lat is not null and p_lng is not null then
    select area_id into v_off_area from find_parking_area(p_lat, p_lng);
  end if;

  select ps.id, ps.started_at, ps.area_id, a.name as area_name, a.max_stay_minutes, a.operator_id into s
  from parking_session ps join parking_area a on a.id = ps.area_id
  where ps.status = 'active' and ps.plate_snapshot = v_plate
    and (v_me.operator_id is null or a.operator_id = v_me.operator_id)
  order by ps.started_at desc limit 1;
  v_found := found;

  if not v_found then
    v_result := 'no_session'; v_msg := 'No active parking session for this plate.';
  elsif s.max_stay_minutes is not null and s.started_at + make_interval(mins => s.max_stay_minutes) < now() then
    v_result := 'expired'; v_msg := 'Session exceeded the maximum stay of ' || s.max_stay_minutes || ' min.';
  elsif v_off_area is not null and v_off_area <> s.area_id
        and not exists (select 1 from parking_area p where p.id = s.area_id and p.parent_id = v_off_area) then
    v_result := 'wrong_area'; v_msg := 'Paid for ' || s.area_name || ', but vehicle is in a different area.';
  else
    v_result := 'valid'; v_msg := 'Valid: paid in ' || s.area_name || '.';
  end if;

  insert into enforcement_check (officer_id, plate, plate_region, area_id, result, location)
  values (v_me.id, v_plate, p_region, v_off_area, v_result,
          case when p_lat is null or p_lng is null then null
               else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end);

  return jsonb_build_object('result', v_result, 'plate', v_plate,
                            'area_name', case when v_found then s.area_name end,
                            'started_at', case when v_found then s.started_at end, 'message', v_msg);
end $$;

create or replace function officer_valid_vehicles(p_lat double precision, p_lng double precision,
                                                  p_radius_m integer default 150)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['officer','operator_admin','platform_admin']::user_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object('session_id', s.id, 'plate', s.plate_snapshot,
                                        'area_name', a.name, 'started_at', s.started_at) order by s.started_at)
    from parking_session s join parking_area a on a.id = s.area_id
    where s.status = 'active'
      and (v_me.operator_id is null or a.operator_id = v_me.operator_id)
      and st_dwithin(s.start_location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
                     least(greatest(p_radius_m, 10), 2000))), '[]'::jsonb);
end $$;

create or replace function officer_issue_citation(p_plate text, p_region text, p_reason text, p_fine_cents integer,
                                                  p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me app_user; v_plate text; v_area uuid; v_cur char(3); v_sess uuid; v_id uuid; v_veh uuid;
begin
  v_me := _require_staff(array['officer','operator_admin','platform_admin']::user_role[]);
  v_plate := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_plate) < 2 then raise exception 'invalid_plate' using errcode = 'P0001'; end if;
  if p_fine_cents is null or p_fine_cents <= 0 or p_fine_cents > 50000 then
    raise exception 'invalid_fine' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;

  if p_lat is not null and p_lng is not null then
    select area_id into v_area from find_parking_area(p_lat, p_lng);
  end if;
  select currency into v_cur from operator where id = coalesce(
    (select operator_id from parking_area where id = v_area), v_me.operator_id);
  v_cur := coalesce(v_cur, 'CAD');
  select id into v_sess from parking_session where plate_snapshot = v_plate and status = 'active' limit 1;
  select id into v_veh from vehicle where plate = v_plate and archived_at is null limit 1;

  insert into citation (officer_id, session_id, vehicle_id, plate, plate_region, area_id, location,
                        reason, fine_cents, currency, due_at)
  values (v_me.id, v_sess, v_veh, v_plate, p_region, v_area,
          case when p_lat is null or p_lng is null then null
               else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end,
          btrim(p_reason), p_fine_cents, v_cur, now() + interval '30 days')
  returning id into v_id;
  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'citation', v_id::text, 'issue', jsonb_build_object('plate', v_plate, 'fine_cents', p_fine_cents));

  return (select jsonb_build_object('id', c.id, 'plate', c.plate, 'area_name', a.name, 'reason', c.reason,
                                    'fine_cents', c.fine_cents, 'currency', c.currency, 'issued_at', c.issued_at)
          from citation c left join parking_area a on a.id = c.area_id where c.id = v_id);
end $$;

create or replace function officer_recent_citations(p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['officer','operator_admin','platform_admin']::user_role[]);
  return coalesce((select jsonb_agg(j order by (j ->> 'issued_at') desc) from (
    select jsonb_build_object('id', c.id, 'plate', c.plate, 'area_name', a.name, 'reason', c.reason,
                              'fine_cents', c.fine_cents, 'currency', c.currency, 'issued_at', c.issued_at) as j
    from citation c left join parking_area a on a.id = c.area_id
    where c.officer_id = v_me.id order by c.issued_at desc limit least(greatest(p_limit, 1), 100)) q), '[]'::jsonb);
end $$;

-- ---------- operator console functions ---------------------------------------
create or replace function operator_areas() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  return coalesce((select jsonb_agg(_area_json(a.id) order by a.level, a.name)
                   from parking_area a where v_me.operator_id is null or a.operator_id = v_me.operator_id), '[]'::jsonb);
end $$;

-- Create or update an area and replace its tariff in one call.
-- p_plan = {"name":"..","min_charge_cents":100,"daily_max_cents":2000|null,"grace_minutes":5,
--           "rules":[{"days_of_week":[1,2],"start_time":"08:00","end_time":"18:00","price_per_hour_cents":400,"priority":0}]}
create or replace function operator_save_area(p_area_id uuid, p_name text, p_level integer, p_geojson jsonb,
                                              p_max_stay integer, p_active boolean, p_plan jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me app_user; v_op uuid; v_cur char(3); v_geom geometry; v_id uuid := p_area_id; v_plan uuid; r jsonb;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  v_op := v_me.operator_id;
  if v_op is null then raise exception 'operator_required' using errcode = 'P0001'; end if;
  if p_name is null or length(btrim(p_name)) < 2 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if p_level not in (1, 2, 3) then raise exception 'invalid_level' using errcode = 'P0001'; end if;
  select currency into v_cur from operator where id = v_op;

  v_geom := st_setsrid(st_geomfromgeojson(p_geojson::text), 4326);
  if not st_isvalid(v_geom) then v_geom := st_makevalid(v_geom); end if;
  v_geom := st_multi(st_collectionextract(v_geom, 3));
  if v_geom is null or st_isempty(v_geom) then raise exception 'invalid_geometry' using errcode = 'P0001'; end if;

  if v_id is null then
    insert into parking_area (operator_id, level, name, geom, max_stay_minutes, active, created_by)
    values (v_op, p_level, btrim(p_name), v_geom, p_max_stay, coalesce(p_active, true), v_me.id)
    returning id into v_id;
  else
    update parking_area set name = btrim(p_name), level = p_level, geom = v_geom,
           max_stay_minutes = p_max_stay, active = coalesce(p_active, true)
     where id = v_id and operator_id = v_op;
    if not found then raise exception 'area_not_found' using errcode = 'P0001'; end if;
  end if;

  select id into v_plan from rate_plan where area_id = v_id and active order by created_at desc limit 1;
  if v_plan is null then
    insert into rate_plan (operator_id, area_id, name, currency, min_charge_cents, daily_max_cents, grace_minutes)
    values (v_op, v_id, coalesce(p_plan ->> 'name', btrim(p_name) || ' rate'), v_cur,
            coalesce((p_plan ->> 'min_charge_cents')::int, 0), (p_plan ->> 'daily_max_cents')::int,
            coalesce((p_plan ->> 'grace_minutes')::int, 5))
    returning id into v_plan;
  else
    update rate_plan set name = coalesce(p_plan ->> 'name', name),
           min_charge_cents = coalesce((p_plan ->> 'min_charge_cents')::int, 0),
           daily_max_cents = (p_plan ->> 'daily_max_cents')::int,
           grace_minutes = coalesce((p_plan ->> 'grace_minutes')::int, 5)
     where id = v_plan;
    delete from rate_rule where rate_plan_id = v_plan;
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'rules', '[]'::jsonb)) loop
    insert into rate_rule (rate_plan_id, days_of_week, start_time, end_time, price_per_hour_cents, priority)
    values (v_plan,
            array(select jsonb_array_elements_text(r -> 'days_of_week')::smallint),
            (r ->> 'start_time')::time, (r ->> 'end_time')::time,
            (r ->> 'price_per_hour_cents')::int, coalesce((r ->> 'priority')::smallint, 0));
  end loop;
  insert into audit_log (actor_user_id, entity, entity_id, action) values (v_me.id, 'parking_area', v_id::text, 'save');
  return _area_json(v_id);
end $$;

create or replace function operator_report(p_from timestamptz default now() - interval '30 days',
                                           p_to timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me app_user; v jsonb;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  select jsonb_build_object(
    'sessions', count(*) filter (where s.status = 'completed'),
    'active_now', count(*) filter (where s.status = 'active'),
    'revenue_cents', coalesce(sum(s.fee_cents) filter (where s.status = 'completed'), 0),
    'platform_fee_cents', coalesce(sum(s.service_fee_cents) filter (where s.status = 'completed'), 0),
    'operator_payout_cents', coalesce(sum(s.operator_payout_cents) filter (where s.status = 'completed'), 0),
    'by_area', coalesce((
      select jsonb_agg(jsonb_build_object('area_name', x.name, 'sessions', x.n, 'revenue_cents', x.rev) order by x.rev desc)
      from (select a2.name, count(*) n, coalesce(sum(s2.fee_cents), 0) rev
            from parking_session s2 join parking_area a2 on a2.id = s2.area_id
            where s2.status = 'completed' and s2.started_at between p_from and p_to
              and (v_me.operator_id is null or a2.operator_id = v_me.operator_id)
            group by a2.name) x), '[]'::jsonb),
    'citations', (select count(*) from citation c left join parking_area ca on ca.id = c.area_id
                  where c.issued_at between p_from and p_to
                    and (v_me.operator_id is null or ca.operator_id = v_me.operator_id)),
    'citation_cents', (select coalesce(sum(c.fine_cents), 0) from citation c left join parking_area ca on ca.id = c.area_id
                  where c.issued_at between p_from and p_to
                    and (v_me.operator_id is null or ca.operator_id = v_me.operator_id))
  ) into v
  from parking_session s join parking_area a on a.id = s.area_id
  where s.started_at between p_from and p_to
    and (v_me.operator_id is null or a.operator_id = v_me.operator_id);
  return v;
end $$;

create or replace function operator_active_sessions() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  return coalesce((select jsonb_agg(jsonb_build_object('session_id', s.id, 'plate', s.plate_snapshot,
                   'area_name', a.name, 'started_at', s.started_at) order by s.started_at)
                   from parking_session s join parking_area a on a.id = s.area_id
                   where s.status = 'active' and (v_me.operator_id is null or a.operator_id = v_me.operator_id)), '[]'::jsonb);
end $$;

-- operator admins can make an existing user (by email) an officer of their operator, or back to driver
create or replace function operator_set_user_role(p_email text, p_role user_role) returns void
language plpgsql security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  if v_me.operator_id is null then raise exception 'operator_required' using errcode = 'P0001'; end if;
  if p_role not in ('officer', 'driver') then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update app_user set role = p_role, operator_id = case when p_role = 'officer' then v_me.operator_id else null end
   where email = lower(p_email) and role in ('driver', 'officer') and deleted_at is null;
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'app_user', lower(p_email), 'set_role', jsonb_build_object('role', p_role));
end $$;

-- BOOTSTRAP ONLY: run from the Supabase SQL editor (postgres role) to create the first staff users.
create or replace function dev_set_role(p_email text, p_role user_role, p_operator_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update app_user set role = p_role, operator_id = p_operator_id where email = lower(p_email);
  if not found then raise exception 'user_not_found: sign up in the app first' using errcode = 'P0001'; end if;
end $$;

-- ---------- permissions ------------------------------------------------------
do $$
declare r record;
begin
  -- client-callable API
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any (array[
             'list_areas','detect_area','update_profile','my_profile','start_session','end_session',
             'my_active_session','my_sessions','session_ping','delete_my_account',
             'officer_check_plate','officer_valid_vehicles','officer_issue_citation','officer_recent_citations',
             'operator_areas','operator_save_area','operator_report','operator_active_sessions','operator_set_user_role']) loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
  -- internal helpers and bootstrap: not callable through the API
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any (array[
             '_me','_area_json','_session_json','_plan_for_area','_require_staff',
             'dev_set_role','handle_new_auth_user']) loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
