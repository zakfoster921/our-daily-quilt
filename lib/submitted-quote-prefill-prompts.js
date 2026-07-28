/**
 * Prompts for schedule-time AI prefill of quotes (runs when a date is assigned).
 *
 * One Claude call produces a single JSON object with these keys:
 *   author, community_prompt, small_act, blessing, notification_text, ig_caption,
 *   what_if, watch_for, speaker_guide_line, speaker_keywords, keyword, art_recs,
 *   good_day, rough_day, prompt_theme, mood
 *
 * The fields speaker_image_url, image_attribution, and speaker_dates are
 * filled deterministically from Wikipedia/Wikimedia outside this prompt.
 *
 * prompt_theme is picked from the Notion "prompt_theme" multi_select column's
 * existing options (passed in as promptThemeOptions) rather than invented, since
 * it's a fixed tag list an editor curates in Notion. The model returns one to
 * three tags as a comma-separated string (e.g. "trust, courage").
 *
 * mood is picked from the Notion "mood" select column (passed in as moodOptions).
 * The model returns exactly one label verbatim from that list.
 */

const IG_CAPTION_CTAS = [
  'Add your color at the link in bio.',
  "Today's quilt is open. Link in bio.",
  "We're waiting for your color. Link in bio.",
  'The quilt resets at midnight. Link in bio.',
  'One color changes the whole quilt. Link in bio.',
  'Come add yours before it\u2019s gone. Link in bio.',
  "Today's quilt needs one more color. Link in bio.",
  'Your color belongs in today\u2019s quilt. Link in bio.',
  'Every color counts. Add yours at the link in bio.'
];

const PREFILL_CREATIVE_PROMPT_VERSION = '2026-07-28-community-prompt-regen-v2';

/** Default Notion `mood` select options when schema lookup is unavailable. */
const QUOTE_MOOD_OPTIONS = [
  'Quiet Wonder — stillness, noticing',
  'Fierce — sharp, unapologetic',
  'Tender — gentle permission, self-compassion',
  'Steady — quiet endurance, plainspoken. Mandela, Frankl, Maathai, van Gogh.',
  'Communal Warmth — togetherness, interdependence',
  'Playful — curiosity, wit',
  'Rallying — call to collective action'
];

const SYSTEM_PROMPT = [
  'You generate companion content for a daily-quote app called Our Daily Quilt.',
  'For a single user-submitted quote, return one JSON object that fills the fields specified below.',
  'Voice across all fields: plain language, warm but not saccharine, can carry a little edge, never preachy.',
  'Avoid these words across every field unless quoting the speaker: nurture, spark, essence, spirit, resonate, journey, transform, illuminate, empower, embrace, soul, light, divine.',
  'Avoid filler phrases like "right now", "in your life", "as a creative".',
  'Do not invent biographical facts. The speaker_dates and image fields are filled separately by a Wikipedia lookup; do not include them here.',
  'Return ONLY a valid JSON object. No markdown fences, no commentary, no leading or trailing text.',
  'Use snake_case keys exactly as in OUTPUT SCHEMA (e.g. small_act, not smallAct).',
  'Always include small_act and watch_for as non-empty strings.',
  'If the quote is abstract, translate its theme into one concrete interpersonal gesture (small_act) and one observable moment to notice (watch_for).'
].join(' ');

function buildMoodFieldInstructions(moodOptions) {
  const options = (moodOptions || []).map((o) => String(o || '').trim()).filter(Boolean);
  if (!options.length) {
    return `
FIELD: mood
- No mood tags are configured right now. Return "".
`.trim();
  }
  return `
FIELD: mood
- Pick exactly ONE mood label from this fixed Notion select list — the emotional tone that best fits the quote's core energy (not the good_day/rough_day copy):
${options.map((opt) => `  - ${opt}`).join('\n')}
- Output the chosen label verbatim (same spelling, em dashes, and punctuation as above). Do not invent a new label or add explanation.
- Prefer the best single fit; do not return multiple moods.
- If none fit well, still pick the closest option rather than returning "".
`.trim();
}

function buildFieldInstructions(promptThemeOptions, moodOptions) {
  const options = (promptThemeOptions || []).map((o) => String(o || '').trim()).filter(Boolean);
  const promptThemeField = options.length
    ? `
FIELD: prompt_theme
- This is a multi-select: pick one to three tags from this fixed list that best fit the core idea of the quote/community_prompt: ${options.join(', ')}
- Output a single comma-separated string of the tags you pick, e.g. "trust, courage" — not a JSON array.
- Output the tag(s) exactly as written above (same spelling/casing). Do not invent a new tag or explain your choice.
- Prefer the single best-fitting tag; only add a second or third when they are each clearly, independently relevant.
- If truly none of the tags fit, return "".
`
    : `
FIELD: prompt_theme
- No theme tags are configured right now. Return "".
`;
  return `${FIELD_INSTRUCTIONS_BASE}
${buildMoodFieldInstructions(moodOptions)}
${promptThemeField.trim()}
`.trim();
}

/**
 * Snap the model's mood guess to one exact Notion select option.
 * Accepts a short prefix before the em dash when the model omits the subtitle.
 */
function resolveMoodOption(moodOptions, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const options = (moodOptions || []).map((o) => String(o || '').trim()).filter(Boolean);
  if (!options.length) return text;
  const validByLower = new Map(options.map((opt) => [opt.toLowerCase(), opt]));
  const direct = validByLower.get(text.toLowerCase());
  if (direct) return direct;
  let shortKey = text.split('—')[0].split(' - ')[0].trim().toLowerCase();
  if (shortKey === 'bittersweet') shortKey = 'tender';
  if (shortKey) {
    for (const opt of options) {
      const optShort = opt.split('—')[0].split(' - ')[0].trim().toLowerCase();
      if (optShort === shortKey) return opt;
    }
  }
  const fuzzy = options.find((opt) => opt.toLowerCase().startsWith(text.toLowerCase()));
  return fuzzy || '';
}

const FIELD_INSTRUCTIONS_BASE = `
FIELD: author
- The most correct canonical form of the speaker's name.
- Expand initialisms and informal forms ("MLK" \u2192 "Martin Luther King Jr."; "bell hooks" stays "bell hooks"; "einstein" \u2192 "Albert Einstein").
- If the submitted name is already canonical, return it unchanged.
- If you cannot identify the person with confidence, return the submitted name unchanged.
- Output: plain string, no honorifics unless they are part of the canonical name.

FIELD: community_prompt
- A single question inviting users to share something from their own experience that could be genuinely useful to others exploring the same theme.
- One clause, one ask — no compound questions (avoid "and what...", "and why...", or stacking two questions in one).
- The best answers are transferable: prompt for a concrete thing that works, not just a personal story without a takeaway others can use.
- Plain language. No filler phrases.
- Does not mention the quote or the author.
- Genuine open question, not rhetorical.
- Ends with "?".
- Aim for under 20 words.

FIELD: small_act
- One sentence: a single concrete action the reader can complete before the day ends.
- By default it should involve another person (relational): something they do with or for someone else, not solo introspection.
- Specific enough that they know exactly when it is done (clear done-state).
- Enacts the spirit of the quote in the world; do not assign reflection, journaling, self-inventory, or personal-development framing.
- Must be non-empty for every usable quote.
- Plain language. Ends with a period.
- Does not mention the quote text or the author.

FIELD: blessing
- Single sentence beginning with "May we".
- First-person plural throughout (we, us, our); do not use "you" or "your".
- Gets to the deepest point of the quote \u2014 not the surface reading.
- Warm but can have a little edge.
- Ends with a period.

FIELD: notification_text
- Format exactly: "[Full Name] on [what the quote is about]"
- The "on\u2026" part should be intriguing and human.
- No period at the end. One line only.
- Use the canonical author name you returned above.

FIELD: ig_caption
- Exactly three lines separated by literal newline characters (\\n).
- Line 1: a reflection question, max 100 characters. Genuine open question. Personal and slightly uncomfortable. Does not mention the quote or the author.
- Line 2: empty.
- Line 3: a CTA wrapped in literal asterisks for italics, picked verbatim from this list:
${IG_CAPTION_CTAS.map((cta) => `    *${cta}*`).join('\n')}
- Pick the single CTA that best fits the tone of the quote. Do not modify it.

FIELD: what_if
- A single "What if\u2026?" question engaging the deeper philosophical claim of the quote, not the surface reading.
- Playful but substantive. Plain specific language.
- Opens a door, does not assign homework.

FIELD: watch_for
- A single sentence naming a specific, observable moment or behavior the user might catch in the world today.
- Enacts the quote without explaining it. No interpretation required \u2014 the noticing is the whole thing.
- Catchable: specific enough that the user knows it when they see it. A behavior, not a category. Not a feeling, not a vibe.
- Never assigns homework. Never tells the user how to feel about what they notice.
- Do NOT include the prefix "Watch for" \u2014 the app supplies that. Write only what comes after it.
- Capitalized standalone sentence fragment. No trailing period unless the copy genuinely needs one.
- Does not mention the quote text or the author.
- Examples (value only, after the app prefix): "Someone does something that could only have come from them." / "Two struggles meet each other." / "An obstacle turns out to be what's making something work." / "A question gets asked that nobody has a clean answer to." / "The room gets quieter and something true gets said." / "A small thing gets made and handed over." / "The obvious path gets skipped for a stranger one." / "Someone tries again after getting it wrong."

FIELD: speaker_guide_line
- One sentence about who this person was and why their perspective on this topic might be worth something.
- Must stand alone: the reader will not see the quote.
- Start with a verb. Omit the speaker's name at the beginning. Avoid "this idea" or "that".
- Grounded in what they actually lived or spent their life doing.
- No reverence. No preamble. No trailing period at the end.
- Example: "Spent decades writing and teaching about love, race, and community"
- If you do not know enough about the speaker to write this honestly, return an empty string.

FIELD: keyword
- 1–3 words or short phrases copied exactly from the quote (same spelling, same order, same punctuation as in the quote).
- Pick entries whose removal would most change the quote's meaning.
- Phrases may be 2–4 words when idiomatic (e.g. "invincible summer", "piece of mind").
- Exclude proper nouns, articles (a, an, the), and conjunctions (and, but, or) unless part of an idiomatic phrase.
- If the quote is six words or fewer, return exactly one entry.
- Output a comma-separated string (e.g. "through, invincible summer") — not a JSON array.

FIELD: speaker_keywords
- 2–4 words or short phrases copied exactly from speaker_guide_line — never from the quote.
- Pick the load-bearing words: what they did, cared about, or are known for (concrete nouns/verbs, not glue words).
- Same substring rules as keyword: each entry must appear verbatim in speaker_guide_line.
- Output a comma-separated string (e.g. "heritage, identity, memory") — not a JSON array.
- Return "" if speaker_guide_line is empty.

FIELD: art_recs
- Five art recommendations across different genres: music, film, painting, literature, and one wildcard.
- Each entry on its own line, numbered 1\u20135.
- Format per entry: "{work title} by {artist/director/author}: {one sentence about why it connects}"
- After the artist/director/author name, use a colon — never an em dash, en dash, or hyphen — before the why-it-connects sentence.
- One sentence only per entry. No trailing period at the end of the entry. Do not exceed five entries.
- These are candidates; a human will pick one later.

FIELD: good_day
- A short, declarative push the reader can carry into a day that already feels open.
- Quirkier than motivational: odd verbs, tiny images, and playful specificity are welcome.
- Specific enough to act on today. Prefer concrete little imperatives over abstract advice.
- Sometimes a command ("Let the weird tool do the job today").
- Occasionally two short sentences when the second opens it up ("Collide two things together today. Let's see what happens").
- "Today" appears often but not always \u2014 only when it earns its place.
- Good examples: "Put the soup spoon in charge" / "Make one useful mess before lunch" / "Give the shy idea a louder hat"
- No questions. No filler. No demands disguised as wisdom. No trailing period at the end.
- Avoid generic pep-talk words: choose, become, rise, step into, unlock, courage, purpose.
- Pull keywords from the quote only when they earn it; do not quote the line.
- Does not mention the quote or the author.

FIELD: rough_day
- Reframes the situation for a reader who is having a hard day.
- Never names emotions or assumes how someone feels; never tells the reader what they are feeling or why.
- No demands. Strip the line to its essential permission or redirect.
- Sometimes shifts to "we" when the quote is about collective experience.
- "Today" appears less than in good_day \u2014 only when it genuinely grounds the line.
- Can be as short as three words ("Love is enough today").
- No questions. No filler. No consolation prizes ("at least...", "it could be worse"). No trailing period at the end.
- Pull keywords from the quote only when they earn it; do not quote the line.
- Does not mention the quote or the author.
`.trim();

const OUTPUT_SCHEMA = `
Return JSON in exactly this shape, with every key present (use "" for any field you cannot honestly fill):

{
  "author": "string",
  "community_prompt": "single short question ending with ?, under 20 words, one ask only",
  "small_act": "one sentence ending with .",
  "blessing": "string starting with May we and ending with .",
  "notification_text": "string in the form 'Full Name on something'",
  "ig_caption": "line1\\n\\n*CTA from list*",
  "what_if": "string starting with What if and ending with ?",
  "watch_for": "capitalized sentence fragment (no Watch for prefix; no forced trailing period)",
  "speaker_guide_line": "string starting with a verb, no trailing period",
  "keyword": "comma-separated quote substrings (1–3 entries, or 1 if quote ≤6 words)",
  "speaker_keywords": "comma-separated substrings of speaker_guide_line (2–4 entries), or \\"\\" if no guide line",
  "art_recs": "1. Title by Artist: one sentence why\\n2. ...\\n3. ...\\n4. ...\\n5. ...",
  "good_day": "short declarative push, one or two sentences, no question marks, no trailing period",
  "rough_day": "short reframe, no emotion-naming, no demands, no question marks, no trailing period",
  "prompt_theme": "comma-separated tag(s) verbatim from the provided list (e.g. \\"trust, courage\\"), or \\"\\" if none fit",
  "mood": "exactly one mood label verbatim from the provided mood list"
}
`.trim();

/** Normalize companion-piece lines to "Title by Artist: blurb" (colon after artist, not dash). */
function normalizeArtRecsPrefillValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(\d+\.\s*)?(.+?\sby\s.+?)\s*[—–-]\s*(.+)$/i);
      if (!m) return line;
      return `${m[1] || ''}${m[2]}: ${m[3]}`;
    })
    .join('\n');
}

const SEAMSIDE_SEARCH_NOTE = [
  'This quote is from a guest on SEAMSIDE, a podcast about textile and fiber artists.',
  'Most guests are working artists without a Wikipedia page, so do not assume you already know them.',
  'You have a web_search tool: use it to look up the artist by name (their own website, portfolio, artist statement, or an interview) before deciding you don’t know enough.',
  'Ground speaker_guide_line in what you actually find about their practice — only fall back to an empty string if search truly turns up nothing usable.',
  'Do not invent facts search doesn’t support, and do not include speaker_dates — that is filled separately.'
].join(' ');

/**
 * Build the user message for the prefill call.
 * @param {{ quoteText: string, authorName: string, promptThemeOptions?: string[], moodOptions?: string[], isSeamside?: boolean }} params
 */
function buildSubmittedQuotePrefillPrompt({
  quoteText,
  authorName,
  promptThemeOptions,
  moodOptions,
  isSeamside = false
}) {
  const safeQuote = String(quoteText || '').trim();
  const safeAuthor = String(authorName || '').trim();
  return [
    SYSTEM_PROMPT,
    '',
    'INPUT:',
    `quote: "${safeQuote}"`,
    `author (as submitted): "${safeAuthor}"`,
    '',
    ...(isSeamside ? ['SEAMSIDE NOTE:', SEAMSIDE_SEARCH_NOTE, ''] : []),
    'FIELD SPECS:',
    buildFieldInstructions(promptThemeOptions, moodOptions),
    '',
    'OUTPUT SCHEMA:',
    OUTPUT_SCHEMA
  ].join('\n');
}

/** Lightweight prompt when backfilling only the Notion `mood` select. */
function buildMoodOnlyPrefillPrompt({ quoteText, authorName, moodOptions }) {
  const safeQuote = String(quoteText || '').replace(/"/g, '\\"').trim();
  const safeAuthor = String(authorName || '').replace(/"/g, '\\"').trim();
  return [
    'You assign one mood label to a daily quote for Our Daily Quilt.',
    'Return ONLY valid JSON with key "mood" — no markdown fences.',
    '',
    `quote: "${safeQuote}"`,
    `author: "${safeAuthor}"`,
    '',
    buildMoodFieldInstructions(moodOptions),
    '',
    'OUTPUT SCHEMA:',
    '{ "mood": "exactly one mood label verbatim from the list above" }'
  ].join('\n');
}

module.exports = {
  buildSubmittedQuotePrefillPrompt,
  buildMoodOnlyPrefillPrompt,
  normalizeArtRecsPrefillValue,
  resolveMoodOption,
  QUOTE_MOOD_OPTIONS,
  IG_CAPTION_CTAS,
  PREFILL_CREATIVE_PROMPT_VERSION
};
