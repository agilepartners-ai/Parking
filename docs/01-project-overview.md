---
title: Project overview - what this project is, its history, and what to trust
last_updated: 2026-11-10
---

# Project overview

## One paragraph
A geo-location parking payment app from 2012. A driver opens the app, taps **Start Parking**, the server works out which paid parking area they are in from GPS, starts a timer, and when they tap **End Parking** it works out the fee and charges them. Parking officers use a second app to check which vehicles are validly parked and to issue tickets. The city/parking operator needs **no meters and no roadside hardware**: pricing is by *parking area* (a polygon on a map) because phone GPS is only accurate to about 5-25 m. The same idea extended to **toll roads** (second patent).

Pitch slogan: **"Just Click Park! Plain & Simple! PARK -> PAY -> GO"**.

## People and organisations seen in the files
| Name | Role as far as the files show |
|---|---|
| Agile Partners Inc (Michigan) / Dev Information Technology Ltd (Ahmedabad) | The company on the pitch deck, NDAs and website copy |
| Aditya (Aggarwal) | Patent inventor, NDA signatory, owner of the working copy (`F:\Aditya\...`) |
| Sunil Goel | Co-inventor on both patents |
| "Ravi" | Sent code drops (`FromRavi`, `CodeFromRavi20July2012`, `Carparking.ipa`) |
| Bways Techno Solution | Hosting domain for the geofence web service in the PhoneGap client (`geo.bwaystechnosolution.com`), likely the outsourced developer |
| Deep Mehta, Mitesh Pandey, Tirath Mulani | Final-year IT students (Silver Oak College, GTU), guide Mr. Alex Kumar; wrote website/app copy ("Website Documents") |
| Toronto Parking Authority (TPA) | The target customer in the pitch deck |
| Danielle Mason, Rob Eddy | NDA recipients |

I am not making claims about how these people relate to you. See `docs/02-ip-and-legal.md`.

## Timeline reconstructed from file dates
| Date (2012 unless noted) | Event |
|---|---|
| 2011-10-06 | Earliest code in folder: an ASP.NET web-form skeleton (`v0`) |
| 14 May | NDAs dated |
| 20-22 May | Windows Azure prototype with a WCF service and Azure Tables (`v1`); Azure MSDN credentials file downloaded 22 May |
| 26-27 May | SQL Server database `AgileParking`, `UserInfo` table |
| 7-12 Jun | Patent draft ("Centralized parking payment") |
| 2-12 Jun | First working ASP.NET web-forms backend + jQuery Mobile front end (`v2`) |
| 17-30 Jun | Merged "AgileParkingServices" project, backups (`v3`) |
| 30 Jun | Word screenshots collected from a competitor app (Parking Mate) |
| 4-8 Jul | Pitch decks v7 (4 Jul) and v8 (5 Jul); 7-9 Jul in-app screenshots; geofence + PhoneGap work from Aditya (`v5`) |
| 15-16 Jul | Merged services with polygon drawing/viewing (`v6`) |
| 20-22 Jul | **Latest code**: ASMX service + PhoneGap/iOS wrapper + Azure packaging (`v7`) |
| 6 Aug | iOS build (`Carparking.ipa`, `v8`) |
| 22 Jun / 27 Aug | Priority dates of the toll and parking patents |
| 2013-2020 | Patents filed, published, granted (see IP doc) |
| 31 Aug 2022 | Copy of an old snapshot (`CodeForParking`) made |
| 5 Nov 2026 | Folder re-copied onto this machine |

## What is real, and what is only a plan

| Capability | In the 2012 code? | In the patent/deck? |
|---|---|---|
| Register a user (email, name, cell, plates) | Yes (plaintext password) | Yes |
| Start and end a parking session with GPS fix | Yes (stored, no fee) | Yes |
| Draw parking polygons/lines on a map and store them | Yes (admin tool `drawpolygons.html`) | Yes (Admin-3 area) |
| Show user's location relative to polygons | Yes (`Viewpolygons.html`) | Yes |
| Look up address from GPS | Yes (Google geocode, geonames) | |
| **Fee calculation / rates / rules engine** | **No** | Yes |
| **Payment (cards, wallets, payouts)** | **No** | Yes |
| **Enforcement app, tickets, plate lookup** | Only a link to a separate Azure site that is not in the folder | Yes |
| Notifications / reminders | No | Yes |
| Speed-based "you left, end your session" reminder | No | Claim 1 of the parking patent |
| Toll tracking | No | Toll patent |
| OCR / QR plate recognition | No | Optional |

So you are not rebuilding an app, you are **building the product for the first time**, using the 2012 code as a record of intent and the patents and deck as the spec. The old code is a prototype and is not reusable as code (see `docs/04-legacy-codebase-analysis.md` and `docs/06-security-findings.md`).

## How to treat the numbers in the deck
The $250 per meter per year, 10,000 meters, "under $2.5M a year" and "90% savings" figures come from a 2012 sales deck and cite a meter vendor's page. They are claims, not data. Re-do the business case with current city data before using them in any investor or store material.

## Reading order for a new session
1. `CLAUDE.md` (root)
2. this file
3. `docs/02-ip-and-legal.md`
4. `docs/03-product-requirements.md`
5. `docs/07-modernization-plan.md` and `database/schema.sql`
6. `docs/04-...` to `06-...` only when you need old-code detail
