/**
 * Drop `dailyQuoteAssignments/{date}` (and legacy `quotes/{date}`) when the Notion
 * catalog row is gone — so deleting in Notion removes the quote from scheduled days too.
 */

const { isDateInSyncWindow } = require('./sync-window.cjs');

function isNotionPageMissingError(err) {
  const status = err && typeof err.notionStatus === 'number' ? err.notionStatus : 0;
  if (status === 404) return true;
  const combined = `${err?.message || ''} ${err?.notionBody || ''}`.toLowerCase();
  return (
    combined.includes('object_not_found') ||
    combined.includes('could not be found') ||
    (combined.includes('archived') && combined.includes('not found'))
  );
}

function normalizeRemovedSourceIds(removedSourceIds) {
  const removed = new Set();
  if (!removedSourceIds) return removed;
  for (const id of removedSourceIds) {
    const sid = String(id || '').trim();
    if (sid) removed.add(sid);
  }
  return removed;
}

/**
 * @param {import('firebase-admin').firestore.Firestore} db
 * @param {{
 *   assignmentsCollection?: string,
 *   quotesCollection?: string,
 *   removedSourceIds: Iterable<string>,
 *   dryRun?: boolean
 * }} options
 */
async function clearDailyAssignmentsForRemovedSourceIds(db, options) {
  const assignmentsCollection =
    options.assignmentsCollection || process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';
  const quotesCollection = options.quotesCollection || process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const dryRun = options.dryRun === true;
  const removed = normalizeRemovedSourceIds(options.removedSourceIds);
  if (!removed.size) return { clearedSlots: 0, dateKeys: [] };

  const snap = await db.collection(assignmentsCollection).get();
  const dateKeys = [];
  snap.forEach((docSnap) => {
    const sid = String(docSnap.data()?.sourceId || '').trim();
    if (sid && removed.has(sid)) dateKeys.push(docSnap.id);
  });
  dateKeys.sort();

  if (!dateKeys.length) {
    return { clearedSlots: 0, dateKeys: [] };
  }

  if (dryRun) {
    console.log(
      `[sync] dry-run: would clear ${dateKeys.length} assignment slot(s) for removed Notion quote(s): ${dateKeys.join(', ')}`
    );
    return { clearedSlots: dateKeys.length, dateKeys };
  }

  const chunkSize = 200;
  for (let i = 0; i < dateKeys.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = dateKeys.slice(i, i + chunkSize);
    for (const dateKey of chunk) {
      batch.delete(db.collection(assignmentsCollection).doc(dateKey));
      batch.delete(db.collection(quotesCollection).doc(dateKey));
    }
    await batch.commit();
  }

  console.log(
    `[sync] cleared ${dateKeys.length} assignment slot(s) for removed Notion quote(s): ${dateKeys.join(', ')}`
  );
  return { clearedSlots: dateKeys.length, dateKeys };
}

/**
 * Assignments in the sync window whose sourceId no longer exists in `quotes/`.
 */
async function clearWindowAssignmentsMissingFromCatalog(db, options) {
  const {
    window,
    assignmentsCollection = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments',
    quotesCollection = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes',
    dryRun = false
  } = options;
  if (!window) return { clearedSlots: 0, dateKeys: [] };

  const quotesSnap = await db.collection(quotesCollection).where('source', '==', 'notion').get();
  const validIds = new Set();
  quotesSnap.forEach((docSnap) => validIds.add(docSnap.id));

  const assignSnap = await db.collection(assignmentsCollection).get();
  const missingSourceIds = new Set();
  assignSnap.forEach((docSnap) => {
    if (!isDateInSyncWindow(docSnap.id, window)) return;
    const sid = String(docSnap.data()?.sourceId || '').trim();
    if (!sid || validIds.has(sid)) return;
    missingSourceIds.add(sid);
  });

  return clearDailyAssignmentsForRemovedSourceIds(db, {
    assignmentsCollection,
    quotesCollection,
    removedSourceIds: missingSourceIds,
    dryRun
  });
}

module.exports = {
  isNotionPageMissingError,
  clearDailyAssignmentsForRemovedSourceIds,
  clearWindowAssignmentsMissingFromCatalog
};
