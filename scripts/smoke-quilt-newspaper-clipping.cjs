#!/usr/bin/env node
/* eslint-disable no-console */
/** Smoke test: quote-only newspaper clipping PNG (nightlyPeek / centerOnly — in-app taped card). */
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
    let flc = Number(d.first_line_count ?? d.firstLineCount);
    if (!Number.isFinite(flc) || flc <= 0) {
      flc = Number(
        d.firstLineCountSnapshot ??
          d.first_line_count_snapshot ??
          d.notionProperties?.first_line_count?.value ??
          d.notionProperties?.firstLineCount?.value
      );
    }
    if (Number.isFinite(flc) && flc > 0) {
      out.first_line_count = Math.round(flc);
      out.firstLineCount = Math.round(flc);
    }
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
    const compose = api.composeDataUrlWithLayout || api.composeDataUrl;
    const quoteOnlyOpts = {
      exportProfile: 'nightlyPeek',
      centerOnly: true
    };

    async function composeQuoteOnly(extra = {}) {
      return compose({
        ...quotes,
        ...quoteOnlyOpts,
        ...extra
      });
    }

    async function pngSizeFromComposed(composed) {
      const url = typeof composed === 'string' ? composed : composed?.dataUrl;
      if (!url) return null;
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
        img.src = url;
      });
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        displayWidthPx: typeof composed === 'object' ? Number(composed.displayWidthPx) || 0 : 0
      };
    }

    async function cornerAlphaMinForUrl(url) {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const w = canvas.width;
      const h = canvas.height;
      const sample = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
      let min = 255;
      for (const [x, y] of [
        [1, 1],
        [w - 2, 1],
        [1, h - 2],
        [w - 2, h - 2]
      ]) {
        min = Math.min(min, sample(x, y));
      }
      return min;
    }

    const live = await composeQuoteOnly();
    const liveUrl = typeof live === 'string' ? live : live?.dataUrl;
    if (!liveUrl) return null;

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

    const shortComposed = await composeQuoteOnly({
      today: shortQuote,
      dateKey: `${quotes.dateKey}-short-sharp`,
      exportDensity: 2
    });
    const shortSizeComposed = await composeQuoteOnly({
      today: shortQuote,
      dateKey: `${quotes.dateKey}-short`
    });
    const longSizeComposed = await composeQuoteOnly({
      today: longQuote,
      dateKey: `${quotes.dateKey}-long`
    });
    const shortSharp = await pngSizeFromComposed(shortComposed);
    const shortSize = {
      width: Number(shortSizeComposed?.clippedWidth) || 0,
      height: Number(shortSizeComposed?.clippedHeight) || 0
    };
    const longSize = {
      width: Number(longSizeComposed?.clippedWidth) || 0,
      height: Number(longSizeComposed?.clippedHeight) || 0
    };
    const cfg = api.withClippingTypography(api.DEFAULTS);
    const legacyOutW = api.resolveQuoteCropMetrics(cfg).outW;

    return {
      exportRev: api.CLIPPING_EXPORT_REV,
      exportWidth: Number(live?.renderWidth) || cfg.width,
      cornerAlphaMin: await cornerAlphaMinForUrl(liveUrl),
      clippedWidth: Number(live?.clippedWidth) || 0,
      clippedHeight: Number(live?.clippedHeight) || 0,
      legacyOutW,
      shortSize,
      shortSharpW: shortSharp?.width || 0,
      shortDisplayW: shortSharp?.displayWidthPx || Number(shortComposed?.displayWidthPx) || 0,
      longSize,
      clipped: liveUrl
    };
  }, payload);
  await browser.close();
  if (!dataUrl?.clipped || !String(dataUrl.clipped).startsWith('data:image/png')) {
    throw new Error('clipping PNG (crop + hand-cut) did not return data URL');
  }
  if (typeof dataUrl.cornerAlphaMin === 'number' && dataUrl.cornerAlphaMin > 32) {
    throw new Error(
      `hand-cut corners should stay transparent outside silhouette (min corner alpha ${dataUrl.cornerAlphaMin})`
    );
  }
  const { shortSize, shortSharpW, shortDisplayW, longSize, legacyOutW, clippedWidth } = dataUrl;
  if (!shortSize?.width || !longSize?.width) {
    throw new Error('content-aware sizing smoke: failed to compose short/long quote sizes');
  }
  if (shortSize.width >= longSize.width) {
    throw new Error(
      `short quote clipping should be narrower than long quote (${shortSize.width}px vs ${longSize.width}px)`
    );
  }
  if (!shortSharpW || !shortDisplayW || shortSharpW < shortDisplayW * 1.15) {
    throw new Error(
      `short quote compose should supersample for retina (sharp ${shortSharpW}px vs display ${shortDisplayW}px)`
    );
  }
  const qnc = require('../lib/quilt-newspaper-clipping.js');
  const minDisplayW = qnc.minClippingDisplayWidthDomPx({ displayScale: 1 });
  if (shortDisplayW + 1 < minDisplayW) {
    throw new Error(
      `short quote display ${shortDisplayW}px should respect readability floor ${Math.round(minDisplayW)}px`
    );
  }
  if (Number.isFinite(legacyOutW) && legacyOutW > 0 && shortSize.width >= legacyOutW) {
    throw new Error(
      `short quote clipping should be narrower than legacy fixed outW (${shortSize.width}px vs ${legacyOutW}px)`
    );
  }
  console.log(
    `[smoke] quote-only — live: ${clippedWidth}x${dataUrl.clippedHeight || '?'}px, short: ${shortSize.width}x${shortSize.height}, long: ${longSize.width}x${longSize.height} (legacy ${legacyOutW}px)`
  );
  const tmpDir = path.join(root, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const writePng = (name, url) => {
    const buf = Buffer.from(url.split(',')[1], 'base64');
    const out = path.join(tmpDir, name);
    fs.writeFileSync(out, buf, { mode: 0o644 });
    try {
      fs.chmodSync(out, 0o644);
    } catch (_) {
      /* iCloud may reject chmod; file is still readable */
    }
    console.log(`[smoke] wrote ${out} (${fs.statSync(out).size} bytes)`);
    return { out, buf, name };
  };
  const written = {
    clipped: writePng('smoke-newspaper-clipping.png', dataUrl.clipped)
  };

  // Mirror outside iCloud so Preview/Finder/Cursor are not blocked on CloudDocs paths.
  const localMirror = '/tmp/our-daily-smoke-newspaper-clipping.png';
  fs.writeFileSync(localMirror, written.clipped.buf, { mode: 0o644 });
  console.log(`[smoke] mirror (open this if iCloud path is denied): ${localMirror}`);

  const previewHtml = path.join(tmpDir, 'smoke-newspaper-clipping-preview.html');
  fs.writeFileSync(
    previewHtml,
    `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>Quote-only clipping smoke preview</title>
<style>
  body { font-family: system-ui, sans-serif; background: #d8d4ce; margin: 0; padding: 24px; }
  h1 { font-size: 1rem; font-weight: 600; margin: 0 0 8px; }
  p.meta { color: #444; font-size: 0.85rem; margin: 0 0 12px; }
  img { display: block; max-width: min(100%, 460px); height: auto; background: #fff; filter: drop-shadow(0 4px 14px rgba(45,36,29,.14)); }
</style></head><body>
<h1>Quote-only clipping (rev ${dataUrl.exportRev || '?'})</h1>
<p class="meta">${dateKey} — nightlyPeek / centerOnly (same as in-app taped card)</p>
<img src="smoke-newspaper-clipping.png" alt="quote-only clipping" />
</body></html>`,
    'utf8'
  );
  console.log(`[smoke] preview page: ${previewHtml}`);
  console.log(`[smoke] open mirror: open ${localMirror}`);
}

main().catch((err) => {
  console.error('[smoke] failed:', err?.stack || err);
  process.exit(1);
});
