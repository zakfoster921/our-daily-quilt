#!/usr/bin/env node
/* eslint-disable no-console */
/** Smoke test: mood clipping PNG (good_day; rough when MOOD_CLIPPING_ROUGH=1 or variant=rough|both). */
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

function getActiveQuiltDateKey(d = new Date()) {
  const adj = new Date(d);
  if (d.getUTCHours() < 7) adj.setUTCDate(adj.getUTCDate() - 1);
  return `${adj.getUTCFullYear()}-${String(adj.getUTCMonth() + 1).padStart(2, '0')}-${String(adj.getUTCDate()).padStart(2, '0')}`;
}

async function loadMoodLinesFromFirestore(centerDateKey) {
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

  const a = await db.collection('dailyQuoteAssignments').doc(centerDateKey).get();
  if (!a.exists) return null;
  const sid = String(a.data()?.sourceId || '').trim();
  if (!sid) return null;
  const q = await db.collection(col).doc(sid).get();
  if (!q.exists) return null;
  const d = q.data() || {};
  const goodDay = String(d.good_day ?? d.goodDay ?? '').trim();
  const roughDay = String(d.rough_day ?? d.roughDay ?? '').trim();
  if (!goodDay && !roughDay) return null;
  return { goodDay, roughDay, dateKey: centerDateKey };
}

function fallbackMood(dateKey) {
  return {
    dateKey,
    goodDay: 'Hard mute the inner critic. Say the true thing once.',
    roughDay: 'Love is enough today.'
  };
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const dateKey = process.env.SMOKE_MOOD_DATE_KEY || getActiveQuiltDateKey();
  const variant = String(process.env.SMOKE_MOOD_VARIANT || 'good').toLowerCase();
  const includeRough = process.env.MOOD_CLIPPING_ROUGH === '1' || variant === 'rough' || variant === 'both';

  let mood = await loadMoodLinesFromFirestore(dateKey);
  if (mood) {
    console.log(
      `[smoke] Firestore ${dateKey} good_day=${mood.goodDay ? mood.goodDay.slice(0, 60) + '…' : '(empty)'} rough_day=${mood.roughDay ? 'yes' : 'no'}`
    );
  } else {
    mood = fallbackMood(dateKey);
    console.log('[smoke] using fallback mood lines (.env for Firestore)');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(
    `<!DOCTYPE html><html><head>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap">
    </head><body></body></html>`,
    { waitUntil: 'networkidle' }
  );
  for (const rel of ['lib/quilt-newspaper-clipping.js', 'lib/quilt-mood-clipping.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(root, rel), 'utf8') });
  }

  const quotePayload = await page.evaluate(async (dateKey) => {
    const api = globalThis.QuiltNewspaperClipping;
    const cfg = api.withClippingTypography(api.DEFAULTS);
    await Promise.all([
      api.ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx]),
      api.ensureClippingSurfaceAssets(cfg)
    ]);
    const mctx = document.createElement('canvas').getContext('2d');
    const quotes = {
      dateKey,
      today: {
        text: 'We are the myths we tell ourselves about ourselves.',
        author: 'Jean Houston',
        first_line_count: 4
      }
    };
    const spread = api.renderFullSpread(mctx, quotes, cfg);
    let clipped = spread ? api.cropSpreadToClipping(spread, cfg) : null;
    if (clipped) clipped = api.applyHandCutSilhouette(clipped, dateKey, cfg);
    return clipped
      ? { w: clipped.width, h: clipped.height, dataUrl: clipped.toDataURL('image/png', 0.92) }
      : null;
  }, dateKey);

  const renderVariant = async (line, v) => {
    if (!line) return null;
    return page.evaluate(
      async ({ line, dateKey, variant, quoteW, quoteH }) => {
        const moodApi = globalThis.QuiltMoodClipping;
        const qnc = globalThis.QuiltNewspaperClipping;
        const cfg = moodApi.withMoodClippingTypography(qnc.DEFAULTS);
        await Promise.all([
          qnc.ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx]),
          qnc.ensureClippingSurfaceAssets(cfg)
        ]);
        const dataUrl = await moodApi.composeMoodDataUrl({
          line,
          dateKey,
          variant,
          quoteClippingWidthPx: quoteW,
          quoteClippingHeightPx: quoteH
        });
        const mctx = document.createElement('canvas').getContext('2d');
        const rendered = moodApi.renderMoodClipping(mctx, line, cfg, {
          quoteClippingWidthPx: quoteW,
          quoteClippingHeightPx: quoteH,
          dateKey,
          variant
        });
        return {
          dataUrl,
          w: rendered?.width ?? 0,
          h: rendered?.height ?? 0
        };
      },
      {
        line,
        dateKey,
        variant: v,
        quoteW: quotePayload?.w ?? 0,
        quoteH: quotePayload?.h ?? 0
      }
    );
  };

  const goodLine = mood.goodDay;
  const good = await renderVariant(goodLine, 'good');
  if (!good?.dataUrl?.startsWith('data:image/png')) {
    throw new Error('good_day mood clipping did not return PNG data URL');
  }

  let rough = null;
  if (includeRough && mood.roughDay) {
    rough = await renderVariant(mood.roughDay, 'rough');
  }

  await browser.close();

  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const writePng = (name, url) => {
    const out = path.join(root, 'tmp', name);
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`[smoke] wrote ${out} (${fs.statSync(out).size} bytes)`);
  };

  writePng('smoke-mood-clipping-good.png', good.dataUrl);
  if (quotePayload?.dataUrl) writePng('smoke-mood-vs-quote-quote.png', quotePayload.dataUrl);

  if (rough?.dataUrl?.startsWith('data:image/png')) {
    writePng('smoke-mood-clipping-rough.png', rough.dataUrl);
  }

  console.log(
    `[smoke] quote clipping ${quotePayload?.w ?? '?'}×${quotePayload?.h ?? '?'}px | good_day mood ${good.w}×${good.h}px` +
      (rough ? ` | rough_day ${rough.w}×${rough.h}px` : '')
  );
  if (quotePayload?.w && quotePayload?.h && good.w && good.h) {
    const wPct = Math.round((good.w / quotePayload.w) * 100);
    const hPct = Math.round((good.h / quotePayload.h) * 100);
    const quoteAspect = (quotePayload.w / quotePayload.h).toFixed(2);
    const moodAspect = (good.w / good.h).toFixed(2);
    const ok =
      wPct >= 90 && wPct <= 110 && hPct >= 90 && hPct <= 110 ? 'within 10%' : 'OUT OF BAND';
    console.log(
      `[smoke] quote aspect ${quoteAspect}:1 | mood aspect ${moodAspect}:1 | mood size ${wPct}%×${hPct}% of quote (${ok})`
    );
  }
}

main().catch((err) => {
  console.error('[smoke] failed:', err?.stack || err);
  process.exit(1);
});
