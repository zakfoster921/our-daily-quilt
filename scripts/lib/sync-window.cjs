/** Shared date window for Notion ↔ Firestore sync (rolling N app-days). */

const { addDays, isDateKey, resolveStartDateKey } = require('./app-date-key.cjs');

const DEFAULT_SYNC_WINDOW_DAYS = 7;

function normPropKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

function findSchemaPropName(properties, base) {
  const target = normPropKey(base);
  for (const key of Object.keys(properties || {})) {
    if (normPropKey(key) === target) return key;
  }
  return '';
}

/**
 * @param {string[]} argv process.argv
 * @returns {{
 *   dryRun: boolean,
 *   fullCatalog: boolean,
 *   noDeleteOrphans: boolean,
 *   window: null | { startKey: string, endKey: string, windowDays: number }
 * }}
 */
function parseSyncWindowCli(argv) {
  const args = {
    dryRun: argv.includes('--dry-run'),
    fullCatalog: argv.includes('--full-catalog'),
    noDeleteOrphans: argv.includes('--no-delete-orphans'),
    start: '',
    windowDays: DEFAULT_SYNC_WINDOW_DAYS
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') continue;
    if (a === '--full-catalog') continue;
    if (a === '--no-delete-orphans') continue;
    if (a.startsWith('--start=')) args.start = a.slice('--start='.length);
    else if (a === '--start' && argv[i + 1]) {
      args.start = argv[++i];
    } else if (a.startsWith('--window=')) {
      args.windowDays = Math.max(1, Number.parseInt(a.slice('--window='.length), 10) || DEFAULT_SYNC_WINDOW_DAYS);
    } else if (a === '--window' && argv[i + 1]) {
      args.windowDays = Math.max(1, Number.parseInt(argv[++i], 10) || DEFAULT_SYNC_WINDOW_DAYS);
    }
  }

  if (args.fullCatalog) {
    return {
      dryRun: args.dryRun,
      fullCatalog: true,
      noDeleteOrphans: args.noDeleteOrphans,
      window: null
    };
  }

  const startKey = resolveStartDateKey(args.start || 'today');
  const windowDays = args.windowDays;
  const endKey = addDays(startKey, windowDays - 1);

  return {
    dryRun: args.dryRun,
    fullCatalog: false,
    noDeleteOrphans: true,
    window: { startKey, endKey, windowDays }
  };
}

function isDateInSyncWindow(dateKey, window) {
  if (!window) return true;
  const d = String(dateKey || '').trim();
  if (!isDateKey(d)) return false;
  return d >= window.startKey && d <= window.endKey;
}

/**
 * Source ids on `dailyQuoteAssignments/{date}` for dates in the sync window.
 */
async function assignmentSourceIdsInWindow(db, window, assignmentsCollection) {
  const ids = new Set();
  if (!window) return ids;
  const snap = await db.collection(assignmentsCollection).get();
  snap.forEach((docSnap) => {
    if (!isDateInSyncWindow(docSnap.id, window)) return;
    const sid = String(docSnap.data()?.sourceId || '').trim();
    if (sid) ids.add(sid);
  });
  return ids;
}

function buildNotionDateScheduledFilter(propName, window) {
  if (!propName || !window) return null;
  return {
    and: [
      { property: propName, date: { on_or_after: window.startKey } },
      { property: propName, date: { on_or_before: window.endKey } }
    ]
  };
}

/**
 * Approved quotes with no date yet — the pool the nightly append scheduler fills.
 */
function buildNotionSchedulingPoolFilter(dateScheduledProp, approvedProp, approvedSchema) {
  if (!dateScheduledProp || !approvedProp) return null;
  const dateEmpty = { property: dateScheduledProp, date: { is_empty: true } };
  const type = approvedSchema && approvedSchema.type;
  if (type === 'checkbox') {
    return {
      and: [{ property: approvedProp, checkbox: { equals: true } }, dateEmpty]
    };
  }
  if (type === 'select' && approvedSchema.select?.options?.length) {
    const yesName =
      approvedSchema.select.options.find((o) => {
        const n = String(o?.name || '').trim().toLowerCase();
        return n === 'yes' || n === 'true' || n === 'approved';
      })?.name || 'Yes';
    return {
      and: [{ property: approvedProp, select: { equals: yesName } }, dateEmpty]
    };
  }
  if (type === 'status' && approvedSchema.status?.options?.length) {
    const approvedName =
      approvedSchema.status.options.find((o) => {
        const n = String(o?.name || '').trim().toLowerCase();
        return n.includes('approv') || n === 'done' || n === 'yes';
      })?.name || null;
    if (approvedName) {
      return {
        and: [{ property: approvedProp, status: { equals: approvedName } }, dateEmpty]
      };
    }
  }
  return null;
}

module.exports = {
  DEFAULT_SYNC_WINDOW_DAYS,
  normPropKey,
  findSchemaPropName,
  parseSyncWindowCli,
  isDateInSyncWindow,
  assignmentSourceIdsInWindow,
  buildNotionDateScheduledFilter,
  buildNotionSchedulingPoolFilter,
  isDateKey,
  addDays,
  resolveStartDateKey
};
