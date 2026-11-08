#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Railway Cron entrypoint: same job as .github/workflows/daily-slide1-preview.yml.
 * Serves the repo on a local port, runs generate-nightly-ig-images.cjs in slide-1-preview-only mode
 * (renders in headless Chromium, writes instagram-images/{day}.slide1Preview*, pushes to admin), then exits.
 *
 * Env (set on the Railway service):
 *   RESET_URL (ending /api/daily-reset), RESET_TOKEN, GOOGLE_APPLICATION_CREDENTIALS_JSON,
 *   FIREBASE_STORAGE_BUCKET (optional), DATE_KEY (optional YYYY-MM-DD)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 8765;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.csv': 'text/csv', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  const resetUrl = String(process.env.RESET_URL || '').trim();
  if (!resetUrl) {
    console.error('Missing RESET_URL');
    server.close();
    process.exit(1);
  }
  const env = {
    ...process.env,
    APP_URL: `http://127.0.0.1:${PORT}/our-daily-beta.html`,
    API_BASE_URL: resetUrl.replace(/\/api\/daily-reset$/, ''),
    DATE_KEY: process.env.DATE_KEY || '',
    NIGHTLY_IG_SLIDE1_PREVIEW_ONLY: 'true',
    NIGHTLY_IG_MAX_ATTEMPTS: '2',
    NIGHTLY_IG_ARTIFACTS_DIR: '/tmp/slide1-preview-artifacts',
  };
  const child = spawn('node', [path.join(__dirname, 'generate-nightly-ig-images.cjs')], { env, stdio: 'inherit' });
  const killTimer = setTimeout(() => { console.error('Timed out after 18 min'); child.kill('SIGKILL'); }, 18 * 60 * 1000);
  child.on('exit', (code) => {
    clearTimeout(killTimer);
    server.close();
    process.exit(code === 0 ? 0 : 1);
  });
});
