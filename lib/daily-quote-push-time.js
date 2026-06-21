/** Hourly daily-quote push scheduling helpers (server + tests). */

const DEFAULT_DAILY_QUOTE_PREFERRED_HOUR = 8;

function normalizeDailyQuotePreferredHour(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_DAILY_QUOTE_PREFERRED_HOUR;
  const hour = Math.floor(n);
  if (hour < 0 || hour > 23) return DEFAULT_DAILY_QUOTE_PREFERRED_HOUR;
  return hour;
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

function isDailyQuoteDueForToken(tokenData, now, options = {}) {
  const force = options.force === true;
  const dateKey = String(options.dateKey || '').trim();
  if (!dateKey) return false;

  const preferredHour = normalizeDailyQuotePreferredHour(tokenData?.dailyQuotePreferredHour);
  const timezone = String(tokenData?.timezone || '').trim() || 'UTC';
  const localHour = getLocalHour(timezone, now);
  if (localHour !== preferredHour) return false;

  if (force) return true;
  const lastSent = String(tokenData?.lastDailyQuotePushDateKey || '').trim();
  return lastSent !== dateKey;
}

const DAILY_QUOTE_NEW_POST_SUFFIX = ' (+ studio update)';

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
  isDailyQuoteDueForToken,
  buildDailyQuotePushBody,
  tokenHasNewSocialPostSinceLastPush
};
