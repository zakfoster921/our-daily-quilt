#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Meet vs split-band quilt screen comparison (real renderer).
 *
 *   npm run split-band:compare
 *   DATE_KEYS=2026-07-07 npm run split-band:compare
 *
 * Output: tmp/split-band-compare/<dateKey>/{meet,split-band,contact-sheet}.png
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const admin = require('firebase-admin');
const { chromium } = require('playwright');
const sharp = require('sharp');
const { loadServerQuiltRuntime } = require('./lib/server-quilt-engine.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT_W = Math.max(320, Math.floor(Number(process.env.OUT_W) || 273));
const OUT_H = Math.max(568, Math.floor(Number(process.env.OUT_H) || 720));
const CONTACT_GAP = Math.max(0, Math.floor(Number(process.env.CONTACT_GAP) || 48));
const CONTACT_LABEL_H = Math.max(0, Math.floor(Number(process.env.CONTACT_LABEL_H) || 96));
const DEFAULT_DATE_KEYS = '2026-07-07';

function initFirestore() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID });
    return admin.firestore();
  }
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.join(ROOT, 'firebase-adminsdk-local.json');
  if (fs.existsSync(credPath)) {
    const sa = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID });
    return admin.firestore();
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID');
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
  return admin.firestore();
}

async function fetchDay(db, dateKey) {
  const snap = await db.collection('quilts').doc(dateKey).get();
  if (!snap.exists) throw new Error(`No quilts/${dateKey} in Firestore`);
  const data = snap.data() || {};
  const blocks = Array.isArray(data.blocks) ? JSON.parse(JSON.stringify(data.blocks)) : [];
  if (blocks.length <= 1) throw new Error(`quilts/${dateKey} has ${blocks.length} block(s)`);
  const contributorCount = Number(data.contributorCount) || 0;
  const submissionCount = Math.max(
    contributorCount,
    blocks.reduce((max, block) => {
      const n = Number(block?.submissionIndex);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0),
    blocks.length
  );
  return { dateKey, blocks, submissionCount, contributorCount, quiltData: data };
}

function splitBandMeta(blocks, dateKey, QuiltMirrorLayout) {
  const result = QuiltMirrorLayout?.computeSplitBandLayout
    ? QuiltMirrorLayout.computeSplitBandLayout({
        minX: Math.min(...blocks.map((b) => Number(b.x))),
        minY: Math.min(...blocks.map((b) => Number(b.y))),
        quiltW: Math.max(...blocks.map((b) => Number(b.x) + Number(b.width))) -
          Math.min(...blocks.map((b) => Number(b.x))),
        quiltH: Math.max(...blocks.map((b) => Number(b.y) + Number(b.height))) -
          Math.min(...blocks.map((b) => Number(b.y))),
        viewportW: OUT_W,
        viewportH: OUT_H,
        doubleSideBySide:
          QuiltMirrorLayout.odqNormalizeMirrorBottomLayout?.(
            QuiltMirrorLayout.odqReadMirrorTuneFromLocal?.(dateKey)?.bottomLayout
          ) === QuiltMirrorLayout.MIRROR_BOTTOM_LAYOUT_DOUBLE
      })
    : null;
  if (!result) return null;
  return {
    primaryScreenH: result.primaryScreenH,
    mirrorBandScreenH: result.mirrorBandScreenH,
    primaryScale: result.primaryScale,
    mirrorScaleX: result.mirrorScaleX,
    mirrorScaleY: result.mirrorScaleY
  };
}

function startStaticServer(splitBand, splitBandSimple = false) {
  const STATIC_MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
  };
  const server = http.createServer((req, res) => {
    const rawUrl = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(rawUrl.pathname.replace(/^\/+/, '') || 'index.html');
    if (rel === 'our-daily-beta') rel = 'our-daily-beta.html';
    if (!path.extname(rel)) rel = `${rel}.html`;
    const filePath = path.resolve(ROOT, rel);
    if (!filePath.startsWith(ROOT + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${rawUrl.pathname}`);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': STATIC_MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  });
  const params = new URLSearchParams({ compositionTester: '1' });
  params.set('splitBand', splitBand ? '1' : '0');
  if (splitBand && splitBandSimple) params.set('splitBandSimple', '1');
  const query = `?${params.toString()}`;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/our-daily-beta${query}`, splitBand });
    });
  });
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderPanel(page, panel, dateKey, quiltData = {}) {
  const renderCheck = await page.evaluate(async ({ blocks, submissionCount, panelDateKey, tuneSeed, viewportW, viewportH }) => {
    const app = window.app;
    document.querySelectorAll('.screen').forEach((screen) => {
      screen.classList.remove('active');
      screen.style.display = 'none';
      screen.style.visibility = 'hidden';
      screen.style.opacity = '0';
      screen.setAttribute('aria-hidden', 'true');
    });
    const connectionProblem = document.getElementById('screen-connection-problem');
    if (connectionProblem) {
      connectionProblem.hidden = true;
      connectionProblem.style.display = 'none';
    }
    const screen = document.getElementById('screen-quilt');
    screen?.classList.add('active');
    screen?.removeAttribute('hidden');
    screen?.setAttribute('aria-hidden', 'false');
    if (screen) {
      screen.style.display = 'flex';
      screen.style.visibility = 'visible';
      screen.style.opacity = '1';
    }

    const clonedBlocks = JSON.parse(JSON.stringify(blocks));
    app._loadedSharedQuiltDateKey = panelDateKey;
    if (tuneSeed && typeof globalThis.odqWriteMirrorTuneLocal === 'function') {
      globalThis.odqWriteMirrorTuneLocal(panelDateKey, tuneSeed);
    }
    app.dailyContributors = [];
    app.quiltEngine.blocks = clonedBlocks;
    app.quiltEngine.submissionCount = submissionCount;

    app.renderer?.setBacksidePreviewEnabled?.(app._isBacksidePreviewMode === true);
    if (app.renderer?.renderBlocks) {
      app.renderer.quiltSVG = document.getElementById('quilt');
      app.renderer._renderViewportOverride = { w: viewportW, h: viewportH };
      app.renderer.renderBlocks(clonedBlocks, [], submissionCount);
    } else if (typeof app.renderQuilt === 'function') {
      await app.renderQuilt();
    }

    const svg = document.getElementById('quilt');
    return {
      blockCount: Array.isArray(app.quiltEngine.blocks) ? app.quiltEngine.blocks.length : 0,
      splitBand: svg?.getAttribute('data-quilt-split-band') === '1',
      splitBandSimple: svg?.getAttribute('data-quilt-split-band-simple') === '1',
      hasPrimaryBand: !!svg?.querySelector('#quiltPrimaryBand'),
      hasMirrorBand: !!svg?.querySelector('#quiltMirrorBand'),
      hasDupLayers: !!svg?.querySelector('#quiltDuplicateBottomLayer1'),
      hasSingleMirror: !!svg?.querySelector('#quiltMirroredFieldLayer')
    };
  }, { blocks: panel.blocks, submissionCount: panel.submissionCount, panelDateKey: dateKey, tuneSeed: panel.tuneSeed, viewportW: OUT_W, viewportH: OUT_H });

  if (renderCheck.blockCount !== panel.blocks.length) {
    throw new Error(`${panel.mode}: expected ${panel.blocks.length} blocks, got ${renderCheck.blockCount}`);
  }
  if (panel.expectSplitBand && !renderCheck.splitBand) {
    throw new Error(`${panel.mode}: expected data-quilt-split-band=1`);
  }
  if (!panel.expectSplitBand && renderCheck.splitBand) {
    throw new Error(`${panel.mode}: split-band should be off`);
  }
  if (panel.expectSplitBandSimple && !renderCheck.splitBandSimple) {
    throw new Error(`${panel.mode}: expected data-quilt-split-band-simple=1`);
  }
  if (panel.expectSplitBandSimple && renderCheck.hasDupLayers) {
    throw new Error(`${panel.mode}: splitBandSimple should not render dup×2 layers`);
  }
  if (panel.expectSplitBandSimple && !renderCheck.hasSingleMirror) {
    throw new Error(`${panel.mode}: splitBandSimple expected single mirror layer`);
  }

  await page.waitForFunction(
    () => !!document.getElementById('quilt')?.querySelector('#quiltParallaxLayer rect, #quiltParallaxLayer polygon'),
    undefined,
    { timeout: 60000 }
  );

  await page.waitForTimeout(400);
  const screenshotBuffer = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: OUT_W, height: OUT_H },
    animations: 'disabled',
    timeout: 30000
  });
  return { ...panel, buffer: screenshotBuffer };
}

async function renderPanels(panels, dateKey, quiltData = {}) {
  const splitBandSimple = process.env.SPLIT_BAND_SIMPLE === '1';
  const servers = {
    meet: await startStaticServer(false),
    splitBand: await startStaticServer(true, splitBandSimple)
  };
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: OUT_W, height: OUT_H },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true
    });
    await page.addStyleTag({
      content: `
        html, body {
          margin: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          overflow: hidden !important;
          background: #f6f4f1 !important;
        }
        body > *:not(#app) { display: none !important; }
        .screen { display: none !important; }
        #screen-connection-problem, #screen-connection-problem *, .connection-problem-inner, .connection-problem-inner * {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        #screen-quilt {
          display: flex !important;
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          min-height: 100vh !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #f6f4f1 !important;
          z-index: 2147483647 !important;
        }
        #screen-quilt > :not(.quilt-container) { display: none !important; }
        #screen-quilt .quilt-container {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          max-width: none !important;
          margin: 0 !important;
          overflow: hidden !important;
          background: #f6f4f1 !important;
          z-index: 2147483647 !important;
        }
      `
    });

    const out = [];
    for (const panel of panels) {
      const url = panel.expectSplitBand ? servers.splitBand.url : servers.meet.url;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(
        () => !!window.app?.renderer && !!window.app?.quiltEngine && !!document.getElementById('quilt'),
        undefined,
        { timeout: 120000 }
      );
      await page.evaluate(() => {
        const app = window.app;
        if (!app) return;
        app.applyQuiltDataFromPayload = async () => {};
        app.attachQuiltLiveListener = () => {};
        app.loadQuiltFromServer = async () => ({ ok: false, reason: 'split_band_compare_disabled' });
        if (app.dataService) {
          app.dataService.loadQuiltFromServer = async () => ({ ok: false, reason: 'split_band_compare_disabled' });
        }
      });
      out.push(await renderPanel(page, panel, dateKey, quiltData));
    }
    return out;
  } finally {
    await browser.close().catch(() => {});
    await Promise.all(Object.values(servers).map(({ server }) => new Promise((resolve) => server.close(resolve))));
  }
}

async function writeContactSheet(panelImages, contactPath, cols = 2) {
  const columnCount = Math.min(cols, panelImages.length);
  const rows = Math.ceil(panelImages.length / columnCount);
  const tileW = OUT_W;
  const tileH = OUT_H;
  const resized = await Promise.all(
    panelImages.map((p) =>
      sharp(p.buffer).resize(tileW, tileH, { fit: 'contain', background: '#f6f4f1' }).png().toBuffer()
    )
  );
  const labelBuffers = panelImages.map((panel) => Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${CONTACT_LABEL_H}" viewBox="0 0 ${tileW} ${CONTACT_LABEL_H}">
      <rect width="${tileW}" height="${CONTACT_LABEL_H}" fill="#fff"/>
      <text x="20" y="36" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="24" font-weight="700" fill="#222">${esc(panel.label)}</text>
      <text x="20" y="64" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="15" fill="#666">${esc(panel.subtitle)}</text>
    </svg>
  `));
  const cellH = CONTACT_LABEL_H + tileH;
  await sharp({
    create: {
      width: tileW * columnCount + CONTACT_GAP * Math.max(0, columnCount - 1),
      height: cellH * rows + CONTACT_GAP * Math.max(0, rows - 1),
      channels: 3,
      background: '#fff'
    }
  })
    .composite(
      resized.flatMap((input, idx) => {
        const left = (idx % columnCount) * (tileW + CONTACT_GAP);
        const top = Math.floor(idx / columnCount) * (cellH + CONTACT_GAP);
        return [
          { input: labelBuffers[idx], left, top },
          { input, left, top: top + CONTACT_LABEL_H }
        ];
      })
    )
    .png()
    .toFile(contactPath);
}

function mirrorTuneSeedFromQuiltData(data = {}) {
  const pick = (key) => (data[key] != null ? data[key] : undefined);
  return {
    bottomLayout: pick('mirrorBottomLayout'),
    flipX: pick('mirrorFlipX'),
    flipY: pick('mirrorFlipY'),
    leftFlipX: pick('mirrorBottomLeftFlipX'),
    leftFlipY: pick('mirrorBottomLeftFlipY'),
    rightFlipX: pick('mirrorBottomRightFlipX'),
    rightFlipY: pick('mirrorBottomRightFlipY'),
    nudgeSeamY: pick('mirrorSeamNudgeY'),
    nudgeMirrorY: pick('mirrorFieldNudgeY'),
    nudgeTileSeamX: pick('mirrorTileSeamNudgeX'),
    nudgeLeftTileX: pick('mirrorBottomLeftNudgeX'),
    nudgeLeftTileY: pick('mirrorBottomLeftNudgeY'),
    nudgeRightTileY: pick('mirrorBottomRightNudgeY')
  };
}

async function renderDate(db, dateKey, QuiltMirrorLayout) {
  const day = await fetchDay(db, dateKey);
  const tuneSeed = mirrorTuneSeedFromQuiltData(day.quiltData);
  const meta = splitBandMeta(day.blocks, dateKey, QuiltMirrorLayout);
  const meetPanel = {
    mode: 'meet',
    label: `Meet — ${dateKey}`,
    subtitle: `${day.blocks.length} blocks · xMidYMin meet · all blocks visible`,
    blocks: day.blocks,
    submissionCount: day.submissionCount,
    expectSplitBand: false,
    tuneSeed
  };
  const splitBandSimple = process.env.SPLIT_BAND_SIMPLE === '1';
  const splitPanel = {
    mode: 'split-band',
    label: splitBandSimple ? `Split-band simple — ${dateKey}` : `Split-band — ${dateKey}`,
    subtitle: meta
      ? `${day.blocks.length} blocks · primary ${Math.round(meta.primaryScreenH)}px · mirror ${Math.round(meta.mirrorBandScreenH)}px${splitBandSimple ? ' · single mirror QA' : ''}`
      : `${day.blocks.length} blocks · width-fit primary + fill mirror`,
    blocks: day.blocks,
    submissionCount: day.submissionCount,
    expectSplitBand: true,
    expectSplitBandSimple: splitBandSimple,
    tuneSeed
  };

  console.log(`[split-band-compare] ${dateKey}: ${day.blocks.length} blocks`);

  const outDir = path.join(ROOT, 'tmp', 'split-band-compare', dateKey);
  fs.mkdirSync(outDir, { recursive: true });

  const panelImages = await renderPanels([meetPanel, splitPanel], dateKey);

  for (const panel of panelImages) {
    const pngPath = path.join(outDir, `${panel.mode}.png`);
    await sharp(panel.buffer).png().toFile(pngPath);
    console.log(`[split-band-compare] wrote ${pngPath}`);
  }

  const contactPath = path.join(outDir, 'contact-sheet.png');
  await writeContactSheet(panelImages, contactPath, 2);
  console.log(`[split-band-compare] wrote ${contactPath}`);

  const summary = {
    dateKey,
    blockCount: day.blocks.length,
    splitBand: meta,
    outputs: {
      meet: path.relative(ROOT, path.join(outDir, 'meet.png')),
      splitBand: path.relative(ROOT, path.join(outDir, 'split-band.png')),
      contactSheet: path.relative(ROOT, contactPath)
    }
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return { summary, panelImages };
}

async function main() {
  const { QuiltMirrorLayout } = loadServerQuiltRuntime();
  const db = initFirestore();
  const dateKeys = String(process.env.DATE_KEYS || process.env.DATE_KEY || DEFAULT_DATE_KEYS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allPanels = [];
  const summaries = [];
  for (const dateKey of dateKeys) {
    try {
      const { summary, panelImages } = await renderDate(db, dateKey, QuiltMirrorLayout);
      summaries.push(summary);
      allPanels.push(...panelImages);
    } catch (err) {
      console.error(`[split-band-compare] ${dateKey} FAILED:`, err.message);
    }
  }

  const outDir = path.join(ROOT, 'tmp', 'split-band-compare');
  fs.mkdirSync(outDir, { recursive: true });
  if (allPanels.length >= 2) {
    const masterPath = path.join(outDir, 'contact-sheet.png');
    await writeContactSheet(allPanels, masterPath, 2);
    console.log(`[split-band-compare] wrote ${masterPath}`);
  }
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summaries, null, 2)}\n`);
  console.log('[split-band-compare] done');
}

main().catch((err) => {
  console.error('[split-band-compare] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
