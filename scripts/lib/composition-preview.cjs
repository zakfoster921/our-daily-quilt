const { createServerQuiltEngine, serializeServerQuiltBlocks } = require('./server-quilt-engine.cjs');

function getModeDecisionAt() {
  const raw = Number(process.env.MODE_DECISION_AT) || Number(process.env.BIAS_LOCK_AT) || 20;
  return Math.max(8, Math.floor(raw));
}

const MODE_DECISION_AT = getModeDecisionAt();

/** One or two in-place pattern injections at the color-20 checkpoint (no new submission). */
const CHECKPOINT_PATTERNS = {
  mosaic: [{ pattern: 'checkerboard' }, { pattern: 'checkerboard' }],
  strata: [{ pattern: 'stripes' }],
  vein: [{ pattern: 'stripes' }],
  constellation: [{ pattern: 'insetCircle' }],
  field: [{ pattern: 'framed' }],
  garden: [{ pattern: 'insetCircle' }],
  tide: [{ pattern: 'stripes' }]
};

const MODE_CONFIG = {
  actual: {
    label: 'Actual',
    description: 'Stored live quilt'
  },
  baseline: {
    label: 'Baseline',
    description: 'Current engine growth (also the fallback when no bias matches)'
  },
  mosaic: {
    label: 'Mosaic',
    description: 'Many families — patchwork grid and frequent accents',
    specials: 1.7,
    accentBias: 1.25,
    forceOversizedEvery: 2,
    patternPreference: ['checkerboard', 'cross', 'hst', 'railfence', 'stripes']
  },
  strata: {
    label: 'Strata',
    description: 'Family runs — horizontal banded layers',
    specials: 1.15,
    axis: 'horizontal',
    patternPreference: ['stripes', 'railfence', 'hst']
  },
  vein: {
    label: 'Vein',
    description: 'Dominant mood with rare contrasting veins',
    specials: 0.9,
    accentBias: 1.9,
    outlierAccent: true,
    patternPreference: ['stripes', 'hst', 'railfence']
  },
  constellation: {
    label: 'Constellation',
    description: 'Traveling hues — small saturated focal points',
    specials: 1.2,
    saturatedAccent: true,
    forceOversizedEvery: 3,
    largeBlockPenalty: 0.45,
    patternPreference: ['insetCircle', 'cross', 'hst', 'checkerboard']
  },
  field: {
    label: 'Field',
    description: 'One family owns the day — wide calm planes',
    specials: 0.32,
    accentBias: 0.4,
    neverForceOversized: true,
    largeBlockPenalty: 0.25,
    patternPreference: ['framed', 'insetCircle', 'hst']
  },
  garden: {
    label: 'Garden',
    description: 'Related families cluster into soft organic beds',
    specials: 1.05,
    colorRoute: 'family',
    dominantCluster: true,
    patternPreference: ['insetCircle', 'framed', 'stripes', 'hst']
  },
  tide: {
    label: 'Tide',
    description: 'Warm and cool trade places — directional flow',
    specials: 1.05,
    colorRoute: 'temperature',
    alternatingAxis: true,
    patternPreference: ['stripes', 'railfence', 'framed', 'hst']
  },
  // Manual override only — not used by inferMode
  vivid: {
    label: 'Vivid',
    description: 'All saturated, punchy colors rendered bold',
    specials: 1.6,
    accentBias: 2.0,
    saturatedAccent: true,
    patternPreference: ['cross', 'checkerboard', 'hst']
  },
  monochromatic: {
    label: 'Monochromatic',
    description: 'One hue with variations in saturation and value',
    specials: 0.8,
    colorRoute: 'value',
    patternPreference: ['hst', 'stripes', 'framed']
  },
  bright: {
    label: 'Bright',
    description: 'High-light day rendered energetic and active',
    specials: 1.5,
    accentBias: 1.3,
    largeBlockPenalty: 0.3,
    patternPreference: ['cross', 'checkerboard', 'hst']
  },
  chromatic: {
    label: 'Chromatic',
    description: 'Colors jump across the hue wheel with high variety',
    specials: 1.4,
    accentBias: 1.2,
    patternPreference: ['checkerboard', 'hst', 'cross']
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
  const hues = [];
  clean.forEach((hex) => {
    const fam = colorFamily(hex);
    familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
    const hsl = hexToHsl(hex);
    lightnesses.push(hsl.l);
    saturations.push(hsl.s);
    hues.push(hsl.h);
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
  const avgValue = lightnesses.length ? lightnesses.reduce((a, b) => a + b, 0) / lightnesses.length : 0;
  const hueRange = hues.length <= 1 ? 0 : (() => {
    const minH = Math.min(...hues);
    const maxH = Math.max(...hues);
    const linear = maxH - minH;
    const circular = 360 - linear;
    return Math.min(linear, circular);
  })();
  return {
    count: clean.length,
    diversity: clean.length ? familyCounts.size / Math.max(1, Math.min(8, clean.length)) : 0,
    familyCount: familyCounts.size,
    dominantFamily: dominant[0],
    dominance: clean.length ? dominant[1] / clean.length : 0,
    contrast: lightSpread,
    warmth: clean.length ? warmCount / clean.length : 0,
    avgSaturation,
    avgValue,
    hueRange,
    momentum: clean.length > 1 ? familySwitches / (clean.length - 1) : 0,
    hueTravel: clean.length > 1 ? hueTravel / (clean.length - 1) : 0,
    families: Object.fromEntries(families)
  };
}

function inferMode(metrics) {
  if (metrics.count < MODE_DECISION_AT) return 'baseline';
  if (metrics.diversity >= 0.78) return 'mosaic';
  if (metrics.momentum <= 0.52 && metrics.familyCount >= 3) return 'strata';
  if (metrics.dominance >= 0.5 && metrics.familyCount >= 2 && metrics.hueTravel >= 0.4) return 'vein';
  if (metrics.hueTravel >= 0.5 && metrics.avgSaturation >= 0.58 && metrics.diversity >= 0.5) return 'constellation';
  if (metrics.dominance >= 0.46 && metrics.contrast < 0.38) return 'field';
  if (
    metrics.dominance >= 0.36 &&
    metrics.diversity < 0.64 &&
    metrics.familyCount >= 2 &&
    metrics.momentum < 0.86
  ) return 'garden';
  if (
    metrics.momentum >= 0.86 &&
    metrics.familyCount >= 3 &&
    metrics.familyCount <= 6 &&
    metrics.warmth >= 0.2 &&
    metrics.warmth <= 0.8
  ) return 'tide';
  return 'baseline';
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

function orderedColorsFromBlocks(blocks) {
  const bySubmissionIndex = new Map();
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const submissionIndex = Math.floor(Number(block?.submissionIndex) || 0);
    if (submissionIndex <= 0 || bySubmissionIndex.has(submissionIndex)) continue;
    const color = normalizeHex(block?.contributorColor) || normalizeHex(block?.color);
    if (color) bySubmissionIndex.set(submissionIndex, color);
  }
  return [...bySubmissionIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, color]) => color);
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

function pickCheckpointCandidateBlocks(engine, limit = 2) {
  const minArea = 35000;
  return (Array.isArray(engine?.blocks) ? engine.blocks : [])
    .filter((block) => {
      if (!block || (Number(block.width) || 0) <= 0 || (Number(block.height) || 0) <= 0) return false;
      if (block.patternType === 'special' && block.specialPatternType !== 'diagonalAxis') return false;
      if (typeof engine._isProtectedAnchorBlock === 'function' && engine._isProtectedAnchorBlock(block)) return false;
      const area = (Number(block.width) || 0) * (Number(block.height) || 0);
      if (area < minArea) return false;
      if (
        typeof engine._isBlockSafelySplittableForFrozenMacro === 'function' &&
        !engine._isBlockSafelySplittableForFrozenMacro(block)
      ) return false;
      if (typeof engine.getAvailablePatterns === 'function') {
        return engine.getAvailablePatterns(block, '#808080').length > 0;
      }
      return true;
    })
    .sort(
      (a, b) =>
        (Number(b.width) || 0) * (Number(b.height) || 0) -
        (Number(a.width) || 0) * (Number(a.height) || 0)
    )
    .slice(0, Math.max(1, limit));
}

function createCheckpointPattern(engine, block, patternType, accentColor) {
  if (!engine || !block) return null;
  switch (patternType) {
    case 'checkerboard':
      return engine.createOrganicCheckerboard(block, accentColor);
    case 'stripes':
      return engine.createOrganicStripes(block, accentColor);
    case 'insetCircle':
      return engine.createInsetCircle(block, accentColor);
    case 'framed':
      return engine.createFramedPattern(block, accentColor);
    case 'hst':
      return engine.createHalfSquareTriangle(block, accentColor);
    default:
      return null;
  }
}

function replaceBlockInEngine(engine, blockId, children) {
  if (!Array.isArray(children) || !children.length) return false;
  const index = engine.blocks.findIndex((block) => String(block?.id) === String(blockId));
  if (index === -1) return false;
  engine.blocks.splice(index, 1, ...children);
  return true;
}

function applySurgicalCheckpointAdjustments(engine, modeKey, checkpointColors) {
  if (!engine || modeKey === 'baseline' || modeKey === 'window') return 0;
  const steps = CHECKPOINT_PATTERNS[modeKey] || [];
  if (!steps.length) return 0;
  const candidates = pickCheckpointCandidateBlocks(engine, steps.length);
  const accent =
    normalizeHex(checkpointColors[checkpointColors.length - 1]) ||
    normalizeHex(checkpointColors[0]) ||
    '#808080';
  let adjustments = 0;
  for (let i = 0; i < steps.length && i < candidates.length; i += 1) {
    const block = candidates[i];
    const children = createCheckpointPattern(engine, block, steps[i].pattern, accent);
    if (Array.isArray(children) && children.length && replaceBlockInEngine(engine, block.id, children)) {
      adjustments += 1;
    }
  }
  return adjustments;
}

function applyModeCheckpoint(engine, modeKey, checkpointColors) {
  const adjustments = applySurgicalCheckpointAdjustments(engine, modeKey, checkpointColors);
  if (modeKey !== 'baseline' && modeKey !== 'window') {
    installModeBiases(engine, modeKey);
  }
  return { mode: modeKey, adjustments };
}

function installModeBiases(engine, modeKey) {
  if (modeKey === 'baseline' || modeKey === 'window') return;
  const config = MODE_CONFIG[modeKey] || {};
  const originalSelectPatternType = engine.selectPatternType?.bind(engine);
  const originalAccentBias = engine._regularSplitAccentBias?.bind(engine);
  const originalForceOversized = engine._shouldForceOversizedSplit?.bind(engine);
  const originalRouteMacro = engine._routeSplittableBlocksByMacroColor?.bind(engine);
  const originalFilterMacro = engine._filterMacroCandidatesByColorOrValue?.bind(engine);
  const modeDominantFamily = (config.dominantCluster || config.outlierAccent)
    ? (() => {
        const counts = new Map();
        for (const block of Array.isArray(engine.blocks) ? engine.blocks : []) {
          const family = colorFamily(block?.color);
          counts.set(family, (counts.get(family) || 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      })()
    : '';

  if (originalSelectPatternType && Array.isArray(config.patternPreference)) {
    engine.selectPatternType = (availablePatterns, block, newColor) => {
      for (const preferred of config.patternPreference) {
        if (availablePatterns.includes(preferred)) return preferred;
      }
      return originalSelectPatternType(availablePatterns, block, newColor);
    };
  }

  if (originalAccentBias && (config.accentBias || config.outlierAccent || config.saturatedAccent)) {
    engine._regularSplitAccentBias = (block, newColor) => {
      let bias = originalAccentBias();
      if (config.accentBias) bias *= Number(config.accentBias) || 1;
      if (config.dominantCluster && modeDominantFamily && colorFamily(newColor) !== modeDominantFamily) {
        bias *= 1.25;
      }
      if (config.saturatedAccent) {
        bias *= hexToHsl(newColor).s >= 0.55 ? 1.6 : 0.6;
      }
      if (config.outlierAccent && modeDominantFamily) {
        if (colorFamily(newColor) === modeDominantFamily) {
          bias *= 0.5;
        } else {
          bias *= 1.8;
        }
      }
      return Math.max(0, Math.min(1, bias));
    };
  }

  if (config.neverForceOversized && originalForceOversized) {
    engine._shouldForceOversizedSplit = () => false;
  } else if (originalForceOversized && config.forceOversizedEvery) {
    engine._shouldForceOversizedSplit = () => {
      const every = Math.max(1, Math.floor(Number(config.forceOversizedEvery) || 1));
      return (Number(engine.submissionCount) || 0) % every === 0 || originalForceOversized();
    };
  }

  if ((config.colorRoute || config.outlierAccent) && originalRouteMacro) {
    engine._routeSplittableBlocksByMacroColor = (newColor, candidateBlocks) => {
      let routed = originalRouteMacro(newColor, candidateBlocks);
      if (!Array.isArray(routed) || routed.length <= 1) return routed;
      if (config.colorRoute === 'family') {
        const fam = colorFamily(newColor);
        routed = [...routed].sort((a, b) => {
          const sameA = colorFamily(a?.color) === fam ? 1 : 0;
          const sameB = colorFamily(b?.color) === fam ? 1 : 0;
          if (sameA !== sameB) return sameB - sameA;
          if (config.dominantCluster && modeDominantFamily && fam !== modeDominantFamily) {
            const dominantA = colorFamily(a?.color) === modeDominantFamily ? 1 : 0;
            const dominantB = colorFamily(b?.color) === modeDominantFamily ? 1 : 0;
            if (dominantA !== dominantB) return dominantA - dominantB;
          }
          return (Number(b?.width) || 0) * (Number(b?.height) || 0) - (Number(a?.width) || 0) * (Number(a?.height) || 0);
        });
      } else if (config.colorRoute === 'temperature') {
        const warm = isWarmFamily(colorFamily(newColor));
        routed = [...routed].sort((a, b) => {
          const matchA = isWarmFamily(colorFamily(a?.color)) === warm ? 1 : 0;
          const matchB = isWarmFamily(colorFamily(b?.color)) === warm ? 1 : 0;
          if (matchA !== matchB) return matchB - matchA;
          return hueDistance(a?.color, newColor) - hueDistance(b?.color, newColor);
        });
      } else if (config.colorRoute === 'value') {
        const newLightness = hexToHsl(newColor).l;
        routed = [...routed].sort((a, b) => {
          const la = hexToHsl(a?.color || '#808080').l;
          const lb = hexToHsl(b?.color || '#808080').l;
          return Math.abs(la - newLightness) - Math.abs(lb - newLightness);
        });
      }
      if (config.outlierAccent && modeDominantFamily) {
        const isOutlier = colorFamily(newColor) !== modeDominantFamily;
        routed = [...routed].sort((a, b) => {
          const areaA = (Number(a?.width) || 0) * (Number(a?.height) || 0);
          const areaB = (Number(b?.width) || 0) * (Number(b?.height) || 0);
          return isOutlier ? areaA - areaB : areaB - areaA;
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

  if (config.axis || config.alternatingAxis) {
    engine._compositionSplitDirection = (block) => {
      if (config.alternatingAxis) {
        return (Number(engine.submissionCount) || 0) % 2 === 0 ? 'horizontal' : 'vertical';
      }
      if (config.axis === 'horizontal' || config.axis === 'vertical') return config.axis;
      const isWider = (Number(block?.width) || 0) > (Number(block?.height) || 0);
      return isWider ? 'vertical' : 'horizontal';
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
  if (modeKey === 'baseline' || modeKey === 'window') return fn();
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

function withQuietConsole(fn) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  try {
    console.log = () => {};
    console.warn = () => {};
    return fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

function replaySequence(dateKey, colors, modeKey, lockAt, options = {}) {
  return withQuietConsole(() => {
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
      if (options.lockPalette === true) installPaletteLock(engine);
      const skippedColors = [];
      let biasInstalled = modeKey === 'baseline' || modeKey === 'window';
      const startIndex = Math.max(0, Math.floor(Number(options.startIndex) || 0));
      for (let i = startIndex; i < colors.length; i += 1) {
        const hex = colors[i];
        const shouldBias = modeKey !== 'baseline' && modeKey !== 'window' && i >= lockAt;
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
  });
}

function replaySequenceWithCheckpoint(dateKey, colors, options = {}) {
  const decisionAt = Math.max(8, Math.floor(Number(options.decisionAt) || MODE_DECISION_AT));
  return withQuietConsole(() => {
    const originalRandom = Math.random;
    Math.random = mulberry32(hashString(`composition-seed-tester:${dateKey}`));
    try {
      const engine = createServerQuiltEngine({
        userId: `composition-checkpoint-${dateKey}`,
        blocks: [],
        submissionCount: 0,
        colorReplayEvents: [],
        macroStructureFrozen: false
      });
      if (options.lockPalette !== false) installPaletteLock(engine);

      let modeKey = options.modeKey || 'baseline';
      let biasInstalled = false;
      let checkpoint = { mode: 'baseline', adjustments: 0 };
      const skippedColors = [];

      for (let i = 0; i < colors.length; i += 1) {
        const hex = colors[i];

        if (i < decisionAt) {
          if (!engine.addColor(hex)) skippedColors.push({ index: i + 1, color: hex });
          if (i + 1 === decisionAt) {
            const snapshot = colors.slice(0, decisionAt);
            modeKey = options.modeKey || inferMode(analyzeColors(snapshot));
            checkpoint = applyModeCheckpoint(engine, modeKey, snapshot);
            biasInstalled = modeKey !== 'baseline' && modeKey !== 'window';
          }
          continue;
        }

        if (modeKey !== 'baseline' && modeKey !== 'window') {
          if (!biasInstalled) {
            installModeBiases(engine, modeKey);
            biasInstalled = true;
          }
          if (!withPatchedRandom(modeKey, () => engine.addColor(hex))) {
            skippedColors.push({ index: i + 1, color: hex });
          }
        } else if (!engine.addColor(hex)) {
          skippedColors.push({ index: i + 1, color: hex });
        }
      }

      return {
        mode: modeKey,
        checkpoint,
        decisionAt,
        blocks: serializeServerQuiltBlocks(engine),
        submissionCount: Number(engine.submissionCount) || colors.length,
        macroStructureFrozen: engine.macroStructureFrozen === true,
        skippedColors
      };
    } finally {
      Math.random = originalRandom;
    }
  });
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

function colorDistanceSq(a, b) {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  if (!ar || !br) return Number.POSITIVE_INFINITY;
  return (ar.r - br.r) ** 2 + (ar.g - br.g) ** 2 + (ar.b - br.b) ** 2;
}

function nearestPaletteColor(hex, palette) {
  const normalized = normalizeHex(hex);
  if (!normalized || !palette.length) return normalized;
  if (palette.includes(normalized)) return normalized;
  return palette.reduce((best, candidate) => (
    colorDistanceSq(normalized, candidate) < colorDistanceSq(normalized, best) ? candidate : best
  ), palette[0]);
}

function alignBlocksToReferencePalette(blocks, referenceBlocks) {
  const palette = [...new Set(collectBlockHexes(referenceBlocks))];
  if (!palette.length) return blocks;
  const aligned = cloneJson(blocks, []);
  const slots = [];
  const addSlot = (getter, setter) => {
    const current = normalizeHex(getter());
    if (!current) return;
    const next = nearestPaletteColor(current, palette);
    setter(next);
    slots.push({ get: getter, set: setter });
  };

  for (const block of aligned) {
    for (const key of [
      'color',
      'contributorColor',
      'hstColorB',
      'insetInnerColor',
      'specialOriginalColor',
      'specialOriginalInnerColor',
      'macroFrozenColor'
    ]) {
      if (typeof block?.[key] === 'string') {
        addSlot(() => block[key], (value) => {
          block[key] = value;
        });
      }
    }
    for (const tri of Array.isArray(block?.hstTriangles) ? block.hstTriangles : []) {
      if (typeof tri?.color === 'string') {
        addSlot(() => tri.color, (value) => {
          tri.color = value;
        });
      }
    }
    for (const piece of Array.isArray(block?.polygonPieces) ? block.polygonPieces : []) {
      if (typeof piece?.color === 'string') {
        addSlot(() => piece.color, (value) => {
          piece.color = value;
        });
      }
    }
  }

  const counts = () => slots.reduce((map, slot) => {
    const color = normalizeHex(slot.get());
    if (color) map.set(color, (map.get(color) || 0) + 1);
    return map;
  }, new Map());

  for (const missing of palette.filter((hex) => !counts().has(hex))) {
    const currentCounts = counts();
    const reusable = slots.find((slot) => (currentCounts.get(normalizeHex(slot.get())) || 0) > 1);
    if (!reusable) break;
    reusable.set(missing);
  }

  return aligned;
}

function suppressedStoredBlockAudit(blocks) {
  return {
    outputUniqueColorCount: [...new Set(collectBlockHexes(blocks))].length,
    outOfPaletteColors: [],
    missingSubmissionIndices: [],
    auditSuppressedReason: 'Stored block fallback infers color order; palette/index audit is not authoritative.'
  };
}

function buildCompositionPreviewFromQuiltData(dateKey, quiltData, options = {}) {
  const lockAt = Math.max(1, Math.floor(Number(options.lockAt) || 10));
  const replayEvents = orderedReplayEvents(quiltData);
  const liveBlocks = Array.isArray(quiltData?.blocks) ? cloneJson(quiltData.blocks, []) : [];
  const replayColors = replayEvents.map((event) => normalizeHex(event?.newHex)).filter(Boolean);
  const blockColors = orderedColorsFromBlocks(liveBlocks);
  const source = replayColors.length > lockAt || replayColors.length >= blockColors.length
    ? 'colorReplayEvents'
    : 'storedBlocks';
  const colors = source === 'colorReplayEvents' ? replayColors : blockColors;
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
      ? 'baseline'
      : inferMode(metrics);
  const modeKeys = options.includeStoredOriginal !== false
    ? [inferredMode]
    : ['baseline', inferredMode].filter((mode, index, list) => mode && list.indexOf(mode) === index);
  const replayCoverage = liveContributorCount > 0 ? colors.length / liveContributorCount : 0;
  const archiveLockSnapshot = hasSparseColorHistory || source !== 'colorReplayEvents'
    ? null
    : reconstructArchiveSnapshotAt(replayEvents, lockAt);
  const replayOptions = archiveLockSnapshot
    ? {
        initialBlocks: archiveLockSnapshot.blocks,
        initialSubmissionCount: archiveLockSnapshot.submissionCount,
        startIndex: archiveLockSnapshot.submissionCount,
        macroStructureFrozen: false,
        lockPalette: options.lockPalette === true
      }
    : { lockPalette: options.lockPalette === true };

  const panels = [];
  if (options.includeStoredOriginal !== false) {
    const audit = source === 'storedBlocks' ? suppressedStoredBlockAudit(liveBlocks) : panelAudit(liveBlocks, colors);
    panels.push({
      mode: 'actual',
      label: `Stored Original — ${dateKey}`,
      subtitle: source === 'storedBlocks'
        ? `${liveContributorCount} stored contributors · ${liveBlocks.length} stored blocks`
        : `${liveContributorCount} stored contributors · ${liveBlocks.length} stored blocks · ${audit.missingSubmissionIndices.length} missing indices`,
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
    if (options.includeStoredOriginal !== false) {
      replay.blocks = alignBlocksToReferencePalette(replay.blocks, liveBlocks);
    }
    const audit = source === 'storedBlocks' ? suppressedStoredBlockAudit(replay.blocks) : panelAudit(replay.blocks, colors);
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
    source,
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
  MODE_DECISION_AT,
  normalizeHex,
  analyzeColors,
  inferMode,
  applyModeCheckpoint,
  buildCompositionPreviewFromQuiltData,
  reconstructArchiveSnapshotAt,
  missingSubmissionIndices,
  orderedColorsFromBlocks,
  orderedReplayEvents,
  replaySequence,
  replaySequenceWithCheckpoint
};
