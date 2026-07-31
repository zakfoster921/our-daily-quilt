#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Playwright screenshot of the live reflection wall DOM (paper, tape, clip-path).
 * Used by preview-ig-carousel and nightly IG when building slide 2 reflection.
 */
async function captureIgReflectionCardsPng(page, options = {}) {
  const prevViewport = page.viewportSize?.() || null;
  await page.setViewportSize({ width: 980, height: 1400 });

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

    const buffer = await locator.screenshot({
      type: 'png',
      omitBackground: true,
      animations: 'disabled'
    });

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

module.exports = { captureIgReflectionCardsPng };
