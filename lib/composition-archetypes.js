/**
 * Browser composition archetypes for quilt-builder preview.
 * Nudges split routing / specials toward a day-level silhouette (blocks still split normally).
 */
(function (root) {
  'use strict';

  const COLUMNS_PATTERN_PREF = [
    'bandedColumns',
    'stripes',
    'checkerboard',
    'insetCircle',
    'cross',
    'diamond',
    'hst',
    'nestedGrid',
    'framed'
  ];

  function quiltWidth() {
    try {
      const dims = typeof Utils !== 'undefined' && Utils.getQuiltDimensions ? Utils.getQuiltDimensions() : null;
      return Math.max(1, Number(dims?.width) || 1070);
    } catch (_) {
      return 1070;
    }
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

  function verticalZone(block) {
    const y = Number(block?.y) || 0;
    const h = Number(block?.height) || 0;
    const cy = y + h / 2;
    const dims = typeof Utils !== 'undefined' && Utils.getQuiltDimensions ? Utils.getQuiltDimensions() : null;
    const quiltH = Math.max(1, Number(dims?.height) || 1340);
    const t = cy / quiltH;
    if (t < 0.34) return 'top';
    if (t < 0.67) return 'middle';
    return 'bottom';
  }

  /** Per-column recipes loosely matching the columns sketch. */
  const COLUMN_ZONE_PATTERNS = {
    1: { top: ['bandedColumns', 'stripes'], middle: ['hst', 'diamond'], bottom: ['checkerboard', 'nestedGrid'] },
    2: { top: ['stripes'], middle: ['diamond', 'cross'], bottom: ['cross', 'nestedGrid'] },
    3: { top: ['stripes', 'hst'], middle: ['insetCircle', 'framed'], bottom: ['bandedColumns', 'stripes'] },
    4: { top: ['hst', 'diamond'], middle: ['nestedGrid', 'cross'], bottom: ['framed', 'stripes'] }
  };

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
    delete engine._compositionSplitDirection;
    delete engine.__compositionArchetypeStash;
    delete engine.__compositionArchetypeKey;
  }

  function installColumnsArchetype(engine, options = {}) {
    if (!engine || typeof engine.addColor !== 'function') return;
    clearArchetypeBiases(engine);

    const dateKey = String(options.dateKey || 'columns-preview').trim() || 'columns-preview';
    if (typeof engine.setQuiltDateKey === 'function') engine.setQuiltDateKey(dateKey);
    if (typeof engine.hydrateMacroLayoutFromPersistence === 'function') {
      engine.hydrateMacroLayoutFromPersistence('columns');
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
          : null
    };

    if (stash.selectPatternType) {
      engine.selectPatternType = (availablePatterns, block, newColor) => {
        const prefs = patternsForBlock(engine, block);
        for (const preferred of prefs) {
          if (availablePatterns.includes(preferred)) return preferred;
        }
        return stash.selectPatternType(availablePatterns, block, newColor);
      };
    }

    engine._compositionSplitDirection = (block) => {
      const w = Number(block?.width) || 0;
      const h = Number(block?.height) || 0;
      if (!engine.macroStructureFrozen && w > quiltWidth() * 0.42) return 'vertical';
      if (h > w * 1.15) return 'horizontal';
      return w > h * 1.15 ? 'vertical' : 'horizontal';
    };

    if (stash.routeMacro) {
      engine._routeSplittableBlocksByMacroColor = (newColor, candidateBlocks) => {
        let routed = stash.routeMacro(newColor, candidateBlocks);
        if (!Array.isArray(routed) || routed.length <= 1) return routed;
        if (engine.macroStructureFrozen && Array.isArray(engine._macroColumnBands)) {
          routed = [...routed].sort((a, b) => {
            const bandA = columnBandForBlock(engine, a);
            const bandB = columnBandForBlock(engine, b);
            const fillA = (bandA?.regionId || 0) / Math.max(1, engine._macroColumnBands.length);
            const fillB = (bandB?.regionId || 0) / Math.max(1, engine._macroColumnBands.length);
            const pickBand = ((Number(engine.submissionCount) || 0) % engine._macroColumnBands.length) + 1;
            const targetA = Math.abs((bandA?.regionId || 0) - pickBand);
            const targetB = Math.abs((bandB?.regionId || 0) - pickBand);
            if (targetA !== targetB) return targetA - targetB;
            return fillA - fillB;
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
