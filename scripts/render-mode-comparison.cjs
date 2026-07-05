#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Compare composition bias modes against real color selections from a real day,
 * with no dependency on archived block/schema quality.
 *
 * For a given date, pulls the real ordered color list (colorSubmissions collection,
 * falling back to block.submissionIndex, falling back to colorReplayEvents), then
 * replays that exact real sequence through every candidate mode from a blank canvas.
 * Modes are only compared against each other -- there is no "Stored Original" panel,
 * since we are not trying to reconstruct history, only to see what each mode produces
 * given real colors.
 *
 *   DATE_KEYS=2026-06-16,2026-06-10 npm run composition:mode-comparison
 *   MODES=mosaic,strata,vein,constellation,field,garden,tide,baseline npm run composition:mode-comparison
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
const {
  MODE_CONFIG,
  normalizeHex,
  orderedColorsFromBlocks,
  orderedReplayEvents,
  replaySequence
} = require('./lib/composition-preview.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT_W = Math.max(320, Math.floor(Number(process.env.OUT_W) || 1080));
const OUT_H = Math.max(568, Math.floor(Number(process.env.OUT_H) || 1920));
const CONTACT_GAP = Math.max(0, Math.floor(Number(process.env.CONTACT_GAP) || 72));
const CONTACT_LABEL_H = Math.max(0, Math.floor(Number(process.env.CONTACT_LABEL_H) || 116));
const BIAS_LOCK_AT = Math.max(1, Math.floor(Number(process.env.BIAS_LOCK_AT) || 10));
const MODE_KEYS = String(process.env.MODES || 'mosaic,strata,vein,constellation,field,garden,tide,baseline')
  .split(',')
  .map((s) => s.trim())
  .filter((mode) => mode && MODE_CONFIG[mode]);

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

/** Real ordered colors for a day, preferring the most authoritative source available. */
async function fetchRealOrderedColors(db, dateKey) {
  // 1. colorSubmissions collection: individual per-submission records, most authoritative.
  const subsSnap = await db.collection('colorSubmissions').where('appDateKey', '==', dateKey).get();
  if (!subsSnap.empty) {
    const rows = subsSnap.docs
      .map((doc) => doc.data() || {})
      .filter((row) => (!row.status || row.status === 'success') && normalizeHex(row.color))
      .sort((a, b) => {
        const ai = Number.isFinite(Number(a.submissionIndex)) ? Number(a.submissionIndex) : Infinity;
        const bi = Number.isFinite(Number(b.submissionIndex)) ? Number(b.submissionIndex) : Infinity;
        if (ai !== bi) return ai - bi;
        return String(a.createdAtIso || '').localeCompare(String(b.createdAtIso || ''));
      })
      .map((row) => normalizeHex(row.color));
    if (rows.length) return { colors: rows, source: 'colorSubmissions' };
  }

  const snap = await db.collection('quilts').doc(dateKey).get();
  if (!snap.exists) throw new Error(`No quilts/${dateKey} in Firestore`);
  const data = snap.data() || {};

  // 2. block.submissionIndex on the assembled quilt doc.
  const blockColors = orderedColorsFromBlocks(Array.isArray(data.blocks) ? data.blocks : []);
  if (blockColors.length > BIAS_LOCK_AT) return { colors: blockColors, source: 'blockSubmissionIndex' };

  // 3. colorReplayEvents on the quilt doc (older logging mechanism).
  const events = orderedReplayEvents(data);
  const replayColors = events.map((e) => normalizeHex(e?.newHex)).filter(Boolean);
  if (replayColors.length) return { colors: replayColors, source: 'colorReplayEvents' };

  throw new Error(`quilts/${dateKey}: no reliable ordered color source found (colorSubmissions/blocks/replayEvents all empty)`);
}

function startStaticServer() {
  const STATIC_MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf'
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
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/our-daily-beta?compositionTester=1` });
    });
  });
}

function esc(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function renderPanelsWithRealQuiltRenderer(renderPanels, dateKey) {
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: OUT_W, height: OUT_H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(
      () => !!window.app?.renderer && !!window.app?.quiltEngine && !!document.getElementById('quilt'),
      undefined, { timeout: 120000 }
    );
    await page.evaluate(() => {
      const app = window.app;
      if (!app) return;
      app.applyQuiltDataFromPayload = async () => {};
      app.attachQuiltLiveListener = () => {};
      app.loadQuiltFromServer = async () => ({ ok: false, reason: 'composition_tester_disabled' });
      if (app.dataService) app.dataService.loadQuiltFromServer = async () => ({ ok: false, reason: 'composition_tester_disabled' });
    });
    await page.addStyleTag({
      content: `
        html, body { margin: 0 !important; width: 100vw !important; height: 100vh !important; overflow: hidden !important; background: #fff !important; }
        body > *:not(#app) { display: none !important; }
        .screen { display: none !important; }
        #screen-connection-problem, #screen-connection-problem *, .connection-problem-inner, .connection-problem-inner * {
          display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;
        }
        #screen-quilt {
          display: flex !important; position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
          min-height: 100vh !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important;
          background: #f6f4f1 !important; z-index: 2147483647 !important;
        }
        #screen-quilt > :not(.quilt-container) { display: none !important; }
        #screen-quilt .quilt-container {
          position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
          max-width: none !important; margin: 0 !important; overflow: hidden !important; background: #f6f4f1 !important; z-index: 2147483647 !important;
        }
      `
    });

    const out = [];
    for (const panel of renderPanels) {
      const renderCheck = await page.evaluate(async ({ blocks, submissionCount, dateKey: panelDateKey }) => {
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
          connectionProblem.style.visibility = 'hidden';
          connectionProblem.style.opacity = '0';
        }
        const screen = document.getElementById('screen-quilt');
        screen?.classList.add('active');
        screen?.removeAttribute('hidden');
        screen?.setAttribute('aria-hidden', 'false');
        if (screen) screen.style.display = 'flex';
        if (screen) screen.style.visibility = 'visible';
        if (screen) screen.style.opacity = '1';

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
        return {
          dateKey: app._loadedSharedQuiltDateKey,
          blockCount: Array.isArray(app.quiltEngine.blocks) ? app.quiltEngine.blocks.length : 0,
          submissionCount: app.quiltEngine.submissionCount
        };
      }, { blocks: panel.blocks, submissionCount: panel.submissionCount, dateKey });

      if (renderCheck.blockCount !== panel.blocks.length) {
        throw new Error(`Browser renderer did not keep injected panel ${panel.mode}: got ${renderCheck.blockCount}, expected ${panel.blocks.length}`);
      }

      await page.waitForFunction(
        () => {
          const svg = document.getElementById('quilt');
          return !!svg?.querySelector('#quiltMirroredFieldLayer') && !!svg?.querySelector('#quiltParallaxLayer');
        },
        undefined, { timeout: 60000 }
      );
      await page.waitForTimeout(500);
      const buffer = await page.locator('#screen-quilt .quilt-container').screenshot({ type: 'png' });
      out.push({ ...panel, buffer });
    }
    return out;
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}

async function writeContactSheet(panelImages, contactPath) {
  const cols = Math.min(2, panelImages.length);
  const rows = Math.ceil(panelImages.length / cols);
  const tileW = OUT_W;
  const tileH = OUT_H;
  const resized = await Promise.all(
    panelImages.map((p) => sharp(p.buffer).resize(tileW, tileH, { fit: 'contain', background: '#fff' }).png().toBuffer())
  );
  const labelBuffers = panelImages.map((panel) => Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${CONTACT_LABEL_H}" viewBox="0 0 ${tileW} ${CONTACT_LABEL_H}">
      <rect width="${tileW}" height="${CONTACT_LABEL_H}" fill="#fff"/>
      <text x="28" y="44" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="34" font-weight="700" fill="#222">${esc(panel.label)}</text>
      <text x="28" y="82" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="22" fill="#666">${esc(panel.subtitle)}</text>
    </svg>
  `));
  const cellH = CONTACT_LABEL_H + tileH;
  await sharp({
    create: { width: tileW * cols + CONTACT_GAP * Math.max(0, cols - 1), height: cellH * rows + CONTACT_GAP * Math.max(0, rows - 1), channels: 3, background: '#fff' }
  })
    .composite(resized.flatMap((input, idx) => {
      const left = (idx % cols) * (tileW + CONTACT_GAP);
      const top = Math.floor(idx / cols) * (cellH + CONTACT_GAP);
      return [{ input: labelBuffers[idx], left, top }, { input, left, top: top + CONTACT_LABEL_H }];
    }))
    .png()
    .toFile(contactPath);
}

async function renderDate(db, dateKey) {
  const { colors, source } = await fetchRealOrderedColors(db, dateKey);
  console.log(`[mode-comparison] ${dateKey}: ${colors.length} real ordered colors from ${source}`);
  if (colors.length <= BIAS_LOCK_AT) {
    throw new Error(`${dateKey}: only ${colors.length} real colors found; need more than ${BIAS_LOCK_AT} to compare modes meaningfully`);
  }

  const outDir = path.join(ROOT, 'tmp', 'mode-comparison', dateKey);
  fs.mkdirSync(outDir, { recursive: true });

  const panels = [];
  for (const mode of MODE_KEYS) {
    const replay = replaySequence(dateKey, colors, mode, BIAS_LOCK_AT, {});
    const config = MODE_CONFIG[mode] || {};
    panels.push({
      mode,
      label: `${config.label || mode} — ${dateKey}`,
      subtitle: `${colors.length} real colors (${source}) · ${replay.blocks.length} blocks · ${config.description || ''}`,
      blocks: replay.blocks,
      submissionCount: replay.submissionCount
    });
    console.log(`[mode-comparison] ${dateKey}: replayed mode "${mode}" -> ${replay.blocks.length} blocks`);
  }

  const panelImages = await renderPanelsWithRealQuiltRenderer(panels, dateKey);
  const contactPath = path.join(outDir, 'contact-sheet.png');
  await writeContactSheet(panelImages, contactPath);
  console.log(`[mode-comparison] wrote ${contactPath}`);

  const summary = { dateKey, colorCount: colors.length, source, modes: MODE_KEYS, contactSheet: path.relative(ROOT, contactPath) };
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

async function main() {
  const db = initFirestore();
  const dateKeys = String(process.env.DATE_KEYS || process.env.DATE_KEY || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!dateKeys.length) throw new Error('Set DATE_KEYS=2026-06-16,2026-06-10 (comma separated)');

  console.log(`[mode-comparison] modes under test: ${MODE_KEYS.join(', ')}`);
  const summaries = [];
  for (const dateKey of dateKeys) {
    try {
      summaries.push(await renderDate(db, dateKey));
    } catch (err) {
      console.error(`[mode-comparison] ${dateKey} FAILED:`, err.message);
    }
  }
  const outDir = path.join(ROOT, 'tmp', 'mode-comparison');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summaries, null, 2)}\n`);
  console.log('[mode-comparison] done');
}

main().catch((err) => {
  console.error('[mode-comparison] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
