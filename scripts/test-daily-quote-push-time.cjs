#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert');
const {
  normalizeDailyQuotePreferredHour,
  getLocalHour,
  getLocalDateKey,
  resolveDailyQuoteDateKey,
  isDailyQuoteDueForToken,
  buildDailyQuotePushBody,
  tokenHasNewSocialPostSinceLastPush,
  DAILY_QUOTE_NEW_POST_SUFFIX,
  DEFAULT_DAILY_QUOTE_PREFERRED_HOUR
} = require('../lib/daily-quote-push-time');

function getAppDateKey(d = new Date()) {
  const utcHours = d.getUTCHours();
  const adjusted = new Date(d);
  if (utcHours < 7) {
    adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  }
  const y = adjusted.getUTCFullYear();
  const m = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(adjusted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function testNormalizeHour() {
  assert.strictEqual(normalizeDailyQuotePreferredHour(undefined), 8);
  assert.strictEqual(normalizeDailyQuotePreferredHour('9'), 9);
  assert.strictEqual(normalizeDailyQuotePreferredHour(23), 23);
  assert.strictEqual(normalizeDailyQuotePreferredHour(-1), 8);
  assert.strictEqual(normalizeDailyQuotePreferredHour(99), 8);
  assert.strictEqual(DEFAULT_DAILY_QUOTE_PREFERRED_HOUR, 8);
}

function testGetLocalHour() {
  const winterNineEt = new Date('2026-01-15T14:00:00.000Z');
  assert.strictEqual(getLocalHour('America/New_York', winterNineEt), 9);

  const summerNineEt = new Date('2026-07-15T13:00:00.000Z');
  assert.strictEqual(getLocalHour('America/New_York', summerNineEt), 9);

  const invalidTz = new Date('2026-01-15T14:00:00.000Z');
  assert.strictEqual(getLocalHour('', invalidTz), 14);
}

function testResolveDailyQuoteDateKey() {
  // 12:40 AM Central on Sept 10 — app day is still Sept 9 until 07:00 UTC.
  const midnightCt = new Date('2026-09-10T05:40:00.000Z');
  assert.strictEqual(getLocalDateKey('America/Chicago', midnightCt), '2026-09-10');
  assert.strictEqual(
    resolveDailyQuoteDateKey(
      { timezone: 'America/Chicago', dailyQuotePreferredHour: 0 },
      midnightCt,
      '2026-09-09'
    ),
    '2026-09-10'
  );

  // 10:40 PM Pacific the evening before — still Sept 9 locally, keep yesterday's quote.
  const eveningPt = new Date('2026-09-10T05:40:00.000Z');
  assert.strictEqual(getLocalDateKey('America/Los_Angeles', eveningPt), '2026-09-09');
  assert.strictEqual(
    resolveDailyQuoteDateKey(
      { timezone: 'America/Los_Angeles', dailyQuotePreferredHour: 22 },
      eveningPt,
      '2026-09-09'
    ),
    '2026-09-09'
  );

  // After the 07:00 UTC roll, even Hawaii evening uses the live app day.
  const afterRoll = new Date('2026-09-10T07:30:00.000Z');
  assert.strictEqual(
    resolveDailyQuoteDateKey(
      { timezone: 'Pacific/Honolulu', dailyQuotePreferredHour: 21 },
      afterRoll,
      '2026-09-10'
    ),
    '2026-09-10'
  );
}

function testIsDailyQuoteDueForToken() {
  const now = new Date('2026-01-15T14:00:00.000Z');
  const dateKey = getAppDateKey(now);
  const token = {
    timezone: 'America/New_York',
    dailyQuotePreferredHour: 9
  };

  assert.strictEqual(isDailyQuoteDueForToken(token, now, { dateKey }), true);
  assert.strictEqual(
    isDailyQuoteDueForToken({ ...token, lastDailyQuotePushDateKey: dateKey }, now, { dateKey }),
    false
  );
  assert.strictEqual(
    isDailyQuoteDueForToken({ ...token, lastDailyQuotePushDateKey: dateKey }, now, { dateKey, force: true }),
    true
  );
  assert.strictEqual(
    isDailyQuoteDueForToken({ ...token, dailyQuotePreferredHour: 10 }, now, { dateKey }),
    false
  );
  assert.strictEqual(
    isDailyQuoteDueForToken({ ...token, dailyQuotePreferredHour: 8 }, now, { dateKey, catchUp: true }),
    true
  );
  assert.strictEqual(
    isDailyQuoteDueForToken({ ...token, dailyQuotePreferredHour: 9 }, now, { dateKey, catchUp: true }),
    true
  );
  assert.strictEqual(
    isDailyQuoteDueForToken({ ...token, dailyQuotePreferredHour: 10 }, now, { dateKey, catchUp: true }),
    false
  );
  assert.strictEqual(
    isDailyQuoteDueForToken(
      { ...token, dailyQuotePreferredHour: 8, lastDailyQuotePushDateKey: dateKey },
      now,
      { dateKey, catchUp: true }
    ),
    false
  );

  const indiaMorning = new Date('2026-01-15T03:30:00.000Z');
  const indiaDateKey = getAppDateKey(indiaMorning);
  assert.strictEqual(
    isDailyQuoteDueForToken(
      { timezone: 'Asia/Kolkata', dailyQuotePreferredHour: 9 },
      indiaMorning,
      { dateKey: indiaDateKey }
    ),
    true
  );

  const midnightCt = new Date('2026-09-10T05:40:00.000Z');
  const midnightToken = {
    timezone: 'America/Chicago',
    dailyQuotePreferredHour: 0,
    lastDailyQuotePushDateKey: '2026-09-09'
  };
  assert.strictEqual(
    isDailyQuoteDueForToken(midnightToken, midnightCt, { dateKey: '2026-09-09' }),
    true
  );
  assert.strictEqual(
    isDailyQuoteDueForToken(
      { ...midnightToken, lastDailyQuotePushDateKey: '2026-09-10' },
      midnightCt,
      { dateKey: '2026-09-09' }
    ),
    false
  );
}

function testBuildDailyQuotePushBody() {
  const longQuote = 'A'.repeat(200);
  assert.strictEqual(
    buildDailyQuotePushBody('Hello world', { hasNewPost: false }),
    'Hello world'
  );
  assert.strictEqual(
    buildDailyQuotePushBody('Hello world', { hasNewPost: true }),
    `Hello world${DAILY_QUOTE_NEW_POST_SUFFIX}`
  );
  const truncated = buildDailyQuotePushBody(longQuote, { hasNewPost: true, maxLen: 178 });
  assert.ok(truncated.endsWith(DAILY_QUOTE_NEW_POST_SUFFIX));
  assert.ok(truncated.length <= 178);
}

function testTokenHasNewSocialPostSinceLastPush() {
  const latestPostIso = '2026-06-20T12:00:00.000Z';

  assert.strictEqual(tokenHasNewSocialPostSinceLastPush({}, latestPostIso), false);
  assert.strictEqual(
    tokenHasNewSocialPostSinceLastPush(
      { lastDailyQuotePushAt: '2026-06-20T11:00:00.000Z' },
      latestPostIso
    ),
    true
  );
  assert.strictEqual(
    tokenHasNewSocialPostSinceLastPush(
      { lastDailyQuotePushAt: '2026-06-20T13:00:00.000Z' },
      latestPostIso
    ),
    false
  );
}

function main() {
  testNormalizeHour();
  testGetLocalHour();
  testResolveDailyQuoteDateKey();
  testIsDailyQuoteDueForToken();
  testBuildDailyQuotePushBody();
  testTokenHasNewSocialPostSinceLastPush();
  console.log('✅ daily quote push time tests passed');
}

main();
