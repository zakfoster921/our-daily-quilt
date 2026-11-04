#!/usr/bin/env node
// Read-only: exports ordered color picks per app-day for the quilt lab (no names, no ids).
const fs = require('fs');
const admin = require('firebase-admin');
const DAYS = Number(process.env.DAYS || 30);
const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
(async () => {
  const db = admin.firestore();
  const out = [];
  const end = new Date();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(end.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const snap = await db.collection('quilts').doc(key).get();
    if (!snap.exists) continue;
    const q = snap.data() || {};
    let colors = (q.colorReplayEvents || []).map((e) => e && e.newHex).filter((h) => /^#[0-9a-f]{6}$/i.test(h || ''));
    if (colors.length < 2) {
      const sub = await db.collection('colorSubmissions').where('appDateKey', '==', key).get().catch(() => null);
      if (sub) colors = sub.docs.map((x) => x.data()).sort((a, b) => String(a.createdAtIso).localeCompare(String(b.createdAtIso))).map((v) => v.color).filter((h) => /^#[0-9a-f]{6}$/i.test(h || ''));
    }
    if (colors.length) out.push({ date: key, count: colors.length, seedColor: (q.blocks && q.blocks[0] && q.blocks[0].color) || null, colors });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  fs.mkdirSync('tmp/inspect', { recursive: true });
  fs.writeFileSync('tmp/inspect/days.json', JSON.stringify(out));
  console.log('days', out.length, out.map((d) => d.count).join(','));
})().catch((e) => { fs.mkdirSync('tmp/inspect', { recursive: true }); fs.writeFileSync('tmp/inspect/error.txt', String(e.stack || e)); });
