# ParkPay (working name)

Geo-location parking payment: a driver parks, taps **Start**, taps **End**, and pays for the exact minutes. An officer checks plates; an operator draws parking areas and sets prices.

This is the rebuild of a 2012 prototype, based on two US patents (US 9,792,818 parking, US 10,726,403 tolls). Patent ownership paperwork must be confirmed before launch: see [docs/02-ip-and-legal.md](docs/02-ip-and-legal.md).

| Read this | If you are |
|---|---|
| [docs/EXPLAINER-FOR-MANAGEMENT.md](docs/EXPLAINER-FOR-MANAGEMENT.md) | A manager or partner: what it is, how it works, status, risks |
| [docs/SETUP-AND-TESTING.md](docs/SETUP-AND-TESTING.md) | Testing on iPhone/Android, live mode, console, releases |
| [docs/00-INDEX.md](docs/00-INDEX.md) | A developer: the full knowledge base |

## Status

Working prototype: driver app, officer mode, operator console, Postgres/PostGIS backend on Supabase with 80 automated database checks and a tested fee engine. **Payments are simulated.** Not yet run on a physical phone, and not in the stores.

## Layout

```
apps/mobile        Expo (React Native, TypeScript): driver + officer, iOS / Android / basic web
apps/ops-console   Operator website (Vite, React, Leaflet)
packages/shared    Fee engine, area matching, demo data (shared by everything)
supabase/          migrations, seed, database tests
scripts/           demo user creation
docs/              knowledge base
```

## Quick start

```bash
npm install
npm test                       # fee engine tests
npm run typecheck              # all packages
npm run mobile                 # Expo dev server; scan the QR with Expo Go
npm run console                # operator console on http://localhost:5173
node supabase/tests/run.mjs    # database tests (needs .env, see SETUP-AND-TESTING.md)
```

The app runs in **offline demo mode** when `apps/mobile/.env` is absent, and against your Supabase project when it is present.

## Rules for this repository

- Never commit secrets. `.env`, `demo-accounts.txt` and `password.txt` are gitignored.
- The 2012 source code and its credentials are **not** in this repository and must never be added.
- Proprietary and not open source. No licence is granted.
