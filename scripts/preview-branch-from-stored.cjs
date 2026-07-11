#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Current vs new-code preview: stored live quilt vs full color replay on current engine.
 *
 *   npm run preview:branch-from-stored
 *   DATE_KEY=2026-07-11 npm run preview:branch-from-stored
 *
 * Output: tmp/branch-from-stored/<dateKey>/contact-sheet.png + preview.html
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const admin = require('firebase-admin');
const { chromium } = require('playwright');
const sharp = require('sharp');
const { getAppDateKey } = require('./lib/app-date-key.cjs');
const { createServerQuiltEngine, serializeServerQuiltBlocks, computeQuiltFingerprint } = require('./lib/server-quilt-engine.cjs');
const { normalizeHex, reconstructArchiveSnapshotAt, replaySequence } = require('./lib/composition-preview.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT_W = Math.max(320, Math.floor(Number(process.env.OUT_W) || 1080));
const OUT_H = Math.max(568, Math.floor(Number(process.env.OUT_H) || 1920));
const CONTACT_GAP = 48;
const CONTACT_LABEL_H = 116;

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

function cloneJson(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value == null ? fallback : value));
  } catch (_) {
    return fallback;
  }
}

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

async function fetchBranchData(dateKey) {
  const db = initFirestore();
  const [snap, submissionSnap] = await Promise.all([
    db.collection('quilts').doc(dateKey).get(),
    db.collection('colorSubmissions').where('appDateKey', '==', dateKey).get()
  ]);
  if (!snap.exists) throw new Error(`No quilts/${dateKey} in Firestore`);
  const data = snap.data() || {};
  const liveBlocks = cloneJson(Array.isArray(data.blocks) ? data.blocks : [], []);
  const liveContributorCount = Number(data.contributorCount) || 0;
  const replayEvents = (Array.isArray(data.colorReplayEvents) ? data.colorReplayEvents : [])
    .slice()
    .sort((a, b) => {
      const seqA = Number(a?.seq) || 0;
      const seqB = Number(b?.seq) || 0;
      if (seqA !== seqB) return seqA - seqB;
      return String(a?.iso || '').localeCompare(String(b?.iso || ''));
    });
  const submissions = submissionSnap.docs
    .map((doc) => {
      const row = doc.data() || {};
      return {
        id: doc.id,
        color: normalizeHex(row.appliedColor || row.color || row.hex || row.selectedColor),
        status: String(row.status || '').trim(),
        submissionIndex: Number(row.submissionIndex),
        createdAtIso: String(row.createdAtIso || row.submittedAtIso || '').trim()
      };
    })
    .filter((row) => row.color && (!row.status || row.status === 'success'))
    .sort((a, b) => {
      const ai = Number.isFinite(a.submissionIndex) ? a.submissionIndex : Number.POSITIVE_INFINITY;
      const bi = Number.isFinite(b.submissionIndex) ? b.submissionIndex : Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return String(a.createdAtIso || '').localeCompare(String(b.createdAtIso || ''));
    });
  return {
    dateKey,
    liveBlocks,
    liveContributorCount,
    macroStructureFrozen: data.macroStructureFrozen === true,
    replayEvents,
    submissions
  };
}

function colorsForReplay(data) {
  const fromEvents = (Array.isArray(data.replayEvents) ? data.replayEvents : [])
    .map((event) => normalizeHex(event?.newHex))
    .filter(Boolean);
  if (fromEvents.length >= data.liveContributorCount) return fromEvents;
  return data.submissions.map((row) => row.color).filter(Boolean);
}

function reverseReplayEvent(blocks, event) {
  const parentId = String(event?.parent?.id || '').trim();
  if (!parentId) return null;
  const childIds = new Set((event.children || []).map((child) => String(child.id || '')).filter(Boolean));
  const parentPrefix = `${parentId}_`;
  let removed = 0;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const blockId = String(blocks[i]?.id || '');
    if (childIds.has(blockId) || blockId.startsWith(parentPrefix)) {
      blocks.splice(i, 1);
      removed += 1;
    }
  }
  if (!removed) return null;
  blocks.push(cloneJson(event.parent, null));
  if (!blocks[blocks.length - 1]) return null;
  return blocks;
}

/** Undo recorded splits after branchAt on the live block list to recover deploy trunk. */
function trunkFromLiveByReversingEvents(liveBlocks, replayEvents, branchAt) {
  const blocks = cloneJson(liveBlocks, []);
  const toReverse = (Array.isArray(replayEvents) ? replayEvents : [])
    .filter((event) => Number(event?.seq) > branchAt)
    .sort((a, b) => Number(b?.seq) - Number(a?.seq));
  const reversedSeqs = [];
  for (const event of toReverse) {
    if (!reverseReplayEvent(blocks, event)) {
      return null;
    }
    reversedSeqs.push(Number(event.seq));
  }
  return {
    blocks,
    submissionCount: branchAt,
    reversedSeqs
  };
}

function resolveTrunk(data, branchAt) {
  const fromEvents = reconstructArchiveSnapshotAt(data.replayEvents, branchAt);
  if (fromEvents) {
    return { ...fromEvents, source: 'colorReplayEvents-forward' };
  }
  const fromReverse = trunkFromLiveByReversingEvents(data.liveBlocks, data.replayEvents, branchAt);
  if (fromReverse) {
    return { ...fromReverse, source: 'live-reverse-events' };
  }
  throw new Error(`Could not derive trunk at pick ${branchAt} for ${data.dateKey}`);
}

function applyBranchPicks(snapshot, colorRows, dateKey, branchAt, macroStructureFrozen) {
  const originalRandom = Math.random;
  Math.random = mulberry32(hashString(`branch-preview:${dateKey}:${branchAt}`));
  try {
    const engine = createServerQuiltEngine({
      userId: `branch-preview-${dateKey}`,
      blocks: cloneJson(snapshot.blocks, []),
      submissionCount: snapshot.submissionCount,
      colorReplayEvents: [],
      macroStructureFrozen: macroStructureFrozen === true
    });
    engine.recordUserContribution = () => {};
    const skipped = [];
    colorRows.forEach(({ submissionIndex, color }) => {
      if (!engine.addColor(color)) skipped.push({ submissionIndex, color });
    });
    return {
      blocks: serializeServerQuiltBlocks(engine),
      submissionCount: Number(engine.submissionCount) || snapshot.submissionCount + colorRows.length,
      macroStructureFrozen: engine.macroStructureFrozen === true,
      skipped
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
      resolve({ server, url: `http://127.0.0.1:${address.port}/our-daily-beta.html?branchPreview=1` });
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
    app.loadQuiltFromServer = async () => ({ ok: false, reason: 'branch_preview_disabled' });
    if (app.dataService) {
      app.dataService.loadQuiltFromServer = async () => ({ ok: false, reason: 'branch_preview_disabled' });
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

      const svg = document.getElementById('quilt');
      const shapeCount = svg?.querySelectorAll('#quiltParallaxLayer rect, #quiltParallaxLayer polygon').length || 0;
      const fingerprint = window.Utils?.computeQuiltFingerprint?.(clonedBlocks) || '';
      return {
        blockCount: clonedBlocks.length,
        submissionCount: Number(app.quiltEngine.submissionCount) || 0,
        shapeCount,
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

    if (renderCheck.blockCount !== panel.blocks.length) {
      throw new Error(`${panel.id}: injected ${renderCheck.blockCount} blocks, expected ${panel.blocks.length}`);
    }
    if (Number(renderCheck.submissionCount) !== Number(panel.submissionCount)) {
      throw new Error(`${panel.id}: submissionCount ${renderCheck.submissionCount} != ${panel.submissionCount}`);
    }
    if (!renderCheck.fingerprintOk) {
      throw new Error(
        `${panel.id}: fingerprint mismatch browser=${renderCheck.fingerprint} expected=${panel.expectedFingerprint}`
      );
    }

    await page.waitForFunction(
      (expectedShapes) => {
        const svg = document.getElementById('quilt');
        const n = svg?.querySelectorAll('#quiltParallaxLayer rect, #quiltParallaxLayer polygon').length || 0;
        return n >= Math.max(1, Math.floor(expectedShapes * 0.5));
      },
      panel.blocks.length,
      { timeout: 60000 }
    );
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
      console.log(
        `[branch-preview] rendered ${panel.id}: ${rendered.renderCheck.blockCount} blocks, ` +
          `fp ${rendered.renderCheck.fingerprint}, shapes ${rendered.renderCheck.shapeCount}`
      );
    }

    const hashes = out.map((panel) => ({
      id: panel.id,
      hash: crypto.createHash('sha256').update(panel.buffer).digest('hex').slice(0, 12)
    }));
    const uniqueHashes = new Set(hashes.map((row) => row.hash));
    if (uniqueHashes.size !== hashes.length) {
      const dupes = hashes.map((h) => `${h.id}:${h.hash}`).join(', ');
      throw new Error(`Panel screenshots were identical — render did not swap quilts (${dupes})`);
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
    .extend({
      top: CONTACT_LABEL_H,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .composite([{ input: labelSvg, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

async function writeDiffImage(leftPanel, rightPanel, outPath, title) {
  const w = OUT_W;
  const h = OUT_H;
  const left = await sharp(leftPanel.buffer).resize(w, h, { fit: 'contain', background: '#f6f4f1' }).ensureAlpha().raw().toBuffer();
  const right = await sharp(rightPanel.buffer).resize(w, h, { fit: 'contain', background: '#f6f4f1' }).ensureAlpha().raw().toBuffer();
  const diff = Buffer.alloc(w * h * 4);
  let changed = 0;
  for (let i = 0; i < left.length; i += 4) {
    const dr = Math.abs(left[i] - right[i]);
    const dg = Math.abs(left[i + 1] - right[i + 1]);
    const db = Math.abs(left[i + 2] - right[i + 2]);
    if (dr > 10 || dg > 10 || db > 10) {
      diff[i] = 255;
      diff[i + 1] = 40;
      diff[i + 2] = 40;
      diff[i + 3] = 220;
      changed += 1;
    } else {
      diff[i] = Math.round(left[i] * 0.35);
      diff[i + 1] = Math.round(left[i + 1] * 0.35);
      diff[i + 2] = Math.round(left[i + 2] * 0.35);
      diff[i + 3] = 255;
    }
  }
  const pct = ((changed / (w * h)) * 100).toFixed(1);
  const labelSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${CONTACT_LABEL_H}" viewBox="0 0 ${w} ${CONTACT_LABEL_H}">
      <rect width="${w}" height="${CONTACT_LABEL_H}" fill="#fff"/>
      <text x="28" y="44" font-family="-apple-system,sans-serif" font-size="28" font-weight="700" fill="#222">${esc(title)}</text>
      <text x="28" y="82" font-family="-apple-system,sans-serif" font-size="20" fill="#666">${pct}% of pixels differ (red = changed)</text>
    </svg>
  `);
  await sharp(diff, { raw: { width: w, height: h, channels: 4 } })
    .extend({ top: CONTACT_LABEL_H, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .composite([{ input: labelSvg, top: 0, left: 0 }])
    .png()
    .toFile(outPath);
  return { pct: Number(pct) };
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
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <title>Branch preview — ${dateKey}</title>
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
    <h1>${dateKey}</h1>
    <p>Left: current live quilt. Right: all ${summary.replayColorCount} colors replayed from scratch with current engine (axis-aligned specials apply when patterns are created).</p>
    <img src="contact-sheet.png${q}" alt="Current vs new code" />
  </main>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'preview.html'), html);
}

async function main() {
  const dateKey = String(process.env.DATE_KEY || getAppDateKey()).trim();
  const data = await fetchBranchData(dateKey);
  const replayColors = colorsForReplay(data);
  if (!replayColors.length) {
    throw new Error(`No colors to replay for ${dateKey}`);
  }

  const fullReplay = replaySequence(dateKey, replayColors, 'baseline', replayColors.length, {
    macroStructureFrozen: false
  });

  const displayPanels = [
    {
      id: 'stored',
      label: 'Current',
      subtitle: `${data.liveContributorCount} picks · ${data.liveBlocks.length} blocks · live in Firestore`,
      blocks: data.liveBlocks,
      submissionCount: data.liveContributorCount,
      expectedFingerprint: computeQuiltFingerprint(data.liveBlocks)
    },
    {
      id: 'branch',
      label: 'New code',
      subtitle: `All ${replayColors.length} colors replayed from scratch with current engine · ${fullReplay.blocks.length} blocks`,
      blocks: fullReplay.blocks,
      submissionCount: fullReplay.submissionCount,
      expectedFingerprint: computeQuiltFingerprint(fullReplay.blocks)
    }
  ];

  const outDir = path.join(ROOT, 'tmp', 'branch-from-stored', dateKey);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[branch-preview] ${dateKey}: full replay ${replayColors.length} colors → ${fullReplay.blocks.length} blocks`);
  if (fullReplay.skippedColors?.length) {
    console.warn('[branch-preview] skipped replay colors:', fullReplay.skippedColors);
  }

  const rendered = await renderPanels(displayPanels, dateKey, outDir);
  for (const panel of rendered) {
    const labeled = await labelPanelBuffer(panel);
    const labeledPath = path.join(outDir, `panel-${panel.id}-labeled.png`);
    fs.writeFileSync(labeledPath, labeled);
    panel.labeledBuffer = labeled;
    panel.labeledPath = labeledPath;
  }

  const contactPanels = rendered.map((panel) => ({
    ...panel,
    buffer: panel.labeledBuffer,
    label: panel.label,
    subtitle: panel.subtitle
  }));
  const contactPath = path.join(outDir, 'contact-sheet.png');
  await writeContactSheet(contactPanels, contactPath);

  const cacheBust = Date.now();
  const summary = {
    dateKey,
    replayColorCount: replayColors.length,
    liveContributorCount: data.liveContributorCount,
    liveBlockCount: data.liveBlocks.length,
    replayBlockCount: fullReplay.blocks.length,
    liveFingerprint: computeQuiltFingerprint(data.liveBlocks),
    replayFingerprint: computeQuiltFingerprint(fullReplay.blocks),
    replayEventCount: data.replayEvents.length,
    skippedReplayColors: fullReplay.skippedColors || [],
    cacheBust
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writePreviewHtml(outDir, dateKey, summary, cacheBust);

  console.log(`[branch-preview] wrote ${contactPath}`);
  console.log(`[branch-preview] open ${path.join(outDir, 'preview.html')}`);
}

main().catch((err) => {
  console.error('[branch-preview] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
