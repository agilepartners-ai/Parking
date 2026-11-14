---
title: End-to-end plan - from today's prototype to a live parking product
audience: the owner (non-technical decisions) and any developer
status: phases 1 and 2 built 2026-11-13 on the section 9 defaults; phases 3 to 6 wait on accounts only the owner can open
supersedes: the roadmap table in 07-modernization-plan.md (that one pre-dates the build)
---

# End-to-end plan

## 1. Where we are today (honest status, 2026-11-13)

Decisions: the owner answered "use good defaults" to section 9, so the defaults written there are in force (Toronto/CAD, percentage fee, email + password, pay at end, platform notices instead of legal fines, operator admin publishes).

| Area | State | Checked how |
|---|---|---|
| Driver app (Android + iOS, one Expo codebase) | **Works**: one-flow sign-up (account, vehicle with make/colour/size, permission explanations), find area by GPS, wheel time picker, start/end, fee, receipt, history, tickets, account deletion | Android emulator. **Not yet on a physical phone or an iPhone** |
| Reminders | **Built**: planned time almost up / up, max stay, forgot to end (12 h), left the area, driving fast with a session open, arrival at a published area (phone geofences) | Left/fast: emulator with the test location. Timed ones: scheduled, not waited out. **Arrival and background ones need a real phone with "Allow all the time"** |
| Officer mode (same app, role-gated) | Basic: check a plate, valid-vehicles list, citation form | Database checks |
| Operator console (web) | **v2**: draw areas, draft and publish with version history, rates, dashboard with charts, session search + CSV export, refunds, tickets (void), staff, audit log | Compiles and builds; server functions covered by database checks. Clicked through in a browser on 2026-11-13 (platform tab excepted) |
| Platform admin | Same console, extra tab: operators, service fee, operator admins | Database checks |
| Backend (Supabase: Postgres + PostGIS) | 7 migrations applied to the project, row-level security, fee engine, **169 database checks pass** | `node supabase/tests/run.mjs` |
| Price changes | A tariff edit never changes a session that is already running (old tariff kept for it) | Database check |
| Google Maps | Key read from the build environment or the local `.env` (never committed). Map turns on in app **0.2.0**; older installs keep the list view | Seen working in the 0.2.0 Android build on the emulator (2026-11-14) |
| Public site | Static pages in `apps/site`: how it works, privacy, terms, support, delete-my-account | Generated. **Legal text is a draft, not lawyer-reviewed. Not deployed** |
| Payments | **Simulated** (no Stripe). Refunds are recorded only | - |
| Server push (forgot to end, ticket issued, payment failed) | **Not built**: needs Firebase (FCM) credentials for Android and an Apple key | - |
| Hosting / live | **Not deployed.** Console and site are ready for Cloudflare Pages | - |
| Design | One coherent design system across app, console and site. Not matched to a Figma file (deferred by the owner) | - |
| Legal / IP | Patent ownership is the owner's stated assumption, unverified. No store accounts | - |

### What only the owner can do next

| Item | Why it blocks |
|---|---|
| Approve one EAS Android build of 0.2.0 | Shows the Google map and bakes in the arrival-reminder code path |
| Restrict the Maps key (package `com.parkpay.app` + SHA-1, Maps SDK for Android only) and set a budget alert | The key is currently unrestricted |
| Test on a real Android phone, then an iPhone | Background location and notifications behave differently from the emulator |
| Stripe account (business verification) | Real payments, card hold, payouts |
| Firebase project + `google-services.json`; Apple Developer account ($99/yr) | Push notifications, iOS build, App Store |
| Play Console ($25) | Play Store; new personal accounts need a closed-test period |
| Product name, domain, legal entity, support mailbox | Bundle id cannot change after the first store upload; site and policies need them |
| Lawyer review of privacy policy and terms; patent assignment and maintenance-fee check | Before public launch |
| Supabase paid plan for production (backups, point-in-time recovery) | Before real users |

## 2. The shape of the product (answers "separate apps or one?")

Recommendation: **one mobile app, one web console, one marketing site, one backend.** Roles decide what each person sees.

| Who | Surface | Why |
|---|---|---|
| **Driver** | Mobile app (Android + iOS). A web version of "my account, history, receipts" later | The product |
| **Officer** | **A mode inside the same mobile app**, shown only to accounts with the officer role | Officers are few; a second app means a second store listing, review and release process for no gain. Split into its own app only if an enforcement agency demands a locked-down device app |
| **Operator** (a city, a lot owner) | **Web console**, own login, own sub-domain | Drawing maps, rate tables and reports are desktop work |
| **Platform admin** (you) | A section of the same console (operators, disputes, refunds, fraud, platform revenue) | One codebase, stricter role |
| **Public** | Marketing site (how it works, for cities, privacy, terms, support, delete-my-data) | Store listings require these pages |

Everyone signs in against **one account system**; the database says what each account may do (driver, officer, operator_admin, platform_admin). "Login separately" is therefore a *role*, not a different app. An operator never needs the phone app, and a driver never sees the console.

```
Driver app (Expo)     Officer mode (same app)      Operator + Admin console (web)     Marketing site
      \                      |                              /                              |
       +----------- Supabase: Auth + Postgres/PostGIS + Edge Functions + Realtime ----------+
                         |                 |                        |
                    Stripe (payments)  Expo Push / FCM / APNs   Sentry, logs, backups
```

## 3. The driver journey you described, mapped to build items

1. **One-time sign-up, in one flow** (new, to build): email + password (or phone code), name -> **vehicle**: plate, region, make, colour, **size class** (compact / standard / large) -> why we need location and notifications (explanations, then the system prompts) -> home screen. Existing users who lack a vehicle see the same step once.
2. **Home shows where you are and the nearest areas** (built; to improve): map with your dot and published areas, nearest first, the area you are in highlighted, price now.
3. **Arrival reminder** (new): when you come near a published area, a notification: "City Hall Lot, $4/h now. Start parking?" with one tap.
4. **During parking** (partly built): timer, cost so far, time left, ending soon, closing soon, "you left the area", **"you are moving fast, did you forget to end parking?"** (patent claim 1: location change + speed), "forgot to end" after a long time.
5. **End, pay, receipt** (built, payments simulated -> Stripe).
6. **Tickets** (new): if an officer issues a citation, push notification and pay in app.

### Reminder catalogue (what, when, how)

| Reminder | Trigger | Where it runs | Status |
|---|---|---|---|
| Near a paid area | OS geofence circle around each published area (wake-up hint), then confirm with the server's polygon match | Phone (background) | New |
| Time running out | N minutes before max stay / paid end | Local scheduled notification (works offline) | Partly built |
| Lot closing soon | Area closing time | Local + server push | New |
| You left the area | Location outside polygon, session open | Phone | Built (foreground), background needs permission |
| **High speed with open session** | Speed above threshold (e.g. 25 km/h) for a few readings while session is open | Phone background task, server rule as backup | New |
| Forgot to end | Session open > X hours or overnight | Server scheduled job -> push | New |
| Payment failed / receipt | Stripe webhook | Server push + email | New |
| Citation issued | Officer action | Server push | New |

Technical limits we must design around (Expo docs, Apple/Google rules): OS geofences are **circles** and iOS allows about 20 at once, so we register only the nearest ones and re-pick as you move; real area matching is done by the **server polygon** match. Background location needs a **development/production build** (not Expo Go) and a store review with a video and justification. GPS is 5 to 25 m accurate, so the app shows the detected area and lets the driver correct it; it never silently charges the wrong area.

## 4. Admin and operator side

| Capability | Detail | Status |
|---|---|---|
| Draw / import areas | Polygon tools on a map, GeoJSON import, name, hierarchy (region, city, zone, lot) | Basic built |
| **Publish to everyone** | Draft -> review -> **published**. Published areas are visible to every driver app within seconds (read-only public data); drafts only to staff. Version history, so a price change never alters a running session unexpectedly | New (status flag + versions) |
| Rates and rules | By day/time, grace minutes, minimum, daily max, max stay, closing time, passes | Built (engine) |
| Staff and officers | Invite by email, role, areas they can enforce | Built (basic) |
| Reports | Revenue, sessions, occupancy by hour, top areas, export CSV | New |
| Refunds and disputes | Look up a session, refund, void a citation, note | New |
| Platform admin | Onboard operators, set the service fee, fraud flags, audit log | New |
| Audit trail | Every change who/when/what | Partly (database triggers) |

## 5. Backend: explainable and efficient

Plain-language explanation for management: *the phone sends "I am here"; the database finds which published area contains that point; the server, not the phone, keeps the clock and works out the price; money is moved by Stripe; every step is written to an audit table.*

Efficiency plan (all standard, none exotic):

| Concern | Approach |
|---|---|
| "Which area am I in?" | PostGIS polygon in a **GiST spatial index**; bounding-box test first, exact test second. One indexed query, milliseconds |
| Nearby areas for the map | `ST_DWithin` on the same index; return only id, name, simplified geometry, current price. Cache by map tile / area-version on Cloudflare because the data is public and rarely changes |
| Session start/end | One database function (transaction) with an **idempotency key**, so retries and double-taps never double-charge. Server time only |
| Pings / breadcrumbs | Short retention (30 days), partitioned by day, batched inserts, no per-ping round trip to the phone's critical path |
| Security | Row-level security on every table; the phone only ever holds the public (publishable) key; the secret key lives in server functions only |
| Reports | Pre-aggregated tables / materialised views refreshed on a schedule, never scanning raw sessions |
| Scale-out | Connection pooling (already used), read replica later, queue for push/e-mail jobs. Load-test with k6 before launch (target and numbers agreed in phase 3) |
| Reliability | Daily backups + point-in-time recovery (paid plan), uptime check, error tracking (Sentry), alerts |

## 6. Google Maps without surprise bills

What costs money and what does not (verify current prices on Google's pricing page before launch; they change):

- **Showing the map on the phone** with the Maps SDK for Android/iOS is, at the time of writing, **not charged per map view**. This is the cheap, intended path and it is what the app uses.
- **Server-side Google APIs** (Geocoding, Directions/Routes, Places, Distance Matrix) are **billed per request** after a small monthly free allowance. If your *server* called them, every driver action would cost money.
- **Design rule:** our server makes **zero Google calls**. Finding the area is PostGIS; distances are PostGIS; the map is drawn by the phone SDK; area shapes come from our database. The server never touches Google, so there is nothing to bill.
- **Is there a CORS or cross-link trick?** No, and we should not look for one: Google bills by *which API is called under your project's key*, not by which machine calls it. The saving comes from **not using paid APIs**, not from bypassing anything. Browser CORS settings control what a web page may read; they do not change billing.
- **Protect the key:** restrict it to the Android package + the SHA-1 of the signing key (and bundle id for iOS), restrict it to the Maps SDK only, set a **budget alert and a daily quota cap** in Google Cloud, and keep it out of Git. A restricted key leaked from an app is useless elsewhere.
- **Address search** (if you want "search an address"): either skip it in v1, or use the phone's own geocoder, or accept a small billed Places usage with a cap.
- **Operator console map (web):** use Leaflet + OpenStreetMap-based tiles from a provider with a free tier (no Google). If you prefer Google maps on the web, each page load is billed; for a handful of operators the cost is small but it is a choice.
- Alternative with no Google account at all: MapLibre + a vector-tile provider. More work, no per-use cost surprises.

Steps to create the key are in [BUILDS-AND-RELEASES.md](BUILDS-AND-RELEASES.md).

## 7. Phase-wise roadmap

Durations assume one developer working with Claude, part of it waiting on third parties (stores, Stripe, a pilot partner). Treat them as rough.

| Phase | Outcome | Work | Done when | Needs from you |
|---|---|---|---|---|
| **0. Decisions and housekeeping** (1 week) | Nothing blocks the build | Answer section 9; product name + domain; legal entity; confirm patent assignment/maintenance with an attorney; rotate the demo passwords | Name, entity, domain chosen | Decisions, an attorney meeting |
| **1. Product core v2** (2-3 weeks) | The journey in section 3 works on a real phone | One-flow sign-up with vehicle (+ size), arrival reminder, speed and forgot-to-end reminders, server push, onboarding explanations, empty/error states, Google Maps key, Figma-matched UI | You can install the app, sign up once, drive to a test area, get the reminders, park, pay (simulated) | Google Maps key, a physical Android phone, Figma file link |
| **2. Admin and operator v2** (2-3 weeks) | A pilot operator can run it alone | Draft/publish areas with versions, reports, refunds/disputes, officer area assignment, platform-admin section, audit log view, CSV export | An operator publishes an area and drivers see it within seconds | A real pilot operator contact (see 9) |
| **3. Real payments and hardening** (3-4 weeks) | Real money, safely | Stripe (card hold at start, capture exact fee at end), Apple Pay / Google Pay, Stripe Connect payouts minus service fee, webhooks, receipts by email, tax settings, rate limits, load test, backups, Sentry | A real small payment succeeds end to end in test mode, then live mode with a tiny amount | Stripe account (business verification), payout details |
| **4. Go live on the web** (1 week, overlaps 3) | Live back end and sites | Supabase **production** project (paid plan), Cloudflare Pages for console and marketing site, custom domains + TLS, WAF/rate limits, Turnstile, monitoring, backup restore drill | Console and site live on your domain | Domain, Cloudflare access |
| **5. Beta and stores** (3-5 weeks, mostly waiting) | In both stores | Production builds (cloud), TestFlight + Play closed testing (Google's new-account rule may require a tester period), store listing, screenshots, privacy policy + terms, Data-safety and App-Privacy forms, **background-location justification + video**, reviewer demo account, account-deletion web page | Approved on Google Play and the App Store | Apple Developer ($99/yr), Play Console ($25 once), testers |
| **6. Launch and operate** | Real users | Pilot area with the operator, support mailbox, monitoring, first update in two weeks, patent maintenance calendar | Real parking sessions paid | Operator agreement, support person |
| **7. Growth** | Differentiators | Passes, family accounts, plate OCR/QR, fraud rules, SMS/voice, **toll module** (second patent), more cities | - | - |

## 8. Design: using Figma properly

I can read a Figma file only when given its **link** (the connector cannot browse your account). Two good routes, pick one:
1. You open a free Figma Community mobile UI kit you like (parking, maps or fintech style), duplicate it to your drafts, and send me the link. I pull its colours, type, spacing and components and restyle the app to match.
2. I propose and build a design system and screens, and you review them as screenshots; you can later give me a Figma file to align to.
Your seat is currently view-only, so I cannot draw into Figma myself unless you give edit access.

## 9. Questions I need answered (answer in one go, "defaults" is a valid answer)

**Business and legal**
1. **Who is the first customer/operator?** A city/parking authority, a private lot owner, or only your own demo? (A real pilot decides prices, areas and what "citation" means.)
2. **Citations:** in your plan are tickets a *legal fine* from a city (needs an agreement with that authority) or only a *platform notice* to the driver? I recommend platform notices until a city signs.
3. **Which country/currency first?** Default: Toronto, CAD.
4. **Business model:** service fee per transaction (percentage), fixed per session, or subscription for operators? Default: percentage, set per operator.
5. **Entity and name:** final product name, domain, and whether you publish as an individual or a company?

**Driver app**
6. **Sign-in method:** email + password only, or also phone code, Google and Apple sign-in? Default: email + password and Apple/Google; phone code later.
7. **Vehicle details:** plate, region, make, colour, **size class**. Does *price* depend on vehicle size or type (EV discount, large vehicle)? Default: no, store it for future.
8. **How many vehicles** per driver and are family / business sub-accounts in v1? Default: several vehicles, no sub-accounts.
9. **Speed reminder:** the speed threshold and what counts as "left" (suggest 25 km/h and 200 m outside the area). OK?
10. **Prepaid or pay-at-end?** Default: pay at end by actual time with a card hold at start.
11. **Languages:** English only first, French for Canada later?

**Admin and platform**
12. **Who can publish an area** immediately (operator admin) or does it need your approval? Default: operator admin publishes, platform admin can unpublish.
13. **Officer needs:** app only, or also printed tickets / plate photo? Default: app only, plate typing; photo/OCR later.
14. **Reports** you must have on day one (revenue per area, sessions per hour, payouts)?

**Money, accounts and tools**
15. **Budget ceiling per month** for hosting and tools (Supabase paid plan, domain, Sentry, maps)? I will keep it as low as possible.
16. **Google Cloud / Maps:** will you create the key and billing account (steps in the builds doc), and set a monthly budget alert?
17. **Stripe:** do you have or will you open an account for the business? Which country?
18. **Apple Developer and Play Console:** open them now (approvals take days)? Which legal name appears on the stores?
19. **A physical Android phone and an iPhone** available for testing?
20. **Figma:** route 1 or 2 in section 8?

## 10. Risks to keep in front of you

| Risk | Mitigation |
|---|---|
| Patent ownership and maintenance fees unverified | Attorney check in phase 0; keep the assignment record |
| Background-location review (Google/Apple) rejects | Ask only after in-app explanation, short video, minimum data; foreground fallback always works |
| Citations have legal meaning | Treat as notices until a city agreement exists |
| Payment regulation, tax, operator payouts vary by country | Stripe Connect; take local advice before live money |
| New Google Play personal accounts need a closed-test period | Start Play testing early |
| GPS inaccuracy near area borders | Show detected area, allow correction, grace period, never silent charging |
| Costs creeping (maps, SMS, hosting) | No server-side Google calls, budgets and alerts, SMS only if needed |
| One developer, many surfaces | Phases above; ship the driver loop first |
