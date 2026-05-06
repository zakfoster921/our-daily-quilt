#!/usr/bin/env node
/* eslint-disable no-console */
try {
  require('dotenv').config();
} catch (_) {
  // dotenv is optional in CI where env vars come from GitHub secrets.
}

const crypto = require('crypto');
const admin = require('firebase-admin');

function parseArgs(argv) {
  const args = {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    limit: 0,
    author: '',
    doc: ''
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--limit=')) args.limit = Math.max(0, Number(a.slice('--limit='.length)) || 0);
    else if (a.startsWith('--author=')) args.author = a.slice('--author='.length).trim().toLowerCase();
    else if (a.startsWith('--doc=')) args.doc = a.slice('--doc='.length).trim();
  }
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
  if (pid && pid !== 'your-project-id') return `${pid}.appspot.com`;
  return undefined;
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
  const snap = await db.collection(collectionName).where('source', '==', 'notion').get();
  const rows = [];
  snap.forEach((docSnap) => rows.push({ id: docSnap.id, ref: docSnap.ref, data: docSnap.data() || {} }));
  return rows;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
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
  const apiKey = opts.dryRun ? String(process.env.REMOVE_BG_API_KEY || '').trim() : requireEnv('REMOVE_BG_API_KEY');
  const db = initFirebase();
  const collectionName = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const rows = await collectRows(db, collectionName, opts);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const d = row.data;
    const author = String(d.author || '').trim();
    if (opts.author && !author.toLowerCase().includes(opts.author)) {
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
    if (existing && !opts.force) {
      console.log(`[cutout] reusing existing cutout for ${row.id} ${author}`);
      if (!opts.dryRun) {
        const derivedWrites = await patchDerivedQuoteDocs(db, collectionName, sourceIds, d, existing, imageUrl);
        console.log(`[cutout] patched ${derivedWrites} derived doc(s)`);
      }
      processed += 1;
      continue;
    }
    if (opts.limit && processed >= opts.limit) break;

    console.log(`[cutout] ${opts.dryRun ? 'would process' : 'processing'} ${row.id} ${author}`);
    if (opts.dryRun) {
      processed += 1;
      continue;
    }

    try {
      const png = await removeBackgroundFromUrl(imageUrl, apiKey);
      const hash = crypto.createHash('sha256').update(imageUrl).digest('hex').slice(0, 12);
      const path = `speaker-cutouts/${safeName(author)}-${hash}.png`;
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

  console.log(`[cutout] complete processed=${processed} skipped=${skipped} failed=${failed} collection=${collectionName}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[cutout] failed:', error.message);
  process.exit(1);
});
