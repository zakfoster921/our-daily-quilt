#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Backfill reflectionThemes/{dateKey} docs with a denormalized `promptThemes` array
 * (the 9 fixed prompt_theme categories: trust, identity, resilience, belonging, voice,
 * attention, doubt, process, courage) so the reflection archive's "by theme" view can
 * query `where('promptThemes', 'array-contains', theme)` without a per-request join.
 *
 * Only useful once scripts/sync-notion-to-firestore.cjs has shipped the promptThemes
 * mapping AND a full Notion->Firestore sync has populated `promptThemes` on `quotes`
 * docs (POST /api/sync-notion-firestore with fullCatalog:true) — otherwise this will
 * resolve empty arrays for everyone.
 *
 * Usage:
 *   node scripts/backfill-reflection-archive-theme-tags.cjs --dry-run
 *   node scripts/backfill-reflection-archive-theme-tags.cjs
 *   node scripts/backfill-reflection-archive-theme-tags.cjs --days=30
 *   node scripts/backfill-reflection-archive-theme-tags.cjs 2026-05-20
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
const { resolvePromptThemesForDateKey } = require('./lib/reflection-archive-prompt-themes.cjs');

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
  let days = 0;
  let dateKey = '';

  for (const arg of argv) {
    if (arg.startsWith('--days=')) {
      days = Math.max(1, Math.min(120, Number(arg.slice('--days='.length)) || 0));
    } else if (isDateDocId(arg)) {
      dateKey = arg;
    }
  }

  return { dryRun, days, dateKey };
}

/** Targeted mode (--days=N or a single dateKey) walks backward from today; otherwise full scan. */
async function collectTargetDocs(db, { days, dateKey }) {
  if (dateKey) {
    const snap = await db.collection('reflectionThemes').doc(dateKey).get();
    return snap.exists ? [snap] : [];
  }
  if (days) {
    const keys = [];
    let cursor = getUtcDateKey();
    for (let i = 0; i < days; i += 1) {
      keys.push(cursor);
      cursor = addDaysToDate(cursor, -1);
    }
    const snaps = await Promise.all(keys.map((key) => db.collection('reflectionThemes').doc(key).get()));
    return snaps.filter((snap) => snap.exists);
  }
  const fullSnap = await db.collection('reflectionThemes').get();
  return fullSnap.docs;
}

function existingPromptThemes(data) {
  const themes = Array.isArray(data?.promptThemes) ? data.promptThemes : [];
  return themes.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
}

async function backfillThemeTags(db, options = {}) {
  const { dryRun = false, days = 0, dateKey = '' } = options;
  const docs = await collectTargetDocs(db, { days, dateKey });
  const results = [];

  for (const snap of docs) {
    const key = snap.id;
    const data = snap.data() || {};

    if (existingPromptThemes(data).length) {
      results.push({ dateKey: key, action: 'already_complete' });
      continue;
    }

    const promptThemes = await resolvePromptThemesForDateKey(db, key);
    if (!promptThemes.length) {
      results.push({ dateKey: key, action: 'no_theme_resolved' });
      continue;
    }

    if (!dryRun) {
      await snap.ref.set({ promptThemes, updatedAtIso: new Date().toISOString() }, { merge: true });
    }

    results.push({
      dateKey: key,
      action: dryRun ? 'would_patch' : 'patched',
      promptThemes
    });
  }

  return {
    dryRun,
    scanned: docs.length,
    patched: results.filter((r) => r.action === 'patched' || r.action === 'would_patch').length,
    results
  };
}

async function main() {
  const { dryRun, days, dateKey } = parseArgs(process.argv.slice(2));
  const db = initFirestore();
  const result = await backfillThemeTags(db, { dryRun, days, dateKey });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('[backfill-reflection-archive-theme-tags] failed:', err.message);
  process.exit(1);
});
