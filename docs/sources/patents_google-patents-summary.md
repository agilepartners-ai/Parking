---
title: The two Google Patents links you gave me - extracted summary
sources:
  - https://patents.google.com/patent/US9792818
  - https://patents.google.com/patent/US20150154578A1
retrieved: 2026-11-10
caveat: summarised from the Google Patents pages. Google states its legal status is an assumption, not a legal conclusion. Claims below are paraphrased, not the legal text. Read the full claims on USPTO Patent Center before relying on any of this.
---

# Patents (from Google Patents)

| | US 9,792,818 B2 | US 2015/0154578 A1 (granted as US 10,726,403 B2) |
|---|---|---|
| Title | Centralized parking payment and monitoring system using geo location enabled devices | Centralized **toll** tracking, payment and monitoring system using geo location enabled devices |
| Subject | **Parking** | **Toll roads** |
| Inventors listed | Adityakumar Akshaikumar Aggarwal; Sunil Goel | Adityakumar Akshaikumar Aggarwal; Sunil Goel |
| Assignee listed | none (individuals) | none (individuals) |
| Priority | 27 Aug 2012 (India, IN2490/MUM/2012) | 22 Jun 2012 (India, IN1811/MUM/2012) |
| Filed (US/PCT) | 2 May 2013 (US 14/423,127) | 15 May 2013 (PCT/IN2013/000315, WO2013190566A2) |
| Published | 30 Jul 2015 (US20150213716A1) | 4 Jun 2015 |
| Granted | 17 Oct 2017 | 28 Jul 2020 |
| Status shown by Google | Active (est. expiry 24 Aug 2033) | Active (adjusted expiry 18 Feb 2034) |

Note the second link, US20150154578A1, is the **toll** patent application, not a parking one. Slide 18 of the pitch deck ("Future toll application: patent pending") corresponds to it. The original draft disclosure in the folder (`01_ip-legal/patent-draft_centralized-parking-payment.docx`) is the parking invention.

## US 9,792,818 (parking): what is claimed

One independent claim (claim 1), a **system** with four parts:
1. **Cloud server** storing parking areas (with geolocations, spaces, rules, fees) and user accounts.
2. **User devices**: send location + user id to start a session; server starts a timer, returns the fee info for the area, and ends the session when the user acts again in the app.
3. **Enforcement officer device**: sends its own location, shows validly parked vehicles nearby, can send violation tickets to the server.
4. **Cellular network** linking all of them. Server decides the parking area from the user's location, marks the vehicle validly parked when the timer starts, computes the fee at session end. **The user's device reminds the user to end the session if the device's location changes and it moves above a set speed.**

Dependent claims (2-9) add: device types (pager, phone, smartphone, palmtop, laptop); GPS and/or cellular positioning; account structure (master account, family sub-accounts, default plate, temporary vehicles); parking areas across cities/states/countries owned by different entities; unusual-activity alerts from history; fraud detection with user notification; tracking of valid vehicles, fees, payments, violations and free spaces; vehicle entry by barcode, QR, camera or optical recognition.

Design ideas worth keeping (description section):
- Pricing applies to a whole **Parking Area** (street section or lot), **not a single bay**, because phone location is only accurate to about 5-25 m.
- **Three-level area hierarchy**: Admin-1 (county/state), Admin-2 (city), Admin-3 (polygon of the specific area). Match the most specific level first, fall back to broader ones.
- Plans: hourly prepaid, day/week/month pass, or pay-at-end by actual time. Operator is paid minus an agreed service charge.
- Access: smartphone app, web app, SMS, or voice (IVR/CTI) for basic phones; unregistered users can pay online or by toll-free phone.
- Vehicle identification: QR stickers, plate photo with OCR, or manual entry.
- Notifications: time limit, lot closing, leaving without ending a session; by app, call or SMS.

## US 10,726,403 / US20150154578A1 (toll): what is claimed

- **System claim:** cloud-based toll tracking with a handheld geo-location device, toll road database, central cloud system, algorithms to decide whether a vehicle is on a toll road, an enforcement app, and integration with the existing payment process.
- **Method claim:** (a) one-time app download and registration; (b) run the app in background or start it at trip start; (c) send multiple location readings to the cloud, which uses a toll-road database and statistical algorithms to decide if the vehicle is on a toll road; (d) calculate the toll by business rules for that location; (e) pay through an encrypted online system.
- Dependent claims: no roadside devices; rates by time, traffic, speed, time on road; officer app; multiple readings to detect entry and exit; no charge for brief wrongful entry; adaptive sampling (fewer readings when far from entry/exit to save battery); prevent double charging when several devices are in one vehicle.

## How this maps to the product

See `docs/02-ip-and-legal.md` for ownership questions and what to verify, and `docs/03-product-requirements.md` for the features these claims imply.
