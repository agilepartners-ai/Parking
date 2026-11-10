---
title: Modernisation plan - rebuild as Expo (React Native) app + web, with a real backend
status: plan. Update 2026-11-10: Phase 1 and most of Phase 2 and 3 are built as a prototype (Supabase backend, Expo driver/officer app, operator console). Payments are simulated; Stripe, store submission and background-location device testing remain. See SETUP-AND-TESTING.md
last_updated: 2026-11-10
verify_before_building: current Expo SDK version, Apple/Google policy and fee details, Stripe availability in your country. These change often.
---

# Modernisation plan

## Decision summary
| Area | Recommendation | Why |
|---|---|---|
| Mobile app | **Expo (React Native) + TypeScript**, Expo Router, **development builds** (not Expo Go), EAS Build + EAS Submit | One codebase for iOS, Android and web; you know React; EAS handles signing and store uploads |
| Web app | Same Expo Router codebase exported for web (driver account, history, receipts) | Reuses screens, hooks and API client |
| Marketing site | Separate small static site on Cloudflare Pages | SEO, store "support/privacy" URLs, fast; matches your Cloudflare-first rule |
| Operator/enforcement console | Separate web app (React + Vite or Next.js) in the same monorepo | Map drawing, rate tables, reports are desktop tasks; not a phone UI |
| Database | **PostgreSQL + PostGIS** (`database/schema.sql`) | Polygons, distance and point-in-polygon are native |
| Backend (MVP) | **Supabase** (Postgres + Auth + Storage + Edge Functions) for the fastest start. The schema is plain Postgres so it can move to Neon + Cloudflare Workers later | Fewest moving parts for one developer |
| Auth | Phone OTP + email (provider-managed). No passwords stored by you | Drivers expect SMS/Apple/Google sign-in. Apple requires "Sign in with Apple" if you offer other social logins |
| Payments | **Stripe**: cards + Apple Pay/Google Pay, PaymentIntents, **Stripe Connect** to pay operators minus your service fee | Matches the patent's "credit the owner minus a service charge"; keeps you out of PCI scope |
| Maps | Google Maps SDK via `react-native-maps` (or `expo-maps` if it covers your needs); Mapbox is the alternative | Replace the obsolete 2012 Maps JS `sensor=false` code |
| Push | `expo-notifications` (APNs/FCM via Expo push service) | Reminders |
| Observability | Sentry + a product analytics tool | Crash and funnel data from day one |

If you prefer to own the API, use **Neon (Postgres + PostGIS) + Cloudflare Workers (Hono, TypeScript) + a hosted auth provider**. It is more assembly, but it fits your deploy habits. The schema, tests and mobile app do not change.

## What the Expo app can and cannot do (checked in the Expo docs)
- `expo-location` supports foreground and **background** location (`startLocationUpdatesAsync`) and **geofencing** (`startGeofencingAsync`). Background location needs a task registered with `expo-task-manager`, the iOS `UIBackgroundModes: location` setting, and a **development build**. It does **not** run in Expo Go.
- OS geofencing works with **circles** (centre + radius), and iOS limits how many regions you can monitor (about 20). Parking areas are **polygons**, so do not rely on OS geofences to match them. Use OS geofences only as a wake-up hint near known areas, and decide the real area **on the server** with `find_parking_area()`.
- GPS is accurate to roughly 5-25 m (the patent says the same). Show the detected area to the driver and let them correct it.

## Proposed repository layout (new repo, start clean)
```
parking-app/
  apps/
    mobile/            Expo app (driver + officer modes by role)
    ops-console/       operator + admin web app
    site/              marketing site (static)
  packages/
    shared/            TypeScript types, zod schemas, fee-calculation + tests (mirrors compute_fee_cents)
    api-client/        typed client for the backend
  supabase/            migrations/ (from database/schema.sql), functions/ (edge functions), seed.sql
  docs/                copy docs/ from this folder
```
Do **not** copy `04_legacy-code` into it.

## Backend responsibilities (functions the API must provide)
| Endpoint / function | Notes |
|---|---|
| `POST /sessions/start` | Input: vehicle, lat/lng/accuracy/speed, idempotency key. Calls `find_parking_area`, picks the rate plan, creates the session with **server time**, schedules reminders, returns area + rates. Reject if a session is already active for the vehicle |
| `POST /sessions/:id/end` | Server computes fee (`compute_fee_cents`), splits platform fee, creates the payment (capture the pre-authorisation or charge the stored method), sends receipt |
| `POST /sessions/:id/extend` | For prepaid plans |
| `POST /sessions/:id/ping` | Optional breadcrumbs for the speed-based "you left, end your session" reminder (patent claim 1) |
| `GET /areas/nearby` | Areas around a point, with rates, for the map |
| Officer: `GET /enforcement/valid-vehicles` / `POST /enforcement/check` / `POST /citations` | `valid_vehicles_near()`, plate lookup, citations |
| Operator: CRUD for areas (GeoJSON), plans, rules; reports | Console only |
| Webhooks: Stripe payment, payout and dispute events | Source of truth for `payment.status` |
| Scheduled jobs | Send due notifications, expire overdue sessions, purge old pings |

## Payments design (important)
- At **start**, create a Stripe PaymentIntent with **manual capture** for a hold sized to the plan's `daily_max` (or a fixed amount); at **end**, capture the exact fee. This is the digital version of the patent's "pay at end" and avoids unpaid sessions.
- Operators are connected accounts; funds are split with application fees (`service_fee_bps`). Payout and tax handling depend on country; take advice for Canada/US.
- Parking is a **physical-world service consumed outside the app**, so Apple's rules normally allow your own payment processor instead of In-App Purchase (App Store Review Guideline 3.1.3(e), goods and services outside the app). Confirm against the current guideline text before submitting.
- Apple Pay / Google Pay through Stripe.

## Privacy and compliance (the stores check these)
- Ask for **While Using** location first. Request **Always/background** only for the end-session reminder, with a clear in-app explanation, and be ready to justify it (Google Play has a separate background-location declaration form and review).
- Privacy policy, data-deletion path in the app and on the web, Apple "App Privacy" labels, Google "Data safety" form. Location + payment + plates are sensitive.
- GDPR/UK GDPR/CCPA/PIPEDA depending on where you launch. Keep location retention short (30 days for pings).
- Plate numbers are personal data in many jurisdictions.

## Phased roadmap
| Phase | Outcome | Key work |
|---|---|---|
| **0. Housekeeping (days)** | Safe to start | Resolve ownership + patent status (`docs/02-ip-and-legal.md`); rotate/retire 2012 credentials (`docs/06-security-findings.md`); choose product name + check trademark; decide legal entity |
| **1. Foundation (1-2 wks)** | Skeleton running end to end | Monorepo, run `database/schema.sql` on Supabase/Neon, auth, `shared` package with fee tests, CI, EAS project, app shell with navigation + theming |
| **2. Driver MVP (4-6 wks)** | A driver can park and pay in one pilot area | Register, vehicles, map + area detection, start/end, fee, Stripe, receipts, history, reminders (foreground first), account deletion |
| **3. Operator + enforcement (3-4 wks)** | A pilot operator can run it | Console: draw areas, rates, reports; officer mode: valid vehicles, plate check, citations; Stripe Connect payouts |
| **4. Beta + store submission (2-4 wks)** | In stores | TestFlight + Play closed testing, store assets, privacy forms, background-location justification, reviewer demo account and video, bug bash |
| **5. Growth** | Differentiate | Passes/tourist products, family accounts, plate OCR / QR stickers, fraud rules, SMS/voice access, **toll module** (second patent), multi-city |
Durations assume one full-time developer with Claude's help; treat them as rough.

## Where Claude can help next, in order
1. Scaffold the monorepo and Expo app with Expo Router, TypeScript, lint, tests.
2. Run `schema.sql` on a throwaway Neon/Supabase project, fix issues, add migrations and RLS policies.
3. Build the `shared` fee calculator with the same test cases as `compute_fee_cents`.
4. Rebuild the operator "draw a parking area" tool (the best idea in the 2012 code) with Mapbox/Google drawing + GeoJSON.
5. Prepare store listing text, privacy policy and data-safety answers.
