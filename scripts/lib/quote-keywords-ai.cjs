'use strict';

const {
  buildKeywordEmphasisPrompt,
  buildSpeakerGuideKeywordPrompt,
  parseKeywordEmphasisResponse,
  normalizeEmphasisWords
} = require('../../lib/quote-keyword-emphasis');

async function postClaude({ apiKey, model, prompt, maxTokens = 160 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Claude ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return (json?.content || []).map((part) => (part?.type === 'text' ? part.text : '')).join('\n').trim();
}

async function postGemini({ apiKey, model, prompt, maxTokens = 160 }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: maxTokens,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return (json?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || '')
    .join('\n')
    .trim();
}

function resolveAiProvider() {
  const anthropicKey = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (anthropicKey) {
    return {
      provider: 'anthropic',
      apiKey: anthropicKey,
      model: String(process.env.ANTHROPIC_PREFILL_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6').trim()
    };
  }
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (geminiKey) {
    return {
      provider: 'gemini',
      apiKey: geminiKey,
      model: String(process.env.GEMINI_PREFILL_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim()
    };
  }
  return null;
}

async function postKeywordAiText(prompt) {
  const cfg = resolveAiProvider();
  if (!cfg) throw new Error('ANTHROPIC_API_KEY or GEMINI_API_KEY is not configured');
  if (cfg.provider === 'anthropic') {
    return postClaude({ apiKey: cfg.apiKey, model: cfg.model, prompt });
  }
  return postGemini({ apiKey: cfg.apiKey, model: cfg.model, prompt });
}

async function suggestQuoteKeywordsWithAi(quoteText) {
  const prompt = buildKeywordEmphasisPrompt(quoteText);
  const raw = await postKeywordAiText(prompt);
  const cfg = resolveAiProvider();
  const keywords = normalizeEmphasisWords(parseKeywordEmphasisResponse(raw), quoteText, 3);
  return { keywords, raw, provider: cfg.provider, model: cfg.model };
}

async function suggestSpeakerGuideKeywordsWithAi(guideText) {
  const prompt = buildSpeakerGuideKeywordPrompt(guideText);
  const raw = await postKeywordAiText(prompt);
  const cfg = resolveAiProvider();
  const keywords = normalizeEmphasisWords(parseKeywordEmphasisResponse(raw), guideText, 4);
  return { keywords, raw, provider: cfg.provider, model: cfg.model };
}

module.exports = {
  resolveAiProvider,
  postKeywordAiText,
  suggestQuoteKeywordsWithAi,
  suggestSpeakerGuideKeywordsWithAi
};
