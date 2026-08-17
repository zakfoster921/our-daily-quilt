#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert');
const {
  normalizeAuthorKey,
  authorsAreSameSpeaker,
  authorIsUsed,
  addUsedAuthor,
  usedAuthorKeysFromAssignments,
  buildLastUsedByAuthor,
  orderFillPool,
  takeNextSpacedQuote,
  authorCooldownDays
} = require('./lib/schedule-quote-pool.cjs');

function community(q) {
  return String(q.submittedVia || '').toLowerCase() === 'app';
}

assert.strictEqual(normalizeAuthorKey('  Rumi! '), 'rumi');
assert.strictEqual(authorsAreSameSpeaker('Rumi', 'Jalal ad-Din Rumi'), true);
assert.strictEqual(authorsAreSameSpeaker('William Carter', 'Jimmy Carter'), false);
assert.strictEqual(authorsAreSameSpeaker('Faith Ringgold', 'Demetri Broxton'), false);

const used = addUsedAuthor(new Set(), 'Rumi');
assert.strictEqual(authorIsUsed('Jalal ad-Din Rumi', used), true);
assert.strictEqual(authorIsUsed('Audre Lorde', used), false);

const quotes = [
  { sourceId: 'c2', author: 'Pat', submittedVia: 'app', schedulePriorityAt: '2026-08-02', submittedAt: '2026-08-02' },
  { sourceId: 'a1', author: 'Ada', submittedVia: '' },
  { sourceId: 'c1', author: 'Kim', submittedVia: 'app', schedulePriorityAt: '2026-08-01', submittedAt: '2026-08-01' },
  { sourceId: 'b1', author: 'Bayard', submittedVia: '' }
];
const ordered = orderFillPool(quotes, community);
assert.strictEqual(ordered[0].sourceId, 'c1');
assert.strictEqual(ordered[1].sourceId, 'c2');
assert.deepStrictEqual(
  new Set(ordered.slice(2).map((q) => q.sourceId)),
  new Set(['a1', 'b1'])
);

const pool = [
  { sourceId: '1', author: 'Rumi' },
  { sourceId: '2', author: 'Audre Lorde' },
  { sourceId: '3', author: 'Bayard Rustin' }
];
const picked = takeNextSpacedQuote(pool, new Set(['rumi']), new Map());
assert.strictEqual(picked.author, 'Audre Lorde');
assert.strictEqual(pool.length, 2);

const onlyRepeats = [{ sourceId: '1', author: 'Rumi' }, { sourceId: '2', author: 'Rumi' }];
const lru = takeNextSpacedQuote(
  onlyRepeats,
  new Set(['rumi']),
  new Map([
    ['rumi', '2026-08-10']
  ])
);
assert.ok(lru);
assert.strictEqual(lru.author, 'Rumi');

const lookbackPool = [
  { sourceId: '1', author: 'Rumi' },
  { sourceId: '2', author: 'Audre Lorde' }
];
const lookbackUsed = new Set(['rumi', 'audre lorde']);
const windowUsed = new Set(['rumi']);
const preferWindow = takeNextSpacedQuote(lookbackPool, lookbackUsed, new Map(), windowUsed);
assert.strictEqual(preferWindow.author, 'Audre Lorde');

const lastUsed = buildLastUsedByAuthor(
  [{ dateKey: '2026-08-01', data: { authorSnapshot: 'Rumi', sourceId: '1' } }],
  [{ author: 'Audre Lorde', lastUsedDate: '2026-07-01' }],
  new Map([['1', { author: 'Rumi' }]])
);
assert.strictEqual(lastUsed.get('rumi'), '2026-08-01');
assert.strictEqual(lastUsed.get('audre lorde'), '2026-07-01');

const fromAssign = usedAuthorKeysFromAssignments(
  [{ dateKey: '2026-08-10', data: { sourceId: '1', authorSnapshot: 'Stale' } }],
  new Map([['1', { author: 'Grace Lee Boggs' }]])
);
assert.strictEqual(authorIsUsed('Grace Lee Boggs', fromAssign), true);

assert.strictEqual(authorCooldownDays({}), 21);
assert.strictEqual(authorCooldownDays({ QUOTE_AUTHOR_COOLDOWN_DAYS: '14' }), 14);

console.log('test-schedule-quote-pool: ok');
