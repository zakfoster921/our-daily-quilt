/**
 * Prompts for AI prefill of user-submitted quotes.
 *
 * One Claude call produces a single JSON object with these keys:
 *   author, community_prompt, small_act, blessing, notification_text, ig_caption,
 *   what_if, watch_for, speaker_guide_line, art_recs, good_day, rough_day
 *
 * The fields speaker_image_url, image_attribution, and speaker_dates are
 * filled deterministically from Wikipedia/Wikimedia outside this prompt.
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

const FIELD_INSTRUCTIONS = `
FIELD: author
- The most correct canonical form of the speaker's name.
- Expand initialisms and informal forms ("MLK" \u2192 "Martin Luther King Jr."; "bell hooks" stays "bell hooks"; "einstein" \u2192 "Albert Einstein").
- If the submitted name is already canonical, return it unchanged.
- If you cannot identify the person with confidence, return the submitted name unchanged.
- Output: plain string, no honorifics unless they are part of the canonical name.

FIELD: community_prompt
- A single question inviting users to share something from their own experience that could be genuinely useful to others exploring the same theme.
- The best answers are transferable: prompt for a concrete thing that works, not just a personal story without a takeaway others can use.
- Plain language. No filler phrases.
- Does not mention the quote or the author.
- Genuine open question, not rhetorical.
- Ends with "?".

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
- Do NOT include the prefix "Watch for the moment today when" \u2014 the app supplies that. Write only what comes after it.
- Capitalized standalone sentence fragment. Ends with a period.
- Does not mention the quote text or the author.
- Examples (value only, after the app prefix): "Someone does something that could only have come from them." / "Two struggles meet each other." / "An obstacle turns out to be what's making something work." / "A question gets asked that nobody has a clean answer to." / "The room gets quieter and something true gets said." / "A small thing gets made and handed over." / "The obvious path gets skipped for a stranger one." / "Someone tries again after getting it wrong."

FIELD: speaker_guide_line
- One sentence about who this person was and why their perspective on this topic might be worth something.
- Must stand alone: the reader will not see the quote.
- Start with a verb. Omit the speaker's name at the beginning. Avoid "this idea" or "that".
- Grounded in what they actually lived or spent their life doing.
- No reverence. No preamble.
- Example: "Spent decades writing and teaching about love, race, and community."
- If you do not know enough about the speaker to write this honestly, return an empty string.

FIELD: art_recs
- Five art recommendations across different genres: music, film, painting, literature, and one wildcard.
- Each entry on its own line, numbered 1\u20135.
- Format per entry: "{work title} \u2014 {artist/director/author} \u2014 {one sentence about why it connects}."
- One sentence only per entry. Do not exceed five entries.
- These are candidates; a human will pick one later.

FIELD: good_day
- A short, declarative push the reader can carry into a day that already feels open.
- Has edge. Specific enough to act on today.
- Sometimes a command ("Hard mute the inner critic.").
- Occasionally two short sentences when the second opens it up ("Collide two things together today. Let's see what happens.").
- "Today" appears often but not always \u2014 only when it earns its place.
- No questions. No filler. No demands disguised as wisdom.
- Pull keywords from the quote only when they earn it; do not quote the line.
- Does not mention the quote or the author.

FIELD: rough_day
- Reframes the situation for a reader who is having a hard day.
- Never names emotions or assumes how someone feels; never tells the reader what they are feeling or why.
- No demands. Strip the line to its essential permission or redirect.
- Sometimes shifts to "we" when the quote is about collective experience.
- "Today" appears less than in good_day \u2014 only when it genuinely grounds the line.
- Can be as short as three words ("Love is enough today.").
- No questions. No filler. No consolation prizes ("at least...", "it could be worse").
- Pull keywords from the quote only when they earn it; do not quote the line.
- Does not mention the quote or the author.
`.trim();

const OUTPUT_SCHEMA = `
Return JSON in exactly this shape, with every key present (use "" for any field you cannot honestly fill):

{
  "author": "string",
  "community_prompt": "string ending with ?",
  "small_act": "one sentence ending with .",
  "blessing": "string starting with May we and ending with .",
  "notification_text": "string in the form 'Full Name on something'",
  "ig_caption": "line1\\n\\n*CTA from list*",
  "what_if": "string starting with What if and ending with ?",
  "watch_for": "capitalized sentence fragment ending with . (no Watch for the moment today when prefix)",
  "speaker_guide_line": "string starting with a verb",
  "art_recs": "1. ...\\n2. ...\\n3. ...\\n4. ...\\n5. ...",
  "good_day": "short declarative push, one or two sentences, no question marks",
  "rough_day": "short reframe, no emotion-naming, no demands, no question marks"
}
`.trim();

/**
 * Build the user message for the prefill call.
 * @param {{ quoteText: string, authorName: string }} params
 */
function buildSubmittedQuotePrefillPrompt({ quoteText, authorName }) {
  const safeQuote = String(quoteText || '').trim();
  const safeAuthor = String(authorName || '').trim();
  return [
    SYSTEM_PROMPT,
    '',
    'INPUT:',
    `quote: "${safeQuote}"`,
    `author (as submitted): "${safeAuthor}"`,
    '',
    'FIELD SPECS:',
    FIELD_INSTRUCTIONS,
    '',
    'OUTPUT SCHEMA:',
    OUTPUT_SCHEMA
  ].join('\n');
}

module.exports = {
  buildSubmittedQuotePrefillPrompt,
  IG_CAPTION_CTAS
};
