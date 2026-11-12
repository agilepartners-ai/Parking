-- Phase 2: operator and platform-admin tools.
--   * publish / unpublish areas, with a version history
--   * a price change never alters a session that is already running (the old tariff is kept for it)
--   * reports (per day, per hour), session list for CSV export
--   * refunds, citation list and void, driver-side tickets
--   * platform admin: operators, service fee, audit log

-- ---------- area versions ----------------------------------------------------
create table if not exists parking_area_version (
  id          bigint generated always as identity primary key,
  area_id     uuid not null references parking_area(id) on delete cascade,
  version     integer not null,
  action      text not null check (action in ('save', 'publish', 'unpublish')),
  snapshot    jsonb not null,                    -- the area, its shape and tariff at that moment
  actor_user_id uuid references app_user(id),
  created_at  timestamptz not null default now(),
  unique (area_id, version)
);
alter table parking_area_version enable row level security;  -- no policy: reached only through the functions below

create or replace function _snapshot_area(p_area_id uuid, p_action text, p_actor uuid) returns void
language sql security definer set search_path = public as $$
  insert into parking_area_version (area_id, version, action, snapshot, actor_user_id)
  select p_area_id, coalesce((select max(version) from parking_area_version where area_id = p_area_id), 0) + 1,
         p_action, _area_json(p_area_id), p_actor;
$$;

-- true when the caller may manage this area (their operator's, or any area for a platform admin)
create or replace function _can_manage_area(p_me app_user, p_area_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from parking_area a where a.id = p_area_id
                 and (p_me.role = 'platform_admin' or a.operator_id = p_me.operator_id));
$$;

-- ---------- save: same contract as before, plus tariff protection and a version row -----------
create or replace function operator_save_area(p_area_id uuid, p_name text, p_level integer, p_geojson jsonb,
                                              p_max_stay integer, p_active boolean, p_plan jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me app_user; v_op uuid; v_cur char(3); v_geom geometry; v_id uuid := p_area_id; v_plan uuid; r jsonb;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  v_op := v_me.operator_id;
  if v_id is not null and v_me.role = 'platform_admin' then
    select operator_id into v_op from parking_area where id = v_id;
  end if;
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
  -- Someone is parked on this tariff right now: retire it (they keep it until they leave) and write a new one.
  if v_plan is not null and exists (select 1 from parking_session where rate_plan_id = v_plan and status = 'active') then
    update rate_plan set active = false, valid_to = now() where id = v_plan;
    v_plan := null;
  end if;
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
  perform _snapshot_area(v_id, 'save', v_me.id);
  return _area_json(v_id);
end $$;

-- ---------- publish / unpublish ------------------------------------------------
create or replace function operator_publish_area(p_area_id uuid, p_publish boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  if not _can_manage_area(v_me, p_area_id) then raise exception 'area_not_found' using errcode = 'P0001'; end if;
  if p_publish and _plan_for_area(p_area_id) is null then raise exception 'no_rate_plan' using errcode = 'P0001'; end if;
  update parking_area set active = p_publish where id = p_area_id;
  insert into audit_log (actor_user_id, entity, entity_id, action)
  values (v_me.id, 'parking_area', p_area_id::text, case when p_publish then 'publish' else 'unpublish' end);
  perform _snapshot_area(p_area_id, case when p_publish then 'publish' else 'unpublish' end, v_me.id);
  return _area_json(p_area_id);
end $$;

create or replace function operator_area_versions(p_area_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  if not _can_manage_area(v_me, p_area_id) then raise exception 'area_not_found' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('version', v.version, 'action', v.action, 'at', v.created_at,
                     'by', u.full_name, 'name', v.snapshot ->> 'name',
                     'rules', v.snapshot -> 'plan' -> 'rules') order by v.version desc)
                   from parking_area_version v left join app_user u on u.id = v.actor_user_id
                   where v.area_id = p_area_id), '[]'::jsonb);
end $$;

-- ---------- reports ------------------------------------------------------------
create or replace function operator_report_series(p_from timestamptz default now() - interval '30 days',
                                                  p_to timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  return jsonb_build_object(
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'sessions', n, 'revenue_cents', rev) order by d) from (
        select (s.started_at at time zone o.timezone)::date as d, count(*) n, coalesce(sum(s.fee_cents), 0) rev
        from parking_session s join parking_area a on a.id = s.area_id join operator o on o.id = a.operator_id
        where s.status = 'completed' and s.started_at between p_from and p_to
          and (v_me.operator_id is null or a.operator_id = v_me.operator_id)
        group by 1) x), '[]'::jsonb),
    'by_hour', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'sessions', n) order by h) from (
        select extract(hour from s.started_at at time zone o.timezone)::int as h, count(*) n
        from parking_session s join parking_area a on a.id = s.area_id join operator o on o.id = a.operator_id
        where s.started_at between p_from and p_to
          and (v_me.operator_id is null or a.operator_id = v_me.operator_id)
        group by 1) y), '[]'::jsonb));
end $$;

-- Session list for look-up, refunds and CSV export. p_search matches plate or receipt number.
create or replace function operator_sessions(p_from timestamptz default now() - interval '30 days',
                                             p_to timestamptz default now(),
                                             p_search text default null, p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me app_user; v_q text := nullif(upper(regexp_replace(coalesce(p_search, ''), '\s', '', 'g')), '');
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  return coalesce((select jsonb_agg(j order by (j ->> 'started_at') desc) from (
    select jsonb_build_object('id', s.id, 'receipt_no', s.receipt_no, 'plate', s.plate_snapshot, 'area_name', a.name,
             'status', s.status, 'started_at', s.started_at, 'ended_at', s.ended_at,
             'duration_minutes', s.duration_minutes, 'fee_cents', s.fee_cents,
             'service_fee_cents', s.service_fee_cents, 'operator_payout_cents', s.operator_payout_cents,
             'currency', s.currency,
             'refunded_cents', coalesce((select sum(p.refunded_cents) from payment p where p.session_id = s.id), 0)) as j
    from parking_session s join parking_area a on a.id = s.area_id
    where s.started_at between p_from and p_to
      and (v_me.operator_id is null or a.operator_id = v_me.operator_id)
      and (v_q is null or s.plate_snapshot like '%' || v_q || '%' or upper(coalesce(s.receipt_no, '')) like '%' || v_q || '%')
    order by s.started_at desc limit least(greatest(p_limit, 1), 5000)) q), '[]'::jsonb);
end $$;

-- ---------- refunds and citations ---------------------------------------------
-- Records the refund. With real payments an Edge Function calls Stripe first, then this.
create or replace function operator_refund_session(p_session_id uuid, p_amount_cents integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me app_user; s parking_session; p payment; v_new integer;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  select * into s from parking_session where id = p_session_id;
  if not found or not _can_manage_area(v_me, s.area_id) then raise exception 'session_not_found' using errcode = 'P0001'; end if;
  if s.status <> 'completed' then raise exception 'session_not_completed' using errcode = 'P0001'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into p from payment where session_id = s.id and status in ('captured', 'partially_refunded')
   order by created_at desc limit 1 for update;
  if not found then raise exception 'nothing_to_refund' using errcode = 'P0001'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p.refunded_cents + p_amount_cents > p.amount_cents then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  v_new := p.refunded_cents + p_amount_cents;
  update payment set refunded_cents = v_new,
         status = case when v_new = amount_cents then 'refunded'::payment_status else 'partially_refunded'::payment_status end
   where id = p.id;
  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'parking_session', s.id::text, 'refund',
          jsonb_build_object('amount_cents', p_amount_cents, 'reason', btrim(p_reason)));
  return jsonb_build_object('session_id', s.id, 'refunded_cents', v_new, 'amount_cents', p.amount_cents);
end $$;

create or replace function operator_citations(p_from timestamptz default now() - interval '30 days',
                                              p_to timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  return coalesce((select jsonb_agg(j order by (j ->> 'issued_at') desc) from (
    select jsonb_build_object('id', c.id, 'plate', c.plate, 'area_name', a.name, 'reason', c.reason,
             'fine_cents', c.fine_cents, 'currency', c.currency, 'status', c.status,
             'issued_at', c.issued_at, 'officer', u.full_name) as j
    from citation c left join parking_area a on a.id = c.area_id left join app_user u on u.id = c.officer_id
    where c.issued_at between p_from and p_to
      and (v_me.operator_id is null or a.operator_id = v_me.operator_id)
    order by c.issued_at desc limit 1000) q), '[]'::jsonb);
end $$;

create or replace function operator_void_citation(p_citation_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me app_user; c citation;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  select * into c from citation where id = p_citation_id;
  if not found or (c.area_id is not null and not _can_manage_area(v_me, c.area_id))
     or (c.area_id is null and v_me.role <> 'platform_admin') then
    raise exception 'citation_not_found' using errcode = 'P0001';
  end if;
  if c.status = 'paid' then raise exception 'citation_already_paid' using errcode = 'P0001'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update citation set status = 'void' where id = c.id;
  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'citation', c.id::text, 'void', jsonb_build_object('reason', btrim(p_reason)));
end $$;

-- ---------- driver side: my tickets --------------------------------------------
create or replace function my_citations() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _me();
  return coalesce((select jsonb_agg(j order by (j ->> 'issued_at') desc) from (
    select jsonb_build_object('id', c.id, 'plate', c.plate, 'area_name', a.name, 'reason', c.reason,
             'fine_cents', c.fine_cents, 'currency', c.currency, 'status', c.status,
             'issued_at', c.issued_at, 'due_at', c.due_at) as j
    from citation c left join parking_area a on a.id = c.area_id
    where c.status <> 'void'
      and c.plate in (select v.plate from vehicle v where v.account_id in (select _my_account_ids()))
    order by c.issued_at desc limit 100) q), '[]'::jsonb);
end $$;

-- MOCK PAYMENT, like end_session: no money moves until Stripe is connected.
create or replace function pay_citation(p_citation_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me app_user; c citation; v_acc uuid;
begin
  v_me := _me();
  select * into c from citation where id = p_citation_id for update;
  select v.account_id into v_acc from vehicle v
   where v.plate = c.plate and v.account_id in (select _my_account_ids()) limit 1;
  if c.id is null or v_acc is null then raise exception 'citation_not_found' using errcode = 'P0001'; end if;
  if c.status <> 'issued' then raise exception 'citation_not_payable' using errcode = 'P0001'; end if;
  insert into payment (account_id, citation_id, provider, provider_payment_id, amount_cents, currency, status)
  values (v_acc, c.id, 'mock', 'mock_' || gen_random_uuid()::text, c.fine_cents, c.currency, 'captured');
  update citation set status = 'paid' where id = c.id;
  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'citation', c.id::text, 'pay', jsonb_build_object('fine_cents', c.fine_cents));
  return jsonb_build_object('id', c.id, 'status', 'paid', 'fine_cents', c.fine_cents, 'currency', c.currency);
end $$;

-- ---------- audit log and platform admin ---------------------------------------
create or replace function operator_audit_log(p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['operator_admin','platform_admin']::user_role[]);
  return coalesce((select jsonb_agg(j order by (j ->> 'at') desc) from (
    select jsonb_build_object('id', l.id, 'at', l.created_at, 'by', coalesce(u.full_name, 'system'), 'role', u.role,
             'entity', l.entity, 'entity_id', l.entity_id, 'action', l.action, 'detail', l.request) as j
    from audit_log l left join app_user u on u.id = l.actor_user_id
    where v_me.role = 'platform_admin'
       or (u.operator_id = v_me.operator_id and u.role in ('officer', 'operator_admin'))
    order by l.created_at desc limit least(greatest(p_limit, 1), 1000)) q), '[]'::jsonb);
end $$;

create or replace function admin_operators() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_staff(array['platform_admin']::user_role[]);
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'country', o.country,
             'timezone', o.timezone, 'currency', o.currency, 'service_fee_bps', o.service_fee_bps,
             'areas', (select count(*) from parking_area a where a.operator_id = o.id),
             'admins', (select coalesce(jsonb_agg(u.email), '[]'::jsonb) from app_user u
                        where u.operator_id = o.id and u.role = 'operator_admin' and u.deleted_at is null))
           order by o.name) from operator o), '[]'::jsonb);
end $$;

create or replace function admin_save_operator(p_id uuid, p_name text, p_country text, p_timezone text,
                                               p_currency text, p_service_fee_bps integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me app_user; v_id uuid := p_id;
begin
  v_me := _require_staff(array['platform_admin']::user_role[]);
  if p_name is null or length(btrim(p_name)) < 2 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if p_service_fee_bps is null or p_service_fee_bps not between 0 and 5000 then raise exception 'invalid_fee' using errcode = 'P0001'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then raise exception 'invalid_timezone' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into operator (name, country, timezone, currency, service_fee_bps)
    values (btrim(p_name), upper(p_country), p_timezone, upper(p_currency), p_service_fee_bps) returning id into v_id;
  else
    -- currency and timezone stay fixed once sessions exist; only name and fee change here
    update operator set name = btrim(p_name), service_fee_bps = p_service_fee_bps where id = v_id;
    if not found then raise exception 'operator_not_found' using errcode = 'P0001'; end if;
  end if;
  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'operator', v_id::text, 'save', jsonb_build_object('name', btrim(p_name), 'service_fee_bps', p_service_fee_bps));
  return v_id;
end $$;

create or replace function admin_set_operator_admin(p_email text, p_operator_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me app_user;
begin
  v_me := _require_staff(array['platform_admin']::user_role[]);
  if p_operator_id is not null and not exists (select 1 from operator where id = p_operator_id) then
    raise exception 'operator_not_found' using errcode = 'P0001';
  end if;
  update app_user set role = case when p_operator_id is null then 'driver'::user_role else 'operator_admin'::user_role end,
         operator_id = p_operator_id
   where email = lower(p_email) and deleted_at is null and role <> 'platform_admin';
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  insert into audit_log (actor_user_id, entity, entity_id, action, request)
  values (v_me.id, 'app_user', lower(p_email), 'set_operator_admin', jsonb_build_object('operator_id', p_operator_id));
end $$;

-- ---------- permissions --------------------------------------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any (array[
             'operator_save_area','operator_publish_area','operator_area_versions','operator_report_series',
             'operator_sessions','operator_refund_session','operator_citations','operator_void_citation',
             'operator_audit_log','admin_operators','admin_save_operator','admin_set_operator_admin',
             'my_citations','pay_citation']) loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any (array['_snapshot_area','_can_manage_area']) loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
