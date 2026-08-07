#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Build a single-panel Columns preview page with a real day's color sequence.
 *
 *   npm run columns:preview
 *   DATE_KEY=2026-07-11 npm run columns:preview
 *
 * Then (separate terminal): npm run builder:quilt
 * Open the printed URL.
 */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const { getAppDateKey } = require('./lib/app-date-key.cjs');
const { fetchBranchData, colorsForReplay, ROOT } = require('./preview-branch-from-stored.cjs');

const TEMPLATE = path.join(ROOT, 'scripts', 'quilt-builder.html');
const OUT_DIR = path.join(ROOT, 'tmp', 'columns-preview');

function injectReplayData(templateHtml, dateKey, colors) {
  const payload = `<script>
window.__ODQ_BUILDER_DATE_KEY__ = ${JSON.stringify(dateKey)};
window.__ODQ_REPLAY_COLORS__ = ${JSON.stringify(colors)};
window.__ODQ_COLUMNS_PREVIEW__ = true;
</script>`;
  if (templateHtml.includes('<!-- columns-preview-inject -->')) {
    return templateHtml.replace('<!-- columns-preview-inject -->', payload);
  }
  return templateHtml.replace('</head>', `${payload}\n</head>`);
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

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${dateKey}.html`);
  fs.writeFileSync(outFile, html);

  const port = Number(process.env.PORT) || 3000;
  const url = `http://127.0.0.1:${port}/tmp/columns-preview/${dateKey}.html`;

  console.log(`Columns preview ready — ${dateKey}`);
  console.log(`  ${colors.length} colors · ${data.liveBlocks.length} blocks in live quilt`);
  console.log('');
  console.log('1. npm run builder:quilt   (if not already running)');
  console.log(`2. open ${url}`);
  console.log('');
  console.log('Space / Add color steps through the real submission order.');
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
