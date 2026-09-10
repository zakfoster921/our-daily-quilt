/** Hourly daily-quote push scheduling helpers (server + tests). */

const DEFAULT_DAILY_QUOTE_PREFERRED_HOUR = 8;

function normalizeDailyQuotePreferredHour(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_DAILY_QUOTE_PREFERRED_HOUR;
  const hour = Math.floor(n);
  if (hour < 0 || hour > 23) return DEFAULT_DAILY_QUOTE_PREFERRED_HOUR;
  return hour;
}

function tokenTimezone(tokenData) {
  return String(tokenData?.timezone || '').trim() || 'UTC';
}

function getLocalHour(ianaTimezone, now = new Date()) {
  const tz = String(ianaTimezone || '').trim() || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false
    }).formatToParts(now);
    const hourPart = parts.find((part) => part.type === 'hour');
    let hour = hourPart ? parseInt(hourPart.value, 10) : NaN;
    if (hour === 24) hour = 0;
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) return hour;
  } catch (_) {
    /* fall through */
  }
  return now.getUTCHours();
}

function utcDateKey(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local calendar YYYY-MM-DD in the token timezone. */
function getLocalDateKey(ianaTimezone, now = new Date()) {
  const tz = String(ianaTimezone || '').trim() || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch (_) {
    /* fall through */
  }
  return utcDateKey(now);
}

/**
 * Quote day to send this token. After local midnight the calendar date can be
 * ahead of the 07:00 UTC app day — send the new local day's quote so a 12:40 AM
 * Central reminder is tomorrow's author, not last night's.
 */
function resolveDailyQuoteDateKey(tokenData, now, appDateKey) {
  const app = String(appDateKey || '').trim();
  const local = getLocalDateKey(tokenTimezone(tokenData), now);
  if (!app) return local;
  if (!local) return app;
  return local > app ? local : app;
}

function isDailyQuoteDueForToken(tokenData, now, options = {}) {
  const force = options.force === true;
  const catchUp = options.catchUp === true;
  const dateKey = String(options.dateKey || '').trim();
  if (!dateKey) return false;

  const preferredHour = normalizeDailyQuotePreferredHour(tokenData?.dailyQuotePreferredHour);
  const timezone = tokenTimezone(tokenData);
  const localHour = getLocalHour(timezone, now);
  const hourIsDue = catchUp ? localHour >= preferredHour : localHour === preferredHour;
  if (!hourIsDue) return false;

  if (force) return true;
  const quoteDateKey = resolveDailyQuoteDateKey(tokenData, now, dateKey);
  const lastSent = String(tokenData?.lastDailyQuotePushDateKey || '').trim();
  return lastSent !== quoteDateKey;
}

const DAILY_QUOTE_NEW_POST_SUFFIX = ' (+ new post)';

function buildDailyQuotePushBody(quoteText, { hasNewPost = false, maxLen = 178 } = {}) {
  const suffix = hasNewPost ? DAILY_QUOTE_NEW_POST_SUFFIX : '';
  const baseMax = Math.max(1, maxLen - suffix.length);
  const clean = String(quoteText || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= baseMax) return `${clean}${suffix}`;
  return `${clean.slice(0, baseMax - 1).trimEnd()}…${suffix}`;
}

/** True when the newest published studio post is newer than this token's last daily push. */
function tokenHasNewSocialPostSinceLastPush(tokenData, latestPublishedPostIso) {
  const latest = String(latestPublishedPostIso || '').trim();
  if (!latest) return false;
  const lastPushAt = String(tokenData?.lastDailyQuotePushAt || '').trim();
  if (!lastPushAt) return false;
  return latest > lastPushAt;
}

module.exports = {
  DEFAULT_DAILY_QUOTE_PREFERRED_HOUR,
  DAILY_QUOTE_NEW_POST_SUFFIX,
  normalizeDailyQuotePreferredHour,
  getLocalHour,
  getLocalDateKey,
  resolveDailyQuoteDateKey,
  isDailyQuoteDueForToken,
  buildDailyQuotePushBody,
  tokenHasNewSocialPostSinceLastPush
};
