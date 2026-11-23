/* eslint-disable no-console */
/**
 * Local background removal via the open-source rembg CLI (https://github.com/danielgatis/rembg).
 * Replaces the remove.bg API (service shuts down 2026-12-01). No API key or credits needed.
 *
 * Env:
 *   REMBG_BIN     path to the rembg executable (default: "rembg")
 *   REMBG_MODELS  comma-separated model names, tried in order until one yields a usable subject
 *                 (default: "isnet-general-use,u2net")
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { PNG } = require('pngjs');

const REMBG_BIN = String(process.env.REMBG_BIN || 'rembg').trim() || 'rembg';
const DEFAULT_MODELS = 'isnet-general-use,u2net';

function rembgModels() {
  return String(process.env.REMBG_MODELS || DEFAULT_MODELS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function extensionFor(contentType = '', imageUrl = '') {
  const type = String(contentType).toLowerCase();
  if (type.includes('png')) return '.png';
  if (type.includes('webp')) return '.webp';
  if (type.includes('gif')) return '.gif';
  if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
  const m = String(imageUrl).toLowerCase().match(/\.(png|jpe?g|webp|gif)(?:[?#]|$)/);
  return m ? `.${m[1] === 'jpeg' ? 'jpg' : m[1]}` : '.jpg';
}

/** Fraction of pixels that are mostly opaque. Used to reject empty or fully-opaque results. */
function opaqueFraction(pngBuffer) {
  const { width, height, data } = PNG.sync.read(pngBuffer);
  const total = width * height;
  if (!total) return 0;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 32) opaque += 1;
  }
  return opaque / total;
}

function runRembg(model, inPath, outPath) {
  const result = spawnSync(REMBG_BIN, ['i', '-m', model, inPath, outPath], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 5 * 60 * 1000
  });
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error(
        `rembg not found ("${REMBG_BIN}"). Install it with: pip install "rembg[cpu,cli]" (or set REMBG_BIN).`
      );
    }
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = `${result.stderr || ''}${result.stdout || ''}`.trim().slice(-600);
    throw new Error(`rembg (${model}) exited ${result.status}: ${detail}`);
  }
  if (!fs.existsSync(outPath)) throw new Error(`rembg (${model}) produced no output file`);
  return fs.readFileSync(outPath);
}

/** Returns a transparent PNG Buffer for the given image bytes. */
function removeBackgroundWithRembg(buffer, contentType, imageUrl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odq-rembg-'));
  const inPath = path.join(dir, `in${extensionFor(contentType, imageUrl)}`);
  const outPath = path.join(dir, 'out.png');
  fs.writeFileSync(inPath, buffer);

  const models = rembgModels();
  let lastError = null;
  let lastPng = null;
  try {
    for (let i = 0; i < models.length; i += 1) {
      const model = models[i];
      try {
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        const png = runRembg(model, inPath, outPath);
        const fraction = opaqueFraction(png);
        // A real portrait cutout keeps a sizeable subject but not the whole frame.
        if (fraction >= 0.03 && fraction <= 0.97) {
          if (i > 0) console.log(`[cutout] succeeded with rembg model ${model}`);
          return png;
        }
        lastPng = png;
        lastError = new Error(`rembg (${model}) subject coverage ${(fraction * 100).toFixed(1)}% looks wrong`);
        if (i < models.length - 1) console.log(`[cutout] ${lastError.message}; trying ${models[i + 1]}`);
      } catch (error) {
        lastError = error;
        if (/rembg not found/.test(error.message || '')) throw error;
        if (i < models.length - 1) console.log(`[cutout] ${error.message}; trying ${models[i + 1]}`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const hint =
    'rembg could not isolate a subject in this portrait (common for old paintings/sepia photos). ' +
    'Use a clearer photo, or upload a manual PNG via scripts/upload-manual-speaker-cutout-client.mjs --upload-file=...';
  if (lastPng && !lastError) return lastPng;
  throw new Error(lastError ? `${lastError.message}\n${hint}` : hint);
}

module.exports = { removeBackgroundWithRembg, opaqueFraction, rembgModels };
