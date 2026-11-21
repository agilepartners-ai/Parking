-- PROPOSED toll schema for ParkPay Toll. NOT applied and NOT in supabase/migrations on purpose.
-- Replaces the two empty draft tables toll_road and toll_trip. Applied inside a rolled-back transaction on 2026-11-21: it applies cleanly.
-- See docs/TOLL-MASTER-SPECIFICATION.md section 7.

drop table if exists toll_trip;
drop table if exists toll_road;

create type toll_trip_status as enum ('candidate','active','completed','cancelled_brief_entry','needs_review','disputed','void');
create type toll_node_kind   as enum ('entry','exit','both');

create table toll_road (
  id               uuid primary key default gen_random_uuid(),
  operator_id      uuid not null references operator(id),
  name             text not null,
  active           boolean not null default false,            -- published, like parking_area.active
  min_confidence   numeric(5,4) not null default 0.9900 check (min_confidence between 0.5 and 0.99999),
  brief_entry_m    numeric(7,1) not null default 300 check (brief_entry_m >= 0),   -- claim 8: "stipulated" distance
  brief_entry_s    integer      not null default 120 check (brief_entry_s >= 0),   -- claim 8: "stipulated" time
  valid_from       timestamptz,
  valid_to         timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table toll_carriageway (                                -- one direction of a road
  id            uuid primary key default gen_random_uuid(),
  road_id       uuid not null references toll_road(id) on delete cascade,
  direction     text not null,                                  -- 'eastbound', 'to the airport', ...
  centreline    geometry(LineString,4326) not null,             -- drawn in travel direction
  half_width_m  numeric(5,1) not null default 15 check (half_width_m between 3 and 100),
  unique (road_id, direction)
);
create index toll_carriageway_gix on toll_carriageway using gist (centreline);

create table toll_node (                                       -- an entry or exit point, in distance order
  id              uuid primary key default gen_random_uuid(),
  carriageway_id  uuid not null references toll_carriageway(id) on delete cascade,
  name            text not null,
  kind            toll_node_kind not null,
  chainage_m      numeric(10,1) not null check (chainage_m >= 0),   -- metres along the centreline from its start
  location        geography(Point,4326) not null,
  unique (carriageway_id, name)
);
create index toll_node_gix on toll_node using gist (location);

create table toll_rate_card (
  id               uuid primary key default gen_random_uuid(),
  road_id          uuid not null references toll_road(id) on delete cascade,
  currency         char(3) not null,
  min_charge_cents integer not null default 0 check (min_charge_cents >= 0),
  daily_max_cents  integer check (daily_max_cents >= 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table toll_rate_rule (                                  -- claim 5: day and time of entry, speed, time on road, plan
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references toll_rate_card(id) on delete cascade,
  vehicle_class text not null default 'car' check (vehicle_class in ('car','motorcycle','van','truck')),
  days_of_week  smallint[] not null default '{1,2,3,4,5,6,7}',
  start_time    time not null default '00:00',                  -- time of ENTRY, operator-local
  end_time      time not null default '24:00',
  from_node_id  uuid references toll_node(id),                  -- both null = any trip
  to_node_id    uuid references toll_node(id),
  per_km_cents  integer check (per_km_cents >= 0),
  flat_cents    integer check (flat_cents >= 0),
  max_speed_kph integer,                                        -- optional: rule applies up to this average speed
  priority      integer not null default 0,
  check (per_km_cents is not null or flat_cents is not null)
);

create table toll_device (                                     -- claim 1: devices are registered with the cloud
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references app_user(id),
  install_id          text not null,
  platform            text not null check (platform in ('android','ios')),
  app_version         text,
  default_vehicle_id  uuid references vehicle(id),
  is_passenger        boolean not null default false,
  last_seen_at        timestamptz,
  disabled_at         timestamptz,
  unique (user_id, install_id)
);

create table toll_trip (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references app_user(id),
  vehicle_id        uuid not null references vehicle(id),
  device_id         uuid not null references toll_device(id),
  road_id           uuid not null references toll_road(id),
  carriageway_id    uuid not null references toll_carriageway(id),
  rate_card_id      uuid references toll_rate_card(id),         -- frozen at entry, like the parking tariff
  entry_node_id     uuid references toll_node(id),
  exit_node_id      uuid references toll_node(id),
  status            toll_trip_status not null default 'candidate',
  entered_at        timestamptz,
  exited_at         timestamptz,
  entry_chainage_m  numeric(10,1),
  exit_chainage_m   numeric(10,1),
  distance_m        numeric(10,1),
  confidence        numeric(6,5),
  readings          integer not null default 0,
  fee_cents         integer check (fee_cents >= 0),
  service_fee_cents integer check (service_fee_cents >= 0),
  operator_payout_cents integer check (operator_payout_cents >= 0),
  currency          char(3),
  receipt_no        text unique,
  review_reason     text,
  idempotency_key   text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (status <> 'completed' or (exited_at is not null and fee_cents is not null and receipt_no is not null))
);
create unique index toll_trip_one_open_per_vehicle on toll_trip (vehicle_id) where status in ('candidate','active');
create index toll_trip_user_idx on toll_trip (user_id, created_at desc);
create index toll_trip_plate_open_idx on toll_trip (road_id) where status = 'active';

create table toll_reading (                                    -- raw fixes. Deleted after the dispute window.
  id           bigint generated always as identity primary key,
  device_id    uuid not null references toll_device(id) on delete cascade,
  trip_id      uuid references toll_trip(id) on delete cascade,
  recorded_at  timestamptz not null,
  location     geography(Point,4326) not null,
  accuracy_m   numeric(8,2),
  speed_mps    numeric(8,2),
  heading_deg  numeric(5,1) check (heading_deg is null or heading_deg >= 0 and heading_deg < 360),
  source       text not null default 'gps' check (source in ('gps','network'))
);
create index toll_reading_device_idx on toll_reading (device_id, recorded_at);

create table toll_dispute (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references toll_trip(id),
  user_id      uuid not null references app_user(id),
  reason       text not null,
  status       text not null default 'open' check (status in ('open','upheld','rejected')),
  resolution   text,
  resolved_by  uuid references app_user(id),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

-- payments and tickets can point at a toll trip
alter table payment  add column toll_trip_id uuid references toll_trip(id);
alter table payment  drop constraint payment_check;
alter table payment  add constraint payment_target_check check (session_id is not null or citation_id is not null or toll_trip_id is not null);
alter table citation add column toll_trip_id uuid references toll_trip(id);

alter table toll_road enable row level security;
alter table toll_carriageway enable row level security;
alter table toll_node enable row level security;
alter table toll_rate_card enable row level security;
alter table toll_rate_rule enable row level security;
alter table toll_device enable row level security;
alter table toll_trip enable row level security;
alter table toll_reading enable row level security;
alter table toll_dispute enable row level security;
