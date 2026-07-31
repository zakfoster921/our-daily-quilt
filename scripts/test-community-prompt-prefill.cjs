#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert');
const {
  getCommunityPromptPrefillIssues,
  isCommunityPromptPrefillValid
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

console.log('test-community-prompt-prefill: ok');
