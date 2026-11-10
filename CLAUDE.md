# ParkPay - context for Claude sessions

Rebuild of a 2012 geo-location parking payment prototype as **Expo (React Native) app + operator web console + Supabase (Postgres/PostGIS)**. Owner: Yatharth (sole author of everything published).

## Read first
1. `README.md`, then `docs/00-INDEX.md`
2. `docs/02-ip-and-legal.md` before any advice on launching or enforcing the patents. Ownership is the owner's stated working assumption, not a verified fact; no assignment document or maintenance-fee check exists in the project.
3. `docs/SETUP-AND-TESTING.md` for commands and the test checklist

## Architecture in one paragraph
All business rules live in SQL functions in `supabase/migrations/` (server keeps time, finds the area with PostGIS, prices the stay, enforces roles via RLS). Clients call them via `supabase.rpc`. `packages/shared` holds the fee engine (mirrors SQL `compute_fee_cents`; same test cases), area matching, and demo data; `supabase/seed.sql` is GENERATED from it with `npm run seed:gen`. The mobile app has two backends behind one `Api` interface: `supabaseApi` (live) and `demoApi` (offline, on-device).

## Commands
- `npm test` fee tests; `npm run typecheck`; `npm run mobile`; `npm run console`
- `node supabase/migrate.mjs [--seed]` apply migrations; `node supabase/tests/run.mjs` DB tests (transaction, rolled back)
- Add a NEW migration file for schema changes; never edit applied migrations.

## Rules
- Money is integer cents; times are UTC `timestamptz`; the operator's time zone decides tariffs.
- Never put the Supabase secret key or DB password in the apps. Never commit `.env`, `demo-accounts.txt`, `password.txt`.
- Payments are MOCK (`payment.provider = 'mock'`). Real Stripe is the next milestone (see SETUP-AND-TESTING section 8).
- Expo SDK 58: check docs.expo.dev before using Expo APIs. Background location does not work in Expo Go.
- Do not claim legal conclusions. Demo prices are sample numbers, not real tariffs. Old "Agile Parking" branding belongs to another company.
- Owner is the only author: no `Co-Authored-By` or "generated with" lines in commits, PRs, issues, READMEs or code comments. New GitHub repos are private by default. Websites deploy to Cloudflare.
- The 2012 code and its plaintext credentials live only in the local archive `D:\Current Projects\Parking_app` and must never enter this repo.
