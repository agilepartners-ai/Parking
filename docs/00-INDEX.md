---
title: Knowledge base index
last_updated: 2026-11-10
---

# Index

**Start here:** [MASTER-SPECIFICATION.md](MASTER-SPECIFICATION.md) is the single document that covers the 2012 material, the schema, the API, geofencing, testing and what is still missing.

**New (2026-11-10):** [EXPLAINER-FOR-MANAGEMENT.md](EXPLAINER-FOR-MANAGEMENT.md) (plain-language overview for non-developers) and [SETUP-AND-TESTING.md](SETUP-AND-TESTING.md) (run, test, release). The prototype is built: see the repository README.

| # | Document | Read it when |
|---|---|---|
| 01 | [Project overview](01-project-overview.md) | You need the big picture, the people, the timeline, and what was real vs only planned |
| 02 | [IP and legal](02-ip-and-legal.md) | Anything about patents, NDAs, naming, launching under your name. **Has open questions that block launch.** |
| 03 | [Product requirements](03-product-requirements.md) | Features, user roles, flows, business rules, MVP scope |
| 04 | [Legacy codebase analysis](04-legacy-codebase-analysis.md) | You want to know what the 2012 code did, which version is latest, the API and old data model |
| 06 | [Security findings](06-security-findings.md) | Before sharing, zipping or pushing anything; credential locations; why the old code is not reused |
| 07 | [Modernisation plan](07-modernization-plan.md) | Architecture choices (Expo, Postgres, Stripe), repo layout, roadmap |
| 08 | [Store and launch checklist](08-store-and-launch-checklist.md) | App Store, Google Play, web, privacy forms |
| 09 | [Source inventory](09-source-inventory.md) | Where each original file went; which source documents were converted |
| - | [Database README](../database/README.md), [schema.sql](../database/schema.sql), [seed_dev.sql](../database/seed_dev.sql) | Data model and how old tables map to new |

(There is no document 05: its content, the legacy API and data model, is inside 04.)

## Converted source documents (`docs/sources/`)
- [Pitch deck v8](sources/pitch-deck_agile-parking-v8.md) - cleaned, structured
- [Patents summary (Google Patents)](sources/patents_google-patents-summary.md)
- [Patent draft, original disclosure](sources/patent-draft_centralized-parking-payment.md) - text unchanged
- [Website documents (student team)](sources/website-documents_student-team.md) - text unchanged
- [Development notes (SQL)](sources/development-notes_sql.md) - text unchanged

## Images (`docs/assets/`)
- `pitch-deck-v8/slide01.png` to `slide20.png` (slides 16 and 17 hold the patent figures)
- `patent-draft-figures/image01-04.jpeg` (contextual diagram and process figures from the draft)
- `competitor-screens/` (Parking Mate screenshots, reference only)

## Open decisions (yours)
1. **Patent ownership.** Are the patents assigned/licensed to you? Who are Aditya Aggarwal and Sunil Goel to you? Have the maintenance fees been paid? (`02-ip-and-legal.md`)
2. **Publisher and name.** Individual or company? New product name? (`08-...`)
3. **Backend path.** Supabase for speed, or Neon + Cloudflare Workers to own the API? (`07-...`)
4. **Pilot.** Which city or private lot owner would you pilot with? It decides the first area, rates, currency and payment setup.
5. **Unrelated files: done.** On 2026-11-10 you chose to delete the unrelated material (a Meritor truck-parts sales app and old .NET libraries, 5,618 files, 2.32 GB). It is gone and cannot be restored from this folder. The old paths remain listed in `_meta/manifest-before-reorg.csv`.
6. **Azure credentials file: done.** Its certificate expired in 2013 and the old hosts no longer exist; the file was deleted on 2026-11-10.
