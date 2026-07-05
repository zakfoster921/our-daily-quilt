#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const {
  analyzeColors,
  inferMode,
  normalizeHex
} = require('./lib/composition-preview.cjs');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tmp', 'composition-mode-eval');
const DAYS = Math.max(1, Math.floor(Number(process.env.DAYS) || 30));
const LOCK_AT = Math.max(1, Math.floor(Number(process.env.BIAS_LOCK_AT) || 10));
const END_DATE = /^\d{4}-\d{2}-\d{2}$/.test(String(process.env.END_DATE || '').trim())
  ? String(process.env.END_DATE).trim()
  : getAppDateKey();

function initFirestore() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
    });
    return admin.firestore();
  }
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.join(ROOT, 'firebase-adminsdk-local.json');
  if (fs.existsSync(credPath)) {
    const sa = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
    });
    return admin.firestore();
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID');
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId
  });
  return admin.firestore();
}

function getAppDateKey(d = new Date()) {
  const adjusted = new Date(d);
  if (adjusted.getUTCHours() < 7) adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  return adjusted.toISOString().slice(0, 10);
}

function dateRange(endDateKey, days) {
  const end = new Date(`${endDateKey}T12:00:00Z`);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function orderedColorsFromReplay(data) {
  return (Array.isArray(data?.colorReplayEvents) ? data.colorReplayEvents : [])
    .slice()
    .sort((a, b) => {
      const seqA = Number(a?.seq) || 0;
      const seqB = Number(b?.seq) || 0;
      if (seqA !== seqB) return seqA - seqB;
      return String(a?.iso || '').localeCompare(String(b?.iso || ''));
    })
    .map((event) => normalizeHex(event?.newHex))
    .filter(Boolean);
}

function orderedColorsFromBlocks(blocks) {
  const bySubmissionIndex = new Map();
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const submissionIndex = Math.floor(Number(block?.submissionIndex) || 0);
    if (submissionIndex <= 0 || bySubmissionIndex.has(submissionIndex)) continue;
    const color = normalizeHex(block?.contributorColor) || normalizeHex(block?.color);
    if (color) bySubmissionIndex.set(submissionIndex, color);
  }
  return [...bySubmissionIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, color]) => color);
}

function chooseColorSource(data) {
  const replayColors = orderedColorsFromReplay(data);
  const blockColors = orderedColorsFromBlocks(data?.blocks);
  const source = replayColors.length > LOCK_AT || replayColors.length >= blockColors.length
    ? 'colorReplayEvents'
    : 'storedBlocks';
  return {
    source,
    colors: source === 'colorReplayEvents' ? replayColors : blockColors,
    replayColorCount: replayColors.length,
    blockColorCount: blockColors.length
  };
}

function inferBalancedMode(metrics) {
  if (metrics.count < 8) return 'baseline';
  if (metrics.momentum <= 0.52 && metrics.familyCount >= 3) return 'strata';
  if (metrics.dominance >= 0.46 && metrics.contrast < 0.38) return 'field';
  if (
    metrics.dominance >= 0.36 &&
    metrics.diversity < 0.64 &&
    metrics.familyCount >= 2 &&
    metrics.momentum < 0.86
  ) return 'garden';
  if (metrics.diversity >= 0.78) return 'mosaic';
  if (metrics.hueTravel >= 0.5 && metrics.avgSaturation >= 0.58) return 'constellation';
  if (metrics.momentum >= 0.86 && metrics.familyCount <= 5 && metrics.warmth >= 0.25 && metrics.warmth <= 0.75) return 'tide';
  return 'window';
}

function countModes(rows, key) {
  return rows.reduce((acc, row) => {
    const mode = row[key] || 'unknown';
    acc[mode] = (acc[mode] || 0) + 1;
    return acc;
  }, {});
}

function sortedCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function modeTable(counts) {
  const modes = ['window', 'constellation', 'mosaic', 'field', 'garden', 'strata', 'tide', 'baseline', 'no-quilt'];
  return modes
    .filter((mode) => counts[mode])
    .map((mode) => `| ${mode} | ${counts[mode]} |`)
    .join('\n');
}

function markdownReport(summary) {
  const currentTable = modeTable(summary.currentCounts);
  const balancedTable = modeTable(summary.balancedCounts);
  const rows = summary.rows.map((row) => (
    `| ${row.dateKey} | ${row.currentMode} | ${row.balancedMode} | ${row.colorCount} | ${row.source} | ${row.dominantFamily} | ${row.diversity} | ${row.momentum} | ${row.hueTravel} | ${row.avgSaturation} |`
  )).join('\n');
  return `# Composition Mode Evaluation

Range: ${summary.dateRange.start} to ${summary.dateRange.end} (${summary.dateRange.days} days)

Lock point: first ${summary.lockAt} colors

## Current Rules

| Mode | Days |
| --- | ---: |
${currentTable}

## Balanced Candidate

This is only a tuning comparison. It does not change production/admin preview rules.

| Mode | Days |
| --- | ---: |
${balancedTable}

## Notes

- Current rules are skewed if \`window\` dominates and some named modes never appear.
- The balanced candidate makes \`tide\`, \`strata\`, and \`garden\` easier to trigger, then leaves \`window\` as a true fallback.
- Days using \`storedBlocks\` are based on stored block submission order because replay events are incomplete.

## Per-Day Detail

| Date | Current | Balanced | Colors | Source | Dominant | Diversity | Momentum | Hue Travel | Avg Saturation |
| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
${rows}
`;
}

async function main() {
  const db = initFirestore();
  const dates = dateRange(END_DATE, DAYS);
  const rows = [];

  for (const dateKey of dates) {
    const snap = await db.collection('quilts').doc(dateKey).get();
    if (!snap.exists) {
      rows.push({
        dateKey,
        currentMode: 'no-quilt',
        balancedMode: 'no-quilt',
        colorCount: 0,
        source: 'none',
        dominantFamily: '',
        diversity: 0,
        momentum: 0,
        hueTravel: 0,
        avgSaturation: 0
      });
      continue;
    }
    const data = snap.data() || {};
    const sourceInfo = chooseColorSource(data);
    const lockColors = sourceInfo.colors.slice(0, Math.min(LOCK_AT, sourceInfo.colors.length));
    const metrics = analyzeColors(lockColors);
    const currentMode = sourceInfo.colors.length < 8 ? 'baseline' : inferMode(metrics);
    const balancedMode = inferBalancedMode(metrics);
    rows.push({
      dateKey,
      currentMode,
      balancedMode,
      colorCount: sourceInfo.colors.length,
      source: sourceInfo.source,
      replayColorCount: sourceInfo.replayColorCount,
      blockColorCount: sourceInfo.blockColorCount,
      dominantFamily: metrics.dominantFamily,
      diversity: Number(metrics.diversity.toFixed(3)),
      dominance: Number(metrics.dominance.toFixed(3)),
      contrast: Number(metrics.contrast.toFixed(3)),
      warmth: Number(metrics.warmth.toFixed(3)),
      momentum: Number(metrics.momentum.toFixed(3)),
      hueTravel: Number(metrics.hueTravel.toFixed(3)),
      avgSaturation: Number(metrics.avgSaturation.toFixed(3)),
      families: metrics.families
    });
  }

  const summary = {
    dateRange: { start: dates[0], end: dates[dates.length - 1], days: dates.length },
    lockAt: LOCK_AT,
    currentCounts: sortedCounts(countModes(rows, 'currentMode')),
    balancedCounts: sortedCounts(countModes(rows, 'balancedMode')),
    rows
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(OUT_DIR, 'summary.md'), markdownReport(summary));

  console.log(JSON.stringify({
    dateRange: summary.dateRange,
    currentCounts: summary.currentCounts,
    balancedCounts: summary.balancedCounts,
    output: {
      json: path.relative(ROOT, path.join(OUT_DIR, 'summary.json')),
      markdown: path.relative(ROOT, path.join(OUT_DIR, 'summary.md'))
    }
  }, null, 2));
}

main().catch((error) => {
  console.error('[composition-mode-eval] failed:', error && error.stack ? error.stack : error);
  process.exit(1);
});
