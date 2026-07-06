/** Resolve workflow_dispatch date inputs for GitHub Actions manual runs. */
const { getAppDateKey, addDays, isDateKey } = require('./app-date-key.cjs');

/**
 * @param {'last_completed'|'today'|'active'|'custom'} mode
 * @param {string} [dateKey] manual YYYY-MM-DD (or the word "today")
 * @param {Date} [now]
 */
function resolveWorkflowDateKey({ mode = 'last_completed', dateKey = '', now = new Date() } = {}) {
  const raw = String(dateKey || '').trim();
  const m = String(mode || '').trim().toLowerCase();

  if (m === 'today' || raw.toLowerCase() === 'today') {
    return getAppDateKey(now);
  }
  if (m === 'active') {
    return getAppDateKey(now);
  }
  if (raw && isDateKey(raw)) {
    return raw;
  }
  if (m === 'custom') {
    throw new Error(`Invalid custom date_key: ${raw || '(empty)'}`);
  }
  return addDays(getAppDateKey(now), -1);
}

if (require.main === module) {
  try {
    process.stdout.write(
      resolveWorkflowDateKey({
        mode: process.env.WORKFLOW_DATE_MODE || 'last_completed',
        dateKey: process.env.WORKFLOW_DATE_KEY || ''
      })
    );
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = { resolveWorkflowDateKey };
