/**
 * Rebuild publishedText + reflectionThemes.themes entry from rawText
 * (e.g. after raising REFLECTION_MODERATION_BODY_MAX).
 */
const REFLECTION_MODERATION_BODY_MAX = 200;
const REFLECTION_PUBLISHED_TEXT_MAX = 240;

function isDateDocId(id) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(id || '').trim());
}

function normalizeSubmittedAuthorName(displayName) {
  return String(displayName || '').replace(/\s+/g, ' ').trim();
}

function reflectionAuthorSuffix(displayName) {
  const name = normalizeSubmittedAuthorName(displayName);
  if (!name || /^friend$/i.test(name)) return '';
  return ` —${name}`;
}

function trimModeratedBodyAtWord(text, maxLen) {
  const s = String(rawNormalizeBody(text));
  if (!s || s.length <= maxLen) return s;
  const slice = s.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace >= Math.floor(maxLen * 0.55)) return slice.slice(0, lastSpace).trim();
  return slice.trim();
}

function rawNormalizeBody(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/g, '')
    .trim();
}

function buildPublishedFromRaw(rawText, displayName) {
  const body = trimModeratedBodyAtWord(rawText, REFLECTION_MODERATION_BODY_MAX);
  if (!body) return '';
  const suffix = reflectionAuthorSuffix(displayName);
  const maxBodyLen = Math.max(0, REFLECTION_PUBLISHED_TEXT_MAX - suffix.length);
  const trimmedBody = trimModeratedBodyAtWord(body, maxBodyLen);
  return `${trimmedBody}${suffix}`.slice(0, REFLECTION_PUBLISHED_TEXT_MAX);
}

function themeEntryMatchesPublished(theme, published) {
  const a = String(theme || '').replace(/\s+/g, ' ').trim();
  const b = String(published || '').replace(/\s+/g, ' ').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return false;
}

async function repairReflectionPublishedFromRaw(db, options = {}) {
  const dryRun = options.dryRun === true;
  const appDateKey = String(options.appDateKey || '').trim();
  const responseId = String(options.responseId || '').trim();
  const publishedOverride =
    options.publishedText != null ? String(options.publishedText).replace(/\s+/g, ' ').trim() : '';

  if (!db) throw new Error('Firestore db is required');
  if (!isDateDocId(appDateKey)) throw new Error('Valid appDateKey (YYYY-MM-DD) is required');

  let responseSnap = null;
  if (responseId) {
    responseSnap = await db.collection('reflectionResponses').doc(responseId).get();
    if (!responseSnap.exists) {
      return { success: false, error: `No reflectionResponses/${responseId}` };
    }
  } else {
    const q = await db
      .collection('reflectionResponses')
      .where('appDateKey', '==', appDateKey)
      .where('status', '==', 'published')
      .limit(20)
      .get();
    if (q.empty) {
      return { success: false, error: `No published reflectionResponses for ${appDateKey}` };
    }
    responseSnap = q.docs[0];
  }

  const data = responseSnap.data() || {};
  const docDateKey = String(data.appDateKey || '').trim();
  if (docDateKey && docDateKey !== appDateKey) {
    return { success: false, error: `Response appDateKey ${docDateKey} does not match ${appDateKey}` };
  }

  const rawText = String(data.rawText || data.responseText || '').replace(/\s+/g, ' ').trim();
  if (!rawText && !publishedOverride) {
    return { success: false, error: 'Response has no rawText to rebuild from' };
  }

  const author = normalizeSubmittedAuthorName(data.authorDisplayName || '');
  const previousPublished = String(data.publishedText || '').replace(/\s+/g, ' ').trim();
  const nextPublished = publishedOverride || buildPublishedFromRaw(rawText, author);
  if (!nextPublished) {
    return { success: false, error: 'Could not build published text' };
  }

  const themeRef = db.collection('reflectionThemes').doc(appDateKey);
  const themeSnap = await themeRef.get();
  const priorThemes = themeSnap.exists && Array.isArray(themeSnap.data()?.themes) ? themeSnap.data().themes : [];
  let themesUpdated = false;
  const nextThemes = priorThemes.map((entry) => {
    const text = String(entry || '').replace(/\s+/g, ' ').trim();
    if (themeEntryMatchesPublished(text, previousPublished) || themeEntryMatchesPublished(text, nextPublished)) {
      themesUpdated = true;
      return nextPublished;
    }
    return entry;
  });

  const result = {
    success: true,
    appDateKey,
    responseId: responseSnap.id,
    dryRun,
    previousPublished,
    nextPublished,
    rawLength: rawText.length,
    publishedLength: nextPublished.length,
    themesUpdated,
    changed: previousPublished !== nextPublished
  };

  if (!result.changed && themesUpdated) {
    result.changed = priorThemes.some((t) => themeEntryMatchesPublished(t, previousPublished) && previousPublished !== nextPublished);
  }

  if (dryRun) return result;

  await responseSnap.ref.update({
    publishedText: nextPublished,
    responseText: nextPublished,
    repairedFromRawAt: new Date().toISOString()
  });

  if (themesUpdated) {
    await themeRef.set({ themes: nextThemes }, { merge: true });
  } else if (!priorThemes.some((entry) => String(entry || '').trim() === nextPublished)) {
    await themeRef.set({ themes: [...priorThemes, nextPublished] }, { merge: true });
  }

  return result;
}

module.exports = {
  REFLECTION_MODERATION_BODY_MAX,
  REFLECTION_PUBLISHED_TEXT_MAX,
  buildPublishedFromRaw,
  repairReflectionPublishedFromRaw
};
