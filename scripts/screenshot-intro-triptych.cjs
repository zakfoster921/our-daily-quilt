#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Capture the three Zak intro screens side-by-side for cohesion review.
 *
 * Usage:
 *   npm start   # in another terminal
 *   npm run screenshot:intro-triptych
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tmp');
const OUT_FILE = path.join(OUT_DIR, 'intro-persona-triptych.png');
const LAB_URL =
  process.env.INTRO_TRIPTYCH_URL ||
  'http://127.0.0.1:3000/intro-persona-triptych-lab';

function probeUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(4000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  if (!(await probeUrl(LAB_URL))) {
    console.error(`Server not reachable at ${LAB_URL}`);
    console.error('Start the app first: npm start');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1320, height: 960 }
  });

  await page.goto(LAB_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);

  await page.screenshot({
    path: OUT_FILE,
    fullPage: true
  });

  await browser.close();
  console.log(`Saved ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
