#!/usr/bin/env node
'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const GUIDE =
  'Spent a career as an astrophysicist and public communicator making the case that scientific literacy is not a luxury but a practical tool for navigating reality.';
const KEYWORDS = 'astrophysicist, scientific literacy is not a luxury';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const markerCss = `
#screen-quilt .quote-speaker-guide { position: relative; margin: 0; font-size: 18px; line-height: 1.22; width: 200px; color: #333; }
#screen-quilt .quote-speaker-guide .speaker-guide-marker { display: contents; }
#screen-quilt .quote-speaker-guide .speaker-guide-marker__stroke { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; overflow: visible; transform: translate(-50%,-50%); }
#screen-quilt .quote-speaker-guide .speaker-guide-marker__text { position: relative; z-index: 1; transform: rotate(0.12deg); }
`;
  await page.setContent(
    '<div id="screen-quilt"><p class="quote-speaker-guide" id="guide"></p></div>'
  );
  await page.addStyleTag({ content: markerCss });
  await page.addScriptTag({ path: path.join(ROOT, 'lib/quote-keyword-emphasis.js') });
  await page.addScriptTag({ path: path.join(ROOT, 'lib/speaker-guide-marker.js') });
  await page.waitForFunction(() => globalThis.SpeakerGuideMarker?.applySpeakerGuideMarker);
  await page.evaluate(
    ({ guide, keywords }) => {
      const el = document.getElementById('guide');
      globalThis.SpeakerGuideMarker.applySpeakerGuideMarker(el, guide, keywords);
    },
    { guide: GUIDE, keywords: KEYWORDS }
  );
  await page.waitForTimeout(100);
  const result = await page.evaluate(() => {
    const textEl = [...document.querySelectorAll('.speaker-guide-marker__text')].find((el) =>
      (el.textContent || '').includes('scientific literacy')
    );
    if (!textEl) return { ok: false, reason: 'no long-phrase text el' };
    const rects = [...textEl.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    const tops = [...new Set(rects.map((r) => Math.round(r.top)))];
    return { ok: tops.length > 1, lineCount: tops.length, tops };
  });
  await browser.close();
  if (!result.ok) {
    console.error('FAIL: emphasis text did not wrap to multiple lines', result);
    process.exit(1);
  }
  console.log('OK: emphasis wraps across', result.lineCount, 'lines');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
