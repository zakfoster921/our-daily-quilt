'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const rawUrl = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(rawUrl.pathname).replace(/^\/+/, '') || 'index.html';
    if (rel === 'quilt-render-shell') rel = 'scripts/quilt-render-shell.html';
    const filePath = path.join(ROOT, rel);
    if (!filePath.startsWith(ROOT + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': STATIC_MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/quilt-render-shell`
      });
    });
  });
}

async function renderBlocksToPng(browser, shellUrl, blocks, submissionCount, dateKey, outPath) {
  const page = await browser.newPage({
    viewport: { width: 273, height: 720 },
    deviceScaleFactor: 2
  });
  try {
    await page.goto(shellUrl, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__renderReady === true, undefined, { timeout: 30000 });
    const stats = await page.evaluate(
      ({ blocks, submissionCount, dateKey }) =>
        window.__renderQuiltBlocks(blocks, submissionCount, dateKey),
      { blocks, submissionCount, dateKey }
    );
    // Full-page clip avoids Playwright waiting for huge SVG trees to become "stable".
    await page.screenshot({
      path: outPath,
      type: 'png',
      animations: 'disabled',
      clip: { x: 0, y: 0, width: 273, height: 720 }
    });
    return stats;
  } finally {
    await page.close();
  }
}

async function renderPanelsFast(panels, dateKey, outDir) {
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const out = [];
    for (const panel of panels) {
      const pngPath = path.join(outDir, `panel-${panel.id}.png`);
      const stats = await renderBlocksToPng(
        browser,
        url,
        panel.blocks,
        panel.submissionCount,
        dateKey,
        pngPath
      );
      out.push({ ...panel, pngPath, stats });
    }
    return out;
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}

module.exports = {
  renderPanelsFast,
  startStaticServer,
  renderBlocksToPng
};
