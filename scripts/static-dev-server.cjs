#!/usr/bin/env node
'use strict';

/**
 * Static our-daily-beta + /api/proxy-image (no node-canvas).
 * Story speaker cutouts need same-origin proxy for canvas compose.
 *
 *   npm run dev:static
 *   open http://127.0.0.1:3000/our-daily-beta
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const {
  normalizeProxyImageSourceUrl,
  shrinkImageBufferForCanvasProxy
} = require('./lib/proxy-image-utils.cjs');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.resolve(__dirname, '..');
const PROXY_MAX_BYTES = Number(process.env.PROXY_IMAGE_MAX_BYTES) || 32 * 1024 * 1024;
const PROXY_TIMEOUT_MS = 15000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

/** Same clean URLs as server.js (GET /our-daily-beta → our-daily-beta.html). */
const HTML_ALIASES = new Map([
  ['our-daily-beta', 'our-daily-beta.html'],
  ['mood-triptych-lab', 'mood-triptych-lab.html'],
  ['speaker-cutout-lab', 'speaker-cutout-lab.html'],
  ['intro-persona-triptych-lab', 'intro-persona-triptych-lab.html'],
  ['intro-persona-nav-lab', 'intro-persona-nav-lab.html'],
  ['intro-persona-frame', 'intro-persona-frame.html'],
  ['privacy', 'privacy.html'],
  ['support', 'support.html']
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

function isBlockedProxyHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
    return true;
  }
  return false;
}

async function fetchUpstream(targetUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const upstream = await fetch(targetUrl, {
      headers: { 'User-Agent': 'OurDailyQuiltStaticProxy/1.0' },
      redirect: 'follow',
      signal: controller.signal
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > PROXY_MAX_BYTES) {
      throw new Error('Remote file is too large');
    }
    return {
      status: upstream.status,
      headers: Object.fromEntries(upstream.headers.entries()),
      body
    };
  } finally {
    clearTimeout(timer);
  }
}

async function handleProxyImage(reqUrl, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  const rawUrl = normalizeProxyImageSourceUrl(reqUrl.searchParams.get('url') || '');
  if (!rawUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing url' }));
    return;
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid url' }));
    return;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedProxyHost(parsed.hostname)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unsupported image host' }));
    return;
  }
  try {
    const upstream = await fetchUpstream(parsed.toString());
    if (upstream.status < 200 || upstream.status >= 300) {
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Image fetch failed (${upstream.status})` }));
      return;
    }
    const contentType = String(upstream.headers['content-type'] || 'image/png')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith('image/')) {
      res.writeHead(415, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unsupported content type: ${contentType}` }));
      return;
    }
    let body = await shrinkImageBufferForCanvasProxy(upstream.body, contentType);
    const outType = body !== upstream.body ? 'image/png' : contentType;
    res.writeHead(200, {
      ...CORS,
      'Content-Type': outType,
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(body);
  } catch (err) {
    const msg = String(err?.message || err);
    const status = /too large/i.test(msg) ? 413 : /timed out/i.test(msg) ? 504 : 500;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg || 'Image proxy failed' }));
  }
}

function resolveFilePath(urlPath) {
  const decoded = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  let rel = decoded.replace(/^\/+/, '') || 'index.html';
  const alias = HTML_ALIASES.get(rel.replace(/\.html$/i, ''));
  if (alias) rel = alias;
  const tryPaths = [rel];
  if (!path.extname(rel)) tryPaths.push(`${rel}.html`);
  for (const candidate of tryPaths) {
    const file = path.resolve(ROOT, candidate);
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) continue;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

function serveStatic(urlPath, res) {
  const file = resolveFilePath(urlPath === '/' ? '/index.html' : urlPath);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${urlPath}`);
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${urlPath}`);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  if (reqUrl.pathname === '/api/proxy-image') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    if (req.method === 'GET') {
      void handleProxyImage(reqUrl, res);
      return;
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }
  serveStatic(reqUrl.pathname, res);
});

server.listen(PORT, () => {
  console.log('📂 Static dev server + /api/proxy-image (no node-canvas)');
  console.log(`   Open: http://127.0.0.1:${PORT}/our-daily-beta`);
  console.log('   Full API + Firestore admin: npm run dev');
});
