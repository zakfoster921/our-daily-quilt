#!/usr/bin/env node
/**
 * Increment CURRENT_PROJECT_VERSION in the iOS App target (Debug + Release).
 * Used by release-ios-prep.sh before each Archive prep.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pbxproj = path.join(root, "ios", "App", "App.xcodeproj", "project.pbxproj");

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
console.log(`bump-ios-build: ${current} → ${next}`);
