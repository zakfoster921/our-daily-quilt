#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seam strength sweep: original vs deferred+seam at 15% / 25% / 35%.
 *
 *   npm run cohesion:sweep
 *   DATE_KEY=2026-06-16 npm run cohesion:sweep
 *
 * Output: tmp/cohesion-seam-sweep/<dateKey>/contact-sheet.png
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
const SEAM_THRESHOLD = Number(process.env.SEAM_THRESHOLD) || null;
const DEFERRED_STRENGTH = Number(process.env.DEFERRED_STRENGTH) || null;
const SEAM_STRENGTHS = String(process.env.SEAM_STRENGTHS || '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
  .map((n) => (n > 1 ? n / 100 : n));
const DEFAULT_SEAM_STRENGTHS = SEAM_STRENGTHS.length ? SEAM_STRENGTHS : [0.05, 0.1, 0.15];

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

function deferredPlusSeam(SimpleQuiltEngine, blocks, submissionCount, macroStructureFrozen, seamStrength) {
  const E = SimpleQuiltEngine;
  const base = makeEngine(E, blocks, submissionCount, macroStructureFrozen, 'deferred');
  const deferred = base.withDeferredCohesionPreviewBlocks(
    DEFERRED_STRENGTH ?? E.COHESION_DEFERRED_STRENGTH
  );
  const seamEngine = makeEngine(
    E,
    deferred,
    submissionCount,
    macroStructureFrozen,
    `seam_${Math.round(seamStrength * 100)}`
  );
  return seamEngine.withSeamSoftenPreviewBlocks(
    SEAM_THRESHOLD ?? E.SEAM_SOFTEN_THRESHOLD,
    seamStrength
  );
}

async function main() {
  const dateKey = String(process.env.DATE_KEY || getAppDateKey()).trim();
  const { SimpleQuiltEngine, Utils } = loadEngineRuntime();
  const { blocks, submissionCount, macroStructureFrozen } = await fetchQuiltBlocks(dateKey);

  const PANELS = [
    {
      key: '00-original',
      label: 'Original',
      subtitle: 'Live quilt · no treatment',
      blocks
    },
    ...DEFAULT_SEAM_STRENGTHS.map((s) => ({
      key: `seam-${Math.round(s * 100)}`,
      label: `Deferred + seam ${Math.round(s * 100)}%`,
      subtitle: `Deferred @100% · seam ΔE>${SEAM_THRESHOLD} · strength ${Math.round(s * 100)}%`,
      blocks: deferredPlusSeam(SimpleQuiltEngine, blocks, submissionCount, macroStructureFrozen, s)
    }))
  ];

  const outDir = path.join(ROOT, 'tmp', 'cohesion-seam-sweep', dateKey);
  fs.mkdirSync(outDir, { recursive: true });

  const pngPaths = [];
  for (const { key, label, subtitle, blocks: previewBlocks } of PANELS) {
    const svg = blocksToSvg(previewBlocks, Utils, `${label} — ${dateKey}`, subtitle);
    const pngPath = path.join(outDir, `${key}.png`);
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    pngPaths.push({ pngPath, label, key });
    console.log(`[cohesion-sweep] wrote ${pngPath}`);
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
  console.log(`[cohesion-sweep] wrote ${contactPath}`);
  console.log(`[cohesion-sweep] done — ${outDir}`);
}

main().catch((err) => {
  console.error('[cohesion-sweep] failed:', err.message || err);
  process.exit(1);
});
