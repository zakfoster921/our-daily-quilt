#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Backfill reflectionThemes.generatedAt for days that have themes but never
 * completed curation (archive query requires generatedAt).
 *
 * Usage:
 *   node scripts/backfill-reflection-archive-generated-at.cjs --dry-run
 *   node scripts/backfill-reflection-archive-generated-at.cjs --days=14
 *   node scripts/backfill-reflection-archive-generated-at.cjs 2026-05-22
 */
const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] != null && process.env[key] !== '') continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadDotEnv();

const admin = require('firebase-admin');

function isDateDocId(id) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(id || '').trim());
}

function addDaysToDate(dateKey, delta) {
  const [yy, mm, dd] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function getUtcDateKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hasGeneratedAt(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.generatedAt && typeof data.generatedAt.toMillis === 'function') return true;
  return Boolean(String(data.generatedAtIso || '').trim());
}

function pickBackfillIso(data, docSnap) {
  const candidates = [
    data.lastPublishedAtIso,
    data.updatedAtIso,
    data.curatedAtIso
  ];
  for (const value of candidates) {
    const iso = String(value || '').trim();
    if (iso && Number.isFinite(Date.parse(iso))) return iso;
  }
  if (docSnap?.updateTime && typeof docSnap.updateTime.toDate === 'function') {
    return docSnap.updateTime.toDate().toISOString();
  }
  return new Date().toISOString();
}

function initFirestore() {
  if (admin.apps.length) return admin.firestore();

  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (json && String(json).trim()) {
    const sa = JSON.parse(json);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID || 'our-daily'
    });
    return admin.firestore();
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(path.resolve(credPath))) {
    const sa = JSON.parse(fs.readFileSync(path.resolve(credPath), 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID || 'our-daily'
    });
    return admin.firestore();
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || 'our-daily').trim();
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId
  });
  return admin.firestore();
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  let days = 14;
  let dateKey = '';

  for (const arg of argv) {
    if (arg.startsWith('--days=')) {
      days = Math.max(1, Math.min(90, Number(arg.slice('--days='.length)) || 14));
    } else if (isDateDocId(arg)) {
      dateKey = arg;
    }
  }

  return { dryRun, days, dateKey };
}

function buildDateKeys({ days, dateKey }) {
  if (dateKey) return [dateKey];
  const keys = [];
  let cursor = getUtcDateKey();
  for (let i = 0; i < days; i += 1) {
    keys.push(cursor);
    cursor = addDaysToDate(cursor, -1);
  }
  return keys;
}

async function backfillReflectionArchiveGeneratedAt(db, options = {}) {
  const { dryRun = false, days = 14, dateKey = '' } = options;
  const dateKeys = buildDateKeys({ days, dateKey });
  const results = [];

  for (const key of dateKeys) {
    const ref = db.collection('reflectionThemes').doc(key);
    const snap = await ref.get();
    if (!snap.exists) {
      results.push({ dateKey: key, action: 'missing_doc' });
      continue;
    }

    const data = snap.data() || {};
    const themes = Array.isArray(data.themes) ? data.themes.filter((t) => t && (t.text || typeof t === 'string')) : [];
    if (!themes.length) {
      results.push({ dateKey: key, action: 'no_themes' });
      continue;
    }
    if (hasGeneratedAt(data)) {
      results.push({ dateKey: key, action: 'already_has_generated_at' });
      continue;
    }

    const generatedAtIso = pickBackfillIso(data, snap);
    const patch = {
      generatedAtIso,
      updatedAtIso: String(data.updatedAtIso || generatedAtIso).trim() || generatedAtIso
    };
    if (!dryRun) {
      patch.generatedAt = admin.firestore.FieldValue.serverTimestamp();
      await ref.set(patch, { merge: true });
    }

    results.push({
      dateKey: key,
      action: dryRun ? 'would_backfill' : 'backfilled',
      generatedAtIso,
      themeCount: themes.length,
      responseCount: Number(data.responseCount) || themes.length
    });
  }

  return {
    dryRun,
    scanned: dateKeys.length,
    backfilled: results.filter((r) => r.action === 'backfilled' || r.action === 'would_backfill').length,
    results
  };
}

async function main() {
  const { dryRun, days, dateKey } = parseArgs(process.argv.slice(2));
  const db = initFirestore();
  const result = await backfillReflectionArchiveGeneratedAt(db, { dryRun, days, dateKey });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('[backfill-reflection-archive-generated-at] failed:', err.message);
  process.exit(1);
});
