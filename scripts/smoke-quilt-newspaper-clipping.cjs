#!/usr/bin/env node
/* eslint-disable no-console */
/** Smoke test: canvas composer returns a PNG data URL (headless Chromium). */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(
    `<!DOCTYPE html><html><head>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap">
    </head><body></body></html>`,
    { waitUntil: 'domcontentloaded' }
  );
  for (const rel of [
    'lib/quote-keyword-emphasis.js',
    'lib/layout-b-keyword-emphasis.js',
    'lib/quilt-newspaper-clipping.js'
  ]) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    await page.addScriptTag({ content: src });
  }
  const dataUrl = await page.evaluate(async () => {
    return globalThis.QuiltNewspaperClipping.composeDataUrl({
      yesterday: {
        text: 'Yesterday whispers along the margin.',
        author: 'A. Neighbor',
        keyword: 'whispers'
      },
      today: {
        text: 'Today we stitch one more color into the quilt of our shared days.',
        author: 'B. Center',
        keyword: 'stitch,color'
      },
      tomorrow: {
        text: 'Tomorrow opens like a door left ajar.',
        author: 'C. Next',
        keyword: 'door'
      }
    });
  });
  await browser.close();
  if (!dataUrl || !String(dataUrl).startsWith('data:image/png')) {
    throw new Error('composeDataUrl did not return PNG data URL');
  }
  const out = path.join(root, 'tmp', 'smoke-newspaper-clipping.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`[smoke] wrote ${out} (${fs.statSync(out).size} bytes)`);
}

main().catch((err) => {
  console.error('[smoke] failed:', err?.stack || err);
  process.exit(1);
});
