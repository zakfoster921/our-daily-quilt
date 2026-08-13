#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Preview story quote-fit (9:16): top vinyl quote + slide-0b speaker at bottom.
 * Usage:
 *   DATE_KEY=2026-08-12 node scripts/preview-story-quote-fit.cjs
 *   QUOTE='line one / line two' DATE_KEY=2026-08-12 node scripts/preview-story-quote-fit.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const dateKey = String(process.env.DATE_KEY || '2026-08-12').trim();
  const quoteOverride = process.env.QUOTE != null ? String(process.env.QUOTE).trim() : '';
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
    // Speaker catalog hydrate (same warm-up Layout B / 0b need).
    await page.waitForTimeout(2500);

    // Always inject latest compose so local edits aren't stuck behind a cached script tag.
    await page.addScriptTag({
      path: path.join(process.cwd(), 'lib/ig-carousel-slide0b-speaker-name-compose.js')
    });
    await page.addScriptTag({
      path: path.join(process.cwd(), 'lib/ig-carousel-slide0-quote-fit-compose.js')
    });

    const live = await page.evaluate(
      async ({ dateKey: dk, quoteOverride: qo }) => {
        const app = window.app;
        const arch = app?.archiveService;
        const qs = app?.quoteService;
        if (typeof arch?.generateInstagramStoryQuoteFitImageData !== 'function') {
          return { error: 'generateInstagramStoryQuoteFitImageData missing' };
        }
        if (typeof window.composeStoryQuoteFitFromQuiltBlob !== 'function') {
          return { error: 'composeStoryQuoteFitFromQuiltBlob missing after inject' };
        }
        if (typeof window.IgCarouselSlide0bSpeakerNameCompose?.drawSpeakerNameStack !== 'function') {
          return { error: 'slide0b drawSpeakerNameStack missing after inject' };
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

        let quoteObj = null;
        let quoteText = qo;
        if (!quoteText) {
          if (qs?.loadQuotesFromFirestore) {
            await qs.loadQuotesFromFirestore({ requireServer: true, timeoutMs: 45000 });
          }
          let resolved = null;
          if (typeof qs?.resolveQuoteForCalendarKeyFresh === 'function') {
            resolved = (await qs.resolveQuoteForCalendarKeyFresh(dk)) || null;
          } else if (typeof qs?.getQuoteResolvedForInstagramDateKey === 'function') {
            resolved = (await qs.getQuoteResolvedForInstagramDateKey(dk)) || null;
          } else if (typeof qs?.resolveAndPinCalendarKey === 'function') {
            resolved = (await qs.resolveAndPinCalendarKey(dk, { requireLive: true })) || null;
          }
          quoteObj =
            resolved?.quote && typeof resolved.quote === 'object' ? resolved.quote : resolved;
          quoteText = String(quoteObj?.text || quoteObj?.body || quoteObj?.quote || '').trim();
        }
        if (!quoteText) return { error: `no quote for ${dk}` };
        quoteObj =
          quoteObj && typeof quoteObj === 'object'
            ? quoteObj
            : { text: quoteText, body: quoteText };
        if (!quoteObj.text && !quoteObj.body) {
          quoteObj = { ...quoteObj, text: quoteText, body: quoteText };
        }

        const result = await arch.generateInstagramStoryQuoteFitImageData(blocks, quoteObj, dk, {
          quiltFit: 'cover'
        });
        if (!result?.dataUrl) return { error: 'story quote-fit compose returned empty' };
        return {
          dataUrl: result.dataUrl,
          meta: result.meta || null,
          quoteText,
          quoteAuthor: quoteObj?.author || quoteObj?.speaker || ''
        };
      },
      { dateKey, quoteOverride }
    );

    if (live?.error) throw new Error(live.error);

    const outPath = path.join(tmp, `story-quote-fit-${dateKey}.png`);
    fs.writeFileSync(
      outPath,
      Buffer.from(live.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
    );
    console.log(`[preview-story-quote-fit] wrote ${outPath}`);
    console.log(
      '[preview-story-quote-fit] meta',
      JSON.stringify(
        {
          ...(live.meta || {}),
          quoteText: live.quoteText || null,
          quoteAuthor: live.quoteAuthor || null
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
