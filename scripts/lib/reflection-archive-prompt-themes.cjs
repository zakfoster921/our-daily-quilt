/**
 * Resolves the `promptThemes` category tags (trust, identity, resilience, belonging,
 * voice, attention, doubt, process, courage) for a given reflection archive dateKey.
 *
 * Mirrors the join chain used by loadReflectionArchiveContextServer in server.js:
 * quotes/{dateKey} -> dailyQuoteAssignments/{dateKey} -> quotes/{sourceId}, picking
 * whichever doc in the chain has a non-empty promptThemes array. Shared by server.js
 * (denormalizing onto reflectionThemes docs at generation time) and the one-off
 * backfill script (scripts/backfill-reflection-archive-theme-tags.cjs).
 */

function isDateDocId(id) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(id || '').trim());
}

function promptThemesFromDoc(data) {
  const themes = Array.isArray(data?.promptThemes) ? data.promptThemes : [];
  return themes.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
}

async function resolvePromptThemesForDateKey(db, dateKey, options = {}) {
  const key = String(dateKey || '').trim();
  if (!isDateDocId(key)) return [];

  const quotesCollection = options.quotesCollection || process.env.FIRESTORE_QUOTES_COLLECTION || 'quotes';
  const assignmentsCollection =
    options.assignmentsCollection || process.env.FIRESTORE_ASSIGNMENTS_COLLECTION || 'dailyQuoteAssignments';

  const dailyQuoteSnap = await db.collection(quotesCollection).doc(key).get();
  const dailyQuoteThemes = dailyQuoteSnap.exists ? promptThemesFromDoc(dailyQuoteSnap.data()) : [];
  if (dailyQuoteThemes.length) return dailyQuoteThemes;

  const assignmentSnap = await db.collection(assignmentsCollection).doc(key).get();
  const assignmentData = assignmentSnap.exists ? assignmentSnap.data() || {} : {};
  const assignmentThemes = promptThemesFromDoc(assignmentData);
  if (assignmentThemes.length) return assignmentThemes;

  const sourceId = String(assignmentData.sourceId || assignmentData.quoteId || '').trim();
  if (sourceId) {
    const sourceSnap = await db.collection(quotesCollection).doc(sourceId).get();
    if (sourceSnap.exists) {
      const sourceThemes = promptThemesFromDoc(sourceSnap.data());
      if (sourceThemes.length) return sourceThemes;
    }
  }

  return [];
}

module.exports = {
  resolvePromptThemesForDateKey
};
