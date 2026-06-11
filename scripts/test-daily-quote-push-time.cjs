#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert');
const {
  normalizeDailyQuotePreferredHour,
  getLocalHour,
  isDailyQuoteDueForToken,
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
}

function main() {
  testNormalizeHour();
  testGetLocalHour();
  testIsDailyQuoteDueForToken();
  console.log('✅ daily quote push time tests passed');
}

main();
