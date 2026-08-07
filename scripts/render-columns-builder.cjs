#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Columns archetype preview from real Firestore colors → PNG + HTML.
 *
 *   npm run columns:preview
 *   DATE_KEY=2026-07-11 npm run columns:preview
 */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const { getAppDateKey } = require('./lib/app-date-key.cjs');
const { fetchBranchData, colorsForReplay, renderPanels, ROOT } = require('./preview-branch-from-stored.cjs');
const {
  createServerQuiltEngine,
  serializeServerQuiltBlocks,
  computeQuiltFingerprint,
  loadServerQuiltRuntime
} = require('./lib/server-quilt-engine.cjs');
const { installColumnsArchetype } = require('./lib/composition-archetypes.cjs');

const OUT_DIR = path.join(ROOT, 'scripts', 'columns-preview-live');

function replayColumns(dateKey, colors) {
  const { Utils } = loadServerQuiltRuntime();
  const engine = createServerQuiltEngine({
    userId: `columns-preview-${dateKey}`,
    quiltDateKey: dateKey,
    engineOptions: {
      macroFreezeAtBlockCount: 25,
      bandRowSpecialWeight: 1,
      specialStructureScaleMultiplier: 1,
      macroFlattenedAngledSplitProb: 0.85
    }
  });
  installColumnsArchetype(engine, { dateKey, Utils });

  const skipped = [];
  for (let i = 0; i < colors.length; i += 1) {
    if (!engine.addColor(colors[i])) skipped.push({ index: i + 1, color: colors[i] });
  }

  const blocks = serializeServerQuiltBlocks(engine);
  return {
    blocks,
    submissionCount: Number(engine.submissionCount) || colors.length,
    macroStructureFrozen: engine.macroStructureFrozen === true,
    macroLayoutMode: engine.macroLayoutMode || 'columns',
    skipped
  };
}

function writeViewHtml(dateKey, meta) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Columns preview — ${dateKey}</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f6f4f1; color: #1f1b16; }
    main { max-width: 520px; margin: 0 auto; padding: 1.25rem; }
    h1 { font-size: 1rem; margin: 0 0 0.35rem; }
    p { margin: 0 0 1rem; color: #6b635a; font-size: 0.9rem; line-height: 1.45; }
    img { width: 100%; height: auto; display: block; border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.08); }
    .row { display: grid; gap: 1.5rem; }
    figcaption { margin-top: 0.5rem; font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: #6b635a; }
  </style>
</head>
<body>
  <main>
    <h1>Columns preview — ${dateKey}</h1>
    <p>${meta.colorCount} real colors replayed · ${meta.columnsBlocks} blocks (columns) vs ${meta.liveBlocks} blocks (live)</p>
    <div class="row">
      <figure>
        <img src="panel-live.png" alt="Live quilt ${dateKey}" />
        <figcaption>Live (Firestore)</figcaption>
      </figure>
      <figure>
        <img src="panel-columns.png" alt="Columns archetype ${dateKey}" />
        <figcaption>Columns archetype</figcaption>
      </figure>
    </div>
  </main>
</body>
</html>`;
  fs.writeFileSync(path.join(OUT_DIR, 'view.html'), html);
}

async function main() {
  const dateKey = String(process.env.DATE_KEY || getAppDateKey()).trim();
  const data = await fetchBranchData(dateKey);
  const colors = colorsForReplay(data);
  if (!colors.length) throw new Error(`No replay colors for ${dateKey}`);

  const columns = replayColumns(dateKey, colors);
  if (columns.skipped.length) {
    console.warn(`Skipped ${columns.skipped.length} color(s) during replay`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const panels = [
    {
      id: 'live',
      label: 'Live',
      subtitle: `${data.liveContributorCount} picks · ${data.liveBlocks.length} blocks`,
      blocks: data.liveBlocks,
      submissionCount: data.liveContributorCount,
      expectedFingerprint: computeQuiltFingerprint(data.liveBlocks)
    },
    {
      id: 'columns',
      label: 'Columns',
      subtitle: `${colors.length} colors · ${columns.blocks.length} blocks · layout ${columns.macroLayoutMode}`,
      blocks: columns.blocks,
      submissionCount: columns.submissionCount,
      expectedFingerprint: computeQuiltFingerprint(columns.blocks)
    }
  ];

  console.log(`Rendering ${dateKey} (${colors.length} colors)…`);
  await renderPanels(
    panels.map((p) => ({ ...p, pngPath: path.join(OUT_DIR, `${p.id}.png`) })),
    dateKey,
    OUT_DIR
  );

  writeViewHtml(dateKey, {
    colorCount: colors.length,
    columnsBlocks: columns.blocks.length,
    liveBlocks: data.liveBlocks.length
  });

  const viewPath = path.join(OUT_DIR, 'view.html');
  const columnsPng = path.join(OUT_DIR, 'panel-columns.png');
  console.log('');
  console.log(`Done — ${dateKey}`);
  console.log(`  ${viewPath}`);
  console.log(`  ${columnsPng}`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
