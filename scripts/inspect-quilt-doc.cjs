#!/usr/bin/env node
// Read-only: prints quilt doc metadata (no writes). Output -> tmp/inspect/quilt-<dateKey>.json
const fs = require('fs');
const admin = require('firebase-admin');
const dateKey = process.env.DATE_KEY || '2026-11-04';
const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
(async () => {
  const db = admin.firestore();
  const snap = await db.collection('quilts').doc(dateKey).get();
  const d = snap.data() || {};
  const blocks = Array.isArray(d.blocks) ? d.blocks : [];
  const { blocks: _b, colorReplayEvents, contributors, ...rest } = d;
  const out = {
    exists: snap.exists, updateTime: snap.updateTime?.toDate?.().toISOString(),
    blockCount: blocks.length,
    blockContributors: blocks.map((b) => [b.contributorId, ...(b.contributorIds || [])].filter(Boolean)),
    contributors, replayEventCount: (colorReplayEvents || []).length,
    rest
  };
  // recent color submissions for this app day
  const subs = await db.collection('colorSubmissions').where('appDateKey', '==', dateKey).get().catch(() => null);
  if (subs) out.submissions = subs.docs.map((x) => { const v = x.data(); return { id: x.id, name: v.displayName, at: v.createdAtIso, idx: v.submissionIndex, blockCount: v.blockCount, source: v.source }; }).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const refl = await db.collection('reflectionResponses').where('appDateKey', '==', dateKey).get().catch((e) => ({ err: String(e) }));
  out.reflections = refl.docs ? refl.docs.map((x) => { const v = x.data(); return { id: x.id, name: v.authorDisplayName || v.displayName, at: v.createdAtIso || v.createdAt?.toDate?.().toISOString(), clientId: String(v.clientId || v.deviceId || '').slice(0, 12), keys: Object.keys(v).join(',') }; }) : refl;
  const prev = new Date(dateKey + 'T00:00:00Z'); prev.setUTCDate(prev.getUTCDate() - 1);
  const pk = prev.toISOString().slice(0, 10);
  const pq = (await db.collection('quilts').doc(pk).get()).data() || {};
  out.prevDay = { key: pk, blocks: (pq.blocks || []).length, contributors: (pq.contributors || []).map((c) => c.name + ' ' + c.firstContributedAt) };
  fs.mkdirSync('tmp/inspect', { recursive: true });
  fs.writeFileSync(`tmp/inspect/quilt-${dateKey}.json`, JSON.stringify(out, null, 1));
  console.log('ok', out.blockCount, (out.submissions || []).length);
})().catch((e) => { fs.mkdirSync('tmp/inspect', { recursive: true }); fs.writeFileSync('tmp/inspect/error.txt', String(e.stack || e)); process.exit(0); });
