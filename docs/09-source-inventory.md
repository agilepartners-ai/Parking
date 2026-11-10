---
title: Source inventory - where every original went, and what was converted
last_updated: 2026-11-10
complete_lists: docs/_meta/move-log.csv (47 move operations), docs/_meta/manifest-before-reorg.csv (every file before the reorganisation: path, size, date)
integrity_check: 7,871 files before and 7,871 after in the original areas (new docs, database and root files are extra). Verified by comparing file name + size against the manifest. 12 files were deliberately renamed (patent draft, both decks, screenshots.docx, Website Documents, Development Notes, Jensen paper, android xlsx, 3 SQL scripts, publishsettings) and were matched by size. That check was made right after the reorganisation. **Afterwards, on 2026-11-10, you asked me to delete the unrelated Meritor project and libraries: 5,618 files, 2.32 GB, permanently.** The same day you also had the expired Azure credentials file deleted (after I confirmed its certificate ran out in 2013). Everything else is intact (about 2,300 files, 0.19 GB). The manifest still lists the deleted paths.
---

# Source inventory

## Originals: old path -> new path
| Old location (under `Parking_app\`) | New location | Type |
|---|---|---|
| `Patent_Centralized parking payment.docx` | `01_ip-legal/patent-draft_centralized-parking-payment.docx` | patent draft |
| `MobileApp-iPad\NDAs\` (3 docx + a lock file) | `01_ip-legal/NDAs/` | NDAs |
| `AgilePartners Parkingv7.ppt` | `02_business/pitch-deck/AgilePartners-Parking-v7_2012-07-04.ppt` | slides (older) |
| `AgilePartners Parkingv8.ppt` | `02_business/pitch-deck/AgilePartners-Parking-v8_2012-07-05.ppt` | slides (**final**) |
| `ParkingMarketingMaterial\TorontoParkingAuthority\` | `02_business/market-research/TorontoParkingAuthority/` | TPA 2003 and 2010 annual reports, 2009 staff report |
| `MobileApp-iPad\Students\Website Documents.docx` | `02_business/website-content/Website-Documents_student-team.docx` | website/app copy |
| `screenshots.docx` | `03_design-reference/competitor-screenshots_ParkingMate.docx` | competitor reference |
| `MobileApp-iPad\AppScreenshots\` | `03_design-reference/own-app-screenshots_2012-07/` | 10 PNG screenshots of the 2012 Android build |
| `MobileApp-iPad\10.1.1.70.161.pdf` | `03_design-reference/research/Jensen-2006_Geo-Enabled-Mobile-Services.pdf` | academic paper |
| `MobileApp-iPad\android developers.xlsx` | `03_design-reference/research/android-developers-list_2012-06.xlsx` | spreadsheet (not analysed) |
| `MobileApp-iPad\AgileParkingServices\Backup` | `04_legacy-code/v0_2011-10_initial-webform-backup/` | code |
| `MobileApp-iPad\AzureAgileParkingService`, `AgileParkSolution` | `04_legacy-code/v1_2012-05_azure-wcf-prototype/` | code |
| `MobileApp-iPad\WebApplication1` | `04_legacy-code/v2_2012-06_aspnet-webforms-first-working/` | code |
| `CodeForParking` | `04_legacy-code/v2b_2012-06-12_CodeForParking-snapshot-copy/` | code (copy of v2) |
| `...\AgileParkingServices\Backup30062012` | `04_legacy-code/v3_2012-06-30_backup/` | code |
| `...\AgileParkingServices\Backup08072012` | `04_legacy-code/v4_2012-07-08_backup/` | code |
| `MobileApp-iPad\FromRavi` | `04_legacy-code/v5_2012-07-08_phonegap-geofence-from-Aditya/` | code |
| `MobileApp-iPad\AgileParkingServices` (rest) | `04_legacy-code/v6_2012-07-16_merged-services/` | code |
| `MobileApp-iPad\CodeFromRavi20July2012` (+ `.zip`) | `04_legacy-code/v7_2012-07-22_LATEST_phonegap-ios-asmx-azure/` | **latest code** |
| `MobileApp-iPad\fromRavi06082012\Carparking.ipa` | `04_legacy-code/v8_2012-08-06_ios-build-ipa/` | iOS build |
| `MobileApp-iPad\ViewParkingTransactions`, `Log4Net_WebApp`, `ParkWebFrontEnd` | `04_legacy-code/side-projects/` | empty shells |
| `MobileApp-iPad\javascripts` | `04_legacy-code/_shared-js-libs/` | jQuery, Cordova |
| `Parking\Development Notes.docx` | `04_legacy-code/_dev-notes/Development-Notes_sql-and-design.docx` | notes |
| `MobileApp-iPad\DBScripts.sql`, `DBScript06302012.sql`, `UserInfo.sql`, `DBScripts\` | `database/legacy-sql/` | SQL |
| `Parking\` (rest: Titanium app, manual, mockups) | **deleted 2026-11-10** | Meritor project, not parking |
| `MobileApp-iPad\Meritor Mobile Source Package`, `SalesPad.arvinmeritor.com`, `salespadws.arvinmeritor.com` | **deleted 2026-11-10** | Meritor project (2.3 GB, videos and PDFs) |
| `MobileApp-iPad\Source`, `NewtonJson`, `log4net-*`, `*.zip`, `Documentation.chm`, `readme.txt` | **deleted 2026-11-10** | open-source libraries |
| `MobileApp-iPad\...credentials.publishsettings` | **deleted 2026-11-10** | expired 2012 Azure credential file |
| `MobileApp-iPad\~$rkingApp.docx` | **deleted 2026-11-10** | Word temp file |

`MobileApp-iPad`, `Students`, `ParkingMarketingMaterial` and `CodeForParking` no longer exist as folders; they were emptied by the moves and removed (empty only).

## What was converted to Markdown (and how)
| Source | Markdown | Method | Fidelity |
|---|---|---|---|
| Pitch deck v8 (20 slides) | `docs/sources/pitch-deck_agile-parking-v8.md` + `docs/assets/pitch-deck-v8/*.png` | PowerPoint export, then hand-structured | Text complete; images of every slide kept. Logo-only slides (4, 5, 11) have no text |
| Pitch deck v7 | differences listed in the v8 file | diff of extracted text | Only wording and slide 19 differ |
| Patent draft | `docs/sources/patent-draft_...md` + `docs/assets/patent-draft-figures/` | python-docx | Text unchanged, 4 figures extracted |
| Website Documents | `docs/sources/website-documents_student-team.md` | python-docx | Text unchanged |
| Development Notes | `docs/sources/development-notes_sql.md` | python-docx | Text unchanged |
| Two Google Patents links | `docs/sources/patents_google-patents-summary.md` | web fetch, summarised | **Paraphrase, not the legal text** |
| NDAs (3) | summarised in `02-ip-and-legal.md` | read | Not copied in full (confidential) |
| `screenshots.docx` | 2 images in `docs/assets/competitor-screens/` | image extraction | Competitor's screenshots |

## Not converted or not analysed
- `android developers.xlsx`, TPA PDFs (identified by first page only), the `.ipa`, and the Azure build output folders.
- I did not compile or run any legacy code.
