#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Preview carousel slide 0: quilt frame + justified Helvetica quote fit.
 * Usage:
 *   DATE_KEY=2026-07-31 node scripts/preview-carousel-slide0.cjs
 *   QUOTE='line one / line two' DATE_KEY=2026-07-31 node scripts/preview-carousel-slide0.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PANEL_W = 1080;
const PANEL_H = 1350;

const DEFAULT_QUOTE = [
  'So I try',
  'something new.',
  'Not turning my',
  'back to the past,',
  'not fleeing it,',
  'but extending a',
  'hand. I say to the',
  'past, come with',
  'me, then, as I live.'
].join(' / ');

async function main() {
  const dateKey = String(process.env.DATE_KEY || '2026-07-31').trim();
  const quoteText = String(process.env.QUOTE || DEFAULT_QUOTE).trim();
  const appUrl = String(process.env.APP_URL || 'http://127.0.0.1:3000/our-daily-beta.html').trim();
  const tmp = path.join(process.cwd(), 'tmp');
  const quiltOnlyFallback = path.join(tmp, `carousel-slide-4-quilt-only-${dateKey}.png`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1
  });

  let dataUrl = null;
  let meta = null;
  let mode = 'live';

  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => !!window.app?.archiveService && !!window.db && !!window.firestore,
      { timeout: 90000 }
    );

    // Ensure slide0 compose is present (script tag may need hard refresh on old servers).
    const hasCompose = await page.evaluate(() => {
      return typeof window.composeCarouselSlide0QuoteFitFromQuiltBlob === 'function';
    });
    if (!hasCompose) {
      await page.addScriptTag({
        path: path.join(process.cwd(), 'lib/ig-carousel-slide0-quote-fit-compose.js')
      });
    }

    const live = await page.evaluate(
      async ({ dateKey: dk, quoteText: qt }) => {
        const app = window.app;
        const arch = app?.archiveService;
        if (!arch?.generateInstagramCarouselSlide0QuoteFitImageData) {
          return { error: 'generateInstagramCarouselSlide0QuoteFitImageData missing' };
        }
        let blocks = [];
        if (window.db && window.firestore) {
          const snap = await window.firestore.getDoc(window.firestore.doc(window.db, 'quilts', dk));
          if (snap.exists()) {
            const data = snap.data() || {};
            blocks = Array.isArray(data.blocks) ? data.blocks : [];
          }
        }
        if (!blocks.length) return { error: `no blocks for ${dk}` };
        if (typeof app.applyQuiltDataFromPayload === 'function') {
          await app.applyQuiltDataFromPayload({ blocks, contributors: [], dateKey: dk, date: dk });
        }
        if (app.renderer?.renderBlocks && app.quiltEngine?.getState) {
          const state = app.quiltEngine.getState();
          app.renderer.renderBlocks(state.blocks, state.userPieces, state.submissionCount);
        }
        const result = await arch.generateInstagramCarouselSlide0QuoteFitImageData(
          blocks,
          { text: qt, body: qt },
          dk,
          { quiltFit: 'cover' }
        );
        if (!result?.dataUrl) return { error: 'slide0 compose returned empty' };
        return { dataUrl: result.dataUrl, meta: result.meta || null };
      },
      { dateKey, quoteText }
    );

    if (live?.error) throw new Error(live.error);
    dataUrl = live.dataUrl;
    meta = live.meta;
  } catch (err) {
    console.warn('[preview-carousel-slide0] live path failed:', err.message);
    mode = 'overlay-fallback';
    let fallbackPath = quiltOnlyFallback;
    if (!fs.existsSync(fallbackPath)) {
      const candidates = fs
        .readdirSync(tmp)
        .filter((f) => /^carousel-slide-4-quilt-only-.*\.png$/.test(f))
        .sort()
        .reverse();
      if (candidates[0]) fallbackPath = path.join(tmp, candidates[0]);
    }
    if (!fs.existsSync(fallbackPath)) {
      await browser.close();
      throw new Error(`Live failed and missing quilt-only fallback in tmp/`);
    }
    console.warn('[preview-carousel-slide0] using fallback', path.basename(fallbackPath));

    // Inject compose helpers and paint on existing quilt-only PNG.
    await page.setContent('<canvas id="c"></canvas>');
    await page.addScriptTag({
      path: path.join(process.cwd(), 'lib/ig-carousel-slide0-quote-fit-compose.js')
    });
    const b64 = fs.readFileSync(fallbackPath).toString('base64');
    const overlay = await page.evaluate(
      async ({ b64, quoteText: qt, PANEL_W, PANEL_H }) => {
        const api = window.IgCarouselSlide0QuoteFitCompose;
        if (!api?.drawQuoteFitInQuiltRect) return { error: 'drawQuoteFitInQuiltRect missing' };
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error('fallback img load failed'));
          i.src = `data:image/png;base64,${b64}`;
        });
        const canvas = document.createElement('canvas');
        canvas.width = PANEL_W;
        canvas.height = PANEL_H;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, PANEL_W, PANEL_H);
        const peek = 48;
        const typeRect = {
          x: peek,
          y: peek,
          width: PANEL_W - peek * 2,
          height: PANEL_H - peek * 2
        };
        const drawn = api.drawQuoteFitInQuiltRect(ctx, qt, typeRect);
        return {
          dataUrl: canvas.toDataURL('image/png'),
          meta: { mode: 'overlay-fallback', ...drawn, typeRect }
        };
      },
      { b64, quoteText, PANEL_W, PANEL_H }
    );
    if (overlay?.error) {
      await browser.close();
      throw new Error(overlay.error);
    }
    dataUrl = overlay.dataUrl;
    meta = overlay.meta;
  }

  const outPath = path.join(tmp, `carousel-slide-0-quote-fit-${dateKey}.png`);
  fs.writeFileSync(outPath, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log(`[preview-carousel-slide0] mode=${mode}`);
  console.log(`[preview-carousel-slide0] wrote ${outPath}`);
  if (meta) console.log('[preview-carousel-slide0] meta', JSON.stringify(meta, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
