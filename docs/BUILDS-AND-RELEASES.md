---
title: Builds, updates and releases (how to not run out of builds)
audience: the owner
status: written 2026-11-10; verified against the Expo account on that date
---

# Builds, updates and releases

## What actually uses an EAS build

An **EAS build** is a cloud build started by `eas build`. Only that command (or a build you start from expo.dev) uses one.

- **Commits and pushes do not start builds.** On 2026-11-10 the account had 4 builds in total (3 finished, 1 cancelled), and each one was started by hand. There is no automatic build from GitHub on this project. If you ever connect GitHub to the Expo project (expo.dev → project → GitHub), builds can start on push, so leave that off.
- Your plan's monthly allowance and when it resets are shown on expo.dev → your account → **Billing / Usage**. Check the real counter there rather than trusting a number from memory.
- Treat each cloud build as a scarce item. The plan below means you rarely need one.

## The plan (use the cheapest tool that works)

| What changed | How to get it onto a phone | Uses an EAS build? |
|---|---|---|
| Screens, text, logic (JavaScript / TypeScript) while developing | Run `npm run mobile` (Metro) with the **development build** installed. Saving a file reloads the phone | No |
| JS-only fix for people who already have the app | **Over-the-air update:** `eas update --channel preview --message "what changed"` (testers) or `--channel production` (store users). The app downloads it next time it opens | No |
| Native change (new native library, permission, app icon, `version`) | **Local build** on this PC: `npm run build:apk` → `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` | No |
| Release to Google Play / App Store | **Cloud build** with the production profile, because stores need the signed build from the stable EAS keystore | Yes, 1 per platform per release |

Rules that keep the count low:

1. Never run `eas build` to "see if it works". Test on the emulator or with Metro first.
2. Batch native changes. Do several, then one build.
3. Do not bump `version` in `apps/mobile/app.config.ts` for JS-only changes. The **runtime version equals the app version**, so an over-the-air update only reaches builds of the same version. Bump it only when native code changes, then make a new build.
4. Use `eas build --profile preview` for tester APKs only when the local build is not possible (for example you are on another computer).

## Over-the-air updates

Set up in `app.config.ts` (`runtimeVersion`, `updates.url`) and `eas.json` (a channel per profile). Builds made **after 2026-11-10** include it; the first v0.1.0 APK does not, so it will not receive updates.

```bash
cd apps/mobile
eas update --channel preview --message "Fix keyboard on sign-in"
```

- An update can only change JavaScript and assets. It cannot add a permission or native library.
- Apple and Google allow this for bug fixes and small changes; do not use it to change what the app fundamentally does.
- To roll back: `eas update:rollback` or publish the previous commit again.

## Local Android build (free)

Requirements are already installed on this PC: JDK 21 and the Android SDK (`%LOCALAPPDATA%\Android\Sdk`).

```bash
npm run build:apk
```

It generates the native project (`expo prebuild`, folder `apps/mobile/android`, git-ignored), runs Gradle, and copies the APK to `release-artifacts/`.

Caveats:

- The local APK is signed with a **debug key**, not your store key. Good for testing and for GitHub pre-releases; **not** for Google Play.
- Installing it over an app that came from an EAS build fails (different signature): uninstall the old one first.
- The first run downloads Gradle and the Android build tools (several GB, 10 to 20 minutes). Later builds are faster.
- It builds on Windows, but not iOS. iOS builds need EAS cloud or a Mac.

## Do not lose builds or keys

- **Download and keep every APK you share.** Attach it to a GitHub release (done for v0.1.0). Expo removes old build artifacts after a retention period, so a link on expo.dev is not an archive.
- **Back up the Android signing key.** Google Play only accepts updates signed by the same key. In `apps/mobile` run `eas credentials` → Android → production → download the keystore, and store it with its passwords in your password manager (not in Git). Losing it means you cannot update the app on Play without Google's key-reset process.
- Same for the iOS distribution certificate and provisioning profile once you have an Apple account (EAS keeps them and can export them).
- Builds belong to the **personal account `chopra.yatharth`**, so teammates only see them if invited to that account.

## Release checklist (each version)

1. Test on the emulator with the development build and Metro. `npm run typecheck`, `npm test`.
2. If native code changed: bump `version` in `app.config.ts`.
3. Build: `npm run build:apk` for a tester APK, or `eas build --profile production --platform android` for the store.
4. Install and run the actual APK on the emulator and on a real phone. Sign in, park, end, check the receipt.
5. Tag and publish: `git tag vX.Y.Z`, push to `origin` and `org`, create the GitHub release with the APK attached (pre-release until a real phone has passed).
6. For JS-only follow-ups: `eas update --channel production`.

## Google Maps on Android

The map on Android needs a Google Maps key. Without it the app shows the nearby-areas list instead of a map (it never crashes). To turn the map on:

1. Google Cloud Console → create a project (or reuse one) → **Billing**: link a billing account. Google gives a monthly free credit; set a **budget alert** so cost never surprises you.
2. **APIs & Services → Library → Maps SDK for Android → Enable.**
3. **Credentials → Create credentials → API key.** Then **restrict** it:
   - Application restriction: **Android apps** → add package `com.parkpay.app` and the **SHA-1** fingerprint of the signing key you use (debug key for local builds, the EAS keystore for store builds; see below).
   - API restriction: **Maps SDK for Android** only.
4. Give the key to the build (never commit it):
   - Local build: put `GOOGLE_MAPS_API_KEY=...` in `apps/mobile/.env`. It is git-ignored.
   - EAS builds: `eas env:create --name GOOGLE_MAPS_API_KEY --value <key> --environment production --visibility secret` (repeat for `preview` and `development`).
5. Rebuild (a key is a native change).

SHA-1 of the EAS keystore: `eas credentials` → Android → see the keystore details. SHA-1 of the local debug key: `keytool -list -v -keystore apps/mobile/android/app/debug.keystore -alias androiddebugkey -storepass android`.

**No-billing alternative:** use an OpenStreetMap-based map (MapLibre). It needs no Google account or key, but needs a tile provider (free tiers exist) and is a bigger code change than the key.

iOS uses Apple Maps by default and needs no key.
