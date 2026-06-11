/** Patch Notion quote preview assets (speaker cutout + newspaper clipping). */

const NOTION_API_VERSION = '2022-06-28';

function normPropKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

function findSchemaPropName(properties, ...aliases) {
  const targets = aliases.map(normPropKey).filter(Boolean);
  for (const key of Object.keys(properties || {})) {
    const nk = normPropKey(key);
    if (targets.includes(nk)) return key;
  }
  return '';
}

function readNotionAssetUrl(prop) {
  if (!prop) return '';
  if (prop.type === 'url' && prop.url) return String(prop.url).trim();
  if (prop.type === 'files' && Array.isArray(prop.files)) {
    for (const file of prop.files) {
      const url = String(file?.external?.url || file?.file?.url || '').trim();
      if (url) return url;
    }
  }
  if (prop.type === 'rich_text' && Array.isArray(prop.rich_text)) {
    return prop.rich_text
      .map((x) => x.plain_text || x.text?.content || '')
      .join('')
      .trim();
  }
  return '';
}

function buildNotionAssetPropertyValue(prop, imageUrl, fileName) {
  const url = String(imageUrl || '').trim();
  if (!url || !prop) return null;
  if (prop.type === 'files') {
    return {
      files: [
        {
          type: 'external',
          name: fileName || 'asset.png',
          external: { url }
        }
      ]
    };
  }
  if (prop.type === 'url') {
    return { url };
  }
  if (prop.type === 'rich_text') {
    return { rich_text: [{ text: { content: url.slice(0, 2000) } }] };
  }
  return null;
}

function buildNotionQuoteAssetProperties(schema, { speakerCutoutUrl, quoteClippingUrl }) {
  const properties = {};
  const speakerProp = findSchemaPropName(
    schema,
    'speaker_cutout',
    'speakerCutout',
    'Speaker cutout'
  );
  const clippingProp = findSchemaPropName(
    schema,
    'quote_clipping',
    'quoteClipping',
    'Quote clipping'
  );
  if (speakerProp && speakerCutoutUrl) {
    const value = buildNotionAssetPropertyValue(schema[speakerProp], speakerCutoutUrl, 'speaker-cutout.png');
    if (value) properties[speakerProp] = value;
  }
  if (clippingProp && quoteClippingUrl) {
    const value = buildNotionAssetPropertyValue(schema[clippingProp], quoteClippingUrl, 'quote-clipping.png');
    if (value) properties[clippingProp] = value;
  }
  return { properties, speakerProp, clippingProp };
}

async function fetchNotionJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Notion API ${res.status}: ${text || res.statusText}`);
  }
  return text ? JSON.parse(text) : null;
}

async function notionGetDatabaseSchema(databaseId, notionToken) {
  const json = await fetchNotionJson(`https://api.notion.com/v1/databases/${databaseId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_API_VERSION
    }
  });
  return json?.properties || {};
}

async function notionGetPage(pageId, notionToken) {
  return fetchNotionJson(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_API_VERSION
    }
  });
}

async function notionPatchPage(pageId, notionToken, payload) {
  await fetchNotionJson(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

function isReviewedNotionPage(page) {
  const props = page?.properties || {};
  let reviewedProp = props['reviewed?'] || props.reviewed || props.Reviewed;
  if (!reviewedProp) {
    const reviewedKey = findSchemaPropName(props, 'reviewed', 'Reviewed');
    if (reviewedKey) reviewedProp = props[reviewedKey];
  }
  if (!reviewedProp) return false;
  if (typeof reviewedProp.checkbox === 'boolean') return reviewedProp.checkbox;
  const text = readNotionAssetUrl(reviewedProp).toLowerCase();
  return ['true', 'yes', 'y', '1', 'checked', 'reviewed'].includes(text);
}

function readExistingNotionAssets(page, schema) {
  const props = page?.properties || {};
  const speakerProp = findSchemaPropName(
    schema,
    'speaker_cutout',
    'speakerCutout',
    'Speaker cutout'
  );
  const clippingProp = findSchemaPropName(
    schema,
    'quote_clipping',
    'quoteClipping',
    'Quote clipping'
  );
  return {
    speakerCutoutUrl: speakerProp ? readNotionAssetUrl(props[speakerProp]) : '',
    quoteClippingUrl: clippingProp ? readNotionAssetUrl(props[clippingProp]) : '',
    speakerProp,
    clippingProp
  };
}

module.exports = {
  NOTION_API_VERSION,
  buildNotionAssetPropertyValue,
  buildNotionQuoteAssetProperties,
  findSchemaPropName,
  isReviewedNotionPage,
  notionGetDatabaseSchema,
  notionGetPage,
  notionPatchPage,
  readExistingNotionAssets,
  readNotionAssetUrl
};
