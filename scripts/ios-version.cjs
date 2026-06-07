#!/usr/bin/env node
/**
 * iOS marketing version helpers.
 *
 * Apple closes a version train after it ships (e.g. 2.0.2). The next App Store
 * upload needs a higher MARKETING_VERSION, not just a higher build number.
 *
 *   npm run ios              # runs check before prep (blocks if version stale)
 *   npm run ios:bump-version # 2.0.3 → 2.0.4 in Xcode + app-config
 *   npm run ios:shipped      # run after a version goes live on the App Store
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pbxproj = path.join(root, "ios", "App", "App.xcodeproj", "project.pbxproj");
const appConfig = path.join(root, "lib", "app-config.js");
const lastShippedFile = path.join(root, "ios", "last-shipped-version.txt");

function readMarketingVersion() {
  if (!fs.existsSync(pbxproj)) {
    console.warn("ios-version: project.pbxproj not found");
    return null;
  }
  const match = fs.readFileSync(pbxproj, "utf8").match(/MARKETING_VERSION = ([^;]+);/);
  return match ? match[1].trim() : null;
}

function writeMarketingVersion(next) {
  const text = fs.readFileSync(pbxproj, "utf8");
  fs.writeFileSync(
    pbxproj,
    text.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${next};`)
  );
  if (fs.existsSync(appConfig)) {
    const cfg = fs.readFileSync(appConfig, "utf8");
    fs.writeFileSync(
      appConfig,
      cfg.replace(/(version: )'[^']+'/, `$1'${next}'`)
    );
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
  if (parts.length < 3) parts.push(0);
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

function cmdCheck() {
  const current = readMarketingVersion();
  const lastShipped = readLastShipped();
  if (!current) {
    console.warn("ios-version: skipping check (no MARKETING_VERSION)");
    return;
  }
  if (!lastShipped) {
    console.warn(
      "ios-version: no ios/last-shipped-version.txt — skipping check (run npm run ios:shipped after your next App Store release)"
    );
    return;
  }
  if (compareVersions(current, lastShipped) <= 0) {
    const suggested = bumpPatch(lastShipped);
    console.error("");
    console.error("ios-version: BLOCKED — App Store version not bumped.");
    console.error(`  Last shipped:  ${lastShipped}`);
    console.error(`  Current:       ${current}`);
    console.error("");
    console.error("  After a version goes live, Apple closes that train. The next upload");
    console.error("  needs a higher version (build number alone is not enough).");
    console.error("");
    console.error(`  Fix:  npm run ios:bump-version   (suggest ${suggested})`);
    console.error("  Then: npm run ios");
    console.error("");
    process.exit(1);
  }
  console.log(`ios-version: OK (${current} > last shipped ${lastShipped})`);
}

function cmdBump() {
  const current = readMarketingVersion();
  if (!current) {
    console.error("ios-version: MARKETING_VERSION not found");
    process.exit(1);
  }
  const next = bumpPatch(current);
  writeMarketingVersion(next);
  console.log(`ios-version: ${current} → ${next}`);
}

function cmdShipped() {
  const current = readMarketingVersion();
  if (!current) {
    console.error("ios-version: MARKETING_VERSION not found");
    process.exit(1);
  }
  const prev = readLastShipped();
  writeLastShipped(current);
  console.log(`ios-version: recorded last shipped ${current}${prev ? ` (was ${prev})` : ""}`);
  console.log("  Run this after the version is live on the App Store.");
}

const cmd = process.argv[2];
if (cmd === "check") cmdCheck();
else if (cmd === "bump") cmdBump();
else if (cmd === "shipped") cmdShipped();
else {
  console.error("Usage: node scripts/ios-version.cjs check|bump|shipped");
  process.exit(1);
}
