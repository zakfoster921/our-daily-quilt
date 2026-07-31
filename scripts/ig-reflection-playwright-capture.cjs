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
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (Math.abs(r - 246) <= 10 && Math.abs(g - 244) <= 10 && Math.abs(b - 241) <= 10) {
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

async function captureIgReflectionCardsPng(page, options = {}) {
  const prevViewport = page.viewportSize?.() || null;
  await page.setViewportSize({ width: 1080, height: 1500 });

  const prep = await page.evaluate(async (opts) => {
    const app = window.app;
    if (typeof app?.prepareIgReflectionSlidePlaywrightCapture !== 'function') {
      throw new Error('app.prepareIgReflectionSlidePlaywrightCapture missing');
    }
    return app.prepareIgReflectionSlidePlaywrightCapture(opts);
  }, options);
  if (!prep?.selector) {
    if (prevViewport) await page.setViewportSize(prevViewport);
    return null;
  }

  try {
    await page.evaluate(() => document.fonts?.ready?.catch?.(() => {}));
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

module.exports = { captureIgReflectionCardsPng, keyOutWarmPaperBackground };
