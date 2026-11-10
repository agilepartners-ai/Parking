---
title: Product requirements - features, users, flows (consolidated from patents, deck, website copy and 2012 code)
status: draft for your review; items marked (patent) come from claims, (deck) from the pitch deck, (copy) from the student website text, (code) from what the 2012 code did
last_updated: 2026-11-10
---

# Product requirements

## Users
| Role | Needs |
|---|---|
| **Driver** | Pay for street/lot parking from the phone with no meter and no coins; get warned before time runs out; keep a history; manage several vehicles |
| **Enforcement officer** | See which vehicles near them are validly parked; look up a plate; issue a ticket; build a repeat-offender view |
| **Parking operator / authority** (city, lot owner) | Define areas and rates without hardware; see revenue and occupancy; get paid minus a service fee; run passes and promotions |
| **Platform admin** (you) | Onboard operators, handle disputes and refunds, monitor fraud |
| **Family / business account** (patent dep. claim) | A master account with sub-accounts and several vehicles |

## Core flows

### 1. Register and set up (patent, copy, code)
Create account (phone or email, name) -> add default licence plate plus other vehicles (and temporary plates for a rental/borrowed car) -> add a payment method -> optional vehicle QR sticker.
The profile lives on the server, so a lost phone loses nothing (patent).

### 2. Park (patent claim 1, deck, code)
1. Driver taps **Start Parking** (or the app suggests it when they stop inside a paid area).
2. App sends location + user id + chosen vehicle.
3. Server maps location to a **Parking Area** (most specific polygon first, then city, then region) and returns the area name, rates, maximum stay and closing time.
4. Driver confirms options (duration, pass, pay-at-end). Server starts a timer and marks the vehicle **validly parked** (this is the "virtual receipt": plate + area + time).
5. App schedules reminders before expiry or lot closing.

### 3. End and pay (patent, deck)
- Driver taps **End Parking**; server stops the timer, computes the fee from rate rules, charges the stored payment method and credits the operator minus the service charge; receipt is sent.
- **Auto-reminder (patent claim 1):** if the phone's location changes and speed exceeds a threshold while a session is open, remind the driver to end it. Also remind if they have left the area or the lot is closing.
- **Extend** a session remotely from the app or by SMS (deck).

### 4. Enforce (patent claim 1, deck)
Officer opens the enforcement view; the app shows vehicles validly parked **near the officer's location**; officer types or scans a plate and sees valid / expired / no session; can issue a ticket (sent to the server, attached to the vehicle owner, payable in app); optional plate photo with OCR or QR/barcode sticker lookup. Server keeps a repeat-offender list.

### 5. Operate (deck, code `drawpolygons.html`)
Operator draws or imports parking areas on a map, sets pricing rules by day / time / location, sets max stay and closing time, creates tourist/weekend passes, sees real-time occupancy and revenue. Rate changes must be a data change, not a software release (deck slide 14, toll patent dep. claim).

### 6. Toll roads (second patent; future module)
Background app sends several readings; server decides whether the vehicle is on a toll road and for how far; charges the linked account; adaptive sampling (fewer readings far from a toll road) to save battery; prevent double charging when two devices are in one car. Treat as phase 2 after parking works.

## Feature list (from the student website text and the deck)
- Parking time selector / timer that cannot be paused; stop early if you return early (copy)
- Map with current location and nearby parking (copy)
- Last parked locations with time and cost (copy)
- Notes and a photo of the car as proof (copy)
- Police-alert / ticket notification with in-app payment (copy)
- Transaction history on the web account; family/business multi-phone account (copy)
- FAQ and help (copy)
- Reminder before expiry (deck, patent)
- Fraud detector and unusual-activity alerts (patent, dep. claims)
- Multi-operator and multi-region (cities, states, countries) (patent)
- Voice/SMS access for basic phones (patent). I recommend **dropping this for v1**; keep the data model able to support it.

## Business rules found in the sources
- Pricing is **per Parking Area**, not per bay, because of GPS accuracy (patent).
- Plans: hourly prepaid, day/week/month pass, pay-at-end by actual time (patent).
- Rate depends on day, time of day, location (deck).
- Operator receives payment minus an agreed service charge (patent).
- The old code **cancelled parking inside 5 minutes** (a comment in `Service.cs`), not implemented. Worth keeping as a "grace period" rule.
- Statuses used in the old code: `Parked`, `Completed Parking`; internal status `1` just parked, `50` just completed.
- Duplicate request detection: every request was logged in an `Audit` table with a transaction id; a repeated id with identical payload was rejected as "Duplicate Transaction". Keep the idea as **idempotency keys**.

## Non-functional requirements (new, needed for stores)
- Location is sensitive data. Foreground use by default; background location only for the end-session reminder, with clear in-app explanation.
- Payments through a PCI-compliant provider; no card data on your servers.
- Works with poor accuracy: show the detected area and allow a manual change; never silently charge the wrong area.
- Offline tolerance: queue start/stop events when there is no signal; the server uses event times, not receive times.
- Accessibility (screen reader labels, large touch targets), light/dark mode, localisation (English first; the design should allow French for Canada).
- Audit trail for every state change (the old `Audit` table idea).
- Data retention and deletion path (account deletion is mandatory on both stores).

## MVP scope recommendation
**In:** register/login, vehicles, one or two pilot parking areas, start/end, fee calculation with time-of-day rules, card payment, reminders, history, an operator web console to draw areas and set rates, officer lookup by plate.
**Later:** passes and promotions, family accounts, OCR/QR, toll module, voice/SMS, analytics and fraud models.
