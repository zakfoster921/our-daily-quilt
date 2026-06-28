#!/usr/bin/env node
/**
 * Android marketing version helpers.
 *
 * Google Play closes a version train after it ships. The next Play Store
 * upload needs a higher versionName, not just a higher versionCode.
 *
 *   npm run android:prep          # runs check before prep (blocks if version stale)
 *   npm run android:bump-version  # 3.11 → 3.12 in build.gradle + app-config
 *   npm run android:shipped       # run after a version goes live on the Play Store
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const buildGradle = path.join(root, "android", "app", "build.gradle");
const appConfig = path.join(root, "lib", "app-config.js");
const lastShippedFile = path.join(root, "android", "last-shipped-version.txt");

function readVersionName() {
  if (!fs.existsSync(buildGradle)) {
    console.warn("android-version: build.gradle not found");
    return null;
  }
  const match = fs.readFileSync(buildGradle, "utf8").match(/versionName "([^"]+)"/);
  return match ? match[1].trim() : null;
}

function writeVersionName(next) {
  const text = fs.readFileSync(buildGradle, "utf8");
  fs.writeFileSync(buildGradle, text.replace(/versionName "[^"]+"/, `versionName "${next}"`));
  if (fs.existsSync(appConfig)) {
    const cfg = fs.readFileSync(appConfig, "utf8");
    fs.writeFileSync(appConfig, cfg.replace(/(version: )'[^']+'/, `$1'${next}'`));
  }
}

function parseParts(version) {
  return String(version)
    .trim()
    .split(".")
    .map((part) => parseInt(part, 10) || 0);
}

/** @returns {-1 | 0 | 1} */
function compareVersions(a, b) {
  const left = parseParts(a);
  const right = parseParts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const lv = left[i] ?? 0;
    const rv = right[i] ?? 0;
    if (lv < rv) return -1;
    if (lv > rv) return 1;
  }
  return 0;
}

function readLastShipped() {
  if (!fs.existsSync(lastShippedFile)) return null;
  const line = fs
    .readFileSync(lastShippedFile, "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith("#"));
  return line || null;
}

function writeLastShipped(version) {
  fs.writeFileSync(lastShippedFile, `${version}\n`);
}

function bumpPatch(version) {
  const parts = parseParts(version);
  if (parts.length === 2) {
    parts[1] += 1;
    return parts.join(".");
  }
  if (parts.length < 3) parts.push(0);
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

function cmdCheck() {
  const current = readVersionName();
  const lastShipped = readLastShipped();
  if (!current) {
    console.warn("android-version: skipping check (no versionName)");
    return;
  }
  if (!lastShipped) {
    console.warn(
      "android-version: no android/last-shipped-version.txt — skipping check (run npm run android:shipped after your next Play Store release)"
    );
    return;
  }
  if (compareVersions(current, lastShipped) <= 0) {
    const suggested = bumpPatch(lastShipped);
    console.error("");
    console.error("android-version: BLOCKED — Play Store version not bumped.");
    console.error(`  Last shipped:  ${lastShipped}`);
    console.error(`  Current:       ${current}`);
    console.error("");
    console.error("  After a version goes live, Google closes that train. The next upload");
    console.error("  needs a higher versionName (versionCode alone is not enough).");
    console.error("");
    console.error(`  Fix:  npm run android:bump-version   (suggest ${suggested})`);
    console.error("  Then: npm run android:prep");
    console.error("");
    process.exit(1);
  }
  console.log(`android-version: OK (${current} > last shipped ${lastShipped})`);
}

function cmdBump() {
  const current = readVersionName();
  if (!current) {
    console.error("android-version: versionName not found");
    process.exit(1);
  }
  const next = bumpPatch(current);
  writeVersionName(next);
  console.log(`android-version: ${current} → ${next}`);
}

function cmdShipped() {
  const current = readVersionName();
  if (!current) {
    console.error("android-version: versionName not found");
    process.exit(1);
  }
  const prev = readLastShipped();
  writeLastShipped(current);
  console.log(`android-version: recorded last shipped ${current}${prev ? ` (was ${prev})` : ""}`);
  console.log("  Run this after the version is live on the Play Store.");
}

const cmd = process.argv[2];
if (cmd === "check") cmdCheck();
else if (cmd === "bump") cmdBump();
else if (cmd === "shipped") cmdShipped();
else {
  console.error("Usage: node scripts/android-version.cjs check|bump|shipped");
  process.exit(1);
}
