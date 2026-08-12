#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Preview carousel slide 0b: green mat + speaker cutout + vinyl name.
 * Usage:
 *   DATE_KEY=2026-08-11 node scripts/preview-carousel-slide0b.cjs
 *   SPEAKER_NAME='Audre Lorde' DATE_KEY=2026-08-11 node scripts/preview-carousel-slide0b.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const dateKey = String(process.env.DATE_KEY || '2026-08-11').trim();
  const nameOverride =
    process.env.SPEAKER_NAME != null ? String(process.env.SPEAKER_NAME).trim() : '';
  const appUrl = String(process.env.APP_URL || 'http://127.0.0.1:3000/our-daily-beta.html').trim();
  const tmp = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(tmp, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1
  });

  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => !!window.app?.archiveService && !!window.db && !!window.firestore,
      { timeout: 90000 }
    );
    // Speaker catalog / assignment hydrate (same warm-up Layout B needs).
    await page.waitForTimeout(2500);

    // Always inject latest compose so local edits aren't stuck behind a cached script tag.
    await page.addScriptTag({
      path: path.join(process.cwd(), 'lib/ig-carousel-slide0b-speaker-name-compose.js')
    });

    const live = await page.evaluate(async (args) => {
      const dk = args.dateKey;
      const no = args.nameOverride;
      const app = window.app;
      const arch = app?.archiveService;
      if (!arch?.generateInstagramCarouselSlide0bSpeakerNameImageData) {
        return { error: 'generateInstagramCarouselSlide0bSpeakerNameImageData missing' };
      }
      let blocks = [];
      if (window.db && window.firestore) {
        const snap = await window.firestore.getDoc(window.firestore.doc(window.db, 'quilts', dk));
        if (snap.exists()) {
          const data = snap.data() || {};
          blocks = Array.isArray(data.blocks) ? data.blocks : [];
        }
      }
      let quote = null;
      try {
        quote = await app.quoteService?.getQuoteResolvedForInstagramDateKey?.(dk);
      } catch (_) {
        quote = null;
      }
      if (!quote) {
        try {
          quote = await app.quoteService?.getQuoteForDate?.(dk);
        } catch (_) {
          quote = null;
        }
      }
      // Let archive resolve via getQuoteResolvedForInstagramDateKey (same as Layout B).
      const result = await arch.generateInstagramCarouselSlide0bSpeakerNameImageData(
        blocks,
        null,
        dk,
        no ? { speakerName: no } : {}
      );
      if (!result?.dataUrl) {
        return {
          error: 'compose returned empty',
          author: String(quote?.author || ''),
          hasCompose: typeof window.composeCarouselSlide0bSpeakerName === 'function'
        };
      }
      return { dataUrl: result.dataUrl, meta: result.meta || null };
    }, { dateKey, nameOverride });

    if (live?.error) {
      console.error('[slide0b]', JSON.stringify(live, null, 2));
      process.exitCode = 1;
      return;
    }

    const outPath = path.join(tmp, `carousel-slide-0b-speaker-name-${dateKey}.png`);
    const b64 = String(live.dataUrl).replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`[slide0b] wrote ${outPath}`);
    console.log(`[slide0b] meta ${JSON.stringify(live.meta || {})}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
