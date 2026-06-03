#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert');
const { isNotionPageMissingError } = require('./lib/clear-orphan-assignments.cjs');

assert.strictEqual(isNotionPageMissingError({ notionStatus: 404 }), true);
assert.strictEqual(
  isNotionPageMissingError({ message: 'object_not_found: page gone' }),
  true
);
assert.strictEqual(isNotionPageMissingError({ notionStatus: 500 }), false);

console.log('smoke-clear-orphan-assignments: ok');
