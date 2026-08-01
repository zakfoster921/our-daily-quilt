#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Playwright screenshot of the live reflection wall DOM (paper, tape, clip-path).
 * Used by preview-ig-carousel and nightly IG when building slide 2 reflection.
 */
const sharp = require('sharp');

/** Key out warm paper + clip-path white fringe from Playwright PNG captures. */
async function keyOutWarmPaperBackground(pngBuffer) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const isPaperFill = (r, g, b) =>
    Math.abs(r - 246) <= 8 &&
    Math.abs(g - 244) <= 8 &&
    Math.abs(b - 241) <= 8 &&
    r - b <= 8;
  const isTapeTone = (r, g, b) => r - b >= 10 && g >= b && r >= 200 && r <= 245;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (isTapeTone(r, g, b)) continue;

    if (a >= 248 && isPaperFill(r, g, b)) {
      data[i + 3] = 0;
      continue;
    }

    // Anti-aliased white halo at hand-cut scalloped edges (after background removal).
    if (a > 0 && a < 235 && r > 244 && g > 242 && b > 236) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function captureIgPlaywrightCardsPng(page, options = {}, prepMethod = 'prepareIgReflectionSlidePlaywrightCapture') {
  const prevViewport = page.viewportSize?.() || null;
  await page.setViewportSize({ width: 1080, height: 1500 });

  const prep = await page.evaluate(
    async ({ opts, method }) => {
      const app = window.app;
      if (typeof app?.[method] !== 'function') {
        throw new Error(`app.${method} missing`);
      }
      return app[method](opts);
    },
    { opts: options, method: prepMethod }
  );
  if (!prep?.selector) {
    if (prevViewport) await page.setViewportSize(prevViewport);
    return null;
  }

  try {
    await page.evaluate(async () => {
      try {
        await document.fonts.load('400 16px "DM Sans"');
        await document.fonts.load('italic 400 16px "DM Sans"');
      } catch (_) {
        /* non-fatal */
      }
      await document.fonts?.ready?.catch?.(() => {});
    });
    await page.waitForTimeout(400);

    const locator = page.locator(prep.selector);
    await locator.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    let buffer = await locator.screenshot({
      type: 'png',
      omitBackground: true,
      animations: 'disabled'
    });
    buffer = await keyOutWarmPaperBackground(buffer);

    const deviceScaleFactor = prevViewport ? 2 : 2;

    return {
      base64: buffer.toString('base64'),
      meta: prep,
      logicalWidth: prep.logicalWidth,
      logicalHeight: prep.logicalHeight,
      deviceScaleFactor
    };
  } finally {
    await page
      .evaluate(() => window.app?.teardownIgReflectionSlidePlaywrightCapture?.())
      .catch(() => {});
    if (prevViewport) await page.setViewportSize(prevViewport);
  }
}

async function captureIgReflectionCardsPng(page, options = {}) {
  return captureIgPlaywrightCardsPng(page, options, 'prepareIgReflectionSlidePlaywrightCapture');
}

async function captureIgYesterdayStatsCardsPng(page, options = {}) {
  return captureIgPlaywrightCardsPng(page, options, 'prepareIgYesterdayStatsSlidePlaywrightCapture');
}

module.exports = {
  captureIgReflectionCardsPng,
  captureIgYesterdayStatsCardsPng,
  captureIgPlaywrightCardsPng,
  keyOutWarmPaperBackground
};
