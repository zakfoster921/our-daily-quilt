#!/usr/bin/env node
/* eslint-disable no-console */
try {
  require('dotenv').config();
} catch (_) {
  // dotenv is optional in CI where env vars come from GitHub secrets.
}

const crypto = require('crypto');
const fs = require('fs');
const admin = require('firebase-admin');
const { PNG } = require('pngjs');

function parseArgs(argv) {
  const args = {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    scheduled: argv.includes('--scheduled'),
    softFail: argv.includes('--soft-fail'),
    requireReviewed: argv.includes('--require-reviewed'),
    recropExisting: argv.includes('--recrop-existing') || argv.includes('--crop-existing'),
    limit: 0,
    start: 'today',
    window: 9,
    author: '',
    doc: '',
    uploadFile: ''
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--limit=')) args.limit = Math.max(0, Number(a.slice('--limit='.length)) || 0);
    else if (a.startsWith('--start=')) args.start = a.slice('--start='.length).trim();
    else if (a.startsWith('--window=')) args.window = Math.max(1, Number(a.slice('--window='.length)) || 9);
    else if (a.startsWith('--author=')) args.author = a.slice('--author='.length).trim().toLowerCase();
    else if (a.startsWith('--doc=')) args.doc = a.slice('--doc='.length).trim();
    else if (a.startsWith('--upload-file=')) args.uploadFile = a.slice('--upload-file='.length).trim();
  }
  if (String(args.start).toLowerCase() === 'today') args.start = getAppDateKey();
  if (String(args.start).toLowerCase() === 'tomorrow') args.start = addDays(getAppDateKey(), 1);
  return args;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error(`Missing required env var: ${name}`);
  return String(value).trim();
}

function resolveFirebaseStorageBucket(serviceAccount) {
  const fromEnv = process.env.FIREBASE_STORAGE_BUCKET;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  const fromServiceAccount =
    serviceAccount &&
    typeof serviceAccount.storage_bucket === 'string' &&
    serviceAccount.storage_bucket.trim()
      ? serviceAccount.storage_bucket.trim()
      : '';
  if (fromServiceAccount) return fromServiceAccount;
  const pid = (serviceAccount && serviceAccount.project_id) || process.env.FIREBASE_PROJECT_ID || null;
  if (pid && pid !== 'your-project-id') return `${pid}.firebasestorage.app`;
  return undefined;
}

function addDays(dateKey, deltaDays) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function getAppDateKey(d = new Date()) {
  const adjusted = new Date(d);
  if (d.getUTCHours() < 7) adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  return `${adjusted.getUTCFullYear()}-${String(adjusted.getUTCMonth() + 1).padStart(2, '0')}-${String(adjusted.getUTCDate()).padStart(2, '0')}`;
}

function initFirebase() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const init = { credential: admin.credential.cert(serviceAccount) };
    const bucket = resolveFirebaseStorageBucket(serviceAccount);
    if (bucket) init.storageBucket = bucket;
    admin.initializeApp(init);
  } else {
    const init = {
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID
    };
    const bucket = resolveFirebaseStorageBucket(null);
    if (bucket) init.storageBucket = bucket;
    admin.initializeApp(init);
  }
  return admin.firestore();
}

function buildFirebaseDownloadUrl(bucketName, objectPath, downloadToken) {
  const enc = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${enc}?alt=media&token=${downloadToken}`;
}

async function saveDownloadableFile(destination, buffer, contentType) {
  const bucket = admin.storage().bucket();
  const bucketName = bucket.name;
  const token = crypto.randomUUID();
  const file = bucket.file(destination);
  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000',
      metadata: { firebaseStorageDownloadTokens: token }
    }
  });
  return buildFirebaseDownloadUrl(bucketName, destination, token);
}

async function removeBackgroundFromUrl(imageUrl, apiKey) {
  const form = new FormData();
  form.append('image_url', imageUrl);
  form.append('size', 'auto');
  form.append('format', 'png');
  form.append('crop', 'true');
  form.append('crop_margin', '10%');

  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: form
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`remove.bg ${res.status}: ${body.slice(0, 500)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function downloadBinaryFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`download ${res.status}: ${body.slice(0, 500)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function cropTransparentPngWithMargin(buffer, marginRatio = 0.1) {
  const source = PNG.sync.read(buffer);
  const { width, height, data } = source;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= 8) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('Existing cutout has no visible non-transparent pixels');
  }

  const subjectW = maxX - minX + 1;
  const subjectH = maxY - minY + 1;
  const marginX = Math.max(1, Math.ceil(subjectW * marginRatio));
  const marginY = Math.max(1, Math.ceil(subjectH * marginRatio));
  const outW = subjectW + marginX * 2;
  const outH = subjectH + marginY * 2;
  const out = new PNG({ width: outW, height: outH });

  for (let y = 0; y < subjectH; y += 1) {
    for (let x = 0; x < subjectW; x += 1) {
      const srcIdx = ((minY + y) * width + (minX + x)) * 4;
      const dstIdx = ((marginY + y) * outW + (marginX + x)) * 4;
      out.data[dstIdx] = data[srcIdx];
      out.data[dstIdx + 1] = data[srcIdx + 1];
      out.data[dstIdx + 2] = data[srcIdx + 2];
      out.data[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  return PNG.sync.write(out);
}

function safeName(value) {
  return String(value || 'speaker')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'speaker';
}

async function collectRows(db, collectionName, opts) {
  if (opts.doc) {
    const snap = await db.collection(collectionName).doc(opts.doc).get();
    return snap.exists ? [{ id: snap.id, ref: snap.ref, data: snap.data() || {} }] : [];
  }
  if (opts.scheduled) {
    const assignmentsCollection = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';
    const scheduledSourceIds = [];
    const assignmentSnap = await db.collection(assignmentsCollection).get();
    const windowEnd = addDays(opts.start, Math.max(0, opts.window - 1));
    assignmentSnap.forEach((docSnap) => {
      if (!isDateKey(docSnap.id) || docSnap.id < opts.start || docSnap.id > windowEnd) return;
      const sourceId = String((docSnap.data() || {}).sourceId || '').trim();
      if (sourceId && !scheduledSourceIds.includes(sourceId)) scheduledSourceIds.push(sourceId);
    });

    const rows = [];
    for (const sourceId of scheduledSourceIds) {
      const snap = await db.collection(collectionName).doc(sourceId).get();
      if (snap.exists) rows.push({ id: snap.id, ref: snap.ref, data: snap.data() || {} });
      else console.log(`[cutout] scheduled source doc missing: ${sourceId}`);
    }
    console.log(
      `[cutout] scheduled mode start=${opts.start} window=${opts.window} sourceIds=${scheduledSourceIds.length} rows=${rows.length}`
    );
    return rows;
  }
  const snap = await db.collection(collectionName).where('source', '==', 'notion').get();
  const rows = [];
  snap.forEach((docSnap) => rows.push({ id: docSnap.id, ref: docSnap.ref, data: docSnap.data() || {} }));
  return rows;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function isReviewedQuote(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.reviewed === 'boolean') return data.reviewed;
  if (typeof data.reviewed_ === 'boolean') return data.reviewed_;
  const value = String(data.reviewed ?? data.reviewed_ ?? '').trim().toLowerCase();
  return ['true', 'yes', 'y', '1', 'checked', 'reviewed'].includes(value);
}

function assignmentCutoutPayload(cutoutUrl, imageUrl, timestamp) {
  return {
    speakerCutoutUrlSnapshot: cutoutUrl,
    speaker_cutout_url_snapshot: cutoutUrl,
    speakerCutoutSourceUrlSnapshot: imageUrl,
    speaker_cutout_source_url_snapshot: imageUrl,
    speakerCutoutUpdatedAt: timestamp,
    speaker_cutout_updated_at: timestamp
  };
}

function dailyQuoteCutoutPayload(cutoutUrl, imageUrl, timestamp) {
  return {
    speakerCutoutUrl: cutoutUrl,
    speaker_cutout_url: cutoutUrl,
    speakerCutoutSourceUrl: imageUrl,
    speaker_cutout_source_url: imageUrl,
    speakerCutoutUpdatedAt: timestamp,
    speaker_cutout_updated_at: timestamp
  };
}

async function patchDerivedQuoteDocs(db, quotesCollection, sourceIds, sourceData, cutoutUrl, imageUrl) {
  const assignmentsCollection = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const author = String(sourceData.author || '').trim();
  const patchedRefs = new Set();
  let writes = 0;

  async function patchRef(ref, payload) {
    const key = ref.path;
    if (patchedRefs.has(key)) return;
    patchedRefs.add(key);
    await ref.set(payload, { merge: true });
    writes += 1;
  }

  for (const sourceId of sourceIds) {
    const assignmentSnap = await db.collection(assignmentsCollection).where('sourceId', '==', sourceId).get();
    for (const docSnap of assignmentSnap.docs) {
      await patchRef(docSnap.ref, assignmentCutoutPayload(cutoutUrl, imageUrl, timestamp));
    }

    const dailyQuoteSnap = await db.collection(quotesCollection).where('sourceId', '==', sourceId).get();
    for (const docSnap of dailyQuoteSnap.docs) {
      if (!isDateKey(docSnap.id)) continue;
      await patchRef(docSnap.ref, dailyQuoteCutoutPayload(cutoutUrl, imageUrl, timestamp));
    }
  }

  if (author) {
    const assignmentByAuthorSnap = await db.collection(assignmentsCollection).where('authorSnapshot', '==', author).get();
    for (const docSnap of assignmentByAuthorSnap.docs) {
      await patchRef(docSnap.ref, assignmentCutoutPayload(cutoutUrl, imageUrl, timestamp));
    }

    const dailyQuoteByAuthorSnap = await db.collection(quotesCollection).where('author', '==', author).get();
    for (const docSnap of dailyQuoteByAuthorSnap.docs) {
      if (!isDateKey(docSnap.id)) continue;
      await patchRef(docSnap.ref, dailyQuoteCutoutPayload(cutoutUrl, imageUrl, timestamp));
    }
  }

  if (imageUrl) {
    const assignmentByImageSnap = await db
      .collection(assignmentsCollection)
      .where('speakerImageUrlSnapshot', '==', imageUrl)
      .get();
    for (const docSnap of assignmentByImageSnap.docs) {
      await patchRef(docSnap.ref, assignmentCutoutPayload(cutoutUrl, imageUrl, timestamp));
    }
  }

  const scheduledDate = String(sourceData.dateScheduled || sourceData.date_scheduled || '').trim();
  if (isDateKey(scheduledDate)) {
    await patchRef(
      db.collection(quotesCollection).doc(scheduledDate),
      dailyQuoteCutoutPayload(cutoutUrl, imageUrl, timestamp)
    );
  }

  return writes;
}

async function main() {
  const opts = parseArgs(process.argv);
  const apiKey = opts.dryRun ? String(process.env.REMOVE_BG_API_KEY || '').trim() : String(process.env.REMOVE_BG_API_KEY || '').trim();
  if (!opts.dryRun && !opts.recropExisting && !opts.uploadFile && !apiKey) {
    if (opts.softFail) {
      console.log('[cutout] REMOVE_BG_API_KEY missing; soft-fail enabled, skipping cutout processing');
      return;
    }
    requireEnv('REMOVE_BG_API_KEY');
  }
  const db = initFirebase();
  const collectionName = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const rows = await collectRows(db, collectionName, opts);

  let processed = 0;
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const d = row.data;
    const author = String(d.author || '').trim();
    if (opts.author && !author.toLowerCase().includes(opts.author)) {
      skipped += 1;
      continue;
    }
    if (opts.requireReviewed && !isReviewedQuote(d)) {
      console.log(`[cutout] skipped unreviewed quote ${row.id} ${author}`);
      skipped += 1;
      continue;
    }
    const imageUrl = String(d.speakerImageUrl || d.speaker_image_url || '').trim();
    const existing = String(d.speakerCutoutUrl || d.speaker_cutout_url || '').trim();
    const sourceIds = Array.from(new Set([row.id, String(d.sourceId || '').trim()].filter(Boolean)));
    if (!imageUrl) {
      skipped += 1;
      continue;
    }
    if (existing && !opts.force && !opts.recropExisting) {
      console.log(`[cutout] reusing existing cutout for ${row.id} ${author}`);
      if (!opts.dryRun) {
        const derivedWrites = await patchDerivedQuoteDocs(db, collectionName, sourceIds, d, existing, imageUrl);
        console.log(`[cutout] patched ${derivedWrites} derived doc(s)`);
      }
      processed += 1;
      continue;
    }
    if (opts.limit && generated >= opts.limit) break;

    console.log(
      `[cutout] ${
        opts.dryRun
          ? 'would process'
          : opts.uploadFile
            ? 'uploading local cutout'
            : opts.recropExisting
              ? 'recropping existing'
              : 'processing'
      } ${row.id} ${author}`
    );
    generated += 1;
    if (opts.dryRun) {
      processed += 1;
      continue;
    }

    try {
      if (opts.recropExisting && !existing) {
        throw new Error('Cannot recrop existing cutout because speakerCutoutUrl is empty');
      }
      const png = opts.uploadFile
        ? fs.readFileSync(opts.uploadFile)
        : opts.recropExisting
          ? await cropTransparentPngWithMargin(await downloadBinaryFromUrl(existing), 0.1)
          : await removeBackgroundFromUrl(imageUrl, apiKey);
      const hash = crypto.createHash('sha256').update(imageUrl).digest('hex').slice(0, 12);
      const path = opts.uploadFile
        ? `speaker-cutouts/${safeName(author)}-${hash}-manual.png`
        : opts.recropExisting
          ? `speaker-cutouts/${safeName(author)}-${hash}-crop10.png`
          : `speaker-cutouts/${safeName(author)}-${hash}.png`;
      const cutoutUrl = await saveDownloadableFile(path, png, 'image/png');
      await row.ref.set(
        {
          speakerCutoutUrl: cutoutUrl,
          speaker_cutout_url: cutoutUrl,
          speakerCutoutSourceUrl: imageUrl,
          speaker_cutout_source_url: imageUrl,
          speakerCutoutUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          speaker_cutout_updated_at: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      const derivedWrites = await patchDerivedQuoteDocs(db, collectionName, sourceIds, d, cutoutUrl, imageUrl);
      processed += 1;
      console.log(`[cutout] wrote ${path}`);
      console.log(`[cutout] patched ${derivedWrites} derived doc(s)`);
    } catch (error) {
      failed += 1;
      console.error(`[cutout] failed ${row.id} ${author}: ${error.message}`);
    }
  }

  console.log(
    `[cutout] complete processed=${processed} generatedOrPreviewed=${generated} skipped=${skipped} failed=${failed} collection=${collectionName}`
  );
  if (failed && opts.softFail) {
    console.log('[cutout] soft-fail enabled; leaving workflow successful despite cutout errors');
  } else if (failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[cutout] failed:', error.message);
  process.exit(1);
});
