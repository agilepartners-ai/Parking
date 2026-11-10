-- =============================================================================
-- Parking app - target schema (PostgreSQL 15+ with PostGIS)
-- Replaces the 2012 SQL Server schema (UserInfo, ParkInfo, Audit, geo_*).
-- Portable: plain Postgres + PostGIS. Works on Neon, Supabase, RDS, local.
-- Identity: authentication is delegated to an auth provider. This schema never
-- stores passwords; app_user.auth_subject holds the provider's user id.
-- Status: runs on PostgreSQL 16 + PostGIS (tested with supabase/tests/run.mjs).
-- Money: integer minor units (cents) + ISO currency. Time: timestamptz, UTC.
-- Patent mapping is in comments: [P1]=US9792818 claim 1, [P2]=US10726403.
-- =============================================================================

create extension if not exists postgis;
create extension if not exists citext;

-- ---------- enums ------------------------------------------------------------
create type user_role        as enum ('driver','officer','operator_admin','platform_admin');
create type account_kind     as enum ('individual','family','business');          -- [P1 dep] master + sub-accounts
create type area_kind        as enum ('lot','street','zone','region');
create type plan_type        as enum ('pay_at_end','hourly_prepaid','day_pass','week_pass','month_pass','tourist_pass');
create type session_status   as enum ('active','completed','expired','cancelled','disputed');
create type payment_status   as enum ('requires_action','authorized','captured','failed','refunded','partially_refunded','void');
create type citation_status  as enum ('issued','paid','appealed','void');
create type check_result     as enum ('valid','expired','no_session','wrong_area');
create type notif_kind       as enum ('expiring_soon','expired','lot_closing','left_area_end_session','receipt','citation','payment_failed');
create type notif_channel    as enum ('push','sms','email','voice');
create type notif_status     as enum ('scheduled','sent','failed','cancelled');
create type fraud_status     as enum ('open','reviewed','dismissed','confirmed');

-- ---------- helper: updated_at ----------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- people and accounts ---------------------------------------------
create table app_user (
  id            uuid primary key default gen_random_uuid(),
  auth_subject  text not null unique,                 -- id from the auth provider
  email         citext unique,
  phone_e164    text unique check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  full_name     text not null,
  role          user_role not null default 'driver',
  locale        text not null default 'en',
  marketing_opt_in boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,                          -- soft delete, then purge job
  check (email is not null or phone_e164 is not null)
);
create trigger trg_app_user_updated before update on app_user
  for each row execute function set_updated_at();

create table account (                                -- billing owner; family/business share one
  id            uuid primary key default gen_random_uuid(),
  kind          account_kind not null default 'individual',
  owner_user_id uuid not null references app_user(id),
  name          text,
  created_at    timestamptz not null default now()
);
create table account_member (
  account_id    uuid not null references account(id) on delete cascade,
  user_id       uuid not null references app_user(id) on delete cascade,
  is_admin      boolean not null default false,
  primary key (account_id, user_id)
);

create table vehicle (                                -- replaces DefaultLicensePlate + semicolon list
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references account(id) on delete cascade,
  plate         text not null,
  plate_region  text,                                 -- state/province (old: RegionLicensePlateFrom)
  plate_country char(2) not null default 'US',
  nickname      text,
  is_default    boolean not null default false,
  is_temporary  boolean not null default false,       -- rental/borrowed car [P1 dep]
  expires_at    timestamptz,                          -- for temporary vehicles
  qr_code       text unique,                          -- sticker id [P1 dep]
  created_at    timestamptz not null default now(),
  check (plate = upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g')))   -- store normalised
);
create index vehicle_plate_idx on vehicle (plate_country, plate_region, plate);
create unique index vehicle_one_default_per_account on vehicle (account_id) where is_default;

create table payment_method (                         -- never store card data; provider tokens only
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references account(id) on delete cascade,
  provider      text not null default 'stripe',
  provider_customer_id text not null,
  provider_method_id   text not null,
  brand         text,
  last4         char(4),
  exp_month     smallint,
  exp_year      smallint,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (provider, provider_method_id)
);

-- ---------- operators, areas, rates -----------------------------------------
create table operator (                               -- city authority, private lot owner, ...
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  legal_name    text,
  country       char(2) not null,
  timezone      text not null,                        -- IANA, e.g. America/Toronto
  currency      char(3) not null,
  service_fee_bps integer not null default 0 check (service_fee_bps between 0 and 10000), -- platform cut [P1 desc]
  payout_account_ref text,                            -- e.g. Stripe Connect account id
  created_at    timestamptz not null default now()
);

create table parking_area (                           -- replaces geo_LocationTitle + geo_LocationTitleCord
  id            uuid primary key default gen_random_uuid(),
  operator_id   uuid not null references operator(id),
  parent_id     uuid references parking_area(id),     -- [P1] hierarchy: region > city > polygon
  level         smallint not null check (level in (1,2,3)),  -- 1=Admin-1 (state), 2=Admin-2 (city), 3=Admin-3 (polygon)
  kind          area_kind not null default 'zone',
  name          text not null,
  geom          geometry(MultiPolygon,4326) not null,
  source_line   geometry(LineString,4326),            -- original drawn kerbside line (old Ptype='line'), buffered into geom
  total_spaces  integer check (total_spaces >= 0),    -- for occupancy
  max_stay_minutes integer check (max_stay_minutes > 0),
  active        boolean not null default true,
  valid_from    timestamptz,
  valid_to      timestamptz,
  created_by    uuid references app_user(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index parking_area_geom_gix on parking_area using gist (geom);
create index parking_area_operator_idx on parking_area (operator_id);
create trigger trg_parking_area_updated before update on parking_area
  for each row execute function set_updated_at();

create table rate_plan (                              -- a product the driver can buy in an area
  id            uuid primary key default gen_random_uuid(),
  operator_id   uuid not null references operator(id),
  area_id       uuid references parking_area(id),     -- null = operator-wide default
  name          text not null,
  type          plan_type not null default 'pay_at_end',
  currency      char(3) not null,
  pass_price_cents integer check (pass_price_cents >= 0),  -- for day/week/month/tourist passes
  min_charge_cents integer not null default 0 check (min_charge_cents >= 0),
  daily_max_cents  integer check (daily_max_cents >= 0),
  grace_minutes integer not null default 5 check (grace_minutes >= 0),  -- old code: cancel inside 5 min
  active        boolean not null default true,
  valid_from    timestamptz,
  valid_to      timestamptz,
  created_at    timestamptz not null default now()
);
create index rate_plan_area_idx on rate_plan (area_id) where active;

create table rate_rule (                              -- time-of-day tariff lines (deck: day/time/location pricing)
  id            uuid primary key default gen_random_uuid(),
  rate_plan_id  uuid not null references rate_plan(id) on delete cascade,
  days_of_week  smallint[] not null,                  -- ISO: 1=Mon .. 7=Sun
  start_time    time not null,                        -- local time of the operator
  end_time      time not null,                        -- may be 24:00; overnight = two rules
  price_per_hour_cents integer not null check (price_per_hour_cents >= 0),
  priority      smallint not null default 0,          -- higher wins when rules overlap
  check (start_time < end_time),
  check (days_of_week <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(days_of_week) > 0)
);
create index rate_rule_plan_idx on rate_rule (rate_plan_id);

-- ---------- parking sessions (replaces ParkInfo) -----------------------------
create table parking_session (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_user(id),
  account_id    uuid not null references account(id),
  vehicle_id    uuid not null references vehicle(id),
  plate_snapshot text not null,                       -- plate at the time (vehicle may be edited)
  area_id       uuid not null references parking_area(id),
  rate_plan_id  uuid not null references rate_plan(id),
  status        session_status not null default 'active',
  started_at    timestamptz not null default now(),   -- SERVER time [P1] "server starts a timer"
  client_started_at timestamptz,                      -- device clock, for offline queues
  planned_end_at timestamptz,                         -- for prepaid/pass
  ended_at      timestamptz,
  start_location geography(Point,4326) not null,
  start_accuracy_m numeric(8,2),                      -- old: Accuracy
  start_speed_mps  numeric(8,2),                      -- old: Speed
  start_heading_deg numeric(6,2),                     -- old: Heading
  end_location  geography(Point,4326),
  end_accuracy_m numeric(8,2),
  duration_minutes integer,
  fee_cents     integer check (fee_cents >= 0),
  currency      char(3) not null,
  service_fee_cents integer check (service_fee_cents >= 0),
  operator_payout_cents integer check (operator_payout_cents >= 0),
  idempotency_key text not null,                      -- replaces TxID/Audit duplicate check
  device_id     text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (ended_at is null or ended_at >= started_at),
  check (status <> 'completed' or (ended_at is not null and fee_cents is not null))
);
create unique index one_active_session_per_vehicle on parking_session (vehicle_id) where status = 'active';
create index parking_session_user_idx on parking_session (user_id, started_at desc);
create index parking_session_area_active_idx on parking_session (area_id) where status = 'active';
create index parking_session_plate_active_idx on parking_session (plate_snapshot) where status = 'active';
create trigger trg_parking_session_updated before update on parking_session
  for each row execute function set_updated_at();

create table location_ping (                          -- breadcrumbs while a session is open [P1 speed reminder, P2 toll]
  id            bigint generated always as identity primary key,
  session_id    uuid not null references parking_session(id) on delete cascade,
  recorded_at   timestamptz not null,
  location      geography(Point,4326) not null,
  accuracy_m    numeric(8,2),
  speed_mps     numeric(8,2)
);
create index location_ping_session_idx on location_ping (session_id, recorded_at);
-- RETENTION: purge pings of completed sessions after 30 days (see database/README.md).

-- ---------- payments ---------------------------------------------------------
create table payment (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references account(id),
  session_id    uuid references parking_session(id),
  citation_id   uuid,                                 -- FK added below (circular order)
  provider      text not null default 'stripe',
  provider_payment_id text not null,                  -- PaymentIntent id
  amount_cents  integer not null check (amount_cents >= 0),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  currency      char(3) not null,
  status        payment_status not null,
  failure_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (provider, provider_payment_id),
  check (session_id is not null or citation_id is not null)
);
create trigger trg_payment_updated before update on payment
  for each row execute function set_updated_at();

-- ---------- enforcement ------------------------------------------------------
create table citation (                               -- [P1] officer sends violation tickets to the server
  id            uuid primary key default gen_random_uuid(),
  officer_id    uuid not null references app_user(id),
  session_id    uuid references parking_session(id),
  vehicle_id    uuid references vehicle(id),
  plate         text not null,
  plate_region  text,
  area_id       uuid references parking_area(id),
  location      geography(Point,4326),
  reason        text not null,
  fine_cents    integer not null check (fine_cents >= 0),
  currency      char(3) not null,
  status        citation_status not null default 'issued',
  photo_path    text,
  issued_at     timestamptz not null default now(),
  due_at        timestamptz
);
create index citation_plate_idx on citation (plate, issued_at desc);
alter table payment add constraint payment_citation_fk foreign key (citation_id) references citation(id);

create table enforcement_check (                      -- every plate lookup by an officer; feeds repeat-offender view
  id            bigint generated always as identity primary key,
  officer_id    uuid not null references app_user(id),
  plate         text not null,
  plate_region  text,
  area_id       uuid references parking_area(id),
  result        check_result not null,
  location      geography(Point,4326),
  checked_at    timestamptz not null default now()
);
create index enforcement_check_plate_idx on enforcement_check (plate, checked_at desc);

create view repeat_offender as                        -- deck slide 12: "database of repeat offenders"
select plate, plate_region,
       count(*)           as citation_count,
       sum(fine_cents)    as fines_cents,
       max(issued_at)     as last_issued_at
from citation
where status <> 'void'
group by plate, plate_region
having count(*) >= 3;

-- ---------- notifications, fraud, audit -------------------------------------
create table notification (                           -- reminders [P1: expiring, lot closing, left without ending]
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_user(id) on delete cascade,
  session_id    uuid references parking_session(id) on delete cascade,
  kind          notif_kind not null,
  channel       notif_channel not null default 'push',
  scheduled_for timestamptz not null,
  sent_at       timestamptz,
  status        notif_status not null default 'scheduled',
  payload       jsonb not null default '{}'
);
create index notification_due_idx on notification (scheduled_for) where status = 'scheduled';

create table fraud_flag (                             -- [P1 dep] unusual activity / fraud detection
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references app_user(id),
  session_id    uuid references parking_session(id),
  kind          text not null,                        -- e.g. 'impossible_travel','many_plates','area_mismatch'
  score         numeric(5,2),
  details       jsonb not null default '{}',
  status        fraud_status not null default 'open',
  created_at    timestamptz not null default now()
);

create table audit_log (                              -- replaces the old Audit table (TxID, RequestStr)
  id            bigint generated always as identity primary key,
  actor_user_id uuid references app_user(id),
  entity        text not null,
  entity_id     text,
  action        text not null,
  request       jsonb,
  ip            inet,
  created_at    timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity, entity_id, created_at desc);

-- ---------- phase 2: toll roads [P2] (create later, listed so the model is complete) ----
create table toll_road (
  id            uuid primary key default gen_random_uuid(),
  operator_id   uuid not null references operator(id),
  name          text not null,
  corridor      geometry(MultiPolygon,4326) not null,   -- buffered road centreline
  entry_points  geometry(MultiPoint,4326),
  rate_plan_id  uuid references rate_plan(id),
  active        boolean not null default true
);
create index toll_road_corridor_gix on toll_road using gist (corridor);

create table toll_trip (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_user(id),
  vehicle_id    uuid not null references vehicle(id),
  toll_road_id  uuid not null references toll_road(id),
  entered_at    timestamptz not null,
  exited_at     timestamptz,
  distance_m    numeric(10,1),
  confidence    numeric(4,3),                           -- statistical confidence from multiple readings
  fee_cents     integer,
  currency      char(3),
  idempotency_key text not null,
  unique (user_id, idempotency_key)
);

-- =============================================================================
-- Functions
-- =============================================================================

-- [P1] "server determines the parking area from the user's location".
-- Most specific level wins (3 before 2 before 1); ties go to the smallest area.
create or replace function find_parking_area(p_lat double precision, p_lng double precision)
returns table (area_id uuid, area_name text, area_level smallint, area_operator_id uuid)
language sql stable as $$
  with p as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as pt)
  select a.id, a.name, a.level, a.operator_id
  from parking_area a, p
  where a.active
    and (a.valid_from is null or a.valid_from <= now())
    and (a.valid_to   is null or a.valid_to   >  now())
    and a.geom && p.pt
    and st_covers(a.geom, p.pt)
  order by a.level desc, st_area(a.geom::geography) asc
  limit 1;
$$;

-- Reference fee calculator (the API may re-implement this in TypeScript; keep tests aligned).
-- Rules: per STARTED minute, rate chosen from the rate_rule active at that local minute
-- (highest priority wins), grace period is free, then min charge and daily max apply.
-- Pass plans (day/week/month/tourist) return pass_price_cents and ignore rules.
create or replace function compute_fee_cents(p_rate_plan_id uuid, p_start timestamptz, p_end timestamptz)
returns integer
language plpgsql stable as $$
declare
  v_plan    rate_plan%rowtype;
  v_tz      text;
  v_total   numeric := 0;
  v_minutes integer;
  v_days    integer;
  v_fee     integer;
begin
  select * into v_plan from rate_plan where id = p_rate_plan_id;
  if not found then
    raise exception 'rate plan % not found', p_rate_plan_id;
  end if;
  if p_end <= p_start then
    return 0;
  end if;
  if v_plan.type in ('day_pass','week_pass','month_pass','tourist_pass') then
    return coalesce(v_plan.pass_price_cents, 0);
  end if;
  if p_end - p_start <= make_interval(mins => v_plan.grace_minutes) then
    return 0;
  end if;

  select o.timezone into v_tz from operator o where o.id = v_plan.operator_id;

  select coalesce(sum(r.price_per_hour_cents), 0), count(*)
    into v_total, v_minutes
  from generate_series(date_trunc('minute', p_start),
                       p_end - interval '1 microsecond',
                       interval '1 minute') as m(t)
  left join lateral (
    select rr.price_per_hour_cents
    from rate_rule rr
    where rr.rate_plan_id = p_rate_plan_id
      and extract(isodow from (m.t at time zone v_tz))::smallint = any (rr.days_of_week)
      and (m.t at time zone v_tz)::time >= rr.start_time
      and (m.t at time zone v_tz)::time <  rr.end_time
    order by rr.priority desc, rr.id
    limit 1
  ) r on true;

  v_fee := ceil(v_total / 60.0)::integer;   -- integer maths first, divide once, round up
  if v_plan.daily_max_cents is not null then
    v_days := greatest(1, ceil(v_minutes / 1440.0)::integer);
    v_fee  := least(v_fee, v_plan.daily_max_cents * v_days);
  end if;
  return greatest(v_fee, v_plan.min_charge_cents);
end $$;

-- Platform cut and operator payout split. [P1 desc] operator is credited minus an agreed service charge.
create or replace function split_fee(p_fee_cents integer, p_service_fee_bps integer)
returns table (service_fee_cents integer, operator_payout_cents integer)
language sql immutable as $$
  select (p_fee_cents * p_service_fee_bps / 10000)::integer,
         p_fee_cents - (p_fee_cents * p_service_fee_bps / 10000)::integer;
$$;

-- Officer view: validly parked vehicles within p_radius_m of the officer. [P1 claim 1 element 3]
create or replace function valid_vehicles_near(p_lat double precision, p_lng double precision, p_radius_m integer default 150)
returns table (session_id uuid, plate text, area_id uuid, started_at timestamptz, planned_end_at timestamptz)
language sql stable as $$
  select s.id, s.plate_snapshot, s.area_id, s.started_at, s.planned_end_at
  from parking_session s
  where s.status = 'active'
    and (s.planned_end_at is null or s.planned_end_at > now())
    and st_dwithin(s.start_location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m);
$$;
