#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Build Columns preview with real Firestore colors and open in Cursor.
 *
 *   npm run columns:preview
 *   DATE_KEY=2026-07-11 npm run columns:preview
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const { getAppDateKey } = require('./lib/app-date-key.cjs');
const { fetchBranchData, colorsForReplay, ROOT } = require('./preview-branch-from-stored.cjs');

const TEMPLATE = path.join(ROOT, 'scripts', 'quilt-builder.html');
const OUT_FILE = path.join(ROOT, 'scripts', 'columns-preview-live.html');
const PORT = Number(process.env.PORT) || 3000;

function injectReplayData(templateHtml, dateKey, colors) {
  const payload = `<script>
window.__ODQ_BUILDER_DATE_KEY__ = ${JSON.stringify(dateKey)};
window.__ODQ_REPLAY_COLORS__ = ${JSON.stringify(colors)};
window.__ODQ_COLUMNS_PREVIEW__ = true;
window.__ODQ_AUTO_REPLAY__ = true;
</script>`;
  if (templateHtml.includes('<!-- columns-preview-inject -->')) {
    return templateHtml.replace('<!-- columns-preview-inject -->', payload);
  }
  return templateHtml.replace('</head>', `${payload}\n</head>`);
}

function serverAlreadyUp(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/scripts/columns-preview-live.html`, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startStaticServer() {
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'static-dev-server.cjs')], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT) }
  });
  child.unref();
}

async function waitForServer(port, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    if (await serverAlreadyUp(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main() {
  const dateKey = String(process.env.DATE_KEY || getAppDateKey()).trim();
  const data = await fetchBranchData(dateKey);
  const colors = colorsForReplay(data);
  if (!colors.length) {
    throw new Error(`No replay colors for ${dateKey}`);
  }

  if (!fs.existsSync(TEMPLATE)) {
    throw new Error(`Missing template: ${TEMPLATE}`);
  }
  const templateHtml = fs.readFileSync(TEMPLATE, 'utf8');
  const html = injectReplayData(templateHtml, dateKey, colors);
  fs.writeFileSync(OUT_FILE, html);

  if (!(await serverAlreadyUp(PORT))) {
    startStaticServer();
    if (!(await waitForServer(PORT))) {
      throw new Error(`Static server did not start on port ${PORT}`);
    }
  }

  const url = `http://127.0.0.1:${PORT}/scripts/columns-preview-live.html`;
  console.log(`Columns preview ready — ${dateKey}`);
  console.log(`  ${colors.length} colors · ${data.liveBlocks.length} blocks in live quilt`);
  console.log(`  ${url}`);
  console.log(`  file: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
