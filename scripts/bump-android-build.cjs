#!/usr/bin/env node
/**
 * Increment versionCode in android/app/build.gradle.
 * Used by release-android-prep.sh before each Play Store upload.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const buildGradle = path.join(root, "android", "app", "build.gradle");
const appConfig = path.join(root, "lib", "app-config.js");

function syncAppConfigBuildId(buildId) {
  if (!fs.existsSync(appConfig)) {
    console.warn("bump-android-build: lib/app-config.js not found — skipping config sync");
    return;
  }
  const cfg = fs.readFileSync(appConfig, "utf8");
  if (!/(buildId: )'[^']+'/.test(cfg)) {
    console.warn("bump-android-build: buildId not found in app-config.js — skipping config sync");
    return;
  }
  fs.writeFileSync(appConfig, cfg.replace(/(buildId: )'[^']+'/, `$1'${buildId}'`));
}

if (!fs.existsSync(buildGradle)) {
  console.warn("bump-android-build: build.gradle not found — skipping");
  process.exit(0);
}

const text = fs.readFileSync(buildGradle, "utf8");
const match = text.match(/versionCode (\d+)/);
if (!match) {
  console.warn("bump-android-build: versionCode not found — skipping");
  process.exit(0);
}

const current = parseInt(match[1], 10);
const next = current + 1;
const updated = text.replace(/versionCode \d+/, `versionCode ${next}`);
fs.writeFileSync(buildGradle, updated);
syncAppConfigBuildId(String(next));
console.log(`bump-android-build: ${current} → ${next}`);
