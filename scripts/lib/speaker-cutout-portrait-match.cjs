const crypto = require('crypto');

function portraitUrlHash(imageUrl) {
  return crypto.createHash('sha256').update(String(imageUrl || '').trim()).digest('hex').slice(0, 12);
}

/** True when URL points at speaker-cutouts/ in Firebase Storage. */
function isFirebaseSpeakerCutoutUrl(url) {
  const u = String(url || '').trim();
  return /speaker-cutouts(?:%2F|\/)/i.test(u);
}

/** True when Storage path was built from this portrait URL. */
function cutoutStorageMatchesPortraitUrl(cutoutUrl, imageUrl) {
  const cutout = String(cutoutUrl || '').trim();
  const portrait = String(imageUrl || '').trim();
  if (!cutout || !portrait) return false;
  const hash = portraitUrlHash(portrait);
  return cutout.includes(`-${hash}.`) || cutout.includes(`-${hash}-`);
}

/** Drop stale/deleted cutout URLs so assignments do not pin a broken Storage link. */
function speakerCutoutUrlForPortrait(cutoutUrl, portraitUrl) {
  const cutout = String(cutoutUrl || '').trim();
  const portrait = String(portraitUrl || '').trim();
  if (!cutout) return '';
  if (!portrait) return cutout;
  if (!isFirebaseSpeakerCutoutUrl(cutout)) return '';
  if (!cutoutStorageMatchesPortraitUrl(cutout, portrait)) return '';
  return cutout;
}

module.exports = {
  portraitUrlHash,
  isFirebaseSpeakerCutoutUrl,
  cutoutStorageMatchesPortraitUrl,
  speakerCutoutUrlForPortrait
};
