# OUR DAILY QUILT 3.27 — release checklist

Versions are already set to **3.27** (iOS + Android). Build numbers (currently 119) are bumped automatically by the prep scripts below. 3.26 is recorded as shipped in `ios/last-shipped-version.txt` and `android/last-shipped-version.txt`.

Ignore `APP-STORE-SUBMIT-NOW.md` (it is about the old build 17/18 rejection).

## What's New (draft — edit freely)

> A calmer quilt screen: more breathing room between the quote, the mood card and the speaker. Quote submissions now keep the author's name neatly capitalized. Plus small polish and fixes.

Changes since 3.26 (Oct 4), for reference:
- More space after the quote clipping and after the scratch-off mood card
- Quote clipping taped to the color card; speaker portraits scaled to body
- Hid the quilt-naming section, in-app story share, "Watch for" note and "Today's quilt closes" box
- Review prompt goes to each phone's own store; "Help us grow" links to the right store
- Chevron icon and wonky-circle fixes; scroll no longer jumps as blocks finish sizing
- Title-case author on quote submissions

## 1. Before you build

1. `git pull --rebase` (your local branch has commits that also exist on GitHub under different hashes), then `git push`.
2. Optional but wise: on a real phone, run the app flow once (quote → color → quilt → scratch card → About).

## 2. iOS (Xcode)

```bash
npm run ios            # checks version, bumps build, build:www, pod install, cap sync
npm run ios:open       # same, then opens App.xcworkspace
```
Xcode: pick **Any iOS Device** → Product → Archive → Distribute → App Store Connect.
Or: `npm run ios:archive`, then `npm run ios:verify-push`, then `npm run ios:upload` (needs the App Store Connect API key env vars) or drag `build/AppStoreExport/App.ipa` into Transporter.

In App Store Connect: create version **3.27**, pick the new build, paste What's New, submit for review.

## 3. Android (Android Studio)

```bash
npm run android:prep   # checks version, bumps build, removes iCloud duplicate resources, build:www, cap sync
```
Android Studio: open `android/` → Build → Generate Signed Bundle → Android App Bundle → `release` (keystore: `android/ourdaily-release.keystore`). Use **JDK 21** (Capacitor needs it).
Upload the `.aab` in Play Console → Production (or Internal testing first) → paste What's New → roll out.

## 4. After each version is live

```bash
npm run ios:shipped
npm run android:shipped
```

## Known issues found during prep (not caused by this release)

- GitHub CI **smoke** check fails: "unresolved global" in `lib/simplified-quilt-app-boot.js` (`odqMirrorTuneFromQuiltData`, `odqMirrorTuneSnapshotsEqual`, `odqIsoTimestampIsNewer`, `odqReflectionHearts`), `simplified-quilt-app-quilt-name-leaderboard.js` (`odqQuiltNameLeaderboardCache_`), `simplified-quilt-app-quilt.js` (`ODQ_STORY_QUOTE_FIT_PREVIEW_RENDER_VERSION`). May be false alarms or real bugs; failing on main before today.
- GitHub **Android build** workflows (`build-android.yml`, `release-android.yml`) use Java 17 and fail with "invalid source release: 21". Fix: `java-version: 21`. Building in Android Studio with JDK 21 is unaffected.
