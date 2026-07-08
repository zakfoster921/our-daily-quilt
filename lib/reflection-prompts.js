/** Reflection AI prompts (moderation + curation only; no synthesis). */

const REFLECTION_MODERATION_BODY_MAX = 200;

function buildReflectionModerationPrompt({ reflectionPrompt, responseText }) {
  const rp = String(reflectionPrompt || '').replace(/\s+/g, ' ').trim();
  const rt = String(responseText || '').replace(/\s+/g, ' ').trim();
  const preamble = [rp, rt].filter(Boolean).join('\n\n');
  const max = REFLECTION_MODERATION_BODY_MAX;
  const instructions = [
    'Review ONE user reflection.',
    '',
    'Reject only if it is offensive, hateful, sexually explicit, personally attacking, clearly off-topic spam, absurdist nonsense, or meta (e.g. claiming to be an AI).',
    'Brief but genuine reflections are fine — do not reject solely for brevity.',
    `If it passes, return the reflection text trimmed to ${max} characters or fewer. End on a complete word. Do not add a name or attribution. Keep the submitter's wording; trim only for length.`,
    '',
    'Return ONLY valid JSON, no markdown:',
    '{"action":"publish"|"reject","text":"..."}',
    '- reject: {"action":"reject","text":""}',
    '- publish: {"action":"publish","text":"<body only>"}'
  ].join('\n');
  return preamble ? `${preamble}\n\n${instructions}` : instructions;
}

function buildReflectionCurationPrompt({ reflectionPrompt, items }) {
  const rp = String(reflectionPrompt || '').replace(/\s+/g, ' ').trim();
  const lines = (Array.isArray(items) ? items : [])
    .map((item) => {
      const id = String(item?.id || '').trim();
      const text = String(item?.text || '').replace(/\s+/g, ' ').trim();
      if (!id || !text) return '';
      return `RESPONSE ${id}: ${text}`;
    })
    .filter(Boolean);
  const preamble = [rp, ...lines].filter(Boolean).join('\n\n');
  const instructions = [
    'Group published reflections for the community wall. Every response stays visible.',
    '',
    'Rules:',
    '- Use the exact response text shown; do not rewrite or merge wording.',
    '- When two responses mean the same thing, pair them in one group of exactly two ids (top strip + bottom strip on one card).',
    '- When three or more mean the same thing, make multiple pairs (groups of two). Any leftover goes in its own single-id group.',
    '- Genuinely distinct responses each get their own single-id group.',
    '- Every input id must appear exactly once across all groups.',
    '',
    'Return ONLY valid JSON, no markdown:',
    '{"groups":[["<id>"],["<id>","<id>"],["<id>"]]}',
    'Each group has one or two ids from the input. Include every id when responses were provided.'
  ].join('\n');
  return preamble ? `${preamble}\n\n${instructions}` : instructions;
}

module.exports = {
  REFLECTION_MODERATION_BODY_MAX,
  buildReflectionModerationPrompt,
  buildReflectionCurationPrompt
};
