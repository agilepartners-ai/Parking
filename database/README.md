> **2026-11-10:** the schema here is now deployed and tested from `../supabase/migrations/` (80 automated checks). This folder is kept as the design reference and old-to-new table mapping.

# Database

Two parts:

| Path | What |
|---|---|
| `schema.sql` | **New** PostgreSQL + PostGIS schema for the rebuilt app. Start here. |
| `seed_dev.sql` | Fake demo data and example queries with expected results |
| `legacy-sql/` | The 2012 SQL Server scripts, moved here unchanged, for reference only |

## Status
- `schema.sql` and `seed_dev.sql` are a **design draft**. `schema.sql` passes a PostgreSQL parser check (60 statements). **It has not been run against a server.** Run it on a throwaway Neon/Supabase/local database first and fix anything it reports. `seed_dev.sql` also parses (4 statements) but has not been run; the expected fee values in its comments were worked out by hand, so confirm them when you first run it.
- No real data exists to migrate. The 2012 database was a prototype with test rows.

## Try it locally (Docker)
```bash
docker run --name parking-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgis/postgis:16-3.4
psql postgresql://postgres:dev@localhost:5432/postgres -f database/schema.sql -f database/seed_dev.sql
```
Then run the queries in the comments at the bottom of `seed_dev.sql`.

## How the old tables map to the new ones
| 2012 (SQL Server) | New (Postgres) | Change |
|---|---|---|
| `UserInfo` | `app_user` + `account` + `vehicle` | No passwords (auth provider). Plates are rows, not a `;`-separated string |
| `ParkInfo` | `parking_session` (+ `location_ping`) | UUID ids, idempotency key, `geography` points, proper timestamps and money types, status enum |
| `Audit` (TxID, RequestStr) | `audit_log` + `parking_session.idempotency_key` | Idempotency and audit are separate concerns |
| `geo_LocationTitle` + `geo_LocationTitleCord` | `parking_area` (PostGIS polygon) | No per-point rows; spatial index; hierarchy level 1-3 from the patent |
| `geo_log` / `geo_LogCurrentLocation` | `location_ping`, `enforcement_check` | |
| (none) | `operator`, `rate_plan`, `rate_rule`, `payment`, `payment_method`, `citation`, `notification`, `fraud_flag`, `toll_road`, `toll_trip` | Everything the patents describe that the prototype never built |

## Design decisions worth knowing
- **Money** is integer cents plus a currency code. Never floats.
- **Time** is `timestamptz` in UTC. The operator's `timezone` decides which tariff rule applies (the old dev notes learned about UTC the hard way).
- **Area-level pricing**, not bay-level, because phone GPS is only good to about 5-25 m (patent). `find_parking_area` picks the most specific polygon.
- **One active session per vehicle** is enforced by a partial unique index.
- **Idempotency**: the app generates a key per start/stop request; a retry returns the same session instead of creating a duplicate.
- **Server clock** starts the timer; `client_started_at` is kept only for offline queues.
- **No card data**. `payment_method` stores provider tokens and last 4 digits only.
- **Fee logic** exists twice on purpose: `compute_fee_cents()` is the reference/test oracle; the API will call it or re-implement it in TypeScript with the same test cases. Billing is per started minute; grace period is free; then min charge and daily max.

## Operational notes
- Retention: delete `location_ping` rows for sessions older than 30 days (scheduled job). Location history is personal data.
- Account deletion: soft-delete (`app_user.deleted_at`), then a purge job that anonymises sessions and removes vehicles and payment methods. Financial records may need to be kept by law, in anonymised form.
- If you use **Supabase**, enable Row Level Security on every table and write policies keyed on `app_user.auth_subject = auth.uid()::text`. Operators, officers and admins need separate policies. Do this before exposing any table to the client SDK.
- Spatial indexes use `gist`. For large cities consider partitioning `parking_session` by month.
