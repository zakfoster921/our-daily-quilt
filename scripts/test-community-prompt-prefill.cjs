#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert');
const {
  getCommunityPromptPrefillIssues,
  isCommunityPromptPrefillValid,
  normalizeMoodDayPrefillValue,
  getMoodDayPrefillIssues,
  isMoodDayPrefillValid,
  MOOD_DAY_MAX_CHARS
} = require('../lib/submitted-quote-prefill-prompts');

const bad =
  'When you gave someone more patience than they probably deserved, what made you do it — and did it change anything?';
assert(!isCommunityPromptPrefillValid(bad));
assert(getCommunityPromptPrefillIssues(bad).includes('compound_question'));
assert(getCommunityPromptPrefillIssues(bad).includes('over_20_words'));

const good = 'What helped you stay patient with someone who did not deserve it?';
assert(isCommunityPromptPrefillValid(good));

const compoundShort = 'What made you do it and did it change anything?';
assert(!isCommunityPromptPrefillValid(compoundShort));
assert(getCommunityPromptPrefillIssues(compoundShort).includes('compound_question'));

const longMood = 'Collide two things together today and let us see what strange new pattern emerges from the mess';
assert(!isMoodDayPrefillValid(longMood));
assert(getMoodDayPrefillIssues(longMood).includes('over_50_chars'));
const trimmed = normalizeMoodDayPrefillValue(longMood);
assert(trimmed.length <= MOOD_DAY_MAX_CHARS);
assert(isMoodDayPrefillValid(trimmed));
assert(isMoodDayPrefillValid('Put the soup spoon in charge'));

console.log('test-community-prompt-prefill: ok');
