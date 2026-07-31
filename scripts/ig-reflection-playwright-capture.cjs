#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Playwright screenshot of the live reflection wall DOM (paper, tape, clip-path).
 * Used by preview-ig-carousel and nightly IG when building slide 2 reflection.
 */
async function captureIgReflectionCardsPng(page, options = {}) {
  const prep = await page.evaluate(async (opts) => {
    const app = window.app;
    if (typeof app?.prepareIgReflectionSlidePlaywrightCapture !== 'function') {
      throw new Error('app.prepareIgReflectionSlidePlaywrightCapture missing');
    }
    return app.prepareIgReflectionSlidePlaywrightCapture(opts);
  }, options);
  if (!prep?.selector) return null;

  try {
    await page.evaluate(() => document.fonts?.ready?.catch?.(() => {}));
    await page.waitForTimeout(350);

    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.style.opacity = '1';
      el.style.visibility = 'visible';
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return {
        x: Math.max(0, r.x),
        y: Math.max(0, r.y),
        width: r.width,
        height: r.height
      };
    }, prep.selector);

    if (!box || box.width < 4 || box.height < 4) {
      throw new Error(`Reflection capture host has no layout (${JSON.stringify(box)})`);
    }

    const buffer = await page.screenshot({
      type: 'png',
      omitBackground: false,
      clip: {
        x: box.x,
        y: box.y,
        width: Math.min(box.width, 2000),
        height: Math.min(box.height, 2000)
      }
    });

    return {
      base64: buffer.toString('base64'),
      meta: prep,
      logicalWidth: prep.logicalWidth,
      logicalHeight: prep.logicalHeight
    };
  } finally {
    await page
      .evaluate(() => window.app?.teardownIgReflectionSlidePlaywrightCapture?.())
      .catch(() => {});
  }
}

module.exports = { captureIgReflectionCardsPng };
