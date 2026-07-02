const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

let runtime = null;

function loadServerQuiltRuntime() {
  if (runtime) return runtime;

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
    'lib/utils-quilt.js',
    'lib/utils-zapier.js',
    'lib/simple-quilt-engine.js'
  ]) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(src, ctx, { filename: rel });
  }
  sandbox.Utils = sandbox.UtilsCore;

  if (!sandbox.SimpleQuiltEngine || !sandbox.Utils) {
    throw new Error('Could not initialize server quilt engine runtime');
  }

  runtime = {
    SimpleQuiltEngine: sandbox.SimpleQuiltEngine,
    Utils: sandbox.Utils
  };
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
  macroStructureFrozen
} = {}) {
  const { SimpleQuiltEngine } = loadServerQuiltRuntime();
  const engine = new SimpleQuiltEngine(String(userId || 'server-color-submission'), {
    recordColorReplayEvents: true
  });
  // Server writes the durable audit doc; browser local contribution history is client-only.
  engine.recordUserContribution = () => {};

  const sourceBlocks = Array.isArray(blocks) ? cloneJson(blocks, []) : [];
  if (sourceBlocks.length) {
    engine.blocks = sourceBlocks;
    engine.submissionCount = Math.max(0, Math.floor(Number(submissionCount) || 0));
    engine.recordColorReplayEvents = true;
    engine.macroStructureFrozen = macroStructureFrozen === true;
    if (typeof engine.setColorReplayEvents === 'function') {
      engine.setColorReplayEvents(Array.isArray(colorReplayEvents) ? colorReplayEvents : []);
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

function computeQuiltFingerprint(blocks) {
  const { Utils } = loadServerQuiltRuntime();
  return typeof Utils.computeQuiltFingerprint === 'function'
    ? Utils.computeQuiltFingerprint(blocks)
    : '';
}

module.exports = {
  loadServerQuiltRuntime,
  createServerQuiltEngine,
  serializeServerQuiltBlocks,
  computeQuiltFingerprint
};
