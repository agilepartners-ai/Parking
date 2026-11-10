---
title: App Store, Google Play and web launch checklist
status: checklist; fees, rules and form names change, verify each item on the official page before acting
last_updated: 2026-11-10
---

# Launch checklist

## Accounts and identity
- [ ] Decide publisher: **individual vs company**. The legal name is shown on both stores. Apple's organisation enrolment needs a D-U-N-S number and can take days or weeks.
- [ ] **Apple Developer Program** (paid yearly, currently about US$99; verify). Enrol, accept agreements, set up **banking and tax** if the app handles paid features.
- [ ] **Google Play Console** (one-time registration fee, currently about US$25; verify). Complete identity verification. For **new personal accounts**, Google has required a **closed test with a minimum number of testers (12) for 14 days** before production access. Check whether that applies to your account type today.
- [ ] Domain name + email on that domain; support page; privacy policy URL; terms URL.
- [ ] Product **name** cleared (trademark search, store name search). Do not reuse "Agile Parking" / "Agile Partners" unless you have the right to.
- [ ] Stripe account (and Connect) activated for your country; confirm that your countries and operators are supported.

## Build and release (Expo)
- [ ] Bundle id (iOS) and application id (Android) chosen and never changed (`com.<yourdomain>.<app>`).
- [ ] `app.config.ts` with permissions strings: location when-in-use, optional always, camera, notifications.
- [ ] Development build for testing background location; **do not test it in Expo Go**.
- [ ] EAS Build for both platforms; EAS Submit to TestFlight and Play internal track; EAS Update for OTA JS fixes.
- [ ] Version/build number policy; release notes; crash reporting enabled.
- [ ] Android: target the API level Google currently requires; 64-bit; app signing by Play. iOS: current Xcode/SDK requirement for submissions.

## Store listing assets
- [ ] App icon (1024x1024, no transparency for iOS), feature graphic (Google, 1024x500).
- [ ] Screenshots for each required device size (iPhone large, iPad if you support it, Android phone; 7"/10" tablets if you claim tablet support).
- [ ] Short and long description, keywords, category (Navigation or Travel/Maps; verify), age rating questionnaire, support URL, marketing URL.
- [ ] Optional promo video.
- [ ] Localised copy for each launch language.

## Policy and compliance forms
- [ ] **Apple App Privacy** labels (location, contact info, identifiers, purchases, usage data).
- [ ] **Google Data safety** form and **Permissions declaration** for **background location** (justification text + short video of the feature).
- [ ] Apple review notes explaining location use and payments; **demo reviewer account** that works without SMS codes; a way for the reviewer to simulate being in a parking area (a test area near the reviewer, or a "demo mode" the reviewer can switch on).
- [ ] **Account deletion** inside the app and on the web (both stores require it).
- [ ] **Sign in with Apple** if you offer other third-party social logins on iOS.
- [ ] Payments: parking is a real-world service; use Stripe (not In-App Purchase). State this in review notes.
- [ ] Privacy policy covers location, plates, payments, retention (30-day pings), processors (Stripe, Supabase/hosting, Sentry), user rights, contact.
- [ ] Terms of service covering fees, disputes, fines, refunds, operator relationship.
- [ ] Accessibility pass: screen reader labels, dynamic type, contrast, touch targets.

## Web
- [ ] Marketing site on Cloudflare Pages: home, how it works, for cities/operators, privacy, terms, support, deletion request.
- [ ] Driver web app (Expo web export or a separate lightweight app) with login, history, receipts.
- [ ] Operator console behind login on its own subdomain.
- [ ] SEO basics: titles, meta, Open Graph, sitemap, schema.org `SoftwareApplication`, store badges and **Smart App Banner** / App Links / Universal Links files (`apple-app-site-association`, `assetlinks.json`).
- [ ] Cloudflare: DNS, TLS, WAF rules, rate limiting on auth endpoints, Turnstile on forms.

## Quality gates before submission
- [ ] End-to-end test: register, add vehicle, start, wait, end, pay, receipt, history, delete account.
- [ ] Fee tests: grace period, time-of-day boundary, DST change day, daily max, pass products.
- [ ] Poor-GPS and offline tests; double-tap and retry (idempotency); two phones on one account.
- [ ] Background location battery test on real devices (iOS and a mid-range Android).
- [ ] Security: no secrets in the app bundle; API authorisation tests; rate limits; dependency scan.
- [ ] Legal: ownership and patent questions closed (`docs/02-ip-and-legal.md`).

## After launch
- [ ] Monitor crash-free sessions, payment failures, support email.
- [ ] Respond to store reviews; plan the first update in 2 weeks.
- [ ] Track maintenance fee dates for the patents.
