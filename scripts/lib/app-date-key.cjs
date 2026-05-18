/** Shared app-day helpers (07:00 UTC boundary). */

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function addDays(dateKey, deltaDays) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Before 07:00 UTC still belongs to the prior quote day. */
function getAppDateKey(d = new Date()) {
  const adjusted = new Date(d);
  if (d.getUTCHours() < 7) adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  return `${adjusted.getUTCFullYear()}-${String(adjusted.getUTCMonth() + 1).padStart(2, '0')}-${String(adjusted.getUTCDate()).padStart(2, '0')}`;
}

/**
 * The dateKey for the quilt day opening at the current/next 07:00 UTC reset.
 * Stable if GitHub delays the scheduled workflow past 07:00 (unlike --start=tomorrow).
 */
function getOpeningAppDateKey(d = new Date()) {
  const appToday = getAppDateKey(d);
  if (d.getUTCHours() < 7) return addDays(appToday, 1);
  return appToday;
}

function resolveStartDateKey(start, d = new Date()) {
  const raw = String(start || '').trim();
  const key = raw.toLowerCase();
  if (key === 'today') return getAppDateKey(d);
  if (key === 'tomorrow') return addDays(getAppDateKey(d), 1);
  if (key === 'opening') return getOpeningAppDateKey(d);
  if (!isDateKey(raw)) {
    throw new Error('--start must be YYYY-MM-DD, today, tomorrow, or opening');
  }
  return raw;
}

module.exports = {
  addDays,
  isDateKey,
  getAppDateKey,
  getOpeningAppDateKey,
  resolveStartDateKey
};
