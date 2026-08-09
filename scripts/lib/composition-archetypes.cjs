'use strict';

const COLUMNS_PATTERN_PREF = [
  'checkerboard',
  'insetCircle',
  'cross',
  'diamond',
  'hst',
  'nestedGrid',
  'framed',
  'stripes'
];

const VERTICAL_STRIPE_PATTERN_TYPES = new Set(['bandedColumns', 'stripes']);
const MAX_VERTICAL_STRIPE_PATTERNS = 1;

const COLUMN_ZONE_PATTERNS = {
  1: { top: ['hst', 'diamond'], middle: ['hst', 'diamond'], bottom: ['checkerboard', 'nestedGrid'] },
  2: { top: ['framed', 'cross'], middle: ['diamond', 'cross'], bottom: ['cross', 'nestedGrid'] },
  3: { top: ['hst', 'insetCircle'], middle: ['insetCircle', 'framed'], bottom: ['checkerboard', 'nestedGrid'] },
  4: { top: ['hst', 'diamond'], middle: ['nestedGrid', 'cross'], bottom: ['framed', 'checkerboard'] },
  5: { top: ['insetCircle', 'hst'], middle: ['insetCircle', 'hst'], bottom: ['checkerboard', 'nestedGrid'] }
};

function columnBandForBlock(engine, block) {
  const bands = engine?._macroColumnBands;
  if (!Array.isArray(bands) || !bands.length || !block) return null;
  const cx = (Number(block.x) || 0) + (Number(block.width) || 0) / 2;
  for (const band of bands) {
    if (cx >= band.x && cx < band.x + band.width) return band;
  }
  return bands[bands.length - 1] || null;
}

function quiltDims(Utils) {
  const dims = Utils?.getQuiltDimensions?.();
  return {
    w: Math.max(1, Number(dims?.width) || 1070),
    h: Math.max(1, Number(dims?.height) || 1340)
  };
}

function blockSpansQuiltWidth(block, Utils) {
  const { w: quiltW } = quiltDims(Utils);
  const bx = Number(block?.x) || 0;
  const bw = Number(block?.width) || 0;
  return bx <= 4 && bw >= quiltW * 0.68;
}

function blockContainedInSingleColumnBand(engine, block) {
  const band = columnBandForBlock(engine, block);
  if (!band || !block) return false;
  const bx = Number(block.x) || 0;
  const bw = Number(block.width) || 0;
  const eps = 3;
  return bx >= band.x - eps && bx + bw <= band.x + band.width + eps;
}

function blockIsTallStrip(block) {
  const w = Math.max(1, Number(block?.width) || 1);
  const h = Math.max(1, Number(block?.height) || 1);
  return h / w >= 2;
}

function blockWouldGetVerticalStripes(block) {
  const w = Math.max(1, Number(block?.width) || 1);
  const h = Math.max(1, Number(block?.height) || 1);
  return w / h < 0.95;
}

function filterVerticalStripePatterns(engine, availablePatterns, block) {
  let patterns = availablePatterns.filter((p) => p !== 'bandedColumns');
  const used = Number(engine.__columnsVerticalStripePatternCount) || 0;
  if (used >= MAX_VERTICAL_STRIPE_PATTERNS) {
    patterns = patterns.filter((p) => !VERTICAL_STRIPE_PATTERN_TYPES.has(p));
  } else {
    patterns = patterns.filter((p) => {
      if (p !== 'stripes') return true;
      return !blockWouldGetVerticalStripes(block);
    });
  }
  return patterns.length ? patterns : availablePatterns.filter((p) => p !== 'bandedColumns');
}

function noteVerticalStripePattern(engine, block, pattern) {
  if (pattern === 'bandedColumns') {
    engine.__columnsVerticalStripePatternCount =
      (Number(engine.__columnsVerticalStripePatternCount) || 0) + 1;
    return;
  }
  if (pattern === 'stripes' && blockWouldGetVerticalStripes(block)) {
    engine.__columnsVerticalStripePatternCount =
      (Number(engine.__columnsVerticalStripePatternCount) || 0) + 1;
  }
}

function splitDirectionForColumns(engine, block, Utils) {
  if (blockIsTallStrip(block)) return 'horizontal';
  if (blockSpansQuiltWidth(block, Utils)) return 'vertical';
  if (blockContainedInSingleColumnBand(engine, block)) return 'horizontal';
  const band = columnBandForBlock(engine, block);
  if (band) {
    const bw = Number(block?.width) || 0;
    if (bw <= Number(band.width) * 0.88) return 'horizontal';
  }
  return 'vertical';
}

function verticalZone(block, Utils) {
  const y = Number(block?.y) || 0;
  const h = Number(block?.height) || 0;
  const cy = y + h / 2;
  const dims = Utils?.getQuiltDimensions?.();
  const quiltH = Math.max(1, Number(dims?.height) || 1340);
  const t = cy / quiltH;
  if (t < 0.34) return 'top';
  if (t < 0.67) return 'middle';
  return 'bottom';
}

function patternsForBlock(engine, block, Utils) {
  const band = columnBandForBlock(engine, block);
  const colId = Number(band?.regionId) || 0;
  const zone = verticalZone(block, Utils);
  const recipe = COLUMN_ZONE_PATTERNS[colId]?.[zone];
  if (Array.isArray(recipe) && recipe.length) return recipe.concat(COLUMNS_PATTERN_PREF);
  return COLUMNS_PATTERN_PREF.slice();
}

function clearArchetypeBiases(engine) {
  if (!engine || !engine.__compositionArchetypeStash) return;
  const stash = engine.__compositionArchetypeStash;
  if (stash.selectPatternType) engine.selectPatternType = stash.selectPatternType;
  if (stash.routeMacro) engine._routeSplittableBlocksByMacroColor = stash.routeMacro;
  if (stash.forceOversized) engine._shouldForceOversizedSplit = stash.forceOversized;
  if (stash.createDiagonalAxisPattern) engine.createDiagonalAxisPattern = stash.createDiagonalAxisPattern;
  if (stash.macroFlattenedAngledSplitProb != null) {
    engine.macroFlattenedAngledSplitProb = stash.macroFlattenedAngledSplitProb;
  }
  delete engine._compositionSplitDirection;
  delete engine._compositionColumnsFullHeight;
  delete engine.__columnsVerticalStripePatternCount;
  delete engine.__compositionArchetypeStash;
  delete engine.__compositionArchetypeKey;
}

function installColumnsArchetype(engine, options = {}) {
  if (!engine || typeof engine.addColor !== 'function') return;
  const Utils = options.Utils || null;
  clearArchetypeBiases(engine);

  const dateKey = String(options.dateKey || 'columns-preview').trim() || 'columns-preview';
  if (typeof engine.setQuiltDateKey === 'function') engine.setQuiltDateKey(dateKey);
  if (typeof engine.hydrateMacroLayoutFromPersistence === 'function') {
    engine.hydrateMacroLayoutFromPersistence('columns');
  }
  if (typeof engine._computeMacroColumnBands === 'function') {
    engine.macroColumnMinCount = 4;
    engine.macroColumnMaxCount = 5;
    engine._macroColumnBands = engine._computeMacroColumnBands();
  }

  const stash = {
    selectPatternType:
      typeof engine.selectPatternType === 'function' ? engine.selectPatternType.bind(engine) : null,
    routeMacro:
      typeof engine._routeSplittableBlocksByMacroColor === 'function'
        ? engine._routeSplittableBlocksByMacroColor.bind(engine)
        : null,
    forceOversized:
      typeof engine._shouldForceOversizedSplit === 'function'
        ? engine._shouldForceOversizedSplit.bind(engine)
        : null,
    createDiagonalAxisPattern:
      typeof engine.createDiagonalAxisPattern === 'function'
        ? engine.createDiagonalAxisPattern.bind(engine)
        : null,
    macroFlattenedAngledSplitProb: engine.macroFlattenedAngledSplitProb
  };

  engine.macroFlattenedAngledSplitProb = 0;

  if (stash.createDiagonalAxisPattern && typeof engine.performRegularSplit === 'function') {
    engine.createDiagonalAxisPattern = (block, newColor) => engine.performRegularSplit(block, newColor);
  }

  engine.__columnsVerticalStripePatternCount = 0;

  if (stash.selectPatternType) {
    engine.selectPatternType = (availablePatterns, block, newColor) => {
      const filtered = filterVerticalStripePatterns(engine, availablePatterns, block);
      const prefs = patternsForBlock(engine, block, Utils);
      for (const preferred of prefs) {
        if (filtered.includes(preferred)) {
          noteVerticalStripePattern(engine, block, preferred);
          return preferred;
        }
      }
      const chosen = stash.selectPatternType(filtered, block, newColor);
      noteVerticalStripePattern(engine, block, chosen);
      return chosen;
    };
  }

  engine._compositionSplitDirection = (block) => splitDirectionForColumns(engine, block, Utils);
  engine._compositionColumnsFullHeight = true;

  if (stash.routeMacro) {
    engine._routeSplittableBlocksByMacroColor = (newColor, candidateBlocks) => {
      let routed = stash.routeMacro(newColor, candidateBlocks);
      if (!Array.isArray(routed) || routed.length <= 1) return routed;
      if (Array.isArray(engine._macroColumnBands)) {
        routed = [...routed].sort((a, b) => {
          const bandA = columnBandForBlock(engine, a);
          const bandB = columnBandForBlock(engine, b);
          const pickBand = ((Number(engine.submissionCount) || 0) % engine._macroColumnBands.length) + 1;
          const targetA = Math.abs((bandA?.regionId || 0) - pickBand);
          const targetB = Math.abs((bandB?.regionId || 0) - pickBand);
          if (targetA !== targetB) return targetA - targetB;
          return (Number(a?.width) || 0) * (Number(a?.height) || 0) -
            (Number(b?.width) || 0) * (Number(b?.height) || 0);
        });
      }
      return routed;
    };
  }

  if (stash.forceOversized) {
    engine._shouldForceOversizedSplit = () => {
      const n = Number(engine.submissionCount) || 0;
      return n > 0 && n % 4 === 0 ? true : stash.forceOversized();
    };
  }

  engine.__compositionArchetypeStash = stash;
  engine.__compositionArchetypeKey = 'columns';
}

module.exports = {
  installColumnsArchetype,
  clearArchetypeBiases,
  COLUMN_ZONE_PATTERNS
};
