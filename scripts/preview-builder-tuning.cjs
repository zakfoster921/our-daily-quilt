#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Three-way preview: live Firestore quilt vs legacy engine vs builder/current tuning replay.
 *
 *   npm run preview:builder-tuning
 *   DATE_KEY=2026-08-03 npm run preview:builder-tuning
 *
 * Output: tmp/builder-tuning-preview/<dateKey>/contact-sheet.png + preview.html
 */
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (_) {
  /* optional */
}

const { getAppDateKey } = require('./lib/app-date-key.cjs');
const { replaySequence } = require('./lib/composition-preview.cjs');
const {
  fetchBranchData,
  colorsForReplay,
  renderPanels,
  labelPanelBuffer,
  writeContactSheet,
  computeQuiltFingerprint,
  ROOT
} = require('./preview-branch-from-stored.cjs');

const LEGACY_ENGINE_OPTIONS = {
  macroFreezeAtBlockCount: 25,
  macroFlattenedAngledSplitProb: 0,
  bandRowSpecialWeight: 1,
  specialStructureScaleMultiplier: 1
};

const BUILDER_ENGINE_OPTIONS = {
  macroFreezeAtBlockCount: 5,
  macroFlattenedAngledSplitProb: 0.85,
  bandRowSpecialWeight: 0,
  specialStructureScaleMultiplier: 0
};

function writeBuilderPreviewHtml(outDir, dateKey, summary, cacheBust) {
  const q = `?v=${cacheBust}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <title>Builder tuning preview — ${dateKey}</title>
  <style>
    body { margin:0; font-family:system-ui,sans-serif; background:#f6f4f1; color:#2a2118; }
    main { max-width:1600px; margin:0 auto; padding:1.5rem; }
    h1 { font-size:1.2rem; margin:0 0 0.75rem; }
    p { line-height:1.5; margin:0 0 1rem; font-size:0.95rem; }
    img { width:100%; height:auto; border-radius:8px; box-shadow:0 8px 32px rgba(42,33,24,.12); display:block; }
  </style>
</head>
<body>
  <main>
    <h1>${dateKey}</h1>
    <p>Left: live Firestore quilt. Middle: legacy replay (freeze 25, angled splits off, specials on). Right: builder/current tuning replay (freeze 5, angled 0.85, specials off) — ${summary.replayColorCount} colors each.</p>
    <img src="contact-sheet.png${q}" alt="Live vs legacy vs builder tuning" />
  </main>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'preview.html'), html);
}

async function main() {
  const dateKey = String(process.env.DATE_KEY || getAppDateKey()).trim();
  const data = await fetchBranchData(dateKey);
  const replayColors = colorsForReplay(data);
  if (!replayColors.length) {
    throw new Error(`No colors to replay for ${dateKey}`);
  }

  const legacyReplay = replaySequence(dateKey, replayColors, 'baseline', replayColors.length, {
    macroStructureFrozen: false,
    quiltDateKey: dateKey,
    engineOptions: LEGACY_ENGINE_OPTIONS
  });
  const builderReplay = replaySequence(dateKey, replayColors, 'baseline', replayColors.length, {
    macroStructureFrozen: false,
    quiltDateKey: dateKey,
    engineOptions: BUILDER_ENGINE_OPTIONS
  });

  const displayPanels = [
    {
      id: 'stored',
      label: 'Live',
      subtitle: `${data.liveContributorCount} picks · ${data.liveBlocks.length} blocks · Firestore`,
      blocks: data.liveBlocks,
      submissionCount: data.liveContributorCount,
      expectedFingerprint: computeQuiltFingerprint(data.liveBlocks)
    },
    {
      id: 'legacy',
      label: 'Legacy engine',
      subtitle: `Replay · freeze 25 · angled off · specials on · ${legacyReplay.blocks.length} blocks`,
      blocks: legacyReplay.blocks,
      submissionCount: legacyReplay.submissionCount,
      expectedFingerprint: computeQuiltFingerprint(legacyReplay.blocks)
    },
    {
      id: 'builder',
      label: 'Builder tuning',
      subtitle: `Replay · freeze 5 · angled 0.85 · specials off · ${builderReplay.blocks.length} blocks`,
      blocks: builderReplay.blocks,
      submissionCount: builderReplay.submissionCount,
      expectedFingerprint: computeQuiltFingerprint(builderReplay.blocks)
    }
  ];

  const outDir = path.join(ROOT, 'tmp', 'builder-tuning-preview', dateKey);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `[builder-tuning] ${dateKey}: ${replayColors.length} colors → legacy ${legacyReplay.blocks.length} blocks, builder ${builderReplay.blocks.length} blocks`
  );

  const rendered = await renderPanels(displayPanels, dateKey, outDir);
  for (const panel of rendered) {
    const labeled = await labelPanelBuffer(panel);
    const labeledPath = path.join(outDir, `panel-${panel.id}-labeled.png`);
    fs.writeFileSync(labeledPath, labeled);
    panel.labeledBuffer = labeled;
    panel.labeledPath = labeledPath;
  }

  const contactPanels = rendered.map((panel) => ({
    ...panel,
    buffer: panel.labeledBuffer,
    label: panel.label,
    subtitle: panel.subtitle
  }));
  const contactPath = path.join(outDir, 'contact-sheet.png');
  await writeContactSheet(contactPanels, contactPath, { maxCols: 3 });

  const cacheBust = Date.now();
  const summary = {
    dateKey,
    replayColorCount: replayColors.length,
    liveContributorCount: data.liveContributorCount,
    liveBlockCount: data.liveBlocks.length,
    legacyBlockCount: legacyReplay.blocks.length,
    builderBlockCount: builderReplay.blocks.length,
    liveFingerprint: computeQuiltFingerprint(data.liveBlocks),
    legacyFingerprint: computeQuiltFingerprint(legacyReplay.blocks),
    builderFingerprint: computeQuiltFingerprint(builderReplay.blocks),
    legacyEngineOptions: LEGACY_ENGINE_OPTIONS,
    builderEngineOptions: BUILDER_ENGINE_OPTIONS,
    cacheBust
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeBuilderPreviewHtml(outDir, dateKey, summary, cacheBust);

  console.log(`[builder-tuning] wrote ${contactPath}`);
  console.log(`[builder-tuning] open ${path.join(outDir, 'preview.html')}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[builder-tuning] failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
