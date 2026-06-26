#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Backfill reflectionThemes with denormalized archive fields (prompt, quote snapshots,
 * quiltImageUrl) so the reflection archive screen skips per-day fan-out reads.
 *
 * Usage:
 *   node scripts/backfill-reflection-archive-theme-fields.cjs --dry-run
 *   node scripts/backfill-reflection-archive-theme-fields.cjs --days=30
 *   node scripts/backfill-reflection-archive-theme-fields.cjs 2026-05-20
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

const ARCHIVE_QUILT_IMAGE_SOURCE = 'final_archive';
const ARCHIVE_QUILT_IMAGE_SOURCE_CLASSIC = 'classic';

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

function isUsablePrompt(prompt) {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim();
  return Boolean(text) && text !== '[Reflection prompt coming soon for this quote.]';
}

function getPromptFromData(data) {
  if (!data || typeof data !== 'object') return '';
  return String(
    data.reflectionPrompt ||
    data.communityPrompt ||
    data.community_prompt ||
    data.communityPromptSnapshot ||
    data.reflectionPromptSnapshot ||
    ''
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function getQuoteFromData(data) {
  if (!data || typeof data !== 'object') return null;
  const text = String(
    data.text || data.quoteText || data.textSnapshot || data.quoteTextSnapshot || ''
  )
    .replace(/\s+/g, ' ')
    .trim();
  const author = String(
    data.author || data.quoteAuthor || data.authorSnapshot || data.quoteAuthorSnapshot || ''
  )
    .replace(/\s+/g, ' ')
    .trim();
  return text ? { text, author } : null;
}

function pickClassicImageUrlFromInstagramDoc(data) {
  if (!data || typeof data !== 'object') return '';
  return String(
    data.carouselSlide1Url ||
      data.carouselSlide1ImageStorageUrl ||
      data.classicUrl ||
      data.imageStorageUrl ||
      ''
  ).trim();
}

function pickFinalArchiveQuiltImageUrl(data) {
  if (!data || typeof data !== 'object') return '';
  const source = String(data.quiltImageSource || '').trim();
  if (source !== ARCHIVE_QUILT_IMAGE_SOURCE && source !== ARCHIVE_QUILT_IMAGE_SOURCE_CLASSIC) {
    return '';
  }
  return String(data.quiltImageUrl || data.classicImageUrl || '').trim();
}

function pickQuiltImageUrlFromDoc(data) {
  if (!data || typeof data !== 'object') return '';
  return String(data.quiltImageUrl || data.classicUrl || data.imageStorageUrl || '').trim();
}

function themeHasArchiveFields(data) {
  if (!data || typeof data !== 'object') return false;
  const prompt = getPromptFromData(data);
  const quote = getQuoteFromData(data);
  const quilt =
    pickFinalArchiveQuiltImageUrl(data) || pickQuiltImageUrlFromDoc(data);
  return isUsablePrompt(prompt) && Boolean(quote?.text) && Boolean(quilt);
}

async function resolveQuiltImageUrl(db, dateKey) {
  const igSnap = await db.collection('instagram-images').doc(dateKey).get();
  const igData = igSnap.exists ? igSnap.data() || {} : {};
  const classicUrl = pickClassicImageUrlFromInstagramDoc(igData);
  if (classicUrl) {
    return {
      quiltImageUrl: classicUrl,
      quiltImageSource: ARCHIVE_QUILT_IMAGE_SOURCE_CLASSIC,
      classicImageUrl: classicUrl
    };
  }

  const archiveSnap = await db.collection('archives').doc(dateKey).get();
  const archiveData = archiveSnap.exists ? archiveSnap.data() || {} : {};
  const archiveUrl = pickFinalArchiveQuiltImageUrl(archiveData) || pickQuiltImageUrlFromDoc(archiveData);
  if (archiveUrl) {
    const source =
      String(archiveData.quiltImageSource || '').trim() || ARCHIVE_QUILT_IMAGE_SOURCE;
    return {
      quiltImageUrl: archiveUrl,
      quiltImageSource: source,
      ...(source === ARCHIVE_QUILT_IMAGE_SOURCE_CLASSIC ? { classicImageUrl: archiveUrl } : {})
    };
  }

  return null;
}

async function loadContext(db, dateKey) {
  const quotesCollection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const assignmentsCollection = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';

  const readDoc = async (collectionId, docId) => {
    const snap = await db.collection(collectionId).doc(docId).get();
    const data = snap.exists ? snap.data() || {} : null;
    return {
      prompt: data ? getPromptFromData(data) : '',
      quote: data ? getQuoteFromData(data) : null,
      data
    };
  };

  let prompt = '';
  let quote = null;

  const dailyQuote = await readDoc(quotesCollection, dateKey);
  prompt = dailyQuote.prompt;
  quote = dailyQuote.quote;

  const assignment = await readDoc(assignmentsCollection, dateKey);
  if (!isUsablePrompt(prompt) && isUsablePrompt(assignment.prompt)) prompt = assignment.prompt;
  if (!quote) quote = assignment.quote;

  const sourceId = String(assignment.data?.sourceId || assignment.data?.quoteId || '').trim();
  if (sourceId) {
    const sourceQuote = await readDoc(quotesCollection, sourceId);
    if (!quote) quote = sourceQuote.quote;
    if (!isUsablePrompt(prompt) && isUsablePrompt(sourceQuote.prompt)) prompt = sourceQuote.prompt;
  }

  return { prompt: isUsablePrompt(prompt) ? prompt : '', quote };
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  let days = 30;
  let dateKey = '';

  for (const arg of argv) {
    if (arg.startsWith('--days=')) {
      days = Math.max(1, Math.min(120, Number(arg.slice('--days='.length)) || 30));
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

async function backfillThemeFields(db, options = {}) {
  const { dryRun = false, days = 30, dateKey = '' } = options;
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
    const themes = Array.isArray(data.themes) ? data.themes : [];
    if (!themes.length) {
      results.push({ dateKey: key, action: 'no_themes' });
      continue;
    }

    if (themeHasArchiveFields(data)) {
      results.push({ dateKey: key, action: 'already_complete' });
      continue;
    }

    const patch = {};
    const promptExisting = getPromptFromData(data);
    const quoteExisting = getQuoteFromData(data);

    if (!isUsablePrompt(promptExisting) || !quoteExisting?.text) {
      const context = await loadContext(db, key);
      if (!isUsablePrompt(promptExisting) && context.prompt) {
        patch.reflectionPrompt = context.prompt;
      }
      if (!quoteExisting?.text && context.quote?.text) {
        patch.textSnapshot = context.quote.text;
        patch.authorSnapshot = context.quote.author || '';
      }
    }

    const quiltExisting =
      pickFinalArchiveQuiltImageUrl(data) || pickQuiltImageUrlFromDoc(data);
    if (!quiltExisting) {
      const quilt = await resolveQuiltImageUrl(db, key);
      if (quilt?.quiltImageUrl) {
        patch.quiltImageUrl = quilt.quiltImageUrl;
        patch.quiltImageSource = quilt.quiltImageSource;
        if (quilt.classicImageUrl) patch.classicImageUrl = quilt.classicImageUrl;
      }
    }

    if (!Object.keys(patch).length) {
      results.push({ dateKey: key, action: 'nothing_to_patch' });
      continue;
    }

    patch.updatedAtIso = new Date().toISOString();
    if (!dryRun) {
      await ref.set(patch, { merge: true });
    }

    results.push({
      dateKey: key,
      action: dryRun ? 'would_patch' : 'patched',
      fields: Object.keys(patch)
    });
  }

  return {
    dryRun,
    scanned: dateKeys.length,
    patched: results.filter((r) => r.action === 'patched' || r.action === 'would_patch').length,
    results
  };
}

async function main() {
  const { dryRun, days, dateKey } = parseArgs(process.argv.slice(2));
  const db = initFirestore();
  const result = await backfillThemeFields(db, { dryRun, days, dateKey });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('[backfill-reflection-archive-theme-fields] failed:', err.message);
  process.exit(1);
});
