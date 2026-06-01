/**
 * Flatbed scanner-bed optical overlay — bloom + iridescence above paper, below content.
 * Browser: global.OdqScannerBed
 */
(function (global) {
  'use strict';

  const PROFILES = {
    newsprint: {
      bloomOpacity: 0.05,
      irisOpacity: 0.035,
      bloomX: 28,
      bloomY: 22,
      bloomSize: 68,
      irisAngle: 132
    },
    riso: {
      bloomOpacity: 0.048,
      irisOpacity: 0.024,
      bloomX: 26,
      bloomY: 20,
      bloomSize: 64,
      irisAngle: 128
    }
  };

  function seededRandomFrom(seed) {
    let s = seed >>> 0;
    return function next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(key) {
    const QNC = global.QuiltNewspaperClipping;
    if (QNC?.hashDateKeySeed) return QNC.hashDateKeySeed(String(key || 'odq'));
    let h = 0;
    const s = String(key || 'odq');
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  function applyScannerBedVars(el, seedKey, profileName = 'newsprint') {
    if (!el) return;
    const profile = PROFILES[profileName] || PROFILES.newsprint;
    const rand = seededRandomFrom(hashSeed(seedKey));
    const bloomX = profile.bloomX + (rand() - 0.5) * 8;
    const bloomY = profile.bloomY + (rand() - 0.5) * 6;
    const bloomSize = profile.bloomSize + (rand() - 0.5) * 10;
    const irisAngle = profile.irisAngle + (rand() - 0.5) * 24;
    const bloomOpacity = profile.bloomOpacity + (rand() - 0.5) * 0.008;
    const irisOpacity = profile.irisOpacity + (rand() - 0.5) * 0.006;

    el.style.setProperty('--odq-scanner-bloom-x', `${bloomX.toFixed(1)}%`);
    el.style.setProperty('--odq-scanner-bloom-y', `${bloomY.toFixed(1)}%`);
    el.style.setProperty('--odq-scanner-bloom-size', `${bloomSize.toFixed(1)}%`);
    el.style.setProperty(
      '--odq-scanner-bloom-opacity',
      `${Math.max(0.028, bloomOpacity).toFixed(3)}`
    );
    el.style.setProperty('--odq-scanner-iris-angle', `${irisAngle.toFixed(1)}deg`);
    el.style.setProperty(
      '--odq-scanner-iris-opacity',
      `${Math.max(0.018, irisOpacity).toFixed(3)}`
    );
  }

  function createScannerBed() {
    const el = document.createElement('span');
    el.className = 'odq-scanner-bed';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function syncMaskFromImage(bed, img) {
    if (!bed || !img?.src) return;
    const mask = `url("${img.currentSrc || img.src}")`;
    bed.style.maskImage = mask;
    bed.style.webkitMaskImage = mask;
    bed.style.maskSize = '100% 100%';
    bed.style.webkitMaskSize = '100% 100%';
    bed.style.maskRepeat = 'no-repeat';
    bed.style.webkitMaskRepeat = 'no-repeat';
    bed.style.maskPosition = 'center';
    bed.style.webkitMaskPosition = 'center';
  }

  function mountScannerBed(host, seedKey, options = {}) {
    if (!host) return null;
    const profile = options.profile || 'newsprint';
    const maskImg = options.maskImage || null;
    const insertBefore = options.insertBefore || null;
    let bed = host.querySelector(':scope > .odq-scanner-bed');
    if (!bed) {
      bed = createScannerBed();
      if (insertBefore?.parentNode === host) {
        host.insertBefore(bed, insertBefore);
      } else {
        host.insertBefore(bed, host.firstElementChild);
      }
    }
    applyScannerBedVars(bed, seedKey, profile);
    if (maskImg) syncMaskFromImage(bed, maskImg);
    return bed;
  }

  global.OdqScannerBed = {
    applyScannerBedVars,
    createScannerBed,
    mountScannerBed,
    syncMaskFromImage
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {});
