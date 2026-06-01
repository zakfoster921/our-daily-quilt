#!/usr/bin/env node
/* eslint-disable no-console */
/** Render assets/library-pocket-empty.png from archive/html/library-pocket-lab.html (card inpainted out). */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const LAB_HTML = path.join(ROOT, 'archive/html/library-pocket-lab.html');
const OUT_CUTOUT = path.join(ROOT, 'assets', 'library-pocket-empty.png');

async function main() {
  if (!fs.existsSync(LAB_HTML)) {
    console.error('Missing', LAB_HTML);
    process.exit(1);
  }

  const sourcePath = path.join(ROOT, 'assets', 'library-pocket-source.png');
  const dataUrl = `data:image/png;base64,${fs.readFileSync(sourcePath).toString('base64')}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await page.addInitScript((url) => {
    window.__LIBRARY_POCKET_SOURCE_URL = url;
  }, dataUrl);
  await page.goto(`file://${LAB_HTML}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__renderLibraryPocket === 'function');
  const meta = await page.evaluate(async () => window.__renderLibraryPocket());
  const canvas = page.locator('#cutout');
  await canvas.screenshot({ path: OUT_CUTOUT, type: 'png', omitBackground: true });
  await browser.close();

  console.log('Wrote', OUT_CUTOUT, meta);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
