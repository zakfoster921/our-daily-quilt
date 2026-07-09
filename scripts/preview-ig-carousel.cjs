#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Preview integrated IG carousel PNGs for a quilt day (writes tmp/carousel-*.png).
 * Slide 1 = layout B (+ speaker cutout seam into slide 2), slides 2–3 = shared quilt bg (flip A, A).
 * Usage: APP_URL=https://… DATE_KEY=2026-06-22 node scripts/preview-ig-carousel.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const appUrl = process.env.APP_URL;
  const dateKey = process.env.DATE_KEY;
  if (!appUrl) throw new Error('APP_URL is required');
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error('DATE_KEY=YYYY-MM-DD is required');
  }

  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!window.app && window.app._portalQuiltLoaded === true, undefined, {
      timeout: 180000
    });

    const result = await page.evaluate(async ({ dateKey }) => {
      const app = window.app;
      const arch = app?.archiveService;
      const qs = app?.quoteService;
      if (!arch?.buildIntegratedInstagramCarouselImageData) {
        throw new Error('buildIntegratedInstagramCarouselImageData missing');
      }
      let blocks = [];
      let contributors = [];
      if (window.db && window.firestore) {
        const snap = await window.firestore.getDoc(window.firestore.doc(window.db, 'quilts', dateKey));
        if (snap.exists()) {
          const data = snap.data() || {};
          blocks = Array.isArray(data.blocks) ? data.blocks : [];
          contributors = Array.isArray(data.contributors) ? data.contributors : [];
        }
      }
      if (blocks.length <= 1) throw new Error(`Need blocks for ${dateKey}`);
      let tuneMeta = null;
      if (window.db && window.firestore) {
        const igSnap = await window.firestore.getDoc(window.firestore.doc(window.db, 'instagram-images', dateKey));
        if (igSnap.exists()) {
          const ig = igSnap.data() || {};
          tuneMeta = {
            layoutBTuneUpdatedAt: ig.layoutBTuneUpdatedAt || null,
            layoutBQuiltBgZoomPost: ig.layoutBQuiltBgZoomPost ?? null,
            layoutBStripLayoutSeedPost: ig.layoutBStripLayoutSeedPost ?? null,
            layoutBQuoteStripOffsetXPost: ig.layoutBQuoteStripOffsetXPost ?? null,
            layoutBQuoteStripOffsetYPost: ig.layoutBQuoteStripOffsetYPost ?? null,
            layoutBSpeakerCutoutPresetPost: ig.layoutBSpeakerCutoutPresetPost || null,
            layoutBSpeakerCutoutNudgeCxPost: ig.layoutBSpeakerCutoutNudgeCxPost ?? null,
            layoutBSpeakerCutoutNudgeCyPost: ig.layoutBSpeakerCutoutNudgeCyPost ?? null,
            layoutBSpeakerCutoutNudgeRotateDegPost: ig.layoutBSpeakerCutoutNudgeRotateDegPost ?? null,
            layoutBSpeakerCutoutScaleMulPost: ig.layoutBSpeakerCutoutScaleMulPost ?? null
          };
        }
      }
      if (typeof app.applyQuiltDataFromPayload === 'function') {
        await app.applyQuiltDataFromPayload({ blocks, contributors, dateKey, date: dateKey });
      }
      if (app.renderer?.renderBlocks && app.quiltEngine?.getState) {
        const state = app.quiltEngine.getState();
        app.renderer.renderBlocks(state.blocks, state.userPieces, state.submissionCount);
      }
      let quote = null;
      if (qs && typeof qs.getQuoteResolvedForInstagramDateKey === 'function') {
        quote = (await qs.getQuoteResolvedForInstagramDateKey(dateKey)) || null;
      } else if (qs && typeof qs.getTodayQuote === 'function') {
        quote = qs.getTodayQuote() || null;
      }
      quote = quote || { text: '', body: '', author: '' };
      if (typeof arch._clearLayoutBStoryRefStripPlan === 'function') {
        arch._clearLayoutBStoryRefStripPlan();
      }
      if (arch.generateInstagramStoryLayoutBImage) {
        await arch.generateInstagramStoryLayoutBImage(blocks, quote, dateKey);
      }
      const integrated = await arch.buildIntegratedInstagramCarouselImageData(
        blocks,
        contributors,
        quote,
        dateKey
      );
      if (!integrated?.carouselSlide1 || !integrated?.carouselSlide2 || !integrated?.carouselSlide3) {
        throw new Error('Integrated carousel generation returned empty slides');
      }
      return {
        slide1: integrated.carouselSlide1,
        slide2: integrated.carouselSlide2,
        slide3: integrated.carouselSlide3,
        meta: integrated.meta || null,
        tuneMeta
      };
    }, { dateKey });

    const writeDataUrl = (dataUrl, filename) => {
      const b64 = String(dataUrl).replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(path.join(outDir, filename), Buffer.from(b64, 'base64'));
    };
    writeDataUrl(result.slide1, `carousel-slide-1-layout-b-${dateKey}.png`);
    writeDataUrl(result.slide2, `carousel-slide-2-${dateKey}.png`);
    writeDataUrl(result.slide3, `carousel-slide-3-${dateKey}.png`);
    console.log(`[preview-ig-carousel] wrote tmp/carousel-slide-1-layout-b-${dateKey}.png`);
    console.log(`[preview-ig-carousel] wrote tmp/carousel-slide-2-${dateKey}.png`);
    console.log(`[preview-ig-carousel] wrote tmp/carousel-slide-3-${dateKey}.png`);
    if (result.meta?.speakerSeam) {
      console.log(`[preview-ig-carousel] speakerSeam=${JSON.stringify(result.meta.speakerSeam)}`);
    }
    if (result.meta) {
      console.log(`[preview-ig-carousel] meta=${JSON.stringify(result.meta)}`);
    }
    if (result.tuneMeta) {
      console.log(`[preview-ig-carousel] tune=${JSON.stringify(result.tuneMeta)}`);
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[preview-ig-carousel]', err?.message || err);
  process.exit(1);
});
