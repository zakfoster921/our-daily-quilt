/**
 * Reset the saved Layout B tuner settings (speaker nudge/preset, strip seed + arrangement, keyword emphasis,
 * quilt zoom/offset, strip offset, style amount, clipping offset) for one day back to the coded defaults.
 * Touches ONLY those tune fields on instagram-images/{dateKey}; image URLs and Instagram fields are left alone.
 * Stamps layoutBTuneUpdatedAt = now so devices treat the cleared state as the newest.
 * Env: GOOGLE_APPLICATION_CREDENTIALS_JSON, DATE_KEY (optional, default current app day), DRY_RUN=true to only list.
 */
const admin = require('firebase-admin');
const { getActiveQuiltDateKey } = require('./generate-nightly-ig-images.cjs');

const TUNE_PREFIXES = [
  'layoutBSpeakerCutout',
  'layoutBStripLayoutSeed',
  'layoutBKeywordEmphasis',
  'layoutBQuiltBg',
  'layoutBQuoteStripOffset',
  'layoutBSpeakerStyleAmount',
  'layoutBCarouselClippingOffset',
  'layoutBPostStripPlan',
  'layoutBPostTuneIndependent',
  'speakerCutoutPreset'
];

(async () => {
  const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}');
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
  const dateKey = process.env.DATE_KEY || getActiveQuiltDateKey(new Date());
  const ref = admin.firestore().collection('instagram-images').doc(dateKey);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`instagram-images/${dateKey} does not exist`);
  const data = snap.data() || {};
  const fields = Object.keys(data).filter((k) => TUNE_PREFIXES.some((p) => k.startsWith(p)));
  console.log(`[reset-tune] ${dateKey}: ${fields.length} tune fields:`);
  for (const f of fields) {
    const v = JSON.stringify(data[f]);
    console.log(`  - ${f} = ${v && v.length > 120 ? v.slice(0, 120) + '…' : v}`);
  }
  if (String(process.env.DRY_RUN).toLowerCase() === 'true') {
    console.log('[reset-tune] DRY_RUN — nothing changed');
    return;
  }
  const update = { layoutBTuneUpdatedAt: new Date().toISOString(), layoutBTuneUpdatedBy: 'reset-to-default' };
  for (const f of fields) update[f] = admin.firestore.FieldValue.delete();
  await ref.update(update);
  console.log('[reset-tune] done');
})().catch((e) => {
  console.error('[reset-tune] failed:', e?.stack || e);
  process.exit(1);
});
