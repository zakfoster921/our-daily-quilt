#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Test experimental hidden composition modes against real past quilts.
 *
 * If a date has enough ordered history, the script can replay from scratch.
 * Most older quilts do not, so the default useful path starts from the actual
 * stored quilt and simulates future growth using that day's real palette.
 *
 *   npm run composition:tester
 *   DATE_KEY=2026-06-30 npm run composition:tester
 *   DATE_KEYS=2026-06-28,2026-06-29 npm run composition:tester
 *
 * Output: tmp/composition-seed-tester/<dateKey>/current.png,
 * biased-<mode>.png, contact-sheet.png + summary.json
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

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
const { chromium } = require('playwright');
const sharp = require('sharp');
const { getAppDateKey } = require('./lib/app-date-key.cjs');
const { createServerQuiltEngine, loadServerQuiltRuntime, serializeServerQuiltBlocks } = require('./lib/server-quilt-engine.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT_W = Math.max(320, Math.floor(Number(process.env.OUT_W) || 1080));
const OUT_H = Math.max(568, Math.floor(Number(process.env.OUT_H) || 1920));
const CONTACT_GAP = Math.max(0, Math.floor(Number(process.env.CONTACT_GAP) || 72));
const USE_BROWSER_RENDERER = process.env.COMPOSITION_TESTER_BROWSER_RENDERER !== '0';
const MAX_REPLAY_COLORS = Math.max(1, Math.floor(Number(process.env.MAX_COLORS) || 220));
const SIM_ADDS = Math.max(1, Math.floor(Number(process.env.SIM_ADDS) || 18));
const MIN_REPLAY_COVERAGE = Math.max(0, Math.min(1, Number(process.env.MIN_REPLAY_COVERAGE) || 0.85));
const MODE_KEYS = String(process.env.MODES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MODE_CONFIG = {
  actual: {
    label: 'Actual',
    description: 'Stored live quilt'
  },
  baseline: {
    label: 'Baseline',
    description: 'Current engine growth'
  },
  field: {
    label: 'Field',
    description: 'Larger quiet regions, fewer special interruptions',
    specials: 0.35,
    accentBias: 0.35,
    patternPreference: ['insetCircle', 'framed', 'hst']
  },
  mosaic: {
    label: 'Mosaic',
    description: 'More small-block variety and pattern churn',
    specials: 1.7,
    accentBias: 1.25,
    forceOversizedEvery: 2,
    patternPreference: ['checkerboard', 'hst', 'cross', 'railfence', 'stripes']
  },
  strata: {
    label: 'Strata',
    description: 'Band-like splits and stripe preference',
    specials: 1.15,
    axis: 'horizontal',
    patternPreference: ['stripes', 'railfence', 'hst']
  },
  garden: {
    label: 'Garden',
    description: 'Color-family clustering with organic specials',
    specials: 1.1,
    colorRoute: 'family',
    patternPreference: ['insetCircle', 'framed', 'hst', 'stripes']
  },
  vein: {
    label: 'Vein',
    description: 'Outlier colors become thin interruptions',
    specials: 0.85,
    accentBias: 1.8,
    outlierAccent: true,
    patternPreference: ['stripes', 'hst', 'railfence']
  },
  window: {
    label: 'Window',
    description: 'Protects a few large calm regions',
    specials: 0.5,
    largeBlockPenalty: 0.55,
    patternPreference: ['framed', 'insetCircle', 'hst']
  },
  constellation: {
    label: 'Constellation',
    description: 'Rare saturated colors become small focal points',
    specials: 0.95,
    saturatedAccent: true,
    patternPreference: ['insetCircle', 'hst', 'cross']
  },
  tide: {
    label: 'Tide',
    description: 'Warm/cool alternation and soft directional drift',
    specials: 1.0,
    colorRoute: 'temperature',
    alternatingAxis: true,
    patternPreference: ['stripes', 'framed', 'hst']
  }
};

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

function startStaticServer() {
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
        url: `http://127.0.0.1:${address.port}/our-daily-beta?compositionTester=1`
      });
    });
  });
}

function normalizeHex(hex) {
  const s = String(hex || '').trim();
  const match = s.match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : '';
}

function hexToRgb(hex) {
  const clean = normalizeHex(hex);
  if (!clean) return null;
  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16)
  };
}

function hexToHsl(hex) {
  const rgb = hexToRgb(hex) || { r: 128, g: 128, b: 128 };
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function colorFamily(hex) {
  const { h, s, l } = hexToHsl(hex);
  if (l > 0.92 && s < 0.18) return 'white';
  if (l < 0.12 && s < 0.22) return 'black';
  if (s < 0.14) return 'gray';
  if (h < 30) return 'red';
  if (h < 60) return 'orange';
  if (h < 90) return 'yellow';
  if (h < 150) return 'green';
  if (h < 210) return 'cyan';
  if (h < 270) return 'blue';
  if (h < 330) return 'magenta';
  return 'pink';
}

function isWarmFamily(name) {
  return ['red', 'orange', 'yellow', 'pink', 'magenta'].includes(String(name || '').toLowerCase());
}

function hueDistance(a, b) {
  const ah = hexToHsl(a).h;
  const bh = hexToHsl(b).h;
  const d = Math.abs(ah - bh) % 360;
  return Math.min(d, 360 - d) / 180;
}

function analyzeColors(colors) {
  const clean = colors.map(normalizeHex).filter(Boolean);
  const familyCounts = new Map();
  const lightnesses = [];
  const saturations = [];
  clean.forEach((hex) => {
    const fam = colorFamily(hex);
    familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
    const hsl = hexToHsl(hex);
    lightnesses.push(hsl.l);
    saturations.push(hsl.s);
  });
  const families = [...familyCounts.entries()].sort((a, b) => b[1] - a[1]);
  const dominant = families[0] || ['unknown', 0];
  const warmCount = families.reduce((sum, [name, count]) => sum + (isWarmFamily(name) ? count : 0), 0);
  let familySwitches = 0;
  let hueTravel = 0;
  for (let i = 1; i < clean.length; i += 1) {
    if (colorFamily(clean[i]) !== colorFamily(clean[i - 1])) familySwitches += 1;
    hueTravel += hueDistance(clean[i], clean[i - 1]);
  }
  const lightSpread = lightnesses.length ? Math.max(...lightnesses) - Math.min(...lightnesses) : 0;
  const avgSaturation = saturations.length ? saturations.reduce((a, b) => a + b, 0) / saturations.length : 0;
  return {
    count: clean.length,
    diversity: clean.length ? familyCounts.size / Math.max(1, Math.min(8, clean.length)) : 0,
    familyCount: familyCounts.size,
    dominantFamily: dominant[0],
    dominance: clean.length ? dominant[1] / clean.length : 0,
    contrast: lightSpread,
    warmth: clean.length ? warmCount / clean.length : 0,
    avgSaturation,
    momentum: clean.length > 1 ? familySwitches / (clean.length - 1) : 0,
    hueTravel: clean.length > 1 ? hueTravel / (clean.length - 1) : 0,
    families: Object.fromEntries(families)
  };
}

function inferMode(metrics) {
  if (metrics.count < 8) return 'baseline';
  if (metrics.dominance >= 0.48 && metrics.contrast < 0.34) return 'field';
  if (metrics.dominance >= 0.42 && metrics.diversity < 0.45) return 'garden';
  if (metrics.momentum >= 0.78 && metrics.familyCount <= 4) return 'tide';
  if (metrics.hueTravel >= 0.48 && metrics.avgSaturation >= 0.55) return 'constellation';
  if (metrics.diversity >= 0.75) return 'mosaic';
  if (metrics.momentum <= 0.35 && metrics.familyCount >= 3) return 'strata';
  return 'window';
}

async function fetchQuiltData(dateKey) {
  const db = initFirestore();
  const [snap, submissionSnap] = await Promise.all([
    db.collection('quilts').doc(dateKey).get(),
    db.collection('colorSubmissions').where('appDateKey', '==', dateKey).get()
  ]);
  if (!snap.exists) throw new Error(`No quilts/${dateKey} in Firestore`);
  const data = snap.data() || {};
  const liveBlocks = Array.isArray(data.blocks) ? data.blocks : [];
  const liveContributorCount = Number(data.contributorCount) || 0;
  const liveSubmissionCount = Math.max(
    liveContributorCount,
    liveBlocks.reduce((max, block) => {
      const n = Number(block?.submissionIndex);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0),
    liveBlocks.length
  );
  const replayColors = (Array.isArray(data.colorReplayEvents) ? data.colorReplayEvents : [])
    .slice()
    .sort((a, b) => {
      const seqA = Number(a?.seq) || 0;
      const seqB = Number(b?.seq) || 0;
      if (seqA !== seqB) return seqA - seqB;
      return String(a?.iso || '').localeCompare(String(b?.iso || ''));
    })
    .map((e) => normalizeHex(e?.newHex))
    .filter(Boolean);
  const submissionColors = submissionSnap.docs
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
      const at = a.createdAtIso || '';
      const bt = b.createdAtIso || '';
      if (at !== bt) return at.localeCompare(bt);
      return a.id.localeCompare(b.id);
    })
    .map((row) => row.color)
    .filter(Boolean);
  const source = replayColors.length >= 2 ? 'colorReplayEvents' : 'colorSubmissions';
  const colors = (source === 'colorReplayEvents' ? replayColors : submissionColors).slice(0, MAX_REPLAY_COLORS);
  if (!liveBlocks.length) throw new Error(`quilts/${dateKey} has no stored live blocks`);
  const liveColors = liveBlocks.map((b) => normalizeHex(b?.color)).filter(Boolean);
  return {
    dateKey,
    colors,
    source: colors.length >= 2 ? source : 'actualOnly',
    liveColors,
    liveBlocks,
    liveBlockCount: liveBlocks.length,
    liveContributorCount,
    liveSubmissionCount,
    macroStructureFrozen: data.macroStructureFrozen === true
  };
}

function safeConsole(fn) {
  const original = console.log;
  const originalWarn = console.warn;
  if (!process.env.VERBOSE_COMPOSITION_TESTER) {
    console.log = () => {};
    console.warn = () => {};
  }
  try {
    return fn();
  } finally {
    console.log = original;
    console.warn = originalWarn;
  }
}

function withPatchedRandom(modeKey, fn) {
  if (modeKey === 'baseline') return fn();
  const originalRandom = Math.random;
  const config = MODE_CONFIG[modeKey] || {};
  const specialMultiplier = Number(config.specials) || 1;
  Math.random = () => {
    const raw = originalRandom();
    if (raw < 0.75) {
      return Math.max(0, Math.min(0.999999, raw / specialMultiplier));
    }
    return raw;
  };
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

function installModeBiases(engine, modeKey) {
  if (modeKey === 'baseline') return;
  const config = MODE_CONFIG[modeKey] || {};
  const originalSelectPatternType = engine.selectPatternType?.bind(engine);
  const originalAccentBias = engine._regularSplitAccentBias?.bind(engine);
  const originalForceOversized = engine._shouldForceOversizedSplit?.bind(engine);
  const originalRouteMacro = engine._routeSplittableBlocksByMacroColor?.bind(engine);
  const originalFilterMacro = engine._filterMacroCandidatesByColorOrValue?.bind(engine);

  if (originalSelectPatternType && Array.isArray(config.patternPreference)) {
    engine.selectPatternType = (availablePatterns, block, newColor) => {
      for (const preferred of config.patternPreference) {
        if (availablePatterns.includes(preferred)) return preferred;
      }
      return originalSelectPatternType(availablePatterns, block, newColor);
    };
  }

  if (originalAccentBias && (config.accentBias || config.outlierAccent || config.saturatedAccent)) {
    engine._regularSplitAccentBias = () => {
      let bias = originalAccentBias();
      if (config.accentBias) bias *= Number(config.accentBias) || 1;
      return Math.max(0, Math.min(1, bias));
    };
  }

  if (originalForceOversized && config.forceOversizedEvery) {
    engine._shouldForceOversizedSplit = () => {
      const every = Math.max(1, Math.floor(Number(config.forceOversizedEvery) || 1));
      return (Number(engine.submissionCount) || 0) % every === 0 || originalForceOversized();
    };
  }

  if (config.colorRoute && originalRouteMacro) {
    engine._routeSplittableBlocksByMacroColor = (newColor, candidateBlocks) => {
      const routed = originalRouteMacro(newColor, candidateBlocks);
      if (!Array.isArray(routed) || routed.length <= 1) return routed;
      if (config.colorRoute === 'family') {
        const fam = colorFamily(newColor);
        return [...routed].sort((a, b) => {
          const sameA = colorFamily(a?.color) === fam ? 1 : 0;
          const sameB = colorFamily(b?.color) === fam ? 1 : 0;
          if (sameA !== sameB) return sameB - sameA;
          return (Number(b?.width) || 0) * (Number(b?.height) || 0) - (Number(a?.width) || 0) * (Number(a?.height) || 0);
        });
      }
      if (config.colorRoute === 'temperature') {
        const warm = isWarmFamily(colorFamily(newColor));
        return [...routed].sort((a, b) => {
          const matchA = isWarmFamily(colorFamily(a?.color)) === warm ? 1 : 0;
          const matchB = isWarmFamily(colorFamily(b?.color)) === warm ? 1 : 0;
          if (matchA !== matchB) return matchB - matchA;
          return hueDistance(a?.color, newColor) - hueDistance(b?.color, newColor);
        });
      }
      return routed;
    };
  }

  if (config.largeBlockPenalty && originalFilterMacro) {
    engine._filterMacroCandidatesByColorOrValue = (blocks, newColor) => {
      const filtered = originalFilterMacro(blocks, newColor);
      if (!Array.isArray(filtered) || filtered.length <= 3) return filtered;
      const areas = filtered.map((b) => (Number(b?.width) || 0) * (Number(b?.height) || 0)).sort((a, b) => b - a);
      const cutoff = areas[Math.max(0, Math.floor(areas.length * Number(config.largeBlockPenalty)) - 1)] || Infinity;
      const smaller = filtered.filter((b) => (Number(b?.width) || 0) * (Number(b?.height) || 0) <= cutoff);
      return smaller.length >= 2 ? smaller : filtered;
    };
  }
}

function replayMode(dateKey, colors, modeKey) {
  return withPatchedRandom(modeKey, () =>
    safeConsole(() => {
      const engine = createServerQuiltEngine({
        userId: `composition-${modeKey}-${dateKey}`,
        blocks: [],
        submissionCount: 0,
        colorReplayEvents: [],
        macroStructureFrozen: false
      });
      installModeBiases(engine, modeKey);
      const skippedColors = [];
      for (const hex of colors) {
        const result = engine.addColor(hex);
        if (!result) {
          skippedColors.push(hex);
          console.warn(`[composition-tester] ${dateKey} ${modeKey}: skipped ${hex}`);
        }
      }
      return {
        mode: modeKey,
        blocks: serializeServerQuiltBlocks(engine),
        submissionCount: Number(engine.submissionCount) || colors.length,
        macroStructureFrozen: engine.macroStructureFrozen === true,
        skippedColors
      };
    })
  );
}

function makeContinuationColors(quilt, count) {
  const source = (quilt.colors.length >= 2 ? quilt.colors : quilt.liveColors).map(normalizeHex).filter(Boolean);
  if (!source.length) return [];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const base = source[(i * 7 + i * i * 3) % source.length];
    const hsl = hexToHsl(base);
    const wave = ((i % 5) - 2) * 0.025;
    const l = Math.max(0.12, Math.min(0.9, hsl.l + wave));
    const s = Math.max(0.08, Math.min(1, hsl.s + (((i + 2) % 3) - 1) * 0.03));
    out.push(hslToHex(hsl.h, s, l));
  }
  return out;
}

function hslToHex(h, s, l) {
  h = ((Number(h) || 0) % 360 + 360) % 360;
  s = Math.max(0, Math.min(1, Number(s) || 0));
  l = Math.max(0, Math.min(1, Number(l) || 0));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function continueMode(dateKey, quilt, continuationColors, modeKey) {
  return withPatchedRandom(modeKey, () =>
    safeConsole(() => {
      const engine = createServerQuiltEngine({
        userId: `composition-continue-${modeKey}-${dateKey}`,
        blocks: quilt.liveBlocks,
        submissionCount: quilt.liveSubmissionCount,
        colorReplayEvents: [],
        macroStructureFrozen: quilt.macroStructureFrozen
      });
      installModeBiases(engine, modeKey);
      const skippedColors = [];
      for (const hex of continuationColors) {
        const result = engine.addColor(hex);
        if (!result) skippedColors.push(hex);
      }
      return {
        mode: modeKey,
        blocks: serializeServerQuiltBlocks(engine),
        submissionCount: Number(engine.submissionCount) || quilt.liveSubmissionCount,
        macroStructureFrozen: engine.macroStructureFrozen === true,
        skippedColors
      };
    })
  );
}

function paintSortKey(block) {
  return [Number(block?.visualLayerIndex) || 0, Number(block?.y) || 0, Number(block?.x) || 0];
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function polygon(points, fill) {
  const pts = (points || [])
    .map((p) => `${Number(p?.[0]) || 0},${Number(p?.[1]) || 0}`)
    .join(' ');
  return pts ? `<polygon points="${pts}" fill="${esc(fill)}"/>` : '';
}

function blockShapes(block, Utils) {
  const x = Number(block.x) || 0;
  const y = Number(block.y) || 0;
  const w = Number(block.width) || 0;
  const h = Number(block.height) || 0;
  if (w <= 0 || h <= 0) return [];
  if (Array.isArray(block.polygonPieces) && block.polygonPieces.length) {
    return block.polygonPieces
      .map((piece) => {
        const pts = (piece.points || [])
          .map((p) => `${x + (Number(p?.[0]) || 0)},${y + (Number(p?.[1]) || 0)}`)
          .join(' ');
        return pts ? `<polygon points="${pts}" fill="${esc(piece.color || block.color || '#c8c4bf')}"/>` : '';
      })
      .filter(Boolean);
  }
  if (block.patternType === 'special' && block.specialPatternType === 'hst' && Utils?.getHstRenderTriangles) {
    return Utils.getHstRenderTriangles(block).map((tri) => {
      const pts = (tri.points || [])
        .map((p) => `${x + Number(p[0] || 0)},${y + Number(p[1] || 0)}`)
        .join(' ');
      return `<polygon points="${pts}" fill="${esc(tri.color || block.color || '#c8c4bf')}"/>`;
    });
  }
  if (block.specialPatternType === 'insetCircle' && block.insetInnerColor) {
    const cx = Number(block.insetCx);
    const cy = Number(block.insetCy);
    const r = Number(block.insetR);
    const clipId = `clip_${String(block.id || '').replace(/[^A-Za-z0-9_-]/g, '_')}`;
    if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r) && r > 0) {
      return [
        `<defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>`,
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(block.color || '#c8c4bf')}"/>`,
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${esc(block.insetInnerColor)}" clip-path="url(#${clipId})"/>`
      ];
    }
  }
  if (Array.isArray(block.hstTriangles) && block.hstTriangles.length) {
    return block.hstTriangles.map((tri) => polygon(tri.points, tri.color || block.color || '#c8c4bf')).filter(Boolean);
  }
  return [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(block.color || '#c8c4bf')}"/>`];
}

function blocksToSvg(blocks, Utils, QuiltMirrorLayout, label, subtitle, dateKey) {
  const valid = blocks.filter(
    (b) =>
      b &&
      [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
      Number(b.width) > 0 &&
      Number(b.height) > 0
  );
  if (!valid.length) throw new Error(`No valid blocks for ${label}`);
  const minX = Math.min(...valid.map((b) => b.x));
  const minY = Math.min(...valid.map((b) => b.y));
  const maxX = Math.max(...valid.map((b) => b.x + b.width));
  const maxY = Math.max(...valid.map((b) => b.y + b.height));
  const vbW = Math.max(1, maxX - minX);
  const vbH = Math.max(1, maxY - minY);
  const mirrorLayout = QuiltMirrorLayout?.computeFromBlocks
    ? QuiltMirrorLayout.computeFromBlocks(valid, {
        dateKey,
        viewportW: OUT_W,
        viewportH: OUT_H
      })
    : null;
  const horizontalStretch = mirrorLayout?.horizontalStretch ?? 1.16;
  const mirrorSeamOffset = mirrorLayout?.mirrorSeamOffset ?? vbH * 0.82;
  const mirrorSeamOverlap = mirrorLayout?.mirrorSeamOverlapPx ?? 8;
  const viewBox = mirrorLayout?.viewBox ?? {
    x: minX - Math.max(6, vbW * 0.02),
    y: minY - Math.max(6, vbW * 0.02),
    width: vbW * horizontalStretch + Math.max(6, vbW * 0.02) * 2,
    height: vbH + mirrorSeamOffset + Math.max(6, vbW * 0.02) * 2
  };
  const sorted = [...valid].sort((a, b) => {
    const ka = paintSortKey(a);
    const kb = paintSortKey(b);
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  });
  const shapes = sorted.flatMap((b) => blockShapes(b, Utils)).join('\n');
  const fieldTransform = horizontalStretch !== 1
    ? `translate(${minX} 0) scale(${horizontalStretch} 1) translate(${-minX} 0)`
    : '';
  const mirrorTransform = QuiltMirrorLayout?.mirrorTransform
    ? QuiltMirrorLayout.mirrorTransform(minX, minY, vbW, vbH, mirrorSeamOffset)
    : `translate(${minX + vbW} ${minY + vbH + mirrorSeamOffset - mirrorSeamOverlap}) scale(-1 -1)`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" width="${OUT_W}" height="${OUT_H}" preserveAspectRatio="xMidYMin slice">
  <rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.width}" height="${viewBox.height}" fill="#f6f4f1"/>
  <g id="quiltFieldLayer"${fieldTransform ? ` transform="${fieldTransform}"` : ''}>
    <g id="quiltMirroredFieldLayer" aria-hidden="true" pointer-events="none" transform="${mirrorTransform}">
      ${shapes}
    </g>
    <g id="quiltParallaxLayer">
      ${shapes}
    </g>
  </g>
  <rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.width}" height="76" fill="rgba(246,244,241,0.94)"/>
  <text x="${viewBox.x + 8}" y="${viewBox.y + 28}" font-family="-apple-system,sans-serif" font-size="22" font-weight="700" fill="#333">${esc(label)}</text>
  <text x="${viewBox.x + 8}" y="${viewBox.y + 54}" font-family="-apple-system,sans-serif" font-size="14" fill="#666">${esc(subtitle)}</text>
</svg>`;
}

async function writeContactSheet(panelImages, contactPath) {
  const cols = Math.min(2, panelImages.length);
  const rows = Math.ceil(panelImages.length / cols);
  const tileW = OUT_W;
  const tileH = OUT_H;
  const resized = await Promise.all(
    panelImages.map((p) =>
      sharp(p.buffer).resize(tileW, tileH, { fit: 'contain', background: '#fff' }).png().toBuffer()
    )
  );
  await sharp({
    create: {
      width: tileW * cols + CONTACT_GAP * Math.max(0, cols - 1),
      height: tileH * rows + CONTACT_GAP * Math.max(0, rows - 1),
      channels: 3,
      background: '#fff'
    }
  })
    .composite(
      resized.map((input, idx) => ({
        input,
        left: (idx % cols) * (tileW + CONTACT_GAP),
        top: Math.floor(idx / cols) * (tileH + CONTACT_GAP)
      }))
    )
    .png()
    .toFile(contactPath);
}

async function renderPanelsWithRealQuiltRenderer(renderPanels, dateKey) {
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
    await page.addStyleTag({
      content: `
        html, body {
          margin: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          overflow: hidden !important;
          background: #fff !important;
        }
        body > *:not(#app) { display: none !important; }
        .screen { display: none !important; }
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
          z-index: 1 !important;
        }
        #screen-quilt > :not(.quilt-container) {
          display: none !important;
        }
        #screen-quilt .quilt-container {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          max-width: none !important;
          margin: 0 !important;
          overflow: hidden !important;
          background: #f6f4f1 !important;
        }
      `
    });

    const out = [];
    for (const panel of renderPanels) {
      await page.evaluate(async ({ blocks, submissionCount, dateKey: panelDateKey }) => {
        const app = window.app;
        document.querySelectorAll('.screen').forEach((screen) => {
          screen.classList.remove('active');
          screen.style.display = 'none';
          screen.setAttribute('aria-hidden', 'true');
        });
        const screen = document.getElementById('screen-quilt');
        screen?.classList.add('active');
        screen?.removeAttribute('hidden');
        screen?.setAttribute('aria-hidden', 'false');
        if (screen) screen.style.display = 'flex';

        if (typeof app.applyQuiltDataFromPayload === 'function') {
          await app.applyQuiltDataFromPayload({
            blocks,
            contributors: [],
            contributorCount: submissionCount,
            dateKey: panelDateKey,
            date: panelDateKey
          });
        } else {
          app.quiltEngine.blocks = JSON.parse(JSON.stringify(blocks));
          app.quiltEngine.submissionCount = submissionCount;
        }

        app.renderer?.setBacksidePreviewEnabled?.(app._isBacksidePreviewMode === true);
        if (app.renderer?.renderBlocks) {
          app.renderer.renderBlocks(blocks, [], submissionCount);
        } else if (typeof app.renderQuilt === 'function') {
          await app.renderQuilt();
        }
      }, {
        blocks: panel.blocks,
        submissionCount: panel.submissionCount,
        dateKey
      });

      await page.waitForFunction(
        () => {
          const svg = document.getElementById('quilt');
          return !!svg?.querySelector('#quiltMirroredFieldLayer') && !!svg?.querySelector('#quiltParallaxLayer');
        },
        undefined,
        { timeout: 60000 }
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

async function renderDate(dateKey) {
  const { Utils, QuiltMirrorLayout } = loadServerQuiltRuntime();
  const quilt = await fetchQuiltData(dateKey);
  const metrics = analyzeColors(quilt.colors.length >= 2 ? quilt.colors : quilt.liveColors);
  const inferredMode = inferMode(metrics);
  const replayCoverage = quilt.liveContributorCount > 0 ? quilt.colors.length / quilt.liveContributorCount : 0;
  const useReplayFromScratch = process.env.COMPOSITION_TESTER_MODE === 'replay' && replayCoverage >= MIN_REPLAY_COVERAGE;
  const continuationColors = makeContinuationColors(quilt, SIM_ADDS);
  const modeKeys = MODE_KEYS.length
    ? [...new Set(MODE_KEYS.filter((mode) => MODE_CONFIG[mode]))]
    : ['baseline', inferredMode].filter((mode, index, list) => mode && list.indexOf(mode) === index);
  const outDir = path.join(ROOT, 'tmp', 'composition-seed-tester', dateKey);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `[composition-tester] ${dateKey}: ${quilt.colors.length} replay colors from ${quilt.source}; ${Math.round(replayCoverage * 100)}% coverage; inferred mode ${inferredMode}`
  );
  if (!useReplayFromScratch) {
    console.warn(
      `[composition-tester] ${dateKey}: using actual quilt + ${continuationColors.length} simulated palette-matched adds`
    );
  }

  for (const fileName of fs.readdirSync(outDir)) {
    if (/^(?:actual|baseline|current|biased-.+)\.png$/.test(fileName)) {
      fs.rmSync(path.join(outDir, fileName), { force: true });
    }
  }

  const renderPanels = [];
  const panels = [];
  for (const mode of modeKeys) {
    const config = MODE_CONFIG[mode];
    const replay = useReplayFromScratch
        ? replayMode(dateKey, quilt.colors, mode)
        : continueMode(dateKey, quilt, continuationColors, mode);
    const isCurrent = mode === 'baseline';
    const label = isCurrent
      ? `Current Code — ${dateKey}`
      : `New Bias: ${config.label} — ${dateKey}`;
    const skippedText = replay.skippedColors.length ? ` · ${replay.skippedColors.length} skipped` : '';
    const subtitle = useReplayFromScratch
        ? `${config.description} · replay · ${replay.blocks.length} blocks${skippedText}`
        : `${config.description} · actual + ${continuationColors.length} adds · ${replay.blocks.length} blocks${skippedText}`;
    renderPanels.push({
      mode,
      label,
      subtitle,
      blocks: replay.blocks,
      submissionCount: replay.submissionCount
    });
    panels.push({
      mode,
      label: config.label,
      description: config.description,
      blockCount: replay.blocks.length,
      submissionCount: replay.submissionCount,
      skippedCount: replay.skippedColors.length,
      skippedColors: replay.skippedColors,
      macroStructureFrozen: replay.macroStructureFrozen
    });
  }

  const panelImages = USE_BROWSER_RENDERER
    ? await renderPanelsWithRealQuiltRenderer(renderPanels, dateKey)
    : await Promise.all(renderPanels.map(async (panel) => {
        const svg = blocksToSvg(panel.blocks, Utils, QuiltMirrorLayout, panel.label, panel.subtitle, dateKey);
        const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
        return { ...panel, buffer };
      }));
  panelImages.forEach((panel) => {
    console.log(`[composition-tester] rendered ${panel.mode === 'baseline' ? 'current code' : `biased ${panel.mode}`} panel`);
  });

  const contactPath = path.join(outDir, 'contact-sheet.png');
  await writeContactSheet(panelImages, contactPath);
  const summary = {
    dateKey,
    source: quilt.source,
    colorCount: quilt.colors.length,
    replayCoverage,
    testerMode: useReplayFromScratch ? 'replay' : 'continue-from-actual',
    simulatedAdds: useReplayFromScratch ? 0 : continuationColors.length,
    liveBlockCount: quilt.liveBlockCount,
    liveContributorCount: quilt.liveContributorCount,
    inferredMode,
    metrics,
    modes: panels,
    contactSheet: path.relative(ROOT, contactPath)
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[composition-tester] wrote ${contactPath}`);
  return summary;
}

async function main() {
  const dateKeys = String(process.env.DATE_KEYS || process.env.DATE_KEY || getAppDateKey())
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const summaries = [];
  for (const dateKey of dateKeys) {
    summaries.push(await renderDate(dateKey));
  }
  if (summaries.length > 1) {
    const outDir = path.join(ROOT, 'tmp', 'composition-seed-tester');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summaries, null, 2)}\n`);
  }
  console.log('[composition-tester] done');
}

main().catch((err) => {
  console.error('[composition-tester] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
