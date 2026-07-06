#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Primary quilt vs quilt-screen mirror seam (real renderer).
 *
 *   npm run mirror:compare
 *   DATE_KEYS=2026-04-25,2026-06-10,2026-06-16,2026-06-22,2026-06-30,2026-07-03 npm run mirror:compare
 *
 * Output:
 *   tmp/mirror-seam-compare/<dateKey>/primary.png, duplicate.png, flip-y.png, flip-x.png, fit-bottom.png, double-bottom.png, double-bottom-flip-left.png, quadrant-four-up.png, quilt-screen.png, contact-sheet.png
 *   tmp/mirror-seam-compare/contact-sheet.png (all dates)
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
const OUT_W = Math.max(320, Math.floor(Number(process.env.OUT_W) || 390));
const OUT_H = Math.max(568, Math.floor(Number(process.env.OUT_H) || 844));
const CONTACT_GAP = Math.max(0, Math.floor(Number(process.env.CONTACT_GAP) || 48));
const CONTACT_LABEL_H = Math.max(0, Math.floor(Number(process.env.CONTACT_LABEL_H) || 96));
const DEFAULT_DATE_KEYS = '2026-04-25,2026-06-10,2026-06-16,2026-06-22,2026-06-30,2026-07-03';

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
  return { dateKey, blocks, submissionCount, contributorCount };
}

function mirrorMeta(blocks, dateKey, QuiltMirrorLayout) {
  const result = QuiltMirrorLayout?.computeFromBlocks
    ? QuiltMirrorLayout.computeFromBlocks(blocks, {
        dateKey,
        viewportW: OUT_W,
        viewportH: OUT_H
      })
    : null;
  if (!result) return null;
  const layout = result.layout || {};
  const vb = result.viewBox || {};
  const minY = Math.min(...blocks.map((b) => Number(b.y)));
  const maxY = Math.max(...blocks.map((b) => Number(b.y) + Number(b.height)));
  const quiltH = maxY - minY;
  const fitScale = QuiltMirrorLayout?.duplicateFitBottomScale
    ? QuiltMirrorLayout.duplicateFitBottomScale(0, minY, quiltH, vb.y, vb.height)
    : null;
  return {
    overlapPercent: layout.overlapPercent,
    targetSeamFraction: layout.targetSeamFraction,
    seamFraction: vb.seamFraction,
    shapeCapped: layout.shapeCapped === true,
    mirrorSeamOffset: result.mirrorSeamOffset,
    fitScale,
    primaryVisibleFraction: vb.height && blocks.length
      ? Math.min(1, quiltH / vb.height)
      : null
  };
}

function startStaticServer(mode) {
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
  if (mode === 'primary') params.set('primaryOnly', '1');
  else if (mode === 'duplicate') params.set('duplicateNoMirror', '1');
  else if (mode === 'flipY') params.set('duplicateFlipY', '1');
  else if (mode === 'flipX') params.set('duplicateFlipX', '1');
  else if (mode === 'fitBottom') params.set('duplicateFitBottom', '1');
  else if (mode === 'doubleBottom') params.set('duplicateDoubleBottom', '1');
  else if (mode === 'doubleBottomFlipLeft') params.set('duplicateDoubleBottomFlipLeft', '1');
  else if (mode === 'quadrantFourUp') params.set('quadrantFourUp', '1');
  const query = `?${params.toString()}`;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/our-daily-beta${query}`, mode });
    });
  });
}

function panelUrlForMode(servers, panel) {
  if (panel.expectPrimaryOnly) return servers.primary.url;
  if (panel.expectDuplicate) return servers.duplicate.url;
  if (panel.expectFlipY) return servers.flipY.url;
  if (panel.expectFlipX) return servers.flipX.url;
  if (panel.expectFitBottom) return servers.fitBottom.url;
  if (panel.expectDoubleBottom) return servers.doubleBottom.url;
  if (panel.expectDoubleBottomFlipLeft) return servers.doubleBottomFlipLeft.url;
  if (panel.expectQuadrantFourUp) return servers.quadrantFourUp.url;
  return servers.screen.url;
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderPanel(page, panel, dateKey) {
  const renderCheck = await page.evaluate(async ({ blocks, submissionCount, panelDateKey }) => {
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
    app.dailyContributors = [];
    app.quiltEngine.blocks = clonedBlocks;
    app.quiltEngine.submissionCount = submissionCount;

    app.renderer?.setBacksidePreviewEnabled?.(app._isBacksidePreviewMode === true);
    if (app.renderer?.renderBlocks) {
      app.renderer.quiltSVG = document.getElementById('quilt');
      app.renderer.renderBlocks(clonedBlocks, [], submissionCount);
    } else if (typeof app.renderQuilt === 'function') {
      await app.renderQuilt();
    }

    const svg = document.getElementById('quilt');
    return {
      blockCount: Array.isArray(app.quiltEngine.blocks) ? app.quiltEngine.blocks.length : 0,
      hasMirror: !!svg?.querySelector('#quiltMirroredFieldLayer'),
      primaryOnly: svg?.getAttribute('data-primary-only-preview') === '1'
    };
  }, { blocks: panel.blocks, submissionCount: panel.submissionCount, panelDateKey: dateKey });

  if (renderCheck.blockCount !== panel.blocks.length) {
    throw new Error(`${panel.mode}: expected ${panel.blocks.length} blocks, got ${renderCheck.blockCount}`);
  }
  if (panel.expectMirror) {
    await page.waitForFunction(
      () => {
        const svg = document.getElementById('quilt');
        const layer = svg?.querySelector('#quiltMirroredFieldLayer');
        const transform = layer?.getAttribute('transform') || '';
        return !!layer
          && transform.includes('scale(-1 -1)')
          && !!svg?.querySelector('#quiltParallaxLayer rect, #quiltParallaxLayer polygon');
      },
      undefined,
      { timeout: 60000 }
    );
  } else if (panel.expectDuplicate) {
    await page.waitForFunction(
      () => {
        const svg = document.getElementById('quilt');
        const layer = svg?.querySelector('#quiltMirroredFieldLayer[data-duplicate-no-mirror="1"]');
        const transform = layer?.getAttribute('transform') || '';
        return !!layer
          && !transform.includes('scale(-1')
          && !transform.includes('scale(1 -1)')
          && !!svg?.querySelector('#quiltParallaxLayer rect, #quiltParallaxLayer polygon');
      },
      undefined,
      { timeout: 60000 }
    );
  } else if (panel.expectFlipY) {
    await page.waitForFunction(
      () => {
        const svg = document.getElementById('quilt');
        const layer = svg?.querySelector('#quiltMirroredFieldLayer[data-duplicate-flip-y="1"]');
        const transform = layer?.getAttribute('transform') || '';
        return !!layer
          && transform.includes('scale(1 -1)')
          && !transform.includes('scale(-1 -1)')
          && !!svg?.querySelector('#quiltParallaxLayer rect, #quiltParallaxLayer polygon');
      },
      undefined,
      { timeout: 60000 }
    );
  } else if (panel.expectFlipX) {
    await page.waitForFunction(
      () => {
        const svg = document.getElementById('quilt');
        const layer = svg?.querySelector('#quiltMirroredFieldLayer[data-duplicate-flip-x="1"]');
        const transform = layer?.getAttribute('transform') || '';
        return !!layer
          && transform.includes('scale(-1 1)')
          && !transform.includes('scale(-1 -1)')
          && !!svg?.querySelector('#quiltParallaxLayer rect, #quiltParallaxLayer polygon');
      },
      undefined,
      { timeout: 60000 }
    );
  } else if (panel.expectFitBottom) {
    await page.waitForFunction(
      () => {
        const svg = document.getElementById('quilt');
        const layer = svg?.querySelector('#quiltMirroredFieldLayer[data-duplicate-fit-bottom="1"]');
        const transform = layer?.getAttribute('transform') || '';
        return !!layer
          && transform.includes('scale(1 ')
          && !!svg?.querySelector('#quiltParallaxLayer rect, #quiltParallaxLayer polygon');
      },
      undefined,
      { timeout: 60000 }
    );
  } else if (panel.expectQuadrantFourUp) {
    await page.waitForFunction(
      () => {
        const svg = document.getElementById('quilt');
        const tr = svg?.querySelector('[data-quadrant-tr="1"]');
        const bl = svg?.querySelector('[data-quadrant-bl="1"]');
        const br = svg?.querySelector('[data-quadrant-br="1"]');
        const trT = tr?.getAttribute('transform') || '';
        const blT = bl?.getAttribute('transform') || '';
        const brT = br?.getAttribute('transform') || '';
        return !!tr && trT.includes('scale(-1 1)') && !trT.includes('scale(-1 -1)')
          && !!bl && blT.includes('scale(1 -1)') && !blT.includes('scale(-1 -1)')
          && !!br && brT.includes('scale(-1 -1)')
          && !!svg?.querySelector('#quiltParallaxLayer rect, #quiltParallaxLayer polygon');
      },
      undefined,
      { timeout: 60000 }
    );
  } else if (panel.expectDoubleBottomFlipLeft) {
    await page.waitForFunction(
      () => {
        const svg = document.getElementById('quilt');
        const layer1 = svg?.querySelector('[data-duplicate-double-bottom-flip-left-1="1"]');
        const transform = layer1?.getAttribute('transform') || '';
        return !!layer1
          && transform.includes('scale(-1 1)')
          && !!svg?.querySelector('[data-duplicate-double-bottom-2="1"]')
          && !!svg?.querySelector('#quiltParallaxLayer rect, #quiltParallaxLayer polygon');
      },
      undefined,
      { timeout: 60000 }
    );
  } else if (panel.expectDoubleBottom) {
    await page.waitForFunction(
      () => {
        const svg = document.getElementById('quilt');
        return !!svg?.querySelector('[data-duplicate-double-bottom-1="1"]')
          && !!svg?.querySelector('[data-duplicate-double-bottom-2="1"]')
          && !!svg?.querySelector('#quiltParallaxLayer rect, #quiltParallaxLayer polygon');
      },
      undefined,
      { timeout: 60000 }
    );
  } else {
    await page.waitForFunction(
      () => {
        const svg = document.getElementById('quilt');
        return !!svg?.querySelector('#quiltParallaxLayer rect, #quiltParallaxLayer polygon')
          && !svg?.querySelector('#quiltMirroredFieldLayer');
      },
      undefined,
      { timeout: 60000 }
    );
  }

  await page.waitForTimeout(400);
  const screenshotBuffer = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: OUT_W, height: OUT_H },
    animations: 'disabled',
    timeout: 30000
  });
  return { ...panel, buffer: screenshotBuffer };
}

async function renderPanelsWithRealQuiltRenderer(panels, dateKey) {
  const servers = {
    primary: await startStaticServer('primary'),
    duplicate: await startStaticServer('duplicate'),
    flipY: await startStaticServer('flipY'),
    flipX: await startStaticServer('flipX'),
    fitBottom: await startStaticServer('fitBottom'),
    doubleBottom: await startStaticServer('doubleBottom'),
    doubleBottomFlipLeft: await startStaticServer('doubleBottomFlipLeft'),
    quadrantFourUp: await startStaticServer('quadrantFourUp'),
    screen: await startStaticServer('screen')
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
      const url = panelUrlForMode(servers, panel);
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
        app.loadQuiltFromServer = async () => ({ ok: false, reason: 'mirror_compare_disabled' });
        if (app.dataService) {
          app.dataService.loadQuiltFromServer = async () => ({ ok: false, reason: 'mirror_compare_disabled' });
        }
      });
      out.push(await renderPanel(page, panel, dateKey));
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

function formatDuplicateSubtitle(meta, blockCount) {
  if (!meta) return `${blockCount} blocks · stacked copy · same seam band · no flip`;
  const overlap = Number.isFinite(meta.overlapPercent) ? `${(meta.overlapPercent * 100).toFixed(1)}% overlap` : '';
  const seam = Number.isFinite(meta.seamFraction)
    ? `seam @ ${(meta.seamFraction * 100).toFixed(0)}% viewport`
    : '';
  return [ `${blockCount} blocks`, 'stacked copy', 'no flip', overlap, seam ].filter(Boolean).join(' · ');
}

function formatFlipYSubtitle(meta, blockCount) {
  if (!meta) return `${blockCount} blocks · bottom copy · flip Y only`;
  const overlap = Number.isFinite(meta.overlapPercent) ? `${(meta.overlapPercent * 100).toFixed(1)}% overlap` : '';
  const seam = Number.isFinite(meta.seamFraction)
    ? `seam @ ${(meta.seamFraction * 100).toFixed(0)}% viewport`
    : '';
  return [ `${blockCount} blocks`, 'flip Y only', overlap, seam ].filter(Boolean).join(' · ');
}

function formatFlipXSubtitle(meta, blockCount) {
  if (!meta) return `${blockCount} blocks · bottom copy · flip X only`;
  const overlap = Number.isFinite(meta.overlapPercent) ? `${(meta.overlapPercent * 100).toFixed(1)}% overlap` : '';
  const seam = Number.isFinite(meta.seamFraction)
    ? `seam @ ${(meta.seamFraction * 100).toFixed(0)}% viewport`
    : '';
  return [ `${blockCount} blocks`, 'flip X only', overlap, seam ].filter(Boolean).join(' · ');
}

function formatFitBottomSubtitle(meta, blockCount) {
  if (!meta) return `${blockCount} blocks · compressed to fit bottom band`;
  const scale = Number.isFinite(meta.fitScale) ? `Y ${(meta.fitScale * 100).toFixed(0)}%` : '';
  const seam = Number.isFinite(meta.seamFraction)
    ? `seam @ ${(meta.seamFraction * 100).toFixed(0)}% viewport`
    : '';
  return [ `${blockCount} blocks`, 'fit bottom', 'full width', scale, seam ].filter(Boolean).join(' · ');
}

function formatDoubleBottomSubtitle(meta, blockCount) {
  if (!meta) return `${blockCount} blocks · 2× side-by-side · vertical seam`;
  const overlap = Number.isFinite(meta.overlapPercent) ? `${(meta.overlapPercent * 100).toFixed(1)}% overlap` : '';
  const seam = Number.isFinite(meta.seamFraction)
    ? `seam @ ${(meta.seamFraction * 100).toFixed(0)}% viewport`
    : '';
  return [ `${blockCount} blocks`, '3× quilt', '2 side-by-side below', 'standard crop', overlap, seam ].filter(Boolean).join(' · ');
}

function formatDoubleBottomFlipLeftSubtitle(meta, blockCount) {
  if (!meta) return `${blockCount} blocks · dup ×2 · dup1 flip X`;
  const overlap = Number.isFinite(meta.overlapPercent) ? `${(meta.overlapPercent * 100).toFixed(1)}% overlap` : '';
  const seam = Number.isFinite(meta.seamFraction)
    ? `seam @ ${(meta.seamFraction * 100).toFixed(0)}% viewport`
    : '';
  return [ `${blockCount} blocks`, 'dup ×2', 'dup1 flip X', overlap, seam ].filter(Boolean).join(' · ');
}

function formatQuadrantFourUpSubtitle(meta, blockCount) {
  if (!meta) return `${blockCount} blocks · 4 quadrants · TL TR BL BR mirrors`;
  const overlap = Number.isFinite(meta.overlapPercent) ? `${(meta.overlapPercent * 100).toFixed(1)}% overlap` : '';
  return [ `${blockCount} blocks`, '4-up', 'full primary guaranteed', overlap ].filter(Boolean).join(' · ');
}

function formatMirrorSubtitle(meta, blockCount, contributorCount) {
  if (!meta) return `${blockCount} blocks · ${contributorCount || blockCount} contributors`;
  const overlap = Number.isFinite(meta.overlapPercent) ? `${(meta.overlapPercent * 100).toFixed(1)}% overlap` : '';
  const seam = Number.isFinite(meta.seamFraction)
    ? `seam @ ${(meta.seamFraction * 100).toFixed(0)}% viewport`
    : '';
  const cap = meta.shapeCapped ? 'shape-capped' : '';
  return [ `${blockCount} blocks`, 'mirrored', overlap, seam, cap ].filter(Boolean).join(' · ');
}

async function renderDate(db, dateKey, QuiltMirrorLayout) {
  const day = await fetchDay(db, dateKey);
  const meta = mirrorMeta(day.blocks, dateKey, QuiltMirrorLayout);
  const mirrorSubtitle = formatMirrorSubtitle(meta, day.blocks.length, day.contributorCount);

  const primaryPanel = {
    mode: 'primary',
    label: `Primary — ${dateKey}`,
    subtitle: `${day.blocks.length} blocks · contributor field only · no mirror`,
    blocks: day.blocks,
    submissionCount: day.submissionCount,
    expectPrimaryOnly: true,
    expectDuplicate: false,
    expectFlipY: false,
    expectFlipX: false,
    expectFitBottom: false,
    expectDoubleBottom: false,
    expectDoubleBottomFlipLeft: false,
    expectMirror: false
  };
  const duplicatePanel = {
    mode: 'duplicate',
    label: `Duplicate — ${dateKey}`,
    subtitle: formatDuplicateSubtitle(meta, day.blocks.length),
    blocks: day.blocks,
    submissionCount: day.submissionCount,
    expectPrimaryOnly: false,
    expectDuplicate: true,
    expectFlipY: false,
    expectFlipX: false,
    expectFitBottom: false,
    expectDoubleBottom: false,
    expectDoubleBottomFlipLeft: false,
    expectMirror: false
  };
  const flipYPanel = {
    mode: 'flip-y',
    label: `Flip Y — ${dateKey}`,
    subtitle: formatFlipYSubtitle(meta, day.blocks.length),
    blocks: day.blocks,
    submissionCount: day.submissionCount,
    expectPrimaryOnly: false,
    expectDuplicate: false,
    expectFlipY: true,
    expectFlipX: false,
    expectFitBottom: false,
    expectDoubleBottom: false,
    expectMirror: false
  };
  const flipXPanel = {
    mode: 'flip-x',
    label: `Flip X — ${dateKey}`,
    subtitle: formatFlipXSubtitle(meta, day.blocks.length),
    blocks: day.blocks,
    submissionCount: day.submissionCount,
    expectPrimaryOnly: false,
    expectDuplicate: false,
    expectFlipY: false,
    expectFlipX: true,
    expectFitBottom: false,
    expectMirror: false
  };
  const fitBottomPanel = {
    mode: 'fit-bottom',
    label: `Fit bottom — ${dateKey}`,
    subtitle: formatFitBottomSubtitle(meta, day.blocks.length),
    blocks: day.blocks,
    submissionCount: day.submissionCount,
    expectPrimaryOnly: false,
    expectDuplicate: false,
    expectFlipY: false,
    expectFlipX: false,
    expectFitBottom: true,
    expectDoubleBottom: false,
    expectDoubleBottomFlipLeft: false,
    expectMirror: false
  };
  const doubleBottomPanel = {
    mode: 'double-bottom',
    label: `Dup ×2 — ${dateKey}`,
    subtitle: formatDoubleBottomSubtitle(meta, day.blocks.length),
    blocks: day.blocks,
    submissionCount: day.submissionCount,
    expectPrimaryOnly: false,
    expectDuplicate: false,
    expectFlipY: false,
    expectFlipX: false,
    expectFitBottom: false,
    expectDoubleBottom: true,
    expectDoubleBottomFlipLeft: false,
    expectMirror: false
  };
  const doubleBottomFlipLeftPanel = {
    mode: 'double-bottom-flip-left',
    label: `Dup ×2 flip L — ${dateKey}`,
    subtitle: formatDoubleBottomFlipLeftSubtitle(meta, day.blocks.length),
    blocks: day.blocks,
    submissionCount: day.submissionCount,
    expectPrimaryOnly: false,
    expectDuplicate: false,
    expectFlipY: false,
    expectFlipX: false,
    expectFitBottom: false,
    expectDoubleBottom: false,
    expectDoubleBottomFlipLeft: true,
    expectQuadrantFourUp: false,
    expectMirror: false
  };
  const quadrantFourUpPanel = {
    mode: 'quadrant-four-up',
    label: `4-up — ${dateKey}`,
    subtitle: formatQuadrantFourUpSubtitle(meta, day.blocks.length),
    blocks: day.blocks,
    submissionCount: day.submissionCount,
    expectPrimaryOnly: false,
    expectDuplicate: false,
    expectFlipY: false,
    expectFlipX: false,
    expectFitBottom: false,
    expectDoubleBottom: false,
    expectDoubleBottomFlipLeft: false,
    expectQuadrantFourUp: true,
    expectMirror: false
  };
  const screenPanel = {
    mode: 'quilt-screen',
    label: `Quilt screen — ${dateKey}`,
    subtitle: mirrorSubtitle,
    blocks: day.blocks,
    submissionCount: day.submissionCount,
    expectPrimaryOnly: false,
    expectDuplicate: false,
    expectFlipY: false,
    expectFlipX: false,
    expectFitBottom: false,
    expectDoubleBottom: false,
    expectDoubleBottomFlipLeft: false,
    expectQuadrantFourUp: false,
    expectMirror: true
  };

  console.log(`[mirror-compare] ${dateKey}: ${day.blocks.length} blocks · overlap ${meta?.overlapPercent != null ? (meta.overlapPercent * 100).toFixed(1) + '%' : 'n/a'} · seam ${meta?.seamFraction != null ? (meta.seamFraction * 100).toFixed(0) + '%' : 'n/a'}`);

  const outDir = path.join(ROOT, 'tmp', 'mirror-seam-compare', dateKey);
  fs.mkdirSync(outDir, { recursive: true });

  const panelImages = await renderPanelsWithRealQuiltRenderer(
    [primaryPanel, duplicatePanel, flipYPanel, flipXPanel, fitBottomPanel, doubleBottomPanel, doubleBottomFlipLeftPanel, quadrantFourUpPanel, screenPanel],
    dateKey
  );

  for (const panel of panelImages) {
    const pngPath = path.join(outDir, `${panel.mode}.png`);
    await sharp(panel.buffer).png().toFile(pngPath);
    console.log(`[mirror-compare] wrote ${pngPath}`);
  }

  const contactPath = path.join(outDir, 'contact-sheet.png');
  await writeContactSheet(panelImages, contactPath, 9);
  console.log(`[mirror-compare] wrote ${contactPath}`);

  const summary = {
    dateKey,
    blockCount: day.blocks.length,
    contributorCount: day.contributorCount,
    mirror: meta,
    outputs: {
      primary: path.relative(ROOT, path.join(outDir, 'primary.png')),
      duplicate: path.relative(ROOT, path.join(outDir, 'duplicate.png')),
      flipY: path.relative(ROOT, path.join(outDir, 'flip-y.png')),
      flipX: path.relative(ROOT, path.join(outDir, 'flip-x.png')),
      fitBottom: path.relative(ROOT, path.join(outDir, 'fit-bottom.png')),
      doubleBottom: path.relative(ROOT, path.join(outDir, 'double-bottom.png')),
      doubleBottomFlipLeft: path.relative(ROOT, path.join(outDir, 'double-bottom-flip-left.png')),
      quadrantFourUp: path.relative(ROOT, path.join(outDir, 'quadrant-four-up.png')),
      quiltScreen: path.relative(ROOT, path.join(outDir, 'quilt-screen.png')),
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
      console.error(`[mirror-compare] ${dateKey} FAILED:`, err.message);
    }
  }

  const outDir = path.join(ROOT, 'tmp', 'mirror-seam-compare');
  fs.mkdirSync(outDir, { recursive: true });
  if (allPanels.length >= 2) {
    const masterPath = path.join(outDir, 'contact-sheet.png');
    await writeContactSheet(allPanels, masterPath, 9);
    console.log(`[mirror-compare] wrote ${masterPath}`);
  }
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summaries, null, 2)}\n`);
  console.log('[mirror-compare] done');
}

main().catch((err) => {
  console.error('[mirror-compare] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
