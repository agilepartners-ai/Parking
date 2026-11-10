-- Development seed. ALL DATA IS FAKE. Not for production.
-- Run after schema.sql. Lets you try find_parking_area() and compute_fee_cents().

insert into operator (id, name, country, timezone, currency, service_fee_bps)
values ('00000000-0000-0000-0000-0000000000a1', 'Demo Parking Authority', 'CA', 'America/Toronto', 'CAD', 500);

-- A small invented square near downtown Toronto (about 100 m x 100 m) as the level-3 area.
insert into parking_area (id, operator_id, level, kind, name, geom, total_spaces, max_stay_minutes)
values (
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000a1',
  3, 'street', 'Demo Street Block A',
  st_multi(st_setsrid(st_geomfromtext(
    'POLYGON((-79.3850 43.6530, -79.3838 43.6530, -79.3838 43.6539, -79.3850 43.6539, -79.3850 43.6530))'), 4326)),
  12, 180
);

insert into rate_plan (id, operator_id, area_id, name, type, currency, min_charge_cents, daily_max_cents, grace_minutes)
values ('00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000b1',
        'Demo pay-at-end', 'pay_at_end', 'CAD', 100, 2000, 5);

-- Mon-Sat 08:00-18:00 at 3.00/h, Mon-Sat 18:00-23:00 at 1.50/h, Sunday free (no rule).
insert into rate_rule (rate_plan_id, days_of_week, start_time, end_time, price_per_hour_cents) values
  ('00000000-0000-0000-0000-0000000000c1', '{1,2,3,4,5,6}', '08:00', '18:00', 300),
  ('00000000-0000-0000-0000-0000000000c1', '{1,2,3,4,5,6}', '18:00', '23:00', 150);

-- Quick checks (expected values in the comments):
-- select * from find_parking_area(43.6534, -79.3844);                       -- Demo Street Block A
-- select * from find_parking_area(43.7000, -79.4000);                       -- no rows
-- A Tuesday 10:00-12:00 Toronto time (15:00-17:00 UTC in November):
-- select compute_fee_cents('00000000-0000-0000-0000-0000000000c1',
--        '2026-11-10 15:00:00+00', '2026-11-10 17:00:00+00');               -- 600 (2h x 3.00)
-- 3 minutes: inside the 5-minute grace period:
-- select compute_fee_cents('00000000-0000-0000-0000-0000000000c1',
--        '2026-11-10 15:00:00+00', '2026-11-10 15:03:00+00');               -- 0
-- Sunday 2026-11-15 12:00-14:00 local: no rule applies, min charge 100:
-- select compute_fee_cents('00000000-0000-0000-0000-0000000000c1',
--        '2026-11-15 17:00:00+00', '2026-11-15 19:00:00+00');               -- 100
