#!/usr/bin/env node
/* eslint-disable no-console */
/** Preview quote + contributor clippings on a colorful quilt-like bg — corner white-square check. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tmp');
const DATE_KEY = process.env.SMOKE_CLIPPING_DATE_KEY || '2026-07-07';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(
    `<!DOCTYPE html><html><head>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap">
    </head><body></body></html>`,
    { waitUntil: 'networkidle' }
  );
  for (const rel of [
    'lib/quote-keyword-emphasis.js',
    'lib/layout-b-keyword-emphasis.js',
    'lib/quilt-newspaper-clipping.js'
  ]) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, rel), 'utf8') });
  }

  const payload = await page.evaluate(async (dateKey) => {
    const api = globalThis.QuiltNewspaperClipping;
    const cfg = api.withClippingTypography({ ...api.DEFAULTS, width: 1080 });
    await Promise.all([
      api.ensureNewspaperClippingFonts([cfg.bodyPx, cfg.centerBodyPx]),
      api.ensureClippingSurfaceAssets(cfg)
    ]);

    const quote = {
      dateKey,
      yesterday: {
        text: 'Follow your bliss and the universe will open doors where there were only walls.',
        author: 'Joseph Campbell'
      },
      today: {
        text:
          "We don't have to engage in grand, heroic actions to participate in the process of change. Small acts, when multiplied by millions of people, can transform the world.",
        author: 'Howard Zinn',
        keyword: 'Small acts, transform the world.',
        first_line_count: 5
      },
      tomorrow: {
        text: 'We are the myths we tell ourselves about ourselves.',
        author: 'Jean Houston'
      }
    };

    const quoteUrl = await api.composeDataUrl(quote);
    const contrib = await api.composeContributorListDataUrl({
      dateKey,
      names: ['Jimin', 'Noella', 'Ellie', 'Josh', 'Sam', 'Rosa'],
      width: 1080,
      returnCanvas: true
    });
    const contribUrl =
      typeof contrib === 'string' ? contrib : contrib?.dataUrl || contrib?.clippedCanvas?.toDataURL?.('image/png');

    function cornerReport(dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const w = c.width;
          const h = c.height;
          const sample = (x, y) => {
            const d = ctx.getImageData(x, y, 1, 1).data;
            return { a: d[3], rgb: [d[0], d[1], d[2]] };
          };
          resolve({
            size: [w, h],
            corners: [
              [1, 1],
              [w - 2, 1],
              [1, h - 2],
              [w - 2, h - 2]
            ].map(([x, y]) => ({ x, y, ...sample(x, y) }))
          });
        };
        img.onerror = reject;
        img.src = dataUrl;
      });
    }

    return {
      rev: api.CLIPPING_EXPORT_REV,
      quoteUrl,
      contribUrl,
      quoteCorners: await cornerReport(quoteUrl),
      contribCorners: contribUrl ? await cornerReport(contribUrl) : null
    };
  }, DATE_KEY);

  await browser.close();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const writePng = (name, dataUrl) => {
    const buf = Buffer.from(String(dataUrl).split(',')[1], 'base64');
    const out = path.join(OUT_DIR, name);
    fs.writeFileSync(out, buf);
    return name;
  };

  const quotePng = writePng('clipping-corner-preview-quote.png', payload.quoteUrl);
  const contribPng = payload.contribUrl
    ? writePng('clipping-corner-preview-contrib.png', payload.contribUrl)
    : null;

  const htmlPath = path.join(OUT_DIR, 'clipping-corner-preview.html');
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Clipping corner preview (rev ${payload.rev})</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #2a3038;
    color: #f2efe8;
    padding: 24px;
  }
  h1 { font-size: 1rem; margin: 0 0 6px; }
  p { margin: 0 0 18px; color: #c8c2b8; font-size: 0.88rem; line-height: 1.45; }
  .panel {
    position: relative;
    width: min(420px, 100%);
    margin: 0 auto 28px;
    padding: 28px 18px;
    border-radius: 12px;
    overflow: hidden;
    background:
      linear-gradient(135deg, #6ec7b6 0 18%, transparent 18% 22%),
      linear-gradient(225deg, #d45d5d 0 16%, transparent 16% 20%),
      linear-gradient(45deg, #8b6fd4 0 14%, transparent 14% 18%),
      linear-gradient(315deg, #d4c85a 0 12%, transparent 12% 16%),
      repeating-linear-gradient(0deg, #5a9e8a 0 42px, #4f8d7c 42px 84px),
      repeating-linear-gradient(90deg, #7d6bb8 0 56px, #6a5aa0 56px 112px);
    background-color: #79b8a8;
  }
  .panel h2 {
    margin: 0 0 12px;
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.92);
    text-shadow: 0 1px 2px rgba(0,0,0,0.35);
  }
  .clip-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 120px;
  }
  img.clip {
    display: block;
    max-width: 100%;
    height: auto;
    filter: drop-shadow(0 4px 14px rgba(45, 36, 29, 0.14))
      drop-shadow(0 1px 3px rgba(45, 36, 29, 0.1));
  }
  pre {
    margin: 14px 0 0;
    padding: 10px 12px;
    background: rgba(0,0,0,0.28);
    border-radius: 8px;
    font-size: 0.72rem;
    overflow: auto;
    white-space: pre-wrap;
  }
</style></head><body>
<h1>Hand-cut clipping — no outside white squares</h1>
<p>Rev ${payload.rev}. Colorful quilt-like panels below: any white corner squares outside the paper silhouette should be gone (corners transparent → show patchwork).</p>
<div class="panel">
  <h2>Quote clipping</h2>
  <div class="clip-wrap"><img class="clip" src="${quotePng}" alt="quote clipping" /></div>
  <pre>${JSON.stringify(payload.quoteCorners, null, 2)}</pre>
</div>
${
  contribPng
    ? `<div class="panel">
  <h2>Contributor clipping</h2>
  <div class="clip-wrap"><img class="clip" src="${contribPng}" alt="contributor clipping" /></div>
  <pre>${JSON.stringify(payload.contribCorners, null, 2)}</pre>
</div>`
    : ''
}
</body></html>`;

  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`[preview] ${htmlPath}`);
  console.log(`[preview] quote corners:`, JSON.stringify(payload.quoteCorners.corners));
  if (payload.contribCorners) {
    console.log(`[preview] contrib corners:`, JSON.stringify(payload.contribCorners.corners));
  }

  try {
    execSync(`open "${htmlPath}"`, { stdio: 'inherit' });
  } catch (_) {
    console.log('[preview] open manually:', htmlPath);
  }
}

main().catch((err) => {
  console.error('[preview] failed:', err?.stack || err);
  process.exit(1);
});
