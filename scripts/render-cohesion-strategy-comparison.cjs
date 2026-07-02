#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Compare cohesion strategies: original vs deferred prod vs seam soften vs both.
 *
 *   npm run cohesion:compare
 *   DATE_KEY=2026-06-16 npm run cohesion:compare
 *
 * Output: tmp/cohesion-strategy-compare/<dateKey>/*.png + contact-sheet.png
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

function loadDotEnvFallback() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] == null) process.env[match[1]] = value;
  }
}

loadDotEnvFallback();

const admin = require('firebase-admin');
const sharp = require('sharp');
const { getAppDateKey } = require('./lib/app-date-key.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT_W = 1070;
const OUT_H = 1340;

function loadEngineRuntime() {
  const sandbox = {
    console,
    Math,
    Date,
    parseInt,
    parseFloat,
    Number,
    String,
    Array,
    Object,
    JSON,
    Map,
    Set,
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    localStorage: { getItem: () => null, setItem: () => {} },
    window: { location: { search: '' } },
    CONFIG: { APP: { defaultColor: '#ea9b9a' } }
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const rel of ['lib/utils-core.js', 'lib/utils-quilt.js', 'lib/simple-quilt-engine.js']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(src, ctx, { filename: rel });
  }
  sandbox.Utils = sandbox.UtilsCore;
  return { SimpleQuiltEngine: sandbox.SimpleQuiltEngine, Utils: sandbox.Utils };
}

function initFirestore() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const sa = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
    });
  } else {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const resolvedCred = credPath ? path.resolve(credPath) : '';
    if (resolvedCred && fs.existsSync(resolvedCred)) {
      const sa = JSON.parse(fs.readFileSync(resolvedCred, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
      });
    } else {
      const localPath = path.join(ROOT, 'firebase-adminsdk-local.json');
      if (fs.existsSync(localPath)) {
        const sa = JSON.parse(fs.readFileSync(localPath, 'utf8'));
        admin.initializeApp({
          credential: admin.credential.cert(sa),
          projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
        });
      } else {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        if (!projectId) {
          throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID in .env');
        }
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId
        });
      }
    }
  }
  return admin.firestore();
}

async function fetchQuiltBlocks(dateKey) {
  const db = initFirestore();
  const snap = await db.collection('quilts').doc(dateKey).get();
  if (!snap.exists) throw new Error(`No quilts/${dateKey} in Firestore`);
  const data = snap.data();
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  if (blocks.length <= 1) throw new Error(`quilts/${dateKey} has ${blocks.length} block(s)`);
  return {
    blocks,
    submissionCount: Number(data.contributorCount) || blocks.length,
    macroStructureFrozen: data.macroStructureFrozen === true
  };
}

function paintSortKey(block) {
  const y = Number(block?.y) || 0;
  const x = Number(block?.x) || 0;
  return [y, x];
}

function blockShapes(block, Utils) {
  const x = Number(block.x) || 0;
  const y = Number(block.y) || 0;
  const w = Number(block.width) || 0;
  const h = Number(block.height) || 0;
  if (w <= 0 || h <= 0) return [];
  if (block.patternType === 'special' && block.specialPatternType === 'hst' && Utils?.getHstRenderTriangles) {
    return Utils.getHstRenderTriangles(block).map((tri) => {
      const fill = tri.color || block.color || '#c8c4bf';
      const pts = (tri.points || [])
        .map((p) => `${x + Number(p[0] || 0)},${y + Number(p[1] || 0)}`)
        .join(' ');
      return `<polygon points="${pts}" fill="${fill}"/>`;
    });
  }
  const fill = block.color || '#c8c4bf';
  return [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`];
}

function blocksToSvg(blocks, Utils, label, subtitle) {
  const valid = blocks.filter(
    (b) =>
      b &&
      [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
      Number(b.width) > 0 &&
      Number(b.height) > 0
  );
  const minX = Math.min(...valid.map((b) => b.x));
  const minY = Math.min(...valid.map((b) => b.y));
  const maxX = Math.max(...valid.map((b) => b.x + b.width));
  const maxY = Math.max(...valid.map((b) => b.y + b.height));
  const vbW = Math.max(1, maxX - minX);
  const vbH = Math.max(1, maxY - minY);
  const pad = 6;
  const sorted = [...valid].sort((a, b) => {
    const ka = paintSortKey(a);
    const kb = paintSortKey(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  });
  const shapes = sorted.flatMap((b) => blockShapes(b, Utils)).join('\n');
  const title = String(label || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;');
  const sub = String(subtitle || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${vbW + pad * 2} ${vbH + pad * 2}" width="${OUT_W}" height="${OUT_H}">
  <rect x="${minX - pad}" y="${minY - pad}" width="${vbW + pad * 2}" height="${vbH + pad * 2}" fill="#f6f4f1"/>
  ${shapes}
  <rect x="${minX - pad}" y="${minY - pad}" width="${vbW + pad * 2}" height="68" fill="rgba(246,244,241,0.92)"/>
  <text x="${minX}" y="${minY + 26}" font-family="-apple-system,sans-serif" font-size="22" font-weight="600" fill="#333">${title}</text>
  <text x="${minX}" y="${minY + 50}" font-family="-apple-system,sans-serif" font-size="14" fill="#666">${sub}</text>
</svg>`;
}

function makeEngine(SimpleQuiltEngine, blocks, submissionCount, macroStructureFrozen, deviceId) {
  const engine = new SimpleQuiltEngine(deviceId, { recordColorReplayEvents: false });
  engine.blocks = JSON.parse(JSON.stringify(blocks));
  engine.submissionCount = submissionCount;
  engine.macroStructureFrozen = macroStructureFrozen;
  return engine;
}

async function main() {
  const dateKey = String(process.env.DATE_KEY || getAppDateKey()).trim();
  const { SimpleQuiltEngine, Utils } = loadEngineRuntime();
  const { blocks, submissionCount, macroStructureFrozen } = await fetchQuiltBlocks(dateKey);

  const baseEngine = makeEngine(SimpleQuiltEngine, blocks, submissionCount, macroStructureFrozen, 'strategy_compare');
  const deferredBlocks = baseEngine.withDeferredCohesionPreviewBlocks(1);

  const seamEngine = makeEngine(SimpleQuiltEngine, blocks, submissionCount, macroStructureFrozen, 'seam_compare');
  const seamBlocks = seamEngine.withSeamSoftenPreviewBlocks(
    SimpleQuiltEngine.SEAM_SOFTEN_THRESHOLD,
    SimpleQuiltEngine.SEAM_SOFTEN_STRENGTH
  );

  const bothEngine = makeEngine(
    SimpleQuiltEngine,
    deferredBlocks,
    submissionCount,
    macroStructureFrozen,
    'both_compare'
  );
  const bothBlocks = bothEngine.withSeamSoftenPreviewBlocks(
    SimpleQuiltEngine.SEAM_SOFTEN_THRESHOLD,
    SimpleQuiltEngine.SEAM_SOFTEN_STRENGTH
  );

  const PANELS = [
    {
      key: '00-original',
      label: 'Original',
      subtitle: 'Live quilt · no treatment',
      blocks
    },
    {
      key: '01-deferred',
      label: 'Deferred prod',
      subtitle: 'Cohesion dampen on chroma>p90 only (next-add simulation)',
      blocks: deferredBlocks
    },
    {
      key: '02-seam-soften',
      label: `Seam soften ${Math.round(SimpleQuiltEngine.SEAM_SOFTEN_STRENGTH * 100)}%`,
      subtitle: `Both sides of ΔE>${SimpleQuiltEngine.SEAM_SOFTEN_THRESHOLD} seams nudged ${Math.round(SimpleQuiltEngine.SEAM_SOFTEN_STRENGTH * 100)}% toward midpoint`,
      blocks: seamBlocks
    },
    {
      key: '03-both',
      label: 'Deferred + seam',
      subtitle: 'Proposed two-layer stack',
      blocks: bothBlocks
    }
  ];

  const outDir = path.join(ROOT, 'tmp', 'cohesion-strategy-compare', dateKey);
  fs.mkdirSync(outDir, { recursive: true });

  const pngPaths = [];
  for (const { key, label, subtitle, blocks: previewBlocks } of PANELS) {
    const svg = blocksToSvg(previewBlocks, Utils, `${label} — ${dateKey}`, subtitle);
    const pngPath = path.join(outDir, `${key}.png`);
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    pngPaths.push({ pngPath, label, key });
    console.log(`[cohesion-compare] wrote ${pngPath}`);
  }

  const tileW = Math.floor(OUT_W / 2);
  const tileH = Math.floor(OUT_H / 2);
  const resized = await Promise.all(
    pngPaths.map((p) =>
      sharp(p.pngPath).resize(tileW, tileH, { fit: 'contain', background: '#ebe8e3' }).png().toBuffer()
    )
  );
  const contactPath = path.join(outDir, 'contact-sheet.png');
  await sharp({
    create: {
      width: tileW * 2,
      height: tileH * 2,
      channels: 3,
      background: '#ebe8e3'
    }
  })
    .composite([
      { input: resized[0], left: 0, top: 0 },
      { input: resized[1], left: tileW, top: 0 },
      { input: resized[2], left: 0, top: tileH },
      { input: resized[3], left: tileW, top: tileH }
    ])
    .png()
    .toFile(contactPath);
  console.log(`[cohesion-compare] wrote ${contactPath}`);
  console.log(`[cohesion-compare] done — ${outDir}`);
}

main().catch((err) => {
  console.error('[cohesion-compare] failed:', err.message || err);
  process.exit(1);
});
