---
title: Setup, testing and release guide
audience: the owner and any developer
status: matches the repository on 2026-11-10
---

# Setup, testing and release guide

This is the practical companion to [EXPLAINER-FOR-MANAGEMENT.md](EXPLAINER-FOR-MANAGEMENT.md).

## 0. What is in the repository

```
apps/mobile        Expo app (iPhone + Android + basic web): driver and officer screens
apps/ops-console   Operator website (Vite + React + Leaflet map)
packages/shared    Fee calculator, area-finding code, demo data (used by app, console and tests)
supabase/          migrations/ (database + rules), seed.sql (Toronto demo), tests/ (80 checks)
scripts/           create-demo-users.mjs
docs/              knowledge base (start at 00-INDEX.md)
database/          original schema design notes (supabase/migrations is now the source of truth)
```

## 1. What you need (and when)

| Need | For | When |
|---|---|---|
| **Node.js 20+** and **Git** | Running everything | Now |
| **A phone with Expo Go** (App Store / Google Play) | Testing without any accounts | Now |
| **Supabase project** (you already have `ParkPay`) | The live backend | Now (done) |
| **Expo account** (free) at expo.dev | Building test apps that can run in the background | For background-reminder testing |
| **Google Maps API key** | Maps in Android store builds (Expo Go does not need it) | Before Android builds |
| **Stripe account** | Real card payments | Before charging real money |
| **Apple Developer ($99/yr)** | TestFlight and the App Store; iPhone development builds | Before iOS beta |
| **Google Play Console ($25)** | Google Play | Before Android beta |
| **Privacy policy URL, final app name, icon** | Store listings | Before submission |

> Google Play personal developer accounts created recently may require a closed test with a minimum number of testers for a minimum period before production. Check Google's current rules when you register.

## 2. Try it in five minutes (no accounts, no backend)

1. In a terminal, in the repo folder:
   ```bash
   npm install
   ```
2. Temporarily make the app run in **offline demo mode**: delete or rename `apps/mobile/.env` (it is not committed). Without it the app has no backend and uses the on-phone demo.
3. Start the app:
   ```bash
   npm run mobile
   ```
4. Install **Expo Go** on your phone. Put the phone on the **same Wi-Fi** as the computer.
   - **iPhone:** open the Camera and scan the QR code in the terminal.
   - **Android:** open Expo Go and scan the QR code.
   - If it will not connect, run `npx expo start --tunnel` inside `apps/mobile` instead.
5. Tap **Start demo**.

The demo uses sample Toronto areas. You are probably not in Toronto, so the **Test location** chips at the bottom of the Park screen move you to a Toronto spot (City Hall Lot is selected first). Choose **Real GPS** to use your actual position.

## 3. Test checklist (do this on a real iPhone and a real Android)

| # | Do this | You should see |
|---|---|---|
| 1 | Open the app, sign in or start demo | Park screen with a map and "City Hall Lot" |
| 2 | Vehicles tab, add plate `ABCD 123` | It appears as DEFAULT, plate shown as `ABCD123` |
| 3 | Park tab, tap **Start parking** | Green "PARKED" card with a running timer |
| 4 | Wait 6+ minutes (or pick another spot and test the price list) | "So far" amount appears after the free 5 minutes |
| 5 | Tap **Demo: simulate driving away** | Yellow "Did you leave?" box and a notification |
| 6 | Tap **End parking & pay**, confirm | Receipt with the fee, marked "Paid (test)" |
| 7 | History tab | The session is listed; tap it for the receipt |
| 8 | Choose the spot **Outside Toronto**, with no session running | "No parking area here" message |
| 9 | Start parking with the same plate twice (second device or demo) | "This vehicle already has a running parking session" |
| 10 | Account tab, **Delete my account** (use a throw-away account) | Signed out; account gone |

**Officer test (demo mode):** Account → Demo role → Officer → open the **Officer** tab → check `DEMO123` at City Hall Lot → "VALID". Check `ZZZ999` → "NO SESSION", then **Issue citation**.

**Please report to the developer:** the phone model, OS version, which row failed, and a screenshot.

## 4. Live mode (your Supabase project)

The live backend is already deployed to the `ParkPay` Supabase project: 3 migrations applied, Toronto demo data loaded, 80 database checks passing.

### 4.1 Connect the app to it
Create `apps/mobile/.env` (never commit it):
```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=<publishable key>
```
Use only the **publishable** key in the app. The **secret** key and the database password must never go into the app or the repo.

### 4.2 Create the root `.env` for scripts (never commit it)
Copy `.env.example` to `.env` and fill in the Supabase URL, publishable key, secret key and the database connection (use the **session pooler** host from Supabase → Connect, because the direct host is IPv6-only).

### 4.3 Commands
```bash
node supabase/migrate.mjs --seed        # apply new migrations (safe to re-run) and load demo areas
node supabase/tests/run.mjs             # 80 checks; runs in a transaction and rolls back, leaves no data
node scripts/create-demo-users.mjs      # creates driver/officer/admin test logins -> demo-accounts.txt
```
`demo-accounts.txt` holds generated passwords and is gitignored.

### 4.4 Sign-up emails
By default Supabase asks new users to confirm their email. For testing, switch it off: Supabase dashboard → Authentication → Providers → Email → turn off **Confirm email**. Turn it back on before launch.

### 4.5 Making someone an officer or admin
- **Officer / operator admin (first time):** in the Supabase SQL editor run
  ```sql
  select dev_set_role('person@example.com', 'officer', '00000000-0000-4000-8000-0000000000a0');
  select dev_set_role('boss@example.com', 'operator_admin', '00000000-0000-4000-8000-0000000000a0');
  ```
  (The person must have signed up first.)
- **Later:** an operator admin can add officers from the console's **Staff** tab.

## 5. The operator console

```bash
# apps/ops-console/.env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_KEY=<publishable key>

npm run console      # opens http://localhost:5173
```
Sign in with an operator admin. **Areas & rates**: click an area to edit; draw new areas with the polygon or rectangle tool.

Deploy later as a static site on Cloudflare Pages (`npm run build -w @parkpay/ops-console`, publish `apps/ops-console/dist`).

## 6. Background reminders (needs a development build)

Expo Go cannot run background location. To test the "you drove away" reminder with the app closed you need a **development build**:

```bash
npm install -g eas-cli
cd apps/mobile
eas login
eas init                                          # links the app to your Expo account
eas build --profile development --platform android   # makes an APK you install directly
eas build --profile development --platform ios       # needs an Apple Developer account
```
Then `npx expo start --dev-client` and open the installed app. Allow location **Always** when asked.

Android store builds also need a Google Maps key: add it as an EAS secret named `GOOGLE_MAPS_API_KEY`.

## 7. Before the stores

1. Choose the final name. Then change `APP_NAME`, `slug`, and the identifier `com.parkpay.app` in `apps/mobile/app.config.ts`. **The identifier cannot be changed after the first store upload.**
2. Replace the placeholder icon and splash in `apps/mobile/assets`.
3. Add **Stripe** (see 8). Remove the "test payment" wording.
4. Write the privacy policy and fill the Apple "App Privacy" and Google "Data safety" forms (location, plates, payments).
5. Prepare a **short video** and written justification for background location (both stores ask).
6. Provide Apple and Google reviewers a **demo login** and a way to simulate a parking area (the Test location chips help).
7. Follow [08-store-and-launch-checklist.md](08-store-and-launch-checklist.md).
8. Have a patent attorney confirm ownership and maintenance fees ([02-ip-and-legal.md](02-ip-and-legal.md)).

## 8. Adding real payments (next milestone)

Today `end_session` in `supabase/migrations/20261110000002_app_layer.sql` records a `mock` payment. To go live:
- At **Start**, place a card authorisation (Stripe PaymentIntent, manual capture); at **End**, capture the exact fee. This is described in [07-modernization-plan.md](07-modernization-plan.md).
- Add a small server function (Supabase Edge Function) for the Stripe calls and a webhook for payment events.
- Use Stripe Connect to pay operators, minus the platform fee already calculated in `service_fee_bps`.
- Take advice on tax and payout rules for the country you launch in.

## 9. Known limits of this prototype

- Not yet run on a physical phone by the team; compiled for iOS and Android and exercised through the web build against the live database.
- Payments are simulated. No refunds, no receipts by email.
- Server-side push notifications are not built. Reminders are scheduled on the phone.
- No phone-number sign-in, social sign-in, or "Sign in with Apple" yet (Apple requires it only if you add other social sign-ins).
- The officer role is checked on the server, but there is no photo evidence or ticket printing yet.
- Rates are read when a session ends. If an operator changes prices mid-session, the new prices apply to that session.
- The map on the web build is a text placeholder; the real map is in the iOS and Android apps.
- The seeded Toronto prices are sample numbers.

## 10. Troubleshooting

| Problem | Try |
|---|---|
| QR code does not connect | Same Wi-Fi, or `npx expo start --tunnel` |
| "No parking area here" | Use a Toronto test spot (bottom of the Park screen) |
| Sign-up says "check your email" | Turn off Confirm email (4.4) or confirm the email |
| Officer tab missing | Role not granted yet (4.5); reopen the app after granting |
| Map blank on Android build | Missing Google Maps key (section 6) |
| `permission denied` or `forbidden` | You are signed in with the wrong role |
| Database tests fail to connect | Check `.env`; use the pooler host, not the direct host |

## 11. Security hygiene

- Never commit `.env`, `demo-accounts.txt`, or any file named `password.txt`. They are in `.gitignore`.
- The Supabase **secret key** and **database password** were handled during the prototype build. **Rotate both** (Supabase → Settings) before real users or real money.
- Turn on Supabase backups and, for production, a paid plan.
- Keep the old archive folder (`Parking_app`) out of Git; it holds plaintext credentials from 2012.
