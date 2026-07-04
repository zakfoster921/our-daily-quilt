const { createServerQuiltEngine, serializeServerQuiltBlocks } = require('./server-quilt-engine.cjs');

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

function normalizeHex(hex) {
  const s = String(hex || '').trim();
  const match = s.match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : '';
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

function orderedReplayEvents(quiltData) {
  return (Array.isArray(quiltData?.colorReplayEvents) ? quiltData.colorReplayEvents : [])
    .slice()
    .sort((a, b) => {
      const seqA = Number(a?.seq) || 0;
      const seqB = Number(b?.seq) || 0;
      if (seqA !== seqB) return seqA - seqB;
      return String(a?.iso || '').localeCompare(String(b?.iso || ''));
    });
}

function reconstructArchiveSnapshotAt(events, lockAt) {
  const usableEvents = (Array.isArray(events) ? events : [])
    .filter((event) => Number(event?.seq) > 0 && Number(event?.seq) <= lockAt)
    .sort((a, b) => {
      const seqA = Number(a?.seq) || 0;
      const seqB = Number(b?.seq) || 0;
      if (seqA !== seqB) return seqA - seqB;
      return String(a?.iso || '').localeCompare(String(b?.iso || ''));
    });
  if (!usableEvents.length) return null;

  const firstParent = cloneJson(usableEvents[0]?.parent, null);
  if (!firstParent) return null;
  const blocks = [firstParent];

  for (const event of usableEvents) {
    const parentId = String(event?.parent?.id || '').trim();
    const children = cloneJson(event?.children, [])
      .filter((block) => block && String(block.id || '').trim());
    if (!parentId || !children.length) return null;

    const index = blocks.findIndex((block) => String(block?.id || '') === parentId);
    if (index === -1) return null;
    blocks.splice(index, 1, ...children);
  }

  return {
    blocks,
    submissionCount: Math.max(0, Math.floor(Number(usableEvents[usableEvents.length - 1]?.seq) || lockAt))
  };
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

function installPaletteLock(engine) {
  if (!engine) return;
  if (typeof engine._harmonyAdjustedSplitColor === 'function') {
    engine._harmonyAdjustedSplitColor = (_selectedBlock, userHex) => userHex;
  }
  if (typeof engine._tonalSplitColorForMacroRegion === 'function') {
    engine._tonalSplitColorForMacroRegion = (_block, candidateColor) => candidateColor;
  }
  if (typeof engine._ensureDistinctHstPartner === 'function') {
    engine._ensureDistinctHstPartner = (baseColor, candidateColor) => {
      const normalized = normalizeHex(candidateColor);
      return normalized || normalizeHex(baseColor) || candidateColor || baseColor;
    };
  }
  if (typeof engine.runColorSettlingPass === 'function') {
    engine.runColorSettlingPass = () => false;
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

function replaySequence(dateKey, colors, modeKey, lockAt, options = {}) {
  const originalRandom = Math.random;
  Math.random = mulberry32(hashString(`composition-seed-tester:${dateKey}`));
  try {
    const engine = createServerQuiltEngine({
      userId: `composition-${modeKey}-${dateKey}`,
      blocks: Array.isArray(options.initialBlocks) ? options.initialBlocks : [],
      submissionCount: Math.max(0, Math.floor(Number(options.initialSubmissionCount) || 0)),
      colorReplayEvents: [],
      macroStructureFrozen: options.macroStructureFrozen === true
    });
    installPaletteLock(engine);
    const skippedColors = [];
    let biasInstalled = modeKey === 'baseline';
    const startIndex = Math.max(0, Math.floor(Number(options.startIndex) || 0));
    for (let i = startIndex; i < colors.length; i += 1) {
      const hex = colors[i];
      const shouldBias = modeKey !== 'baseline' && i >= lockAt;
      if (shouldBias && !biasInstalled) {
        installModeBiases(engine, modeKey);
        biasInstalled = true;
      }
      const result = shouldBias
        ? withPatchedRandom(modeKey, () => engine.addColor(hex))
        : engine.addColor(hex);
      if (!result) skippedColors.push({ index: i + 1, color: hex });
    }
    return {
      mode: modeKey,
      blocks: serializeServerQuiltBlocks(engine),
      submissionCount: Number(engine.submissionCount) || colors.length,
      macroStructureFrozen: engine.macroStructureFrozen === true,
      skippedColors
    };
  } finally {
    Math.random = originalRandom;
  }
}

function collectBlockHexes(blocks) {
  const hexes = [];
  const push = (value) => {
    const normalized = normalizeHex(value);
    if (normalized) hexes.push(normalized);
  };
  for (const block of Array.isArray(blocks) ? blocks : []) {
    push(block?.color);
    push(block?.contributorColor);
    push(block?.hstColorB);
    push(block?.insetInnerColor);
    push(block?.specialOriginalColor);
    push(block?.specialOriginalInnerColor);
    push(block?.macroFrozenColor);
    for (const tri of Array.isArray(block?.hstTriangles) ? block.hstTriangles : []) push(tri?.color);
    for (const piece of Array.isArray(block?.polygonPieces) ? block.polygonPieces : []) push(piece?.color);
  }
  return hexes;
}

function missingSubmissionIndices(blocks, expectedCount) {
  const seen = new Set();
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const index = Math.floor(Number(block?.submissionIndex) || 0);
    if (index > 0) seen.add(index);
  }
  const missing = [];
  for (let index = 1; index <= expectedCount; index += 1) {
    if (!seen.has(index)) missing.push(index);
  }
  return missing;
}

function panelAudit(blocks, colors) {
  const inputPalette = new Set((Array.isArray(colors) ? colors : []).map(normalizeHex).filter(Boolean));
  const outputPalette = [...new Set(collectBlockHexes(blocks))];
  return {
    outputUniqueColorCount: outputPalette.length,
    outOfPaletteColors: outputPalette.filter((hex) => !inputPalette.has(hex)),
    missingSubmissionIndices: missingSubmissionIndices(blocks, colors.length)
  };
}

function buildCompositionPreviewFromQuiltData(dateKey, quiltData, options = {}) {
  const lockAt = Math.max(1, Math.floor(Number(options.lockAt) || 10));
  const replayEvents = orderedReplayEvents(quiltData);
  const colors = replayEvents.map((event) => normalizeHex(event?.newHex)).filter(Boolean);
  const liveBlocks = Array.isArray(quiltData?.blocks) ? cloneJson(quiltData.blocks, []) : [];
  const liveContributorCount = Number(quiltData?.contributorCount) || 0;
  const liveSubmissionCount = Math.max(
    liveContributorCount,
    liveBlocks.reduce((max, block) => {
      const n = Number(block?.submissionIndex);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0),
    liveBlocks.length
  );

  if (!liveBlocks.length) throw new Error(`quilts/${dateKey} has no stored live blocks`);

  const hasSparseColorHistory = colors.length <= lockAt;
  const lockColors = colors.slice(0, Math.min(lockAt, colors.length));
  const metrics = analyzeColors(lockColors);
  const inferredMode = MODE_CONFIG[options.modeKey]
    ? String(options.modeKey)
    : hasSparseColorHistory
      ? 'window'
      : inferMode(metrics);
  const modeKeys = hasSparseColorHistory && options.includeStoredOriginal !== false
    ? [inferredMode]
    : ['baseline', inferredMode].filter((mode, index, list) => mode && list.indexOf(mode) === index);
  const replayCoverage = liveContributorCount > 0 ? colors.length / liveContributorCount : 0;
  const archiveLockSnapshot = hasSparseColorHistory ? null : reconstructArchiveSnapshotAt(replayEvents, lockAt);
  const replayOptions = archiveLockSnapshot
    ? {
        initialBlocks: archiveLockSnapshot.blocks,
        initialSubmissionCount: archiveLockSnapshot.submissionCount,
        startIndex: archiveLockSnapshot.submissionCount,
        macroStructureFrozen: false
      }
    : {};

  const panels = [];
  if (options.includeStoredOriginal !== false) {
    const audit = panelAudit(liveBlocks, colors);
    panels.push({
      mode: 'actual',
      label: `Stored Original — ${dateKey}`,
      subtitle: `${liveContributorCount} stored contributors · ${liveBlocks.length} stored blocks · ${audit.missingSubmissionIndices.length} missing indices`,
      blocks: liveBlocks,
      submissionCount: liveContributorCount || liveSubmissionCount || liveBlocks.length,
      blockCount: liveBlocks.length,
      description: MODE_CONFIG.actual.description,
      skippedCount: 0,
      skippedColors: [],
      macroStructureFrozen: quiltData?.macroStructureFrozen === true,
      storedOriginal: true,
      ...audit
    });
  }

  for (const mode of modeKeys) {
    const config = MODE_CONFIG[mode] || MODE_CONFIG.baseline;
    const replay = hasSparseColorHistory
      ? {
          mode,
          blocks: cloneJson(liveBlocks, []),
          submissionCount: liveContributorCount || liveSubmissionCount || liveBlocks.length,
          macroStructureFrozen: quiltData?.macroStructureFrozen === true,
          skippedColors: []
        }
      : replaySequence(dateKey, colors, mode, lockAt, replayOptions);
    const audit = panelAudit(replay.blocks, colors);
    const isCurrent = mode === 'baseline';
    const label = isCurrent
      ? `${archiveLockSnapshot ? 'Stored Lock + Current Continuation' : 'Current Code Replay'} — ${dateKey}`
      : `New Bias: ${config.label}${hasSparseColorHistory ? ' preview of today' : ` after color ${lockAt}`} — ${dateKey}`;
    const skippedText = replay.skippedColors.length ? ` · ${replay.skippedColors.length} skipped` : '';
    const missingText = audit.missingSubmissionIndices.length ? ` · ${audit.missingSubmissionIndices.length} missing indices` : '';
    const branchText = archiveLockSnapshot ? ` · stored through ${lockAt}` : '';
    const sparseText = hasSparseColorHistory ? ' · early day: bias may not diverge yet' : '';
    panels.push({
      mode,
      label,
      subtitle: `${colors.length} same ordered colors · ${Math.round(replayCoverage * 100)}% day coverage · ${replay.blocks.length} blocks${branchText}${sparseText}${skippedText}${missingText}`,
      blocks: replay.blocks,
      submissionCount: replay.submissionCount,
      blockCount: replay.blocks.length,
      description: config.description,
      skippedCount: replay.skippedColors.length,
      skippedColors: replay.skippedColors,
      macroStructureFrozen: replay.macroStructureFrozen,
      ...audit
    });
  }

  return {
    dateKey,
    source: 'colorReplayEvents',
    colorCount: colors.length,
    inputUniqueColorCount: new Set(colors).size,
    replayCoverage,
    branchFromArchiveLock: !!archiveLockSnapshot,
    archiveLockBlockCount: archiveLockSnapshot?.blocks?.length || 0,
    biasLockAt: lockAt,
    hasSparseColorHistory,
    liveBlockCount: liveBlocks.length,
    liveContributorCount,
    inferredMode,
    metrics,
    panels,
    modes: panels.map(({ blocks, ...panel }) => panel)
  };
}

module.exports = {
  MODE_CONFIG,
  normalizeHex,
  analyzeColors,
  inferMode,
  buildCompositionPreviewFromQuiltData,
  reconstructArchiveSnapshotAt,
  missingSubmissionIndices
};
