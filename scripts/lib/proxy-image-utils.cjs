'use strict';

/** Decode once if a Storage URL was already percent-encoded (avoids %252F in proxy queries). */
function normalizeProxyImageSourceUrl(url) {
  let s = String(url || '').trim();
  if (!s) return s;
  try {
    if (/%25[0-9a-f]{2}/i.test(s)) {
      const decoded = decodeURIComponent(s);
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
  } catch (_) {
    /* ignore */
  }
  return s;
}

function proxyImageFetchUrl(base, sourceUrl) {
  const normalized = normalizeProxyImageSourceUrl(sourceUrl);
  const b = String(base || '').replace(/\/$/, '');
  if (!b || !normalized) return '';
  return `${b}/api/proxy-image?url=${encodeURIComponent(normalized)}`;
}

let _sharp = null;
function getSharp() {
  if (_sharp !== undefined) return _sharp;
  try {
    _sharp = require('sharp');
  } catch (_) {
    _sharp = null;
  }
  return _sharp;
}

/** Shrink large speaker cutouts for canvas compose (story preview). */
async function shrinkImageBufferForCanvasProxy(buf, contentType) {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!ct.startsWith('image/') || !buf || buf.length < 1.5 * 1024 * 1024) {
    return buf;
  }
  const sharp = getSharp();
  if (!sharp) return buf;
  try {
    return await sharp(buf)
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
  } catch (err) {
    console.warn('proxy-image shrink failed:', err?.message || err);
    return buf;
  }
}

module.exports = {
  normalizeProxyImageSourceUrl,
  proxyImageFetchUrl,
  shrinkImageBufferForCanvasProxy
};
