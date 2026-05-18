/**
 * Restore first_response on dailyQuoteAssignments + quotes/{sourceId}
 * from the date-keyed catalog doc quotes/{YYYY-MM-DD}.
 */
const { buildFirstResponseFirestorePatch, isDateDocId } = require('./first-response-fields.cjs');

async function repairFirstResponseFromCatalog(db, dateKey, options = {}) {
  const dryRun = options.dryRun === true;
  const FieldValue = options.FieldValue || null;
  if (!db) throw new Error('Firestore db is required');
  if (!isDateDocId(dateKey)) throw new Error('Valid dateKey (YYYY-MM-DD) is required');

  const assignmentsCol = process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';
  const quotesCol = process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';

  const catalogRef = db.collection(quotesCol).doc(dateKey);
  const assignRef = db.collection(assignmentsCol).doc(dateKey);
  const [catalogSnap, assignSnap] = await Promise.all([catalogRef.get(), assignRef.get()]);

  if (!catalogSnap.exists) {
    return { success: false, error: `No catalog doc ${quotesCol}/${dateKey}` };
  }
  if (!assignSnap.exists) {
    return { success: false, error: `No assignment ${assignmentsCol}/${dateKey}` };
  }

  const catalog = catalogSnap.data() || {};
  const assignment = assignSnap.data() || {};
  const restored = String(catalog.first_response || '').replace(/\s+/g, ' ').trim();
  if (!restored) {
    return { success: false, error: `Catalog ${quotesCol}/${dateKey} has no first_response` };
  }

  const currentAssign = String(assignment.first_response || '').replace(/\s+/g, ' ').trim();
  const sourceId = String(assignment.sourceId || '').trim();
  const userName = String(catalog.user_name || assignment.user_name || 'Zak').trim() || 'Zak';

  const result = {
    success: true,
    appDateKey: dateKey,
    dryRun,
    restored,
    previous: currentAssign || '',
    sourceId: sourceId || null,
    userName,
    changed: currentAssign !== restored,
    skipped: currentAssign === restored
  };

  if (currentAssign === restored) return result;

  const patch = buildFirstResponseFirestorePatch(restored, {
    deleteField: FieldValue ? () => FieldValue.delete() : undefined
  });
  patch.user_name = userName;
  patch.updated_at_iso = new Date().toISOString();

  if (dryRun) {
    result.patch = patch;
    return result;
  }

  await assignRef.set(patch, { merge: true });
  if (sourceId) {
    await db.collection(quotesCol).doc(sourceId).set(patch, { merge: true });
  }
  result.updated = [assignmentsCol + '/' + dateKey].concat(sourceId ? [`${quotesCol}/${sourceId}`] : []);
  return result;
}

module.exports = { repairFirstResponseFromCatalog };
