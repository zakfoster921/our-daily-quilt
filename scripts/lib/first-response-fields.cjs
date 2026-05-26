/**
 * Shared helpers for first_response (first reflection theme patch of the day) and user_name.
 * Firestore + Notion use snake_case only.
 */

const FIRST_RESPONSE_USER_NAME = 'Zak';

function isDateDocId(id) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(id || '').trim());
}

function firstThemePatchFromData(data) {
  const themes = Array.isArray(data?.themes) ? data.themes : [];
  return String(themes[0] || '').replace(/\s+/g, ' ').trim();
}

function catalogFieldsForAssignmentMirror(catalog) {
  const portrait = String(catalog?.speaker_image_url ?? catalog?.speakerImageUrl ?? '').trim();
  return {
    first_response: String(catalog?.first_response ?? '').slice(0, 500),
    user_name: FIRST_RESPONSE_USER_NAME,
    ...(portrait
      ? {
          speakerImageUrlSnapshot: portrait.slice(0, 500),
          speaker_image_url_snapshot: portrait.slice(0, 500)
        }
      : {})
  };
}

/**
 * Copy first_response + user_name from a quotes/{sourceId} doc onto dailyQuoteAssignments/{dateKey}
 * when this quote owns that slot (or the slot is empty).
 */
async function mirrorCatalogFieldsToAssignment(db, options) {
  const {
    sourceId,
    dateKey,
    catalog,
    assignmentsCollection = 'dailyQuoteAssignments',
    dryRun = false
  } = options || {};
  const sid = String(sourceId || '').trim();
  const key = String(dateKey || '').trim();
  if (!sid || !isDateDocId(key)) return false;

  const assignRef = db.collection(assignmentsCollection).doc(key);
  const snap = await assignRef.get();
  const existingSource = snap.exists ? String(snap.data()?.sourceId || '').trim() : '';
  if (existingSource && existingSource !== sid) return false;

  const patch = catalogFieldsForAssignmentMirror(catalog || {});
  if (!dryRun) await assignRef.set(patch, { merge: true });
  return true;
}

function buildFirstResponseFirestorePatch(firstResponse, { deleteField } = {}) {
  const text = String(firstResponse || '').replace(/\s+/g, ' ').trim();
  const patch = { user_name: FIRST_RESPONSE_USER_NAME };
  if (text) {
    patch.first_response = text;
  } else if (deleteField) {
    patch.first_response = deleteField();
  }
  return patch;
}

function notionTextPropertyPayload(propSchema, value, { allowEmpty = false } = {}) {
  const text = String(value || '').trim();
  if (!propSchema) return null;
  if (!text && !allowEmpty) return null;
  switch (propSchema.type) {
    case 'title':
      return text
        ? { title: [{ text: { content: text.slice(0, 2000) } }] }
        : { title: [] };
    case 'rich_text':
      return text
        ? { rich_text: [{ text: { content: text.slice(0, 2000) } }] }
        : { rich_text: [] };
    case 'select':
      return text ? { select: { name: text.slice(0, 100) } } : { select: null };
    case 'status':
      return text ? { status: { name: text.slice(0, 100) } } : { status: null };
    default:
      return null;
  }
}

function findSchemaEntry(schema, base) {
  const target = String(base || '')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  for (const [key, prop] of Object.entries(schema || {})) {
    if (key.replace(/[\s_-]/g, '').toLowerCase() === target) return [key, prop];
  }
  return [null, null];
}

function buildFirstResponseNotionProperties(schema, { firstResponse, userName }) {
  const properties = {};
  const [firstKey, firstProp] = findSchemaEntry(schema, 'first_response');
  const [userKey, userProp] = findSchemaEntry(schema, 'user_name');

  if (firstProp) {
    const firstPayload = notionTextPropertyPayload(firstProp, firstResponse, { allowEmpty: true });
    if (firstPayload) properties[firstKey] = firstPayload;
  }
  const userPayload = notionTextPropertyPayload(userProp, userName || FIRST_RESPONSE_USER_NAME);
  if (userProp && userPayload) properties[userKey] = userPayload;
  return properties;
}

module.exports = {
  FIRST_RESPONSE_USER_NAME,
  isDateDocId,
  firstThemePatchFromData,
  catalogFieldsForAssignmentMirror,
  mirrorCatalogFieldsToAssignment,
  buildFirstResponseFirestorePatch,
  buildFirstResponseNotionProperties,
  notionTextPropertyPayload
};
