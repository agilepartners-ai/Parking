---
title: Legacy codebase analysis (2012 prototype) - versions, architecture, API, data model, what to reuse
latest_version: 04_legacy-code/v7_2012-07-22_LATEST_phonegap-ios-asmx-azure/
last_updated: 2026-11-10
verified: read the v7 backend and client source; skimmed the others; nothing was compiled or run (it needs Visual Studio 2010/2012, SQL Server and Azure SDK 1.x, all end-of-life)
---

# Legacy codebase analysis

## Versions (oldest to newest) and which one matters

| Folder | Date | What it is | Keep for |
|---|---|---|---|
| `v0_2011-10_initial-webform-backup` | 6 Oct 2011 | Empty ASP.NET web-form skeleton | history only |
| `v1_2012-05_azure-wcf-prototype` | 20-22 May 2012 | Windows Azure web role with a WCF contract that has one `DoWork()` method and an Azure Tables sample copied from a tutorial ("FastMotorcycleList") | nothing |
| `v2_2012-06_aspnet-webforms-first-working` | 2-12 Jun 2012 | First working backend: ASP.NET web forms (`StartParking.aspx`, `EndParking.aspx`, `UserService.aspx`, `Registration.aspx`) + `ParkInfo`/`UserInfo` classes + jQuery Mobile `index.html`, Azure packaging | concept of start/end session |
| `v2b_2012-06-12_CodeForParking-snapshot-copy` | 12 Jun 2012 (copied 2022) | Near-copy of v2 (differs in config, publish xml, a few `.aspx.cs`, binaries) | duplicate, safe to ignore |
| `v3_2012-06-30_backup` | 17-30 Jun 2012 | `WebApplication2`: adds `ReturnStatus`, `Parking.aspx.cs`, HTML screens (Index, Login, Parking, StartHere), CORS in `Global.asax` | history |
| `v4_2012-07-08_backup` | to 8 Jul 2012 | Same plus `ParkingDataRegistered.aspx` | history |
| `v5_2012-07-08_phonegap-geofence-from-Aditya` | 6-9 Jul 2012 | **Geofence work**: PhoneGap `www` folder (login, home, registration, parking, draw/view polygons), a small ASMX web service and SQL for polygon tables. Includes Aditya's ReadMe | polygon model |
| `v6_2012-07-16_merged-services` | 15-16 Jul 2012 | Merge of the above: `WebApplication2` with `App_Code/` (Service, ServiceBO, ServiceDal, DataAccess), polygon pages and `MapPolygon.aspx` | history |
| **`v7_2012-07-22_LATEST_...`** | 20-22 Jul 2012 (solution updated 6 Oct 2012) | **Latest.** `ParkingService` (ASMX + App_Code), `GeoServices`, PhoneGap `iphoneProject` (Xcode project `Carparking`), Azure cloud-service packaging, SQL scripts. Zip of the same alongside | the reference |
| `v8_2012-08-06_ios-build-ipa` | 6 Aug 2012 | Compiled `Carparking.ipa` (iOS 5 era) | proof the app ran |
| `side-projects/ViewParkingTransactions` | Jul 2012 | Empty ASP.NET shell for a transactions viewer (Azure package, no logic) | nothing |
| `side-projects/Log4Net_WebApp`, `ParkWebFrontEnd` | Jun 2012 | log4net experiment, a lone `web.config` | nothing |
| `_shared-js-libs` | 2012 | jQuery 1.7, jQuery Mobile 1.1, Cordova 1.7, Crockford JSON | nothing |
| `_dev-notes` | May 2012 | Development Notes: SQL date/time function decisions | design rationale |

Rule of thumb: **read v7 and v5, ignore the rest.**

## Architecture of v7

```
 iPhone / Android (PhoneGap/Cordova 1.8 WebView)           Azure Cloud Service (2012)
 +----------------------------------------+   HTTP/JSON    +-----------------------------+
 | index.html -> login/Registration -> home |  ----------->  | Service.asmx (ASP.NET ASMX) |
 | Parking.html  (Google Maps JS v3, GPS)   |                | App_Code: Service, ServicesBO|
 | drawpolygons.html / Viewpolygons.html     |  <-----------  |   ServiceDal, ParkInfo,     |
 +----------------------------------------+                | UserInfo, Util, DataAccess  |
        calls Google Geocode + geonames.org                  +--------------+--------------+
                                                                            | ADO.NET
                                                             SQL Server / Azure SQL "AgileParking"
```

- Front end: static HTML + jQuery Mobile 1.0 + Cordova, wrapped in a thin Xcode project. No framework, no build step.
- Back end: classic ASP.NET `[WebService]` with `[ScriptService]`, called with `$.ajax` POST and JSON; responses are JSON strings inside the ASMX `d` property.
- Data: SQL Server tables for users, parking sessions, audit, and geofence polygons.
- Third-party calls: Google Maps JS v3 (`sensor=false`, now obsolete) and Google Geocoding, geonames.org nearby streets.
- Hosts that appear in the code: `parkingwebservices.cloudapp.net`, `parkingenforcementservice.cloudapp.net`, `geo.bwaystechnosolution.com`, `localhost`. The first two were Azure cloud services; I did not test them and expect them to be gone.

## Client screen flow (v7)
```
index.html  --first run--> Registration.html --> login.html --> home.html
                       \--has account--------------------------^
home.html -> Parking.html      (pick area, enter plate, Start / End Parking, map)
          -> drawpolygons.html (operator draws parking polygons or lines, names them, saves)
          -> Viewpolygons.html (shows saved polygons and the user's live position)
          -> parkingenforcementservice.cloudapp.net (separate enforcement site, not in the folder)
          -> login.html        (log out)
```
Screenshots of the running Android build are in `03_design-reference/own-app-screenshots_2012-07/` (a map with a green polygon labelled "Agile Parking Application", etc.).

## API (all methods of `Service.asmx`, v7)

| Method | Purpose | Notes |
|---|---|---|
| `Parking(... Call)` | Start and end a session. `Call = CreateParking` inserts `ParkInfo`; `CompleteParking` closes it; `IsInParking` is an empty stub | **No fee computed.** Id is `DateTime.Now.ToString().GetHashCode()` |
| `UserService(... Call)` | `CreateUserInfo` inserts a user. `UpdateUserInfo` and `GetUserInfo` exist but are **unreachable** because of an `else if` attached to the wrong `if` | Login by cell number + plaintext password |
| `loadAllPolygon()` | Returns every parking polygon/line with points | TODO in code: filter to nearby |
| `InsertLocationTitleToServer(title, createdBy, cordDetails, ptype)` | Saves a drawn polygon (`ptype` = polygon or line) | Builds SQL by string concatenation (injectable) |
| `SaveLatlngInPoly(lat, lng, deviceId, polyId)` | Logs that a device is inside a polygon (`geo_log`) | Called when the device is near a location |
| `GeoParkingTitles(lat, lng)` | Parking location titles near a point | proc `geo_GeoParkingTitles` is not in the folder |
| `GetGeoLocationListByLatLang`, `GetGeoNames` | Proxy to Google Geocode and geonames.org | server-side relay |
| `UpdateCurrentLoactionToServer` | "not in use" | dead code |

Return object `ReturnStatus`: `TxID, UserID, ParkingTxID, CompletedParkingTxID, UserEmail, AccountID, UserStatus, CellNumber, Parking[]`.

## Data model (as recovered)

`ParkInfo` (a parking session): TxID (PK), AccountID, UserID, ParkingPlanID, DurationInMinutes, LocationName, StartDateTime, EndDateTime (strings, a deliberate speed-over-types decision in the dev notes), Accuracy, Speed, Heading, Latitude, Longitude, LicensePlateNo, RegionLicensePlateFrom, Status, InternalStatus, UserEmail, LinkedTx, CompleteTxID, Comments, CELLNumber, Created/Updated date and time (set by triggers).
`UserInfo`: UserID (PK), UserEmail, FullName, Password, PrimaryCell, UserType (`O` owner/driver seen in samples), AccountID, ResidentAddressID, MailingAddressID, DefaultLicensePlate, LicensePlatesSeparatedBySemiColon, Status, Created/Updated.
`Audit`: TxID (PK), AccountID, UserID, RequestStr (the JSON request), Created date/time. Used for idempotency: a repeated TxID with an identical payload returns "Duplicate Transaction".
`geo_LocationTitle` (Id, LocationTitle, DateCreated, CreatedBy, Ptype) 1-to-many `geo_LocationTitleCord` (Id, RefId, Lat, Lang, LatLang) = a polygon and its points.
`geo_log` (id, LocationId, CreatedDate, DeviceId, UserId, Lat, Lng) and `geo_LogCurrentLocation` = device-in-area log.
Procs: `sp_InsertParkInfoXML`, `sp_UpdateParkInfoXML`, `sp_CompleteParkInfoXML`, `sp_InsertUserInfoXML` (all stubs that parse XML and do nothing, real inserts are inline SQL), `geo_InsertLocationTitle`, `geo_InsertLogCurrentLocation`, `USP_GETALLPOLYGONS`, `usp_insertGeo_log`. Triggers set Created/Updated timestamps from `GETUTCDATE()`.
Cleaned-up scripts are in `database/legacy-sql/`. The modern equivalent is `database/schema.sql`.

## What is worth carrying forward (ideas, not code)
1. **Session lifecycle** `Parked -> Completed`, with a separate machine-readable internal status.
2. **Parking Area = polygon (or line for kerbside)** with a name and type. Matches patent Admin-3.
3. **Idempotent requests with an audit log**: every request stored with a client-generated id.
4. **Store the raw GPS context** (accuracy, speed, heading) with the session. These are exactly the fields the patent's speed/accuracy logic needs.
5. **Operator drawing tool** on a map to define areas without developers.
6. **UTC timestamps everywhere** (the dev notes learned this the hard way).
7. **Grace period** (cancel inside 5 minutes).

## What not to reuse
All the code: ASMX/ASP.NET 4 on Azure SDK 1.x, PhoneGap 1.8, Google Maps v3 `sensor=false`, unauthenticated endpoints, plaintext passwords, string-built SQL, weak ids, hard-coded credentials. Details: `docs/06-security-findings.md`. None of it builds on current toolchains, and fixing it would cost more than rewriting.

## Duplicates and noise you can ignore
- `v2b` duplicates `v2`; `v3` and `v4` are backups of `v6`'s ancestors; `CodeFromRavi20July2012.zip` duplicates the extracted `CodeFromRavi20July2012` folder.
- Most of the ~2,200 files in `04_legacy-code` are compiled `bin/`, `obj/`, `csx/` (Azure package output), `.suo` and `.svn` files. Source is a few dozen `.cs`, `.html`, `.sql` files.
