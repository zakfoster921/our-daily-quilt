#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Replace quilts/{dateKey} with the same full replay as preview:branch-from-stored (right panel).
 *
 *   DATE_KEY=2026-07-28 npm run apply:branch-replay
 *   DATE_KEY=2026-07-28 APPLY=1 npm run apply:branch-replay
 */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const admin = require('firebase-admin');
const { getAppDateKey } = require('./lib/app-date-key.cjs');
const {
  createServerQuiltEngine,
  serializeServerQuiltBlocks,
  computeQuiltFingerprint
} = require('./lib/server-quilt-engine.cjs');
const { normalizeHex, replaySequence, orderedColorsFromBlocks } = require('./lib/composition-preview.cjs');

const ROOT = path.resolve(__dirname, '..');

function initFirestore() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID });
    return admin.firestore();
  }
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.join(ROOT, 'firebase-adminsdk-local.json');
  if (fs.existsSync(credPath)) {
    const sa = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID });
    return admin.firestore();
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID');
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
  return admin.firestore();
}

async function fetchBranchData(dateKey) {
  const db = initFirestore();
  const [snap, submissionSnap] = await Promise.all([
    db.collection('quilts').doc(dateKey).get(),
    db.collection('colorSubmissions').where('appDateKey', '==', dateKey).get()
  ]);
  if (!snap.exists) throw new Error(`No quilts/${dateKey} in Firestore`);
  const data = snap.data() || {};
  const submissions = submissionSnap.docs
    .map((doc) => {
      const row = doc.data() || {};
      return {
        color: normalizeHex(row.appliedColor || row.color || row.hex || row.selectedColor),
        status: String(row.status || '').trim(),
        submissionIndex: Number(row.submissionIndex),
        createdAtIso: String(row.createdAtIso || row.submittedAtIso || '').trim()
      };
    })
    .filter((row) => row.color && (!row.status || row.status === 'success'))
    .sort((a, b) => {
      const ai = Number.isFinite(a.submissionIndex) ? a.submissionIndex : Number.POSITIVE_INFINITY;
      const bi = Number.isFinite(b.submissionIndex) ? b.submissionIndex : Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return String(a.createdAtIso || '').localeCompare(String(b.createdAtIso || ''));
    });
  return {
    dateKey,
    quilt: data,
    liveBlocks: JSON.parse(JSON.stringify(Array.isArray(data.blocks) ? data.blocks : [])),
    liveContributorCount: Number(data.contributorCount) || 0,
    replayEvents: Array.isArray(data.colorReplayEvents) ? data.colorReplayEvents : [],
    submissions
  };
}

function colorsForReplay(data) {
  const fromEvents = (Array.isArray(data.replayEvents) ? data.replayEvents : [])
    .map((event) => normalizeHex(event?.newHex))
    .filter(Boolean);
  if (fromEvents.length >= data.liveContributorCount) return fromEvents;
  const fromSubs = data.submissions.map((row) => row.color).filter(Boolean);
  if (fromSubs.length) return fromSubs;
  return orderedColorsFromBlocks(data.liveBlocks);
}

async function main() {
  const dateKey = String(process.env.DATE_KEY || getAppDateKey()).trim();
  const apply = String(process.env.APPLY || '').trim() === '1';
  const data = await fetchBranchData(dateKey);
  const colors = colorsForReplay(data);
  if (!colors.length) throw new Error(`No colors to replay for ${dateKey}`);

  const replay = replaySequence(dateKey, colors, 'baseline', colors.length, {
    macroStructureFrozen: false
  });
  const fingerprint = computeQuiltFingerprint(replay.blocks);
  const liveFingerprint = computeQuiltFingerprint(data.liveBlocks);

  const plan = {
    dateKey,
    apply,
    replayColorCount: colors.length,
    liveContributorCount: data.liveContributorCount,
    liveBlockCount: data.liveBlocks.length,
    replayBlockCount: replay.blocks.length,
    replaySubmissionCount: replay.submissionCount,
    liveFingerprint,
    replayFingerprint: fingerprint,
    replayEventCount: Array.isArray(replay.colorReplayEvents) ? replay.colorReplayEvents.length : 0,
    skippedReplayColors: replay.skippedColors || [],
    macroStructureFrozen: replay.macroStructureFrozen === true
  };

  console.log(JSON.stringify(plan, null, 2));

  if (replay.skippedColors?.length) {
    throw new Error(`Replay skipped ${replay.skippedColors.length} color(s); aborting`);
  }

  if (!apply) {
    console.log('[apply-branch-replay] dry run — set APPLY=1 to write Firestore');
    return;
  }

  const db = initFirestore();
  const nowIso = new Date().toISOString();
  const quiltRef = db.collection('quilts').doc(dateKey);
  const contributors = Array.isArray(data.quilt.contributors) ? data.quilt.contributors : [];

  await quiltRef.set(
    {
      blocks: replay.blocks,
      contributorCount: Math.max(1, Number(replay.submissionCount) || colors.length),
      colorReplayEvents: Array.isArray(replay.colorReplayEvents) ? replay.colorReplayEvents : [],
      macroStructureFrozen: replay.macroStructureFrozen === true,
      quiltFingerprint: fingerprint,
      lastUpdated: nowIso,
      date: dateKey,
      contributors,
      writeProvenance: {
        writer: 'script',
        reason: 'apply-branch-replay',
        at: nowIso,
        replayColorCount: colors.length,
        previousFingerprint: liveFingerprint,
        replayFingerprint: fingerprint
      }
    },
    { merge: true }
  );

  console.log(`[apply-branch-replay] wrote quilts/${dateKey} (${replay.blocks.length} blocks, fp ${fingerprint})`);
}

main().catch((error) => {
  console.error('[apply-branch-replay] failed:', error?.message || error);
  process.exit(1);
});
