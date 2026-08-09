/**
 * Shared quilt-builder setup so local previews match our-daily-beta.html.
 * Main app: new SimpleQuiltEngine(userId) + new QuiltRendererV2(logger) — no preview overrides.
 */
(function (root) {
  function createProductionEngine(deviceId, options = {}) {
    const Engine = root.SimpleQuiltEngine;
    if (typeof Engine !== 'function') {
      throw new Error('SimpleQuiltEngine must load before builder-fidelity.js');
    }
    const engineOptions = {};
    const freezeAt = Number(options.macroFreezeAtBlockCount);
    if (Number.isFinite(freezeAt) && freezeAt >= 2) {
      engineOptions.macroFreezeAtBlockCount = Math.floor(freezeAt);
    }
    const engine = new Engine(String(deviceId || 'builder-preview'), engineOptions);
    engine.recordUserContribution = () => {};
    engine._suppressSplitWarnings = true;
    return engine;
  }

  function configureLiveRenderer(renderer, options = {}) {
    if (!renderer) return;
    if (typeof renderer.setBuilderPreviewMode === 'function') {
      renderer.setBuilderPreviewMode(false);
    }
    renderer._builderPreviewMode = false;
    if (typeof renderer.setBacksidePreviewEnabled === 'function') {
      renderer.setBacksidePreviewEnabled(false);
    }
    const dateKey = String(options.dateKey || '').trim();
    if (dateKey) renderer._exportDateKeyOverride = dateKey;
  }

  /** Legacy fast path — hides layering and uses simplified paint (not what the app shows). */
  function configureLegacyPreviewRenderer(renderer, options = {}) {
    if (!renderer) return;
    renderer._builderPreviewMode = true;
    if (typeof renderer.setBuilderPreviewMode === 'function') {
      renderer.setBuilderPreviewMode(true);
    }
    const cap = Number(options.layeringCap);
    const layeringCap = Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : 0;
    if (typeof renderer.setBuilderLayeringSubmissionCap === 'function') {
      renderer.setBuilderLayeringSubmissionCap(layeringCap);
    } else {
      renderer._builderLayeringSubmissionCap = layeringCap;
    }
    const dateKey = String(options.dateKey || '').trim();
    if (dateKey) renderer._exportDateKeyOverride = dateKey;
    if (typeof renderer.setBacksidePreviewEnabled === 'function') {
      renderer.setBacksidePreviewEnabled(false);
    }
  }

  function applyRendererMode(renderer, mode, options = {}) {
    if (mode === 'preview') {
      configureLegacyPreviewRenderer(renderer, options);
    } else {
      configureLiveRenderer(renderer, options);
    }
  }

  function productionColumnsLayout(engine, dateKey) {
    if (!engine || typeof engine.setQuiltDateKey !== 'function') return;
    const dk = String(dateKey || '').trim();
    if (dk) engine.setQuiltDateKey(dk);
    engine.hydrateMacroLayoutFromPersistence?.('columns');
  }

  function productionNinePatchGrid(engine, dateKey) {
    if (!engine || typeof engine.setQuiltDateKey !== 'function') return;
    const dk = String(dateKey || '').trim();
    if (dk) engine.setQuiltDateKey(dk);
    engine.hydrateMacroLayoutFromPersistence?.('ninepatch');
    if (typeof engine._computeMacroNinePatchCells === 'function') {
      engine._macroNinePatchCells = engine._computeMacroNinePatchCells();
    }
  }

  function dateMacroLayoutMode(dateKey) {
    const Engine = root.SimpleQuiltEngine;
    if (typeof Engine?.macroLayoutModeForDateKey !== 'function') return 'default';
    return Engine.macroLayoutModeForDateKey(dateKey);
  }

  function fidelitySummary(engine, options = {}) {
    const renderMode = options.renderMode === 'preview' ? 'preview' : 'live';
    const rulesMode = String(options.rulesMode || 'production');
    const layout =
      engine?.macroLayoutMode ||
      (options.dateKey ? dateMacroLayoutMode(options.dateKey) : 'default');
    const frozen = engine?.macroStructureFrozen ? 'yes' : 'no';
    return {
      renderMode,
      rulesMode,
      layout,
      frozen,
      label:
        renderMode === 'live' && rulesMode === 'production'
          ? 'Matches app engine + renderer'
          : renderMode === 'preview'
            ? 'Legacy builder render — not what the app shows'
            : 'Experimental archetype rules — not production columns path'
    };
  }

  root.BuilderFidelity = {
    createProductionEngine,
    configureLiveRenderer,
    configureLegacyPreviewRenderer,
    applyRendererMode,
    productionColumnsLayout,
    productionNinePatchGrid,
    dateMacroLayoutMode,
    fidelitySummary
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
