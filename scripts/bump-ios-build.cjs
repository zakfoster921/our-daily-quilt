#!/usr/bin/env node
/**
 * Increment CURRENT_PROJECT_VERSION in the iOS App target (Debug + Release).
 * Used by release-ios-prep.sh before each Archive prep.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pbxproj = path.join(root, "ios", "App", "App.xcodeproj", "project.pbxproj");
const appConfig = path.join(root, "lib", "app-config.js");

function syncAppConfigBuildId(buildId) {
  if (!fs.existsSync(appConfig)) {
    console.warn("bump-ios-build: lib/app-config.js not found — skipping config sync");
    return;
  }
  const cfg = fs.readFileSync(appConfig, "utf8");
  if (!/(buildId: )'[^']+'/.test(cfg)) {
    console.warn("bump-ios-build: buildId not found in app-config.js — skipping config sync");
    return;
  }
  fs.writeFileSync(appConfig, cfg.replace(/(buildId: )'[^']+'/, `$1'${buildId}'`));
}

if (!fs.existsSync(pbxproj)) {
  console.warn("bump-ios-build: project.pbxproj not found — skipping");
  process.exit(0);
}

const text = fs.readFileSync(pbxproj, "utf8");
const match = text.match(/CURRENT_PROJECT_VERSION = (\d+);/);
if (!match) {
  console.warn("bump-ios-build: CURRENT_PROJECT_VERSION not found — skipping");
  process.exit(0);
}

const current = parseInt(match[1], 10);
const next = current + 1;
const updated = text.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${next};`);
fs.writeFileSync(pbxproj, updated);
syncAppConfigBuildId(String(next));
console.log(`bump-ios-build: ${current} → ${next}`);
