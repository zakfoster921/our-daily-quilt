const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

const runtimeCache = new Map();

function loadServerQuiltRuntime(options = {}) {
  const engineRel = String(options.engineRelPath || 'lib/simple-quilt-engine.js');
  if (runtimeCache.has(engineRel)) return runtimeCache.get(engineRel);

  const storage = new Map();
  const sandbox = {
    console,
    Math,
    Date,
    parseInt,
    parseFloat,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    Map,
    Set,
    RegExp,
    Error,
    Buffer,
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    localStorage: {
      getItem: (key) => (storage.has(String(key)) ? storage.get(String(key)) : null),
      setItem: (key, value) => storage.set(String(key), String(value)),
      removeItem: (key) => storage.delete(String(key))
    },
    navigator: { userAgent: 'server-quilt-engine' },
    location: { search: '' },
    innerWidth: 390,
    innerHeight: 844,
    dispatchEvent: () => {},
    document: {
      dispatchEvent: () => {}
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    CONFIG: { APP: { defaultColor: '#ea9b9a' } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const ctx = vm.createContext(sandbox);
  for (const rel of [
    'lib/utils-core.js',
    'lib/utils-color.js',
    'lib/quote-mood-colors.js',
    'lib/quilt-mirror-layout.js',
    'lib/utils-quilt.js',
    'lib/utils-quilt-render.js',
    'lib/utils-zapier.js',
    engineRel
  ]) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(src, ctx, { filename: rel });
  }
  sandbox.Utils = sandbox.UtilsCore;

  if (!sandbox.SimpleQuiltEngine || !sandbox.Utils) {
    throw new Error('Could not initialize server quilt engine runtime');
  }

  const runtime = {
    SimpleQuiltEngine: sandbox.SimpleQuiltEngine,
    Utils: sandbox.Utils,
    QuiltMirrorLayout: sandbox.QuiltMirrorLayout
  };
  runtimeCache.set(engineRel, runtime);
  return runtime;
}

function cloneJson(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value == null ? fallback : value));
  } catch (_) {
    return fallback;
  }
}

function createServerQuiltEngine({
  userId,
  blocks,
  submissionCount,
  colorReplayEvents,
  macroStructureFrozen,
  macroLayoutMode,
  quiltDateKey,
  engineRelPath,
  engineOptions
} = {}) {
  const { SimpleQuiltEngine } = loadServerQuiltRuntime({ engineRelPath });
  const tuning =
    engineOptions && typeof engineOptions === 'object' && !Array.isArray(engineOptions)
      ? engineOptions
      : {};
  const engine = new SimpleQuiltEngine(String(userId || 'server-color-submission'), {
    recordColorReplayEvents: true,
    quiltDateKey: quiltDateKey || '',
    ...tuning
  });
  // Server writes the durable audit doc; browser local contribution history is client-only.
  engine.recordUserContribution = () => {};

  const sourceBlocks = Array.isArray(blocks) ? cloneJson(blocks, []) : [];
  if (sourceBlocks.length) {
    engine.blocks = sourceBlocks;
    engine.submissionCount = Math.max(0, Math.floor(Number(submissionCount) || 0));
    engine.recordColorReplayEvents = true;
    engine.macroStructureFrozen = macroStructureFrozen === true;
    if (quiltDateKey && typeof engine.setQuiltDateKey === 'function') {
      engine.setQuiltDateKey(quiltDateKey);
    }
    if (typeof engine.hydrateMacroLayoutFromPersistence === 'function') {
      engine.hydrateMacroLayoutFromPersistence(macroLayoutMode);
    }
    if (typeof engine.setColorReplayEvents === 'function') {
      engine.setColorReplayEvents(Array.isArray(colorReplayEvents) ? colorReplayEvents : []);
    }
    if (macroStructureFrozen === true && typeof engine.repairMacroRegionIdsAfterLoadIfFrozen === 'function') {
      engine.repairMacroRegionIdsAfterLoadIfFrozen();
    }
  } else {
    engine.initialize();
    engine.recordColorReplayEvents = true;
  }

  return engine;
}

function serializeServerQuiltBlocks(engine) {
  if (!engine || !Array.isArray(engine.blocks)) return [];
  return engine.blocks
    .map((block) =>
      typeof engine._serializeBlockForReplay === 'function'
        ? engine._serializeBlockForReplay(block)
        : cloneJson(block, null)
    )
    .filter(Boolean);
}

function computeQuiltFingerprint(blocks, options = {}) {
  const { Utils } = loadServerQuiltRuntime(options);
  return typeof Utils.computeQuiltFingerprint === 'function'
    ? Utils.computeQuiltFingerprint(blocks)
    : '';
}

function resolveDedicatedBlock(engine, addResult, clientId) {
  const dedicatedId = String(addResult?.dedicatedBlockId || '').trim();
  if (dedicatedId) {
    const block = (engine.blocks || []).find((b) => String(b.id || '') === dedicatedId);
    if (block) return block;
  }
  const submissionIndex = Number(addResult?.submissionIndex) || Number(engine.submissionCount) || 0;
  const uid = String(clientId || '').trim();
  return (
    (engine.blocks || []).find((block) => {
      if (Number(block?.submissionIndex) !== submissionIndex) return false;
      if (String(block?.contributorId || '').trim() === uid) return true;
      const ids = Array.isArray(block?.contributorIds) ? block.contributorIds : [];
      return ids.some((id) => String(id || '').trim() === uid);
    }) || null
  );
}

function extractBlockPolygonPoints(engine, block) {
  if (!block) return null;
  if (typeof engine?._buildMacroFrozenOutline === 'function') {
    const outline = engine._buildMacroFrozenOutline(block);
    if (outline?.type === 'polygon' && Array.isArray(outline.points) && outline.points.length >= 3) {
      return outline.points.map((p) => [Number(p.x), Number(p.y)]);
    }
    if (
      outline?.type === 'polygons' &&
      Array.isArray(outline.pieces) &&
      outline.pieces[0]?.points?.length >= 3
    ) {
      return outline.pieces[0].points.map((p) => [Number(p.x), Number(p.y)]);
    }
  }
  const x = Number(block.x) || 0;
  const y = Number(block.y) || 0;
  const w = Number(block.width) || 1;
  const h = Number(block.height) || 1;
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h]
  ];
}

/** Read-only color placement for post-color lab — no Firestore writes. */
function previewColorPlacement({
  userId,
  blocks,
  submissionCount,
  colorReplayEvents,
  macroStructureFrozen,
  macroLayoutMode,
  quiltDateKey,
  dailyMoodColorHex,
  color,
  clientId
} = {}) {
  const engine = createServerQuiltEngine({
    userId,
    blocks,
    submissionCount,
    colorReplayEvents,
    macroStructureFrozen,
    macroLayoutMode,
    quiltDateKey
  });
  engine.dailyMoodColorHex = dailyMoodColorHex || null;
  const addResult = engine.addColor(color);
  if (!addResult) {
    return { ok: false, error: 'Could not place color on quilt' };
  }
  const dedicatedBlock = resolveDedicatedBlock(engine, addResult, clientId || userId);
  const targetPolygon = extractBlockPolygonPoints(engine, dedicatedBlock);
  if (!targetPolygon || targetPolygon.length < 3) {
    return { ok: false, error: 'Could not resolve dedicated block outline' };
  }
  return {
    ok: true,
    addResult,
    dedicatedBlock,
    targetPolygon,
    sideCount: targetPolygon.length,
    appliedColor: addResult.appliedColor || color,
    dedicatedBlockId: addResult.dedicatedBlockId || dedicatedBlock?.id || '',
    submissionIndex: Number(addResult.submissionIndex) || Number(engine.submissionCount) || 0
  };
}

module.exports = {
  loadServerQuiltRuntime,
  createServerQuiltEngine,
  serializeServerQuiltBlocks,
  computeQuiltFingerprint,
  resolveDedicatedBlock,
  extractBlockPolygonPoints,
  previewColorPlacement
};
