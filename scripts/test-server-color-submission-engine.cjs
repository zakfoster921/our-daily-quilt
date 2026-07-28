#!/usr/bin/env node
/* eslint-disable no-console */

const {
  createServerQuiltEngine,
  serializeServerQuiltBlocks,
  computeQuiltFingerprint
} = require('./lib/server-quilt-engine.cjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function applyColor(state, color, userId) {
  const engine = createServerQuiltEngine({
    userId,
    blocks: state.blocks,
    submissionCount: state.submissionCount,
    colorReplayEvents: state.colorReplayEvents,
    macroStructureFrozen: state.macroStructureFrozen
  });
  const result = engine.addColor(color);
  assert(result, `addColor failed for ${color}`);
  const blocks = serializeServerQuiltBlocks(engine);
  const fingerprint = computeQuiltFingerprint(blocks);
  assert(blocks.length >= 1, 'serialized blocks should not be empty');
  assert(fingerprint, 'fingerprint should not be empty');
  return {
    blocks,
    submissionCount: Number(engine.submissionCount) || 0,
    colorReplayEvents: engine.getColorReplayEvents(),
    macroStructureFrozen: engine.macroStructureFrozen === true,
    fingerprint,
    result
  };
}

function main() {
  let state = {
    blocks: [],
    submissionCount: 0,
    colorReplayEvents: [],
    macroStructureFrozen: false
  };

  state = applyColor(state, '#de6c61', 'server-smoke-user-1');
  assert(state.submissionCount === 1, `expected first submission count 1, got ${state.submissionCount}`);
  assert(state.blocks.some((block) => block.color === '#de6c61'), 'first color should appear in blocks');

  const firstFingerprint = state.fingerprint;
  state = applyColor(state, '#61c9de', 'server-smoke-user-2');
  assert(state.submissionCount === 2, `expected second submission count 2, got ${state.submissionCount}`);
  assert(state.blocks.some((block) => block.color === '#61c9de'), 'second color should appear in blocks');
  assert(state.fingerprint !== firstFingerprint, 'second color should change quilt fingerprint');

  console.log('✅ server color submission engine smoke passed');

  // Regression: inset-circle similar-color fallback must not recurse splitInsetCircle ↔ performRegularSplit.
  const insetEngine = createServerQuiltEngine({ userId: 'inset-regression' });
  insetEngine.addColor('#ea9b9a');
  insetEngine.addColor('#7b9e87');
  insetEngine.addColor('#4a6fa5');
  insetEngine.addColor('#c9a227');
  let insetOk = false;
  try {
    insetOk = !!insetEngine.addColor('#c9a228');
  } catch (error) {
    throw new Error(`inset-circle similar-color fallback threw: ${error?.message || error}`);
  }
  assert(insetOk, 'inset-circle similar-color fallback should place color without stack overflow');
  console.log('✅ inset-circle similar-color fallback regression passed');
}

main();
