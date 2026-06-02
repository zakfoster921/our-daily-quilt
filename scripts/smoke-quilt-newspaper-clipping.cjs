#!/usr/bin/env node
/* eslint-disable no-console */
/** Smoke test: canvas composer returns a PNG data URL (headless Chromium). */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function offsetDateKey(dateKey, deltaDays) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Active quilt day (UTC 07:00 boundary). */
function getActiveQuiltDateKey(d = new Date()) {
  const adj = new Date(d);
  if (d.getUTCHours() < 7) adj.setUTCDate(adj.getUTCDate() - 1);
  return `${adj.getUTCFullYear()}-${String(adj.getUTCMonth() + 1).padStart(2, '0')}-${String(adj.getUTCDate()).padStart(2, '0')}`;
}

async function loadClippingQuotesFromFirestore(centerDateKey) {
  loadDotEnv();
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) return null;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id
    });
  }
  const db = admin.firestore();
  const col = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';

  async function quoteForDay(dk) {
    const a = await db.collection('dailyQuoteAssignments').doc(dk).get();
    if (!a.exists) return null;
    const sid = String(a.data()?.sourceId || '').trim();
    if (!sid) return null;
    const q = await db.collection(col).doc(sid).get();
    if (!q.exists) return null;
    const d = q.data() || {};
    const text = String(d.text || d.body || '').trim();
    const author = String(d.author || '').trim();
    if (!text) return null;
    const out = { text, author };
    const keyword = String(d.keyword ?? d.keywordSnapshot ?? '').trim();
    if (keyword) out.keyword = keyword;
    const flc = Number(d.first_line_count ?? d.firstLineCount);
    if (Number.isFinite(flc) && flc > 0) out.first_line_count = Math.round(flc);
    return out;
  }

  const yKey = offsetDateKey(centerDateKey, -1);
  const tKey = offsetDateKey(centerDateKey, 1);
  const [yesterday, today, tomorrow] = await Promise.all([
    quoteForDay(yKey),
    quoteForDay(centerDateKey),
    quoteForDay(tKey)
  ]);
  if (!today) return null;
  return { yesterday, today, tomorrow, dateKey: centerDateKey };
}

function fallbackPayload(dateKey) {
  return {
    yesterday: {
      text: 'Follow your bliss and the universe will open doors where there were only walls.',
      author: 'Joseph Campbell',
      keyword: 'open doors'
    },
    dateKey,
    today: {
      text: 'Imagination is more important than knowledge. Knowledge is limited. Imagination encircles the world.',
      author: 'Albert Einstein',
      keyword: 'encircles the world',
      first_line_count: 4
    },
    tomorrow: {
      text: 'We are the myths we tell ourselves about ourselves.',
      author: 'Jean Houston'
    }
  };
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const dateKey = process.env.SMOKE_CLIPPING_DATE_KEY || getActiveQuiltDateKey();
  const fallback = fallbackPayload(dateKey);
  let payload = await loadClippingQuotesFromFirestore(dateKey);
  if (payload) {
    const flc = Number(payload.today?.first_line_count);
    if (!Number.isFinite(flc) || flc <= 0) {
      const envFlc = Number(process.env.SMOKE_FIRST_LINE_COUNT);
      const fbFlc = Number(fallback.today?.first_line_count);
      const useFlc =
        Number.isFinite(envFlc) && envFlc > 0
          ? Math.round(envFlc)
          : Number.isFinite(fbFlc) && fbFlc > 0
            ? Math.round(fbFlc)
            : 0;
      if (useFlc > 0) {
        payload.today.first_line_count = useFlc;
        console.log(
          `[smoke] first_line_count missing in Firestore — using ${useFlc} (set Notion + sync, or SMOKE_FIRST_LINE_COUNT)`
        );
      }
    }
    const qnc = require('../lib/quilt-newspaper-clipping.js');
    const kwStyle = qnc.clippingKeywordStylesForDateKey(dateKey).join('+');
    const spStyle = qnc.clippingSpeakerNameStyleForDateKey(dateKey, qnc.clippingKeywordStylesForDateKey(dateKey));
    console.log(
      `[smoke] loaded quotes from Firestore for ${dateKey} (keyword: ${payload.today.keyword || '(none)'}, first_line_count: ${payload.today.first_line_count ?? 3}, keyword_style: ${kwStyle}, speaker_style: ${spStyle})`
    );
  } else {
    payload = fallback;
    console.log(`[smoke] using fallback quotes (set .env for Firestore)`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(
    `<!DOCTYPE html><html><head>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap">
    </head><body></body></html>`,
    { waitUntil: 'networkidle' }
  );
  for (const rel of [
    'lib/quote-keyword-emphasis.js',
    'lib/layout-b-keyword-emphasis.js',
    'lib/quilt-newspaper-clipping.js'
  ]) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    await page.addScriptTag({ content: src });
  }

  const dataUrl = await page.evaluate(async (quotes) => {
    const api = globalThis.QuiltNewspaperClipping;
    const cfg = api.withClippingTypography(api.DEFAULTS);
    await Promise.all([
      api.ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx]),
      api.ensureClippingSurfaceAssets(cfg)
    ]);
    const mctx = document.createElement('canvas').getContext('2d');
    const spread = api.renderFullSpread(mctx, quotes, cfg);
    if (!spread) return null;
    let clipped = api.cropSpreadToClipping(spread, cfg);
    if (clipped) {
      clipped = api.applyHandCutSilhouette(clipped, quotes.dateKey, cfg);
      clipped = api.trimCanvasAlphaBounds(clipped, cfg);
    }
    const composed = await api.composeDataUrl(quotes);
    const flatCfg = {
      ...cfg,
      halftoneOpacity: 0,
      viewportGrainOpacity: 0,
      cardGrainOpacity: 0,
      handCutEnabled: false
    };
    const spreadFlat = api.renderFullSpread(mctx, quotes, flatCfg);
    const clippedFlat = spreadFlat ? api.cropSpreadToClipping(spreadFlat, flatCfg) : null;
    const altDate = await api.composeDataUrl({ ...quotes, dateKey: quotes.dateKey });
    let cornerAlphaMin = 255;
    if (clipped) {
      const cctx = clipped.getContext('2d');
      const w = clipped.width;
      const h = clipped.height;
      const sample = (x, y) => cctx.getImageData(x, y, 1, 1).data[3];
      for (const [x, y] of [
        [1, 1],
        [w - 2, 1],
        [1, h - 2],
        [w - 2, h - 2]
      ]) {
        cornerAlphaMin = Math.min(cornerAlphaMin, sample(x, y));
      }
    }

    async function composeSizeForToday(today, dateKey) {
      const payload = { ...quotes, today, dateKey: dateKey || quotes.dateKey };
      const s = api.renderFullSpread(mctx, payload, cfg);
      if (!s) return null;
      let c = api.cropSpreadToClipping(s, cfg);
      if (!c) return null;
      c = api.applyHandCutSilhouette(c, payload.dateKey, cfg);
      c = api.trimCanvasAlphaBounds(c, cfg);
      return {
        centerColW: s.centerColW,
        width: c.width,
        height: c.height
      };
    }

    const shortQuote = {
      text: 'When we plant trees, we plant the seeds of peace and seeds of hope.',
      author: 'Wangari Maathai',
      first_line_count: 3
    };
    const longQuote = {
      text:
        'Imagination is more important than knowledge. Knowledge is limited. Imagination encircles the world and opens doors we never knew existed.',
      author: 'Albert Einstein',
      first_line_count: 4
    };
    const shortSize = await composeSizeForToday(shortQuote, `${quotes.dateKey}-short`);
    const longSize = await composeSizeForToday(longQuote, `${quotes.dateKey}-long`);
    const legacyOutW = api.resolveQuoteCropMetrics(cfg).outW;

    return {
      exportWidth: cfg.width,
      cornerAlphaMin,
      clippedWidth: clipped?.width ?? 0,
      clippedHeight: clipped?.height ?? 0,
      centerColW: spread?.centerColW ?? 0,
      legacyOutW,
      shortSize,
      longSize,
      spread: spread.canvas.toDataURL('image/png', 0.92),
      clipped: clipped ? clipped.toDataURL('image/png', 0.92) : composed,
      clippedFlat: clippedFlat ? clippedFlat.toDataURL('image/png', 0.92) : null,
      altDate
    };
  }, payload);
  await browser.close();
  if (!dataUrl?.clipped || !String(dataUrl.clipped).startsWith('data:image/png')) {
    throw new Error('clipping PNG (crop + hand-cut) did not return data URL');
  }
  if (typeof dataUrl.cornerAlphaMin === 'number' && dataUrl.cornerAlphaMin > 32) {
    throw new Error(
      `hand-cut corners look opaque (min corner alpha ${dataUrl.cornerAlphaMin}); silhouette may be missing`
    );
  }
  const { shortSize, longSize, legacyOutW, clippedWidth } = dataUrl;
  if (!shortSize?.width || !longSize?.width) {
    throw new Error('content-aware sizing smoke: failed to compose short/long quote sizes');
  }
  if (shortSize.width >= longSize.width) {
    throw new Error(
      `short quote clipping should be narrower than long quote (${shortSize.width}px vs ${longSize.width}px)`
    );
  }
  if (Number.isFinite(legacyOutW) && legacyOutW > 0 && shortSize.width >= legacyOutW) {
    throw new Error(
      `short quote clipping should be narrower than legacy fixed outW (${shortSize.width}px vs ${legacyOutW}px)`
    );
  }
  console.log(
    `[smoke] content-aware sizes — short: ${shortSize.width}x${shortSize.height} (centerCol ${shortSize.centerColW}), long: ${longSize.width}x${longSize.height}, live: ${clippedWidth}px wide (legacy fixed ${legacyOutW}px)`
  );
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const writePng = (name, url) => {
    const out = path.join(root, 'tmp', name);
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`[smoke] wrote ${out} (${fs.statSync(out).size} bytes)`);
  };
  if (dataUrl.spread) writePng('smoke-newspaper-spread.png', dataUrl.spread);
  writePng('smoke-newspaper-clipping.png', dataUrl.clipped);
  if (dataUrl.clippedFlat) writePng('smoke-newspaper-clipping-flat.png', dataUrl.clippedFlat);
  if (dataUrl.altDate) writePng('smoke-newspaper-clipping-alt-date.png', dataUrl.altDate);
  console.log(
    `[smoke] export width ${dataUrl.exportWidth}px — compare clipping vs flat; alt-date for hand-cut shape`
  );
}

main().catch((err) => {
  console.error('[smoke] failed:', err?.stack || err);
  process.exit(1);
});
