#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Fair engine tuning comparison: pre-tuning vs post-tuning with identical colors + RNG seed.
 *
 *   npm run preview:engine-tuning-comparison
 *   DATE_KEY=2026-07-28 OLD_COMMIT=695c4c2 npm run preview:engine-tuning-comparison
 *
 * Output: tmp/engine-tuning-comparison/<dateKey>/contact-sheet.png + preview.html
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const admin = require('firebase-admin');
const { chromium } = require('playwright');
const sharp = require('sharp');
const { getAppDateKey } = require('./lib/app-date-key.cjs');
const {
  createServerQuiltEngine,
  serializeServerQuiltBlocks,
  computeQuiltFingerprint
} = require('./lib/server-quilt-engine.cjs');
const { normalizeHex } = require('./lib/composition-preview.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT_W = Math.max(320, Math.floor(Number(process.env.OUT_W) || 1080));
const OUT_H = Math.max(568, Math.floor(Number(process.env.OUT_H) || 1920));
const CONTACT_GAP = 48;
const CONTACT_LABEL_H = 116;
const OLD_COMMIT = String(process.env.OLD_COMMIT || '695c4c2').trim();

function hashString(value) {
  let h = 2166136261;
  const s = String(value || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

async function fetchDay(dateKey) {
  const db = initFirestore();
  const [snap, submissionSnap] = await Promise.all([
    db.collection('quilts').doc(dateKey).get(),
    db.collection('colorSubmissions').where('appDateKey', '==', dateKey).get()
  ]);
  if (!snap.exists) throw new Error(`No quilts/${dateKey} in Firestore`);
  const data = snap.data() || {};
  const colors = submissionSnap.docs
    .map((doc) => doc.data() || {})
    .filter((row) => (!row.status || row.status === 'success') && normalizeHex(row.appliedColor || row.color || row.hex || row.selectedColor))
    .sort((a, b) => {
      const ai = Number.isFinite(Number(a.submissionIndex)) ? Number(a.submissionIndex) : Infinity;
      const bi = Number.isFinite(Number(b.submissionIndex)) ? Number(b.submissionIndex) : Infinity;
      if (ai !== bi) return ai - bi;
      return String(a.createdAtIso || '').localeCompare(String(b.createdAtIso || ''));
    })
    .map((row) => normalizeHex(row.appliedColor || row.color || row.hex || row.selectedColor));
  return {
    dateKey,
    liveBlocks: JSON.parse(JSON.stringify(Array.isArray(data.blocks) ? data.blocks : [])),
    liveContributorCount: Number(data.contributorCount) || 0,
    replayEventCount: Array.isArray(data.colorReplayEvents) ? data.colorReplayEvents.length : 0,
    colors
  };
}

function materializeOldEngineSnapshot(commit) {
  const outDir = path.join(ROOT, 'tmp', 'engine-snapshots');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `simple-quilt-engine-${commit}.js`);
  if (!fs.existsSync(outPath)) {
    const src = execSync(`git show ${commit}:lib/simple-quilt-engine.js`, { cwd: ROOT, encoding: 'utf8' });
    fs.writeFileSync(outPath, src);
  }
  return path.relative(ROOT, outPath);
}

function replayWithEngine(dateKey, colors, engineRelPath, label) {
  const originalRandom = Math.random;
  Math.random = mulberry32(hashString(`composition-seed-tester:${dateKey}`));
  try {
    const engine = createServerQuiltEngine({
      userId: `${label}-${dateKey}`,
      blocks: [],
      submissionCount: 0,
      colorReplayEvents: [],
      macroStructureFrozen: false,
      engineRelPath
    });
    const skipped = [];
    colors.forEach((color, index) => {
      if (!engine.addColor(color)) skipped.push({ index: index + 1, color });
    });
    const blocks = serializeServerQuiltBlocks(engine);
    return {
      blocks,
      submissionCount: Number(engine.submissionCount) || colors.length,
      skipped,
      fingerprint: computeQuiltFingerprint(blocks, { engineRelPath })
    };
  } finally {
    Math.random = originalRandom;
  }
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function startStaticServer() {
  const STATIC_MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  };
  const server = http.createServer((req, res) => {
    const rawUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const filePath = path.join(ROOT, decodeURIComponent(rawUrl.pathname));
    if (!filePath.startsWith(ROOT + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
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
      resolve({ server, url: `http://127.0.0.1:${address.port}/our-daily-beta.html?engineTuningPreview=1` });
    });
  });
}

function panelStyleTag() {
  return `
    html, body { margin:0!important; width:100vw!important; height:100vh!important; overflow:hidden!important; background:#f6f4f1!important; }
    body > *:not(#app) { display:none!important; }
    .screen { display:none!important; }
    #screen-connection-problem { display:none!important; }
    #screen-quilt { display:flex!important; position:fixed!important; inset:0!important; background:#f6f4f1!important; z-index:2147483647!important; }
    #screen-quilt > :not(.quilt-container) { display:none!important; }
    #screen-quilt .quilt-container { position:fixed!important; inset:0!important; background:#f6f4f1!important; }
  `;
}

async function disableLiveReload(page) {
  await page.evaluate(() => {
    const app = window.app;
    if (!app) return;
    app.applyQuiltDataFromPayload = async () => {};
    app.attachQuiltLiveListener = () => {};
    app.loadQuiltFromServer = async () => ({ ok: false, reason: 'engine_tuning_preview_disabled' });
    if (app.dataService) {
      app.dataService.loadQuiltFromServer = async () => ({ ok: false, reason: 'engine_tuning_preview_disabled' });
    }
  });
}

async function renderOnePanel(browser, url, panel, dateKey) {
  const page = await browser.newPage({
    viewport: { width: OUT_W, height: OUT_H },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(
      () => !!window.app?.renderer && !!window.app?.quiltEngine && !!document.getElementById('quilt'),
      undefined,
      { timeout: 120000 }
    );
    await disableLiveReload(page);
    await page.addStyleTag({ content: panelStyleTag() });
    const renderCheck = await page.evaluate(({ blocks, submissionCount, panelDateKey, panelId, expectedFingerprint }) => {
      const app = window.app;
      document.querySelectorAll('.screen').forEach((screen) => {
        screen.classList.remove('active');
        screen.style.display = 'none';
      });
      const screen = document.getElementById('screen-quilt');
      screen?.classList.add('active');
      if (screen) {
        screen.style.display = 'flex';
        screen.style.visibility = 'visible';
        screen.style.opacity = '1';
      }
      const clonedBlocks = JSON.parse(JSON.stringify(blocks));
      app._loadedSharedQuiltDateKey = `${panelDateKey}:${panelId}`;
      app.dailyContributors = [];
      app.quiltEngine.blocks = clonedBlocks;
      app.quiltEngine.submissionCount = submissionCount;
      if (app.renderer) {
        app.renderer.lastAddedIndex = null;
        app.renderer.setBacksidePreviewEnabled?.(false);
        app.renderer.quiltSVG = document.getElementById('quilt');
        app.renderer._renderViewportOverride = null;
        app.renderer.renderBlocks(clonedBlocks, [], submissionCount);
      }
      const fingerprint = window.Utils?.computeQuiltFingerprint?.(clonedBlocks) || '';
      return {
        blockCount: clonedBlocks.length,
        submissionCount: Number(app.quiltEngine.submissionCount) || 0,
        fingerprint,
        expectedFingerprint,
        fingerprintOk: !expectedFingerprint || fingerprint === expectedFingerprint
      };
    }, {
      blocks: panel.blocks,
      submissionCount: panel.submissionCount,
      panelDateKey: dateKey,
      panelId: panel.id,
      expectedFingerprint: panel.expectedFingerprint || ''
    });
    if (!renderCheck.fingerprintOk) {
      throw new Error(`${panel.id}: fingerprint mismatch browser=${renderCheck.fingerprint} expected=${panel.expectedFingerprint}`);
    }
    await page.waitForTimeout(600);
    const buffer = await page.locator('#quilt').screenshot({ type: 'png' });
    return { ...panel, buffer, renderCheck };
  } finally {
    await page.close();
  }
}

async function renderPanels(panels, dateKey, outDir) {
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const out = [];
    for (const panel of panels) {
      const rendered = await renderOnePanel(browser, url, panel, dateKey);
      const pngPath = path.join(outDir, `panel-${panel.id}.png`);
      fs.writeFileSync(pngPath, rendered.buffer);
      rendered.pngPath = pngPath;
      out.push(rendered);
      console.log(`[engine-tuning] rendered ${panel.id}: ${rendered.renderCheck.blockCount} blocks, fp ${rendered.renderCheck.fingerprint}`);
    }
    return out;
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}

async function labelPanelBuffer(panel) {
  const title = esc(panel.label || panel.id || 'Panel');
  const subtitle = esc(panel.subtitle || '');
  const fp = esc(panel.renderCheck?.fingerprint || panel.expectedFingerprint || '');
  const labelSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${CONTACT_LABEL_H}" viewBox="0 0 ${OUT_W} ${CONTACT_LABEL_H}">
      <rect width="${OUT_W}" height="${CONTACT_LABEL_H}" fill="#fff"/>
      <text x="28" y="44" font-family="-apple-system,sans-serif" font-size="30" font-weight="700" fill="#222">${title}</text>
      <text x="28" y="82" font-family="-apple-system,sans-serif" font-size="20" fill="#666">${subtitle}</text>
      <text x="28" y="108" font-family="ui-monospace,monospace" font-size="16" fill="#888">${fp}</text>
    </svg>
  `);
  return sharp(panel.buffer)
    .resize(OUT_W, OUT_H, { fit: 'contain', background: '#f6f4f1' })
    .extend({ top: CONTACT_LABEL_H, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .composite([{ input: labelSvg, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

async function writeContactSheet(panelImages, contactPath) {
  const cols = Math.min(2, panelImages.length);
  const rows = Math.ceil(panelImages.length / cols);
  const tileW = OUT_W;
  const tileH = OUT_H;
  const resized = await Promise.all(
    panelImages.map((p) => sharp(p.buffer).resize(tileW, tileH, { fit: 'contain', background: '#fff' }).png().toBuffer())
  );
  const labelBuffers = panelImages.map((panel) => {
    const title = esc(panel.label || '');
    const subtitle = esc(panel.subtitle || '');
    return Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${CONTACT_LABEL_H}" viewBox="0 0 ${tileW} ${CONTACT_LABEL_H}">
        <rect width="${tileW}" height="${CONTACT_LABEL_H}" fill="#fff"/>
        <text x="28" y="44" font-family="-apple-system,sans-serif" font-size="30" font-weight="700" fill="#222">${title}</text>
        <text x="28" y="82" font-family="-apple-system,sans-serif" font-size="20" fill="#666">${subtitle}</text>
      </svg>
    `);
  });
  const cellH = CONTACT_LABEL_H + tileH;
  await sharp({
    create: {
      width: tileW * cols + CONTACT_GAP * Math.max(0, cols - 1),
      height: cellH * rows + CONTACT_GAP * Math.max(0, rows - 1),
      channels: 3,
      background: '#fff'
    }
  })
    .composite(
      resized.flatMap((input, idx) => {
        const left = (idx % cols) * (tileW + CONTACT_GAP);
        const top = Math.floor(idx / cols) * (cellH + CONTACT_GAP);
        return [
          { input: labelBuffers[idx], left, top },
          { input, left, top: top + CONTACT_LABEL_H }
        ];
      })
    )
    .png()
    .toFile(contactPath);
}

function writePreviewHtml(outDir, dateKey, summary, cacheBust) {
  const q = `?v=${cacheBust}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Engine tuning — ${dateKey}</title>
  <style>
    body { margin:0; font-family:system-ui,sans-serif; background:#f6f4f1; color:#2a2118; }
    main { max-width:1200px; margin:0 auto; padding:1.5rem; }
    h1 { font-size:1.2rem; margin:0 0 0.75rem; }
    p { line-height:1.5; margin:0 0 1rem; font-size:0.95rem; }
    img { width:100%; height:auto; border-radius:8px; box-shadow:0 8px 32px rgba(42,33,24,.12); display:block; }
  </style>
</head>
<body>
  <main>
    <h1>${dateKey} — fair engine comparison</h1>
    <p>Left: engine at commit ${summary.oldCommit}. Right: current engine. Both replay the same ${summary.replayColorCount} submission colors with the same test seed. This is <strong>not</strong> the live quilt (which used production randomness and ${summary.liveContributorCount} picks).</p>
    <img src="contact-sheet.png${q}" alt="Pre vs post tuning" />
  </main>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'preview.html'), html);
}

async function main() {
  const dateKey = String(process.env.DATE_KEY || getAppDateKey()).trim();
  const data = await fetchDay(dateKey);
  if (!data.colors.length) throw new Error(`No submission colors for ${dateKey}`);

  const oldEngineRel = materializeOldEngineSnapshot(OLD_COMMIT);
  const newEngineRel = 'lib/simple-quilt-engine.js';
  const oldReplay = replayWithEngine(dateKey, data.colors, oldEngineRel, 'pre-tuning');
  const newReplay = replayWithEngine(dateKey, data.colors, newEngineRel, 'post-tuning');

  const panels = [
    {
      id: 'pre-tuning',
      label: 'Pre-tuning',
      subtitle: `${OLD_COMMIT} · ${data.colors.length} colors · same seed · ${oldReplay.blocks.length} blocks`,
      blocks: oldReplay.blocks,
      submissionCount: oldReplay.submissionCount,
      expectedFingerprint: oldReplay.fingerprint
    },
    {
      id: 'post-tuning',
      label: 'Post-tuning',
      subtitle: `current · ${data.colors.length} colors · same seed · ${newReplay.blocks.length} blocks`,
      blocks: newReplay.blocks,
      submissionCount: newReplay.submissionCount,
      expectedFingerprint: newReplay.fingerprint
    }
  ];

  const outDir = path.join(ROOT, 'tmp', 'engine-tuning-comparison', dateKey, OLD_COMMIT);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[engine-tuning] ${dateKey}: ${data.colors.length} colors, seed composition-seed-tester:${dateKey}`);
  console.log(`[engine-tuning] pre  ${oldReplay.blocks.length} blocks · ${oldReplay.fingerprint}`);
  console.log(`[engine-tuning] post ${newReplay.blocks.length} blocks · ${newReplay.fingerprint}`);
  console.log(`[engine-tuning] identical=${oldReplay.fingerprint === newReplay.fingerprint}`);

  const rendered = await renderPanels(panels, dateKey, outDir);
  const contactPanels = [];
  for (const panel of rendered) {
    const labeledBuffer = await labelPanelBuffer(panel);
    contactPanels.push({ ...panel, buffer: labeledBuffer, label: panel.label, subtitle: panel.subtitle });
  }
  const contactPath = path.join(outDir, 'contact-sheet.png');
  await writeContactSheet(contactPanels, contactPath);

  const summary = {
    dateKey,
    oldCommit: OLD_COMMIT,
    replayColorCount: data.colors.length,
    liveContributorCount: data.liveContributorCount,
    liveBlockCount: data.liveBlocks.length,
    replayEventCount: data.replayEventCount,
    preTuningBlockCount: oldReplay.blocks.length,
    postTuningBlockCount: newReplay.blocks.length,
    preTuningFingerprint: oldReplay.fingerprint,
    postTuningFingerprint: newReplay.fingerprint,
    identicalReplay: oldReplay.fingerprint === newReplay.fingerprint,
    seed: `composition-seed-tester:${dateKey}`,
    cacheBust: Date.now()
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writePreviewHtml(outDir, dateKey, summary, summary.cacheBust);

  console.log(`[engine-tuning] wrote ${contactPath}`);
  console.log(`[engine-tuning] open ${path.join(outDir, 'preview.html')}`);
}

main().catch((err) => {
  console.error('[engine-tuning] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
