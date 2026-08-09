#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Fetch ordered real color picks for a day — no engine replay (fast).
 *
 *   node scripts/fetch-columns-day-colors.cjs
 *   DATE_KEY=2026-07-11 node scripts/fetch-columns-day-colors.cjs
 */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const { getAppDateKey } = require('./lib/app-date-key.cjs');
const { fetchBranchData, colorsForReplay, ROOT } = require('./preview-branch-from-stored.cjs');

const OUT_FILE = path.join(ROOT, 'scripts', 'columns-day-colors.json');

async function main() {
  const dateKey = String(process.env.DATE_KEY || getAppDateKey()).trim();
  const data = await fetchBranchData(dateKey);
  const colors = colorsForReplay(data);
  if (!colors.length) throw new Error(`No colors for ${dateKey}`);

  const payload = {
    dateKey,
    colors,
    liveBlockCount: data.liveBlocks.length,
    liveContributorCount: data.liveContributorCount,
    fetchedAt: new Date().toISOString()
  };
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${colors.length} colors for ${dateKey} → scripts/columns-day-colors.json`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
