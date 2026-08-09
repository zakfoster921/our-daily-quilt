/**
 * Browser composition archetypes for quilt-builder preview.
 * Columns: vertical parallel full-height bands; splits stack inside each band.
 */
(function (root) {
  'use strict';

  const COLUMNS_PATTERN_PREF = [
    'hst',
    'diamond',
    'cross',
    'insetCircle',
    'checkerboard',
    'nestedGrid',
    'stripes',
    'framed',
    'bandedColumns'
  ];

  /** Tall vertical stripe specials — capped; allowed in sketch zones only. */
  const VERTICAL_STRIPE_PATTERN_TYPES = new Set(['bandedColumns', 'stripes']);
  const MAX_VERTICAL_STRIPE_PATTERNS = 3;
  const COLUMNS_IN_COLUMN_DIAGONAL_SPLIT_PROB = 0.85;

  /** Per-column top / middle / bottom recipes — mapped from columns inspiration sketch. */
  const COLUMN_ZONE_PATTERNS = {
    1: { top: ['bandedColumns', 'stripes'], middle: ['hst', 'diamond'], bottom: ['checkerboard', 'nestedGrid'] },
    2: { top: ['stripes', 'framed'], middle: ['diamond', 'stripes'], bottom: ['cross', 'nestedGrid'] },
    3: { top: ['stripes', 'hst'], middle: ['hst', 'insetCircle'], bottom: ['insetCircle', 'bandedColumns'] },
    4: { top: ['nestedGrid', 'checkerboard'], middle: ['checkerboard', 'cross'], bottom: ['stripes', 'bandedColumns'] },
    5: { top: ['hst', 'framed'], middle: ['diamond', 'cross'], bottom: ['checkerboard', 'stripes'] },
    6: { top: ['stripes', 'nestedGrid'], middle: ['insetCircle', 'hst'], bottom: ['cross', 'checkerboard'] }
  };

  function verticalZone(block) {
    const y = Number(block?.y) || 0;
    const h = Number(block?.height) || 0;
    const cy = y + h / 2;
    const quiltH = quiltDims().h;
    const t = cy / quiltH;
    if (t < 0.34) return 'top';
    if (t < 0.67) return 'middle';
    return 'bottom';
  }

  function columnZoneAllowsVerticalStripeSpecial(colId, zone) {
    if (colId === 1 && zone === 'top') return true;
    if (colId === 3 && zone === 'bottom') return true;
    if (colId === 4 && zone === 'bottom') return true;
    return false;
  }

  function columnBandForBlock(engine, block) {
    const bands = engine?._macroColumnBands;
    if (!Array.isArray(bands) || !bands.length || !block) return null;
    const cx = (Number(block.x) || 0) + (Number(block.width) || 0) / 2;
    for (const band of bands) {
      if (cx >= band.x && cx < band.x + band.width) return band;
    }
    return bands[bands.length - 1] || null;
  }

  function quiltDims() {
    const dims = typeof Utils !== 'undefined' && Utils.getQuiltDimensions ? Utils.getQuiltDimensions() : null;
    return {
      w: Math.max(1, Number(dims?.width) || 1070),
      h: Math.max(1, Number(dims?.height) || 1340)
    };
  }

  /** Full-width cut → two stacked “sections” of columns (not allowed). */
  function blockSpansQuiltWidth(block) {
    const { w: quiltW } = quiltDims();
    const bx = Number(block?.x) || 0;
    const bw = Number(block?.width) || 0;
    return bx <= 4 && bw >= quiltW * 0.68;
  }

  function blockSpansMostOfQuiltWidth(block) {
    const { w: quiltW } = quiltDims();
    return (Number(block?.width) || 0) >= quiltW * 0.68;
  }

  const CROSS_COLUMN_SEAM_TOLERANCE = 10;
  const COLUMNS_HORIZONTAL_SPLIT_MIN_BLOCK = 80;

  function hashRatioFromKey(key) {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
    return ((h >>> 0) % 1000) / 1000;
  }

  function horizontalSplitRatioForColumn(engine, block) {
    const band = columnBandForBlock(engine, block);
    const colId = Number(band?.regionId) || 1;
    const n = Number(engine.submissionCount) || 0;
    const dateKey = engine.quiltDateKey || 'columns';
    const base = hashRatioFromKey(`${dateKey}:col-h:${colId}`);
    const jitter = hashRatioFromKey(`${dateKey}:col-h:${colId}:${n}`) * 0.22;
    return 0.3 + base * 0.38 + jitter;
  }

  function collectHorizontalSeamsInOtherColumns(engine, block) {
    const myCol = columnBandForBlock(engine, block)?.regionId ?? null;
    const seams = new Set();
    (engine.blocks || []).forEach((other) => {
      if (!other || other.id === block.id) return;
      const col = columnBandForBlock(engine, other)?.regionId ?? null;
      if (col == null || col === myCol) return;
      const oy = Number(other.y) || 0;
      const oh = Number(other.height) || 0;
      seams.add(oy);
      seams.add(oy + oh);
    });
    return seams;
  }

  function nudgeHorizontalSplitHeight(engine, block, splitHeight) {
    const by = Number(block.y) || 0;
    const bh = Number(block.height) || 0;
    const cutY = by + splitHeight;
    const minSize = COLUMNS_HORIZONTAL_SPLIT_MIN_BLOCK;
    const band = columnBandForBlock(engine, block);
    const colId = Number(band?.regionId) || 1;
    for (const seamY of collectHorizontalSeamsInOtherColumns(engine, block)) {
      if (Math.abs(cutY - seamY) > CROSS_COLUMN_SEAM_TOLERANCE) continue;
      const nudge = 18 + ((colId * 11 + (Number(engine.submissionCount) || 0) * 7) % 40);
      const up = cutY + nudge;
      const down = cutY - nudge;
      if (up - by >= minSize && by + bh - up >= minSize) return up - by;
      if (down - by >= minSize && by + bh - down >= minSize) return down - by;
      return Math.min(bh - minSize, Math.max(minSize, splitHeight + nudge * 0.5));
    }
    return splitHeight;
  }

  function blockAllowsInColumnDiagonalSplit(engine, block) {
    if (!blockContainedInSingleColumnBand(engine, block)) return false;
    if (blockSpansMostOfQuiltWidth(block)) return false;
    const w = Number(block?.width) || 0;
    const h = Number(block?.height) || 0;
    return w >= 140 && h >= 140;
  }

  function inColumnDiagonalSplit(engine, block, newColor, createDiagonal) {
    if (typeof createDiagonal !== 'function' || !blockAllowsInColumnDiagonalSplit(engine, block)) {
      return null;
    }
    const n = Number(engine.submissionCount) || 0;
    const band = columnBandForBlock(engine, block);
    const colId = Number(band?.regionId) || 1;
    const roll = hashRatioFromKey(`${engine.quiltDateKey || 'columns'}:diag:${colId}:${n}`);
    if (roll > COLUMNS_IN_COLUMN_DIAGONAL_SPLIT_PROB) return null;
    return createDiagonal(block, newColor);
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
    const band = columnBandForBlock(engine, block);
    const colId = Number(band?.regionId) || 0;
    const zone = verticalZone(block);
    const allowVerticalStripeZone = columnZoneAllowsVerticalStripeSpecial(colId, zone);
    let patterns = allowVerticalStripeZone
      ? availablePatterns.slice()
      : availablePatterns.filter((p) => p !== 'bandedColumns');
    const used = Number(engine.__columnsVerticalStripePatternCount) || 0;
    if (used >= MAX_VERTICAL_STRIPE_PATTERNS) {
      patterns = patterns.filter((p) => !VERTICAL_STRIPE_PATTERN_TYPES.has(p));
    } else if (!allowVerticalStripeZone) {
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

  /** Vertical sub-splits inside a column only when the block is a short horizontal band. */
  const COLUMNS_VERTICAL_SPLIT_MAX_BLOCK_HEIGHT_FRAC = 0.15;

  function primaryQuiltHeight() {
    return quiltDims().h;
  }

  function blockAllowsVerticalColumnSplit(block) {
    const quiltH = primaryQuiltHeight();
    const bh = Number(block?.height) || 0;
    return bh < quiltH * COLUMNS_VERTICAL_SPLIT_MAX_BLOCK_HEIGHT_FRAC;
  }

  function splitDirectionForColumns(engine, block) {
    if (blockSpansMostOfQuiltWidth(block)) return 'vertical';
    if (blockIsTallStrip(block)) return 'horizontal';
    if (blockSpansQuiltWidth(block)) return 'vertical';
    if (blockContainedInSingleColumnBand(engine, block)) return 'horizontal';
    const band = columnBandForBlock(engine, block);
    if (band) {
      const bw = Number(block?.width) || 0;
      if (bw <= Number(band.width) * 0.88) return 'horizontal';
    }
    if (!blockAllowsVerticalColumnSplit(block)) return 'horizontal';
    return 'vertical';
  }

  function patternsForBlock(engine, block) {
    const band = columnBandForBlock(engine, block);
    const colId = Number(band?.regionId) || 0;
    const zone = verticalZone(block);
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
    if (stash.specialStructureScaleMultiplier != null) {
      engine.specialStructureScaleMultiplier = stash.specialStructureScaleMultiplier;
    }
    if (stash.bandRowSpecialWeight != null) {
      engine.bandRowSpecialWeight = stash.bandRowSpecialWeight;
    }
    delete engine._compositionSplitDirection;
    delete engine._compositionColumnsFullHeight;
    delete engine._compositionHorizontalSplitRatio;
    delete engine._compositionNudgeHorizontalSplitHeight;
    delete engine._compositionAllowAngledMacroSplit;
    delete engine._compositionInColumnDiagonalSplit;
    delete engine.__columnsVerticalStripePatternCount;
    delete engine.__compositionArchetypeStash;
    delete engine.__compositionArchetypeKey;
  }

  /**
   * Columns framework:
   * - Vertical parallel full-height bands (date-seeded).
   * - Never a full-width horizontal cut (that creates two stacked column sections).
   * - Horizontal splits OK only inside one column band.
   */
  function installColumnsArchetype(engine, options = {}) {
    if (!engine || typeof engine.addColor !== 'function') return;
    clearArchetypeBiases(engine);

    const dateKey = String(options.dateKey || 'columns-preview').trim() || 'columns-preview';
    if (typeof engine.setQuiltDateKey === 'function') engine.setQuiltDateKey(dateKey);
    if (typeof engine.hydrateMacroLayoutFromPersistence === 'function') {
      engine.hydrateMacroLayoutFromPersistence('columns');
    }
    if (typeof engine._computeMacroColumnBands === 'function') {
      engine.macroColumnMinCount = 3;
      engine.macroColumnMaxCount = 6;
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
      macroFlattenedAngledSplitProb: engine.macroFlattenedAngledSplitProb,
      specialStructureScaleMultiplier: engine.specialStructureScaleMultiplier,
      bandRowSpecialWeight: engine.bandRowSpecialWeight
    };

    engine.specialStructureScaleMultiplier = Math.max(Number(engine.specialStructureScaleMultiplier) || 0, 1);
    engine.bandRowSpecialWeight = Math.max(Number(engine.bandRowSpecialWeight) || 0, 1);

    engine.macroFlattenedAngledSplitProb =
      Number.isFinite(Number(engine.macroFlattenedAngledSplitProb)) && engine.macroFlattenedAngledSplitProb > 0
        ? engine.macroFlattenedAngledSplitProb
        : 1;

    if (stash.createDiagonalAxisPattern && typeof engine.performRegularSplit === 'function') {
      engine.createDiagonalAxisPattern = (block, newColor) => {
        if (blockSpansQuiltWidth(block) || blockSpansMostOfQuiltWidth(block)) {
          return engine.performRegularSplit(block, newColor);
        }
        if (blockContainedInSingleColumnBand(engine, block)) {
          return stash.createDiagonalAxisPattern(block, newColor);
        }
        return engine.performRegularSplit(block, newColor);
      };
      engine._compositionInColumnDiagonalSplit = (block, newColor) =>
        inColumnDiagonalSplit(engine, block, newColor, stash.createDiagonalAxisPattern);
    }

    engine.__columnsVerticalStripePatternCount = 0;

    if (stash.selectPatternType) {
      engine.selectPatternType = (availablePatterns, block, newColor) => {
        const filtered = filterVerticalStripePatterns(engine, availablePatterns, block);
        const prefs = patternsForBlock(engine, block);
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

    engine._compositionSplitDirection = (block) => splitDirectionForColumns(engine, block);
    engine._compositionColumnsFullHeight = true;
    engine._compositionHorizontalSplitRatio = (block) => horizontalSplitRatioForColumn(engine, block);
    engine._compositionNudgeHorizontalSplitHeight = (block, splitHeight) =>
      nudgeHorizontalSplitHeight(engine, block, splitHeight);
    engine._compositionAllowAngledMacroSplit = (block) =>
      blockContainedInSingleColumnBand(engine, block);

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

  root.CompositionArchetypes = {
    installColumnsArchetype,
    clearArchetypeBiases,
    COLUMN_ZONE_PATTERNS
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
