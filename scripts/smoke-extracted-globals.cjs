#!/usr/bin/env node
/**
 * Phase 8 hardening: extracted app slices call odq/ODQ helpers that must exist on
 * globalThis before the module bootstraps. Most live in lib/layout-b-compose.js.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const SLICE_FILES = fs
  .readdirSync(path.join(ROOT, 'lib'))
  .filter((name) => /^simplified-quilt-app-/.test(name) || name === 'layout-b-compose.js')
  .map((name) => path.join('lib', name));

const REQUIRED_LAYOUT_B_EXPORTS = [
  'composeInstagramLayoutBFromQuiltBlob',
  'getLayoutBStoryQuotePlan',
  'buildLayoutBQuoteStripPlan',
  'odqPromiseWithTimeout',
  'odqPrefetchLayoutBKeywordEmphasis',
  'odqPrefetchSpeakerCutoutTweak',
  'odqReadLayoutBKeywordEmphasis',
  'odqReadLayoutBStripLayoutSeed',
  'odqGetCachedLayoutBKeywordEmphasis',
  'odqGetCachedLayoutBStripLayoutSeed',
  'odqSetCachedLayoutBKeywordEmphasis',
  'odqSetCachedLayoutBStripLayoutSeed',
  'odqNormalizeTuneAspect',
  'odqNormalizeStripLayoutSeed',
  'odqNormalizeSpeakerNudgeComponent',
  'odqNormalizeSpeakerRotateDeg',
  'odqSpeakerCutoutTransformForDateAsync',
  'odqSpeakerCutoutTransformResolved',
  'odqResolveSpeakerImageForTune',
  'odqReadSpeakerCutoutPreset',
  'odqReadSpeakerCutoutTweakFromLocal',
  'odqQuoteMayHaveSpeakerImage',
  'odqSpeakerImageUrlFromQuote',
  'odqWriteSpeakerCutoutPreset',
  'odqWriteLayoutBKeywordEmphasis',
  'odqWriteLayoutBStripLayoutSeed',
  'odqWriteLayoutBSpeakerCutoutPresetFirestore',
  'odqVerifyLayoutBTuneOnServer',
  'odqWriteLayoutBTuneViaServer',
  'odqReadInstagramImagesDocWithFallback',
  'ODQ_SPEAKER_PRESETS',
  'ODQ_SPEAKER_NUDGE_STEP',
  'ODQ_SPEAKER_BIG_NUDGE_MUL',
  'ODQ_SPEAKER_ROTATE_STEP_DEG',
];

function loadLayoutBComposeSandbox() {
  const sandbox = {
    globalThis: {},
    window: {},
    document: {
      fonts: { check: () => true, load: async () => undefined },
      createElement: () => ({ style: {}, getContext: () => null }),
    },
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Math,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Error,
    Intl,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    Image: function Image() {},
    Blob: function Blob() {},
    FileReader: function FileReader() {
      this.readAsDataURL = () => {};
    },
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    CONFIG: {
      APP: { defaultColor: '#ea9b9a', debugMode: false },
      BACKEND: { baseUrl: 'https://example.test' },
    },
    LayoutBKeywordEmphasis: {
      buildTextRunsForLine: () => [],
      normalizeLayoutBKeywordEmphasisPayload: (x) => x,
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(ROOT, 'lib/layout-b-compose.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'layout-b-compose.js' });
  const carouselSrc = fs.readFileSync(
    path.join(ROOT, 'lib/layout-b-carousel-strips.js'),
    'utf8'
  );
  vm.runInContext(carouselSrc, sandbox, { filename: 'layout-b-carousel-strips.js' });
  return sandbox.globalThis;
}

function maskQuotedStrings(src) {
  return src
    .replace(/'(?:\\.|[^'\\])*'/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/"(?:\\.|[^"\\])*"/g, (m) => m.replace(/[^\n]/g, ' '));
}

function collectOdqRefs(filePath) {
  const raw = fs.readFileSync(path.join(ROOT, filePath), 'utf8');
  const src = maskQuotedStrings(raw);
  const names = new Set();
  const patterns = [/\b(odq[A-Z][A-Za-z0-9_]*)\b/g, /\b(ODQ_[A-Z0-9_]+)\b/g];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      const before = src.slice(Math.max(0, m.index - 12), m.index);
      if (/\.dataset\.$/.test(before)) continue;
      names.add(m[1]);
    }
  }
  return names;
}

function collectScriptGlobalsFromHtml(html) {
  const names = new Set();
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);
  for (const rel of scripts) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/\b(?:root|globalThis|window)\.([A-Za-z_$][\w$]*)\s*=/g)) {
      names.add(m[1]);
    }
  }
  return names;
}

function main() {
  let failed = false;

  const globals = loadLayoutBComposeSandbox();
  for (const name of REQUIRED_LAYOUT_B_EXPORTS) {
    if (globals[name] == null) {
      console.error(`missing layout-b-compose export: globalThis.${name}`);
      failed = true;
    }
  }

  const html = fs.readFileSync(path.join(ROOT, 'our-daily-beta.html'), 'utf8');
  const htmlGlobals = new Set([
    ...[...html.matchAll(/globalThis\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
    ...[...html.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]),
    ...collectScriptGlobalsFromHtml(html),
  ]);
  for (const name of Object.keys(globals)) {
    htmlGlobals.add(name);
  }

  const localDef = (src, name) =>
    new RegExp(`(?:function|const|let|async function|class)\\s+${name}\\b`).test(src);

  for (const rel of SLICE_FILES) {
    if (rel.endsWith('layout-b-compose.js')) continue;
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const name of collectOdqRefs(rel)) {
      if (localDef(src, name)) continue;
      if (htmlGlobals.has(name)) continue;
      if (name.startsWith('odqNotifyDebug') || name === 'odqRememberTodayOpen') continue;
      if (name === 'odqFirebaseAuthUser' || name === 'odqFirebaseAuthIdToken') continue;
      if (name === 'odqQrcode' || name === 'odqSettingsGearRectNav') continue;
      console.error(`${rel}: unresolved global ${name}`);
      failed = true;
    }
  }

  if (failed) process.exit(1);
  console.log('smoke-extracted-globals: ok');
}

main();
