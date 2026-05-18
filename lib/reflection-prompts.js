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
    'Reject if it is offensive, hateful, sexually explicit, personally attacking, off-topic, absurdist, or meta (e.g. claiming to be an AI).',
    `If it passes, return the reflection text trimmed to ${max} characters or fewer. End on a complete word. Do not add a name or attribution.`,
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
    'Choose which published reflections stay visible on the community wall.',
    '',
    'Rules:',
    '- Use the exact response text shown; do not rewrite or merge wording.',
    '- When two or more responses mean the same thing, keep only the single best id.',
    '- Keep every genuinely distinct response.',
    '',
    'Return ONLY valid JSON, no markdown:',
    '{"visibleIds":["<id>","<id>"]}',
    'Every id must come from the input. Include at least one id when any responses were provided.'
  ].join('\n');
  return preamble ? `${preamble}\n\n${instructions}` : instructions;
}

module.exports = {
  REFLECTION_MODERATION_BODY_MAX,
  buildReflectionModerationPrompt,
  buildReflectionCurationPrompt
};
