#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert');
const {
  isNotionPageMissingError,
  isNotionPageRemoved,
  clearWindowAssignmentsMissingFromCatalog,
  clearStaleScheduleForRemovedCatalogRows
} = require('./lib/clear-orphan-assignments.cjs');

assert.strictEqual(isNotionPageMissingError({ notionStatus: 404 }), true);
assert.strictEqual(
  isNotionPageMissingError({ message: 'object_not_found: page gone' }),
  true
);
assert.strictEqual(isNotionPageMissingError({ notionStatus: 500 }), false);

assert.strictEqual(isNotionPageRemoved({ archived: true, id: 'abc' }), true);
assert.strictEqual(isNotionPageRemoved({ in_trash: true, id: 'abc' }), true);
assert.strictEqual(isNotionPageRemoved({ archived: false, id: 'abc' }), false);
assert.strictEqual(isNotionPageRemoved(null), false);

assert.strictEqual(typeof clearWindowAssignmentsMissingFromCatalog, 'function');
assert.strictEqual(typeof clearStaleScheduleForRemovedCatalogRows, 'function');

console.log('smoke-clear-orphan-assignments: ok');
