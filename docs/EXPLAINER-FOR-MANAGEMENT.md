---
title: ParkPay explained in plain language
audience: managers, partners, anyone who is not a developer
status: describes the working prototype as of 2026-11-10
---

# ParkPay in plain language

**ParkPay** is a phone app that lets you park anywhere that takes part, pay only for the minutes you actually used, and leave. No coins, no pay-station queue, no guessing how long you will be.

"ParkPay" is a working name only. The old "Agile Parking" name belongs to another company, so the product needs its own name.

---

## 1. The idea in one minute

Today you arrive, find a pay machine, guess your time, pay in advance, and run back if you are late.

With ParkPay:

1. You drive into a parking area. The phone knows where it is.
2. You tap **Start parking**.
3. You leave, and tap **End parking**.
4. You pay for the exact minutes. A receipt is saved.

The same idea is protected by two United States patents held by the product owner (US 9,792,818 for parking, US 10,726,403 for toll roads). The ownership paperwork still has to be confirmed (see section 8).

---

## 2. Who uses it

| Person | What they do in ParkPay |
|---|---|
| **Driver** | Parks, pays, gets receipts |
| **Parking officer** | Checks that a parked car has paid, and writes a ticket if not |
| **Operator** (a city, a parking authority, a lot owner) | Draws their parking areas on a map, sets prices, sees income |

---

## 3. How it works for a driver (5 steps)

1. **Sign up** with an email and a password, and add your car's licence plate once.
2. **Open the app.** A map shows the parking area you are standing in, its name, and its prices.
3. **Tap Start parking.** A timer starts. The timer runs on our server, not on your phone, so nobody can fake the time.
4. **Leave and tap End parking.** The server works out the price from the exact minutes and the area's price list.
5. **Get a receipt.** It is saved in your History.

Helpful extras already built:
- **"Did you leave?" reminder.** If you drive away and forget to end the session, the app tells you. This is the core idea of the parking patent.
- **Time-limit reminders.** You are warned 15 minutes before the maximum stay ends.
- **Delete my account** inside the app, which the app stores require.

---

## 4. How it works for an officer

1. The officer signs in. Their account has an "Officer" tab that drivers never see.
2. They type a licence plate. The app answers one of four things:
   - **Valid:** this car has paid for this area.
   - **No session:** this car has not paid.
   - **Expired:** this car stayed longer than the maximum.
   - **Wrong area:** this car paid for a different area.
3. If it is not valid, they pick a reason and a fine, and tap **Issue citation**. The ticket is saved against the plate.
4. They can also see all paid cars within 150 metres of where they stand.

Every plate check is logged, so nobody can look up plates without leaving a trace.

---

## 5. How it works for an operator

The operator uses a **website** (the Operator Console), not the phone app.

- **Draw a parking area** on a map, name it, and set prices: price per hour, different prices by day and time, a free period, a minimum charge, a daily maximum, and a maximum stay.
- **Prices go live immediately.** Drivers see the new rates the next time they open the app.
- **See income:** revenue per area, how many cars are parked right now, and fines issued.
- **Add officers:** type the email of someone who has signed up and make them an officer.

---

## 6. What is happening behind the scenes

```
  Driver phone  ──┐
  Officer phone ──┼──►  Secure online service (Supabase)  ──►  Database with maps
  Operator site ──┘     keeps the time, finds the area,        (PostgreSQL + PostGIS)
                        calculates the price, checks who
                        is allowed to see what
```

Three simple rules make it trustworthy:

1. **The server keeps the clock.** The phone cannot change start or end times.
2. **The server decides the area and the price.** The phone only asks.
3. **Everyone sees only their own data.** A driver cannot see another driver's cars or receipts. This is enforced in the database itself, and it is automatically tested.

**Why prices are per area, not per parking bay.** Phone GPS is accurate to roughly 5 to 25 metres, which is not enough to tell one bay from the next. So prices are set for an area, and the area is found by checking which drawn shape the phone is inside.

---

## 7. What is built today, honestly

| Part | Status | Notes |
|---|---|---|
| Driver app (iPhone and Android) | **Working prototype** | Sign-up, vehicles, map, start/end, price, receipts, history, reminders |
| Officer mode | **Working prototype** | Plate check, nearby paid cars, citations |
| Operator website | **Working prototype** | Draw areas, edit prices, income report, add officers |
| Database and rules | **Working, tested** | 80 automated checks pass against a real database |
| Price calculation | **Working, tested** | Same rules in the app and in the database, with identical test cases |
| **Real payments** | **Simulated** | No money moves. Receipts say "test payment". Card payments (Stripe) are the next big step |
| Reminders when the app is closed | **Written, not yet tested on a phone** | Needs a special test build of the app, described in the setup guide |
| In the App Store and Google Play | **Not yet** | Needs developer accounts, a privacy policy, a final name, and review by Apple and Google |
| Toll roads (second patent) | **Not started** | Planned after parking works |

**What has and has not been tested.** The app has been compiled for both iPhone and Android, and the complete driver, officer and operator flow was run against the live database through a web version. It has **not yet been run on a physical phone** by the team. Please do the phone test in the setup guide before showing it to anyone outside the company.

All prices in the demo (for example Toronto's City Hall Lot at $4.00 an hour) are **made-up sample numbers**, not real Toronto Parking Authority prices.

---

## 8. Risks and open decisions

| Topic | Why it matters | What is needed |
|---|---|---|
| **Patent paperwork** | The patents list two inventors and no company owner. The owner states they own them, but no signed assignment is in the project files, and the maintenance fees have not been checked | A patent attorney confirms ownership and fee status **before launch** |
| **Product name** | "Agile Parking" belongs to another company | Choose a name, check the trademark, then register a company or publisher account |
| **Real payments** | Taking money brings fees, tax, refunds and payout rules | Stripe account, then a decision on how operators are paid |
| **Privacy** | The app uses location, plates and payments, all sensitive | Privacy policy, store privacy forms, a data retention rule (location points kept about 30 days) |
| **Background location** | Apple and Google review this strictly | A clear in-app explanation and a short demo video for reviewers |
| **First customer** | Prices, currency and tax depend on the city | Pick a pilot (the demo uses Toronto) |
| **Marketing numbers** | The old pitch deck said 90% savings and $250 per meter | These are claims, not measured data. Do not repeat them without evidence |

---

## 9. What it takes to go live

**Accounts someone has to open** (costs change, so confirm current prices):

| Account | Used for | Typical cost |
|---|---|---|
| Apple Developer Program | Publishing on the App Store | about US$99 a year |
| Google Play Console | Publishing on Google Play | about US$25 once |
| Expo (EAS) | Building the apps for the stores | free tier, paid for more builds |
| Stripe | Taking card payments | per-transaction fee |
| Supabase | Hosting the database and service | free to start, paid plan for production |
| Google Maps (Android) | Map display in store builds | free allowance, then usage-based |
| Domain and hosting for the website | Marketing site and operator console | small yearly cost |

**Rough path** (one developer; treat durations as guesses):

| Step | What happens |
|---|---|
| 1. Confirm basics | Patent paperwork, name, pilot location |
| 2. Real payments | Add Stripe so money actually moves |
| 3. Test with real people | Phone test in a real parking lot, then a small closed beta |
| 4. Store submission | Privacy forms, screenshots, review by Apple and Google |
| 5. Pilot | One operator, one or two areas |
| 6. Grow | More cities, passes for tourists, plate scanning, toll roads |

---

## 10. A two-minute demo you can give

1. Open the app, tap **Try demo mode**, then **Start demo**.
2. Go to **Vehicles**, add the plate `ABCD 123`.
3. Go to **Park**. Point out the area name and the price list.
4. Tap **Start parking**. Watch the timer run.
5. Tap **Demo: simulate driving away**. The yellow "Did you leave?" box appears. This is the patented reminder.
6. Tap **End parking & pay**, then confirm. Show the receipt.
7. Open **Account**, choose **Officer**, open the **Officer** tab, and check plate `DEMO123` to show a valid car.
8. Show the operator website: dashboard, then draw or edit an area and its prices.

---

## 11. Words you may hear

| Word | Meaning |
|---|---|
| **Parking area** | A shape drawn on a map (a lot or a street zone) that has one price list |
| **Session** | One parking visit, from Start to End |
| **Operator** | The organisation that owns the parking and gets the income |
| **Geofence / polygon** | The drawn shape of an area |
| **Backend** | The online service that keeps the time and does the maths |
| **Prototype** | A working model to learn from, not yet a finished product |
| **Test mode** | Payments are pretend; no money moves |
| **Store review** | Apple and Google check an app before it appears in their stores |
