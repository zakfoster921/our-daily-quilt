#!/usr/bin/env node
/* eslint-disable no-console */
const sharp = require('sharp');
const { stripSpeakerCutoutHaloRgba } = require('./strip-speaker-cutout-halo.cjs');
const { applySpeakerCutoutXeroxRgba } = require('./speaker-cutout-xerox-pass.cjs');

const DEFAULT_MAX_EDGE = 1200;

function parseMaxEdge() {
  const raw = String(process.env.SPEAKER_CUTOUT_MAX_EDGE || '').trim();
  if (!raw) return DEFAULT_MAX_EDGE;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_MAX_EDGE;
}

function formatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
}

/**
 * Resize and compress a transparent speaker cutout PNG for web delivery.
 * @param {Buffer} inputBuffer
 * @param {{ maxEdge?: number, xeroxSeed?: string, skipXerox?: boolean }} [options]
 * @returns {Promise<{ buffer: Buffer, width: number, height: number, bytesBefore: number, bytesAfter: number }>}
 */
async function optimizeSpeakerCutoutPng(inputBuffer, options = {}) {
  const bytesBefore = Buffer.isBuffer(inputBuffer) ? inputBuffer.length : 0;
  if (!bytesBefore) {
    throw new Error('optimizeSpeakerCutoutPng: empty input buffer');
  }

  const maxEdge = Number(options.maxEdge) > 0 ? Math.round(Number(options.maxEdge)) : parseMaxEdge();
  const meta = await sharp(inputBuffer).metadata();
  const sourceW = Math.max(1, meta.width || 1);
  const sourceH = Math.max(1, meta.height || 1);
  const scale = Math.min(1, maxEdge / Math.max(sourceW, sourceH));

  let pipeline = sharp(inputBuffer, { failOn: 'none' }).ensureAlpha();
  if (scale < 1) {
    pipeline = pipeline.resize(
      Math.max(1, Math.round(sourceW * scale)),
      Math.max(1, Math.round(sourceH * scale)),
      {
        fit: 'inside',
        withoutEnlargement: true
      }
    );
  }

  const { data: raw, info: rawInfo } = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  stripSpeakerCutoutHaloRgba(raw, rawInfo.width, rawInfo.height);
  if (options.skipXerox !== true) {
    applySpeakerCutoutXeroxRgba(raw, rawInfo.width, rawInfo.height, options.xeroxSeed || 'odq');
  }

  const { data, info } = await sharp(raw, {
    raw: { width: rawInfo.width, height: rawInfo.height, channels: 4 }
  })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: true,
      quality: 80,
      effort: 10
    })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    bytesBefore,
    bytesAfter: data.length
  };
}

function logSpeakerCutoutOptimization(result, label = 'cutout') {
  if (!result) return;
  const { width, height, bytesBefore, bytesAfter } = result;
  console.log(
    `[${label}] optimized ${width}x${height} ${formatBytes(bytesBefore)} -> ${formatBytes(bytesAfter)}`
  );
}

module.exports = {
  DEFAULT_MAX_EDGE,
  formatBytes,
  logSpeakerCutoutOptimization,
  optimizeSpeakerCutoutPng,
  parseMaxEdge
};
