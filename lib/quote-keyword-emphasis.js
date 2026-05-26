/**
 * Quote keyword identification and tokenization for collage canvas + lab API.
 * Emphasis targets may be single words or short phrases (exact quote substring).
 */
'use strict';

const KEYWORD_EMPHASIS_PROMPT = [
  'Pick 1–3 key words or short phrases from the quote below.',
  'A key word or phrase is one whose removal would most change the quote\'s meaning.',
  'Each entry must be an exact substring of the quote (same words, same order, same spelling).',
  'Phrases may be 2–4 words when idiomatic (e.g. "piece of mind", "invincible summer").',
  'Exclude proper nouns, articles (a, an, the), and conjunctions (and, but, or) unless part of an idiomatic phrase.',
  'Aim for 1–3 entries — only add a second or third if they carry equal weight to the first.',
  'If the quote is very short (six words or fewer), return exactly one entry.',
  'Do not change any wording. Return only JSON: {"keywords":["through"]} or {"keywords":["invincible summer"]}.'
].join('\n');

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'yet', 'so', 'in', 'on', 'at', 'to', 'of', 'for',
  'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'can', 'need', 'dare', 'ought', 'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i',
  'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our',
  'their', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'not', 'no',
  'yes', 'if', 'then', 'than', 'too', 'very', 'just', 'only', 'also', 'still', 'even'
]);

function buildKeywordEmphasisPrompt(quoteText) {
  const q = String(quoteText || '').replace(/\s+/g, ' ').trim();
  return `${KEYWORD_EMPHASIS_PROMPT}\n\nQuote:\n"${q}"`;
}

function normalizeQuoteForKeywordMatch(text) {
  return String(text || '')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u00A0/g, ' ');
}

function phraseMatchKey(phrase) {
  return String(phrase || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\w']+|[^\w']+$/g, '');
}

/** @deprecated alias */
function wordMatchKey(token) {
  return phraseMatchKey(token);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseRegexFromText(phrase) {
  const parts = String(phrase || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.replace(/^[^\w']+|[^\w']+$/g, ''))
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return `\\b${escapeRegex(parts[0])}\\b`;
  return `\\b${parts.map(escapeRegex).join('\\s+')}\\b`;
}

function makeSeededRng(seedStr) {
  let seed = 2166136261;
  const s = String(seedStr || 'day');
  for (let i = 0; i < s.length; i++) {
    seed = Math.imul(seed ^ s.charCodeAt(i), 16777619);
  }
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseKeywordEmphasisResponse(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  let parsed = null;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : s;
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (_) {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const list = parsed.keywords || parsed.keyword || parsed.words || parsed.phrases;
  if (!Array.isArray(list)) return [];
  return list.map((w) => String(w).trim()).filter(Boolean).slice(0, 3);
}

function findPhraseInQuote(quoteText, phrase) {
  const original = String(quoteText || '');
  const quote = normalizeQuoteForKeywordMatch(original);
  const pat = phraseRegexFromText(normalizeQuoteForKeywordMatch(phrase));
  if (!pat || !quote) return null;
  const re = new RegExp(pat, 'i');
  const m = quote.match(re);
  if (!m || m.index == null) return null;
  if (quote.length === original.length) {
    return original.slice(m.index, m.index + m[0].length);
  }
  return m[0];
}

function parseEmphasisInputList(input) {
  if (Array.isArray(input)) {
    return input.map((p) => String(p).trim()).filter(Boolean);
  }
  const raw = String(input || '').trim();
  if (!raw) return [];
  return raw.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
}

function normalizeEmphasisWords(words, quoteText) {
  const quote = String(quoteText || '');
  if (!quote.trim()) return [];
  const used = new Set();
  const out = [];
  const items = parseEmphasisInputList(words).sort((a, b) => b.length - a.length);
  for (const item of items) {
    const key = phraseMatchKey(item);
    if (!key || used.has(key)) continue;
    const exact = findPhraseInQuote(quote, item);
    if (!exact) continue;
    used.add(phraseMatchKey(exact));
    out.push(exact);
    if (out.length >= 3) break;
  }
  return out;
}

function parseEmphasisWordsInput(input, quoteText) {
  return normalizeEmphasisWords(input, quoteText);
}

function isLikelyProperNoun(word, index, fullText) {
  if (!/^[A-Z]/.test(word)) return false;
  if (index === 0) return false;
  const before = fullText.slice(0, fullText.indexOf(word));
  return /[.!?]\s*$/.test(before.trim()) || /\n\s*$/.test(before);
}

function phraseScore(phrase, rnd) {
  const keys = phrase.split(/\s+/).map((w) => wordMatchKey(w));
  if (!keys.length || keys.some((k) => k.length < 2 || STOPWORDS.has(k))) return -1;
  let score = phrase.length;
  if (keys.length >= 2) score += 4;
  if (keys.length >= 3) score += 2;
  score += rnd() * 4;
  return score;
}

function suggestKeywordsHeuristic(quoteText, dateKey) {
  const text = String(quoteText || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const tokens = [];
  const re = /[\w']+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ word: m[0], index: m.index, key: wordMatchKey(m[0]) });
  }
  const rnd = makeSeededRng(`${dateKey || 'day'}#kw`);
  const short = tokens.length <= 6;
  const cap = short ? 1 : 3;
  const candidates = [];

  for (let i = 0; i < tokens.length; i++) {
    const { word, key } = tokens[i];
    if (key.length < 3 || STOPWORDS.has(key)) continue;
    if (isLikelyProperNoun(word, i, text)) continue;
    let score = key.length;
    if (key.length >= 7) score += 3;
    if (key.length >= 10) score += 2;
    score += rnd() * 4;
    candidates.push({ phrase: word, score });
  }

  for (let len = 2; len <= 3; len++) {
    for (let i = 0; i <= tokens.length - len; i++) {
      const slice = tokens.slice(i, i + len);
      const phrase = slice.map((t) => t.word).join(' ');
      const score = phraseScore(phrase, rnd);
      if (score < 0) continue;
      if (slice.some((t, j) => isLikelyProperNoun(t.word, i + j, text))) continue;
      candidates.push({ phrase, score: score + len * 2 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const key = phraseMatchKey(c.phrase);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c.phrase);
    if (out.length >= cap) break;
  }
  return normalizeEmphasisWords(out, text);
}

function collectPhraseMatchesInLine(line, emphasisTargets) {
  const ln = String(line || '');
  const targets = (emphasisTargets || [])
    .map((text, rank) => ({ text: String(text).trim(), rank }))
    .filter((t) => t.text)
    .sort((a, b) => b.text.length - a.text.length);

  const raw = [];
  for (const t of targets) {
    const pat = phraseRegexFromText(t.text);
    if (!pat) continue;
    const re = new RegExp(pat, 'gi');
    let match;
    while ((match = re.exec(ln)) !== null) {
      raw.push({
        start: match.index,
        end: match.index + match[0].length,
        rank: t.rank,
        text: match[0],
        len: match[0].length
      });
    }
  }

  raw.sort((a, b) => b.len - a.len || a.start - b.start || a.rank - b.rank);
  const picked = [];
  for (const hit of raw) {
    if (picked.some((p) => hit.start < p.end && hit.end > p.start)) continue;
    picked.push(hit);
  }
  picked.sort((a, b) => a.start - b.start);
  return picked;
}

function buildLineSegments(line, emphasisWords) {
  const ln = String(line || '');
  if (!ln) return [{ text: '', emphasis: false, rank: -1 }];

  const matchLine = normalizeQuoteForKeywordMatch(ln);
  const matches = collectPhraseMatchesInLine(matchLine, emphasisWords);
  if (!matches.length) {
    return [{ text: ln, emphasis: false, rank: -1 }];
  }

  const segments = [];
  let pos = 0;
  const indexSafe = matchLine.length === ln.length;
  for (const hit of matches) {
    const start = hit.start;
    const end = hit.end;
    if (start > pos) {
      segments.push({
        text: indexSafe ? ln.slice(pos, start) : matchLine.slice(pos, start),
        emphasis: false,
        rank: -1
      });
    }
    segments.push({
      text: indexSafe ? ln.slice(start, end) : hit.text,
      emphasis: true,
      rank: hit.rank
    });
    pos = end;
  }
  if (pos < (indexSafe ? ln.length : matchLine.length)) {
    segments.push({
      text: indexSafe ? ln.slice(pos) : matchLine.slice(pos),
      emphasis: false,
      rank: -1
    });
  }
  return segments.length ? segments : [{ text: ln, emphasis: false, rank: -1 }];
}

function keywordsNotInQuote(keywords, quoteText) {
  const normalized = normalizeEmphasisWords(keywords, quoteText);
  const normKeys = new Set(normalized.map((n) => phraseMatchKey(n)));
  return parseEmphasisInputList(keywords).filter((p) => !normKeys.has(phraseMatchKey(p)));
}

const api = {
  KEYWORD_EMPHASIS_PROMPT,
  buildKeywordEmphasisPrompt,
  parseKeywordEmphasisResponse,
  normalizeQuoteForKeywordMatch,
  normalizeEmphasisWords,
  parseEmphasisWordsInput,
  suggestKeywordsHeuristic,
  buildLineSegments,
  wordMatchKey,
  phraseMatchKey,
  keywordsNotInQuote
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.QuoteKeywordEmphasis = api;
}
