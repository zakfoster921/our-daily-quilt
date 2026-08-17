'use strict';

const { shuffleQuotes } = require('./shuffle-quotes.cjs');

const DEFAULT_AUTHOR_COOLDOWN_DAYS = 21;

function authorCooldownDays(env = process.env) {
  const raw = Number(env.QUOTE_AUTHOR_COOLDOWN_DAYS);
  if (Number.isInteger(raw) && raw >= 0) return raw;
  return DEFAULT_AUTHOR_COOLDOWN_DAYS;
}

function normalizeAuthorKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function authorsAreSameSpeaker(a, b) {
  const na = normalizeAuthorKey(a);
  const nb = normalizeAuthorKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (shorter.length < 4) return false;
  return longer.endsWith(` ${shorter}`);
}

function authorIsUsed(author, usedAuthorKeys) {
  const key = normalizeAuthorKey(author);
  if (!key || !usedAuthorKeys || usedAuthorKeys.size === 0) return false;
  if (usedAuthorKeys.has(key)) return true;
  for (const used of usedAuthorKeys) {
    if (authorsAreSameSpeaker(key, used)) return true;
  }
  return false;
}

function addUsedAuthor(usedAuthorKeys, author) {
  const key = normalizeAuthorKey(author);
  if (key) usedAuthorKeys.add(key);
  return usedAuthorKeys;
}

function authorFromAssignment(row, quoteBySourceId) {
  const sid = String(row?.data?.sourceId || '').trim();
  const quote = sid && quoteBySourceId ? quoteBySourceId.get(sid) : null;
  return String(quote?.author || row?.data?.authorSnapshot || row?.data?.author || '').trim();
}

function usedAuthorKeysFromAssignments(assignments, quoteBySourceId) {
  const used = new Set();
  for (const row of assignments || []) {
    addUsedAuthor(used, authorFromAssignment(row, quoteBySourceId));
  }
  return used;
}

function buildLastUsedByAuthor(recentAssignments, quotes, quoteBySourceId) {
  const map = new Map();
  const bump = (author, dateKey) => {
    const key = normalizeAuthorKey(author);
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return;
    const prev = map.get(key) || '';
    if (dateKey > prev) map.set(key, dateKey);
  };
  for (const row of recentAssignments || []) {
    bump(authorFromAssignment(row, quoteBySourceId), row.dateKey);
  }
  for (const q of quotes || []) {
    bump(q.author, String(q.lastUsedDate || q.last_used_date || '').trim());
  }
  return map;
}

function orderFillPool(quotes, isCommunitySubmittedQuote) {
  const community = [];
  const catalog = [];
  for (const q of quotes || []) {
    if (isCommunitySubmittedQuote(q)) community.push(q);
    else catalog.push(q);
  }
  community.sort((a, b) => {
    const aPriority = a.schedulePriorityAt || a.submittedAt || '';
    const bPriority = b.schedulePriorityAt || b.submittedAt || '';
    if (aPriority !== bPriority) return aPriority.localeCompare(bPriority);
    const aSubmitted = a.submittedAt || '';
    const bSubmitted = b.submittedAt || '';
    if (aSubmitted !== bSubmitted) return aSubmitted.localeCompare(bSubmitted);
    return String(a.sourceId || '').localeCompare(String(b.sourceId || ''));
  });
  return [...community, ...shuffleQuotes(catalog)];
}

function takeNextSpacedQuote(pool, usedAuthorKeys, lastUsedByAuthor, windowAuthorKeys) {
  if (!Array.isArray(pool) || !pool.length) return null;
  for (let i = 0; i < pool.length; i += 1) {
    if (!authorIsUsed(pool[i].author, usedAuthorKeys)) {
      return pool.splice(i, 1)[0];
    }
  }
  if (windowAuthorKeys && windowAuthorKeys.size) {
    for (let i = 0; i < pool.length; i += 1) {
      if (!authorIsUsed(pool[i].author, windowAuthorKeys)) {
        return pool.splice(i, 1)[0];
      }
    }
  }
  let best = 0;
  let bestDate = lastUsedByAuthor?.get(normalizeAuthorKey(pool[0].author)) || '0000-00-00';
  for (let i = 1; i < pool.length; i += 1) {
    const d = lastUsedByAuthor?.get(normalizeAuthorKey(pool[i].author)) || '0000-00-00';
    if (d < bestDate) {
      bestDate = d;
      best = i;
    }
  }
  return pool.splice(best, 1)[0];
}

module.exports = {
  DEFAULT_AUTHOR_COOLDOWN_DAYS,
  authorCooldownDays,
  normalizeAuthorKey,
  authorsAreSameSpeaker,
  authorIsUsed,
  addUsedAuthor,
  authorFromAssignment,
  usedAuthorKeysFromAssignments,
  buildLastUsedByAuthor,
  orderFillPool,
  takeNextSpacedQuote
};
