#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Branch-from-stored deploy preview: keep picks 1..N exactly (colorReplayEvents trunk),
 * then apply only later picks with current engine code.
 *
 *   npm run preview:branch-from-stored
 *   DATE_KEY=2026-07-11 BRANCH_AT=34 npm run preview:branch-from-stored
 *
 * Output: tmp/branch-from-stored/<dateKey>/contact-sheet.png + preview.html
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
const { getAppDateKey } = require('./lib/app-date-key.cjs');
const { createServerQuiltEngine, serializeServerQuiltBlocks } = require('./lib/server-quilt-engine.cjs');
const { normalizeHex, reconstructArchiveSnapshotAt } = require('./lib/composition-preview.cjs');

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

function branchColorsAfter(submissions, branchAt, maxSubmission) {
  return submissions
    .filter((row) => Number.isFinite(row.submissionIndex) && row.submissionIndex > branchAt && row.submissionIndex <= maxSubmission)
    .map((row) => ({ submissionIndex: row.submissionIndex, color: row.color }))
    .filter((row) => row.color);
}

function reverseReplayEvent(blocks, event) {
  const childIds = new Set((event.children || []).map((child) => String(child.id || '')).filter(Boolean));
  if (!childIds.size || !event?.parent?.id) return null;
  const indices = blocks
    .map((block, index) => (childIds.has(String(block.id || '')) ? index : -1))
    .filter((index) => index >= 0);
  if (indices.length !== childIds.size) return null;
  [...indices].sort((a, b) => b - a).forEach((index) => blocks.splice(index, 1));
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

async function renderPanels(panels, dateKey) {
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: OUT_W, height: OUT_H },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true
    });
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
      app.loadQuiltFromServer = async () => ({ ok: false, reason: 'branch_preview_disabled' });
      if (app.dataService) {
        app.dataService.loadQuiltFromServer = async () => ({ ok: false, reason: 'branch_preview_disabled' });
      }
    });
    await page.addStyleTag({
      content: `
        html, body { margin:0!important; width:100vw!important; height:100vh!important; overflow:hidden!important; background:#f6f4f1!important; }
        body > *:not(#app) { display:none!important; }
        .screen { display:none!important; }
        #screen-connection-problem { display:none!important; }
        #screen-quilt { display:flex!important; position:fixed!important; inset:0!important; background:#f6f4f1!important; z-index:2147483647!important; }
        #screen-quilt > :not(.quilt-container) { display:none!important; }
        #screen-quilt .quilt-container { position:fixed!important; inset:0!important; background:#f6f4f1!important; }
      `
    });

    const out = [];
    for (const panel of panels) {
      await page.evaluate(async ({ blocks, submissionCount, panelDateKey }) => {
        const app = window.app;
        document.getElementById('screen-quilt')?.classList.add('active');
        const clonedBlocks = JSON.parse(JSON.stringify(blocks));
        app._loadedSharedQuiltDateKey = panelDateKey;
        app.dailyContributors = [];
        app.quiltEngine.blocks = clonedBlocks;
        app.quiltEngine.submissionCount = submissionCount;
        app.renderer?.setBacksidePreviewEnabled?.(false);
        if (app.renderer?.renderBlocks) {
          app.renderer.quiltSVG = document.getElementById('quilt');
          app.renderer._renderViewportOverride = null;
          app.renderer.renderBlocks(clonedBlocks, [], submissionCount);
        } else if (typeof app.renderQuilt === 'function') {
          await app.renderQuilt();
        }
      }, { blocks: panel.blocks, submissionCount: panel.submissionCount, panelDateKey: dateKey });
      await page.waitForFunction(
        () => !!document.getElementById('quilt')?.querySelector('#quiltParallaxLayer rect, #quiltParallaxLayer polygon'),
        undefined,
        { timeout: 60000 }
      );
      await page.waitForTimeout(400);
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

function writePreviewHtml(outDir, dateKey, summary) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Branch preview — ${dateKey}</title>
  <style>
    body { margin:0; font-family:system-ui,sans-serif; background:#f6f4f1; color:#2a2118; }
    main { max-width:1200px; margin:0 auto; padding:1.5rem; }
    h1 { font-size:1.2rem; margin:0 0 0.75rem; }
    p { line-height:1.5; margin:0 0 1rem; font-size:0.95rem; }
    img { width:100%; height:auto; border-radius:8px; box-shadow:0 8px 32px rgba(42,33,24,.12); }
    code { font-size:0.88rem; }
  </style>
</head>
<body>
  <main>
    <h1>${dateKey} — deploy-style preview</h1>
    <p>
      Top-left: live Firestore quilt (${summary.liveContributorCount} picks).
      Top-right: trunk at pick ${summary.branchAt} (${summary.trunkSource}).
      Bottom: same trunk, then picks ${summary.branchPickRange} with current engine only.
    </p>
    <p>Branch colors: ${(summary.branchColors || []).join(', ') || '(none)'}</p>
    <img src="contact-sheet.png" alt="Branch-from-stored preview" />
  </main>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'preview.html'), html);
}

async function main() {
  const dateKey = String(process.env.DATE_KEY || getAppDateKey()).trim();
  const data = await fetchBranchData(dateKey);
  const branchAt = Math.max(
    1,
    Math.floor(Number(process.env.BRANCH_AT) || Math.max(1, data.liveContributorCount - 3))
  );
  const trunk = resolveTrunk(data, branchAt);
  const branchColorRows = branchColorsAfter(data.submissions, branchAt, data.liveContributorCount);
  if (!branchColorRows.length) {
    throw new Error(`No submission colors found after pick ${branchAt} for ${dateKey}`);
  }
  const branchColorList = branchColorRows.map((row) => row.color);
  const branched = applyBranchPicks(trunk, branchColorRows, dateKey, branchAt, data.macroStructureFrozen);
  const lastBranchPick = branchColorRows[branchColorRows.length - 1].submissionIndex;

  const panels = [
    {
      id: 'stored',
      label: `Stored live — ${dateKey}`,
      subtitle: `${data.liveContributorCount} picks · ${data.liveBlocks.length} blocks · what users see now`,
      blocks: data.liveBlocks,
      submissionCount: data.liveContributorCount
    },
    {
      id: 'trunk',
      label: `Deploy trunk — pick ${branchAt}`,
      subtitle: `${trunk.blocks.length} blocks · ${trunk.source}${trunk.reversedSeqs?.length ? ` · reversed seq ${trunk.reversedSeqs.join(',')}` : ''}`,
      blocks: trunk.blocks,
      submissionCount: trunk.submissionCount
    },
    {
      id: 'branch',
      label: `Trunk + new code — picks ${branchAt + 1}–${lastBranchPick}`,
      subtitle: `${branched.blocks.length} blocks · ${branchColorRows.length} pick(s) with current engine on stored trunk`,
      blocks: branched.blocks,
      submissionCount: branched.submissionCount
    }
  ];

  const outDir = path.join(ROOT, 'tmp', 'branch-from-stored', dateKey);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[branch-preview] ${dateKey}: trunk at pick ${branchAt} (${trunk.blocks.length} blocks via ${trunk.source})`);
  if (trunk.reversedSeqs?.length) {
    console.log(`[branch-preview] reversed event seq: ${trunk.reversedSeqs.join(', ')}`);
  }
  console.log(`[branch-preview] branch colors (${branchColorList.length}): ${branchColorList.join(', ')}`);
  if (branched.skipped.length) {
    console.warn('[branch-preview] skipped picks:', branched.skipped);
  }

  const rendered = await renderPanels(panels, dateKey);
  const contactPath = path.join(outDir, 'contact-sheet.png');
  await writeContactSheet(rendered, contactPath);

  const summary = {
    dateKey,
    branchAt,
    branchPickRange: `${branchAt + 1}–${lastBranchPick}`,
    branchColors: branchColorList,
    trunkSource: trunk.source,
    reversedEventSeqs: trunk.reversedSeqs || [],
    liveContributorCount: data.liveContributorCount,
    liveBlockCount: data.liveBlocks.length,
    trunkBlockCount: trunk.blocks.length,
    branchBlockCount: branched.blocks.length,
    replayEventCount: data.replayEvents.length,
    skippedBranchPicks: branched.skipped
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writePreviewHtml(outDir, dateKey, summary);

  console.log(`[branch-preview] wrote ${contactPath}`);
  console.log(`[branch-preview] open ${path.join(outDir, 'preview.html')}`);
}

main().catch((err) => {
  console.error('[branch-preview] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
