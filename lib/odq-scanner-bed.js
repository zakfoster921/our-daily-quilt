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


  function addBedClass(bed, className) {
    if (!bed || !className) return;
    for (const name of String(className).split(/\s+/)) {
      if (name) bed.classList.add(name);
    }
  }

  function mountSurface(host, seedKey, options = {}) {
    if (!host) return null;
    if (host.hasAttribute('hidden')) return null;
    const bed = mountScannerBed(host, seedKey, options);
    if (bed && options.bedClass) addBedClass(bed, options.bedClass);
    return bed;
  }

  function bootstrapTriptych(host, dateKey) {
    if (!host) return;
    const dk = String(dateKey || 'odq');
    const quoteShadow = host.querySelector('.quilt-mood-triptych__quote-shadow');
    if (quoteShadow) {
      const img = quoteShadow.querySelector('.quilt-mood-triptych__quote-img');
      mountSurface(quoteShadow, `${dk}:triptych-quote`, {
        profile: 'newsprint',
        maskImage: img,
        insertBefore: img
      });
    }
    host.querySelectorAll('.quilt-mood-triptych__face').forEach((face) => {
      const mood = face.closest('.quilt-mood-triptych__card')?.dataset?.mood || 'card';
      const side = face.classList.contains('quilt-mood-triptych__face--back') ? 'back' : 'front';
      mountSurface(face, `${dk}:triptych-face:${mood}:${side}`, {
        profile: 'riso',
        insertBefore: face.firstElementChild,
        bedClass: 'odq-scanner-bed--riso'
      });
    });
  }

  function bootstrapQuiltPaper(scope, dateKey) {
    const root = scope && scope.nodeType === 1 ? scope : document;
    const screen = root.id === 'screen-quilt' ? root : root.querySelector('#screen-quilt');
    if (!screen) return;
    const dk = String(dateKey || 'odq');

    screen.querySelectorAll('.quilt-quote-clipping--has-png .quilt-quote-clipping__shadow').forEach((host) => {
      const img = host.querySelector('.quilt-quote-clipping__image');
      mountSurface(host, `${dk}:quote-clipping`, {
        profile: 'newsprint',
        maskImage: img,
        insertBefore: img
      });
    });

    screen.querySelectorAll('.quilt-quote-display:not(.quilt-quote-clipping--has-png)').forEach((host) => {
      mountSurface(host, `${dk}:quote-fallback`, {
        profile: 'newsprint',
        insertBefore: host.querySelector('.quilt-quote-text') || host.firstElementChild
      });
    });

    const triptych = screen.querySelector('.quilt-mood-triptych');
    if (triptych) bootstrapTriptych(triptych, dk);

    screen.querySelectorAll('.quilt-mood-widget__slot').forEach((host, i) => {
      mountSurface(host, `${dk}:mood-slot:${i}`, {
        profile: 'newsprint',
        insertBefore: host.firstElementChild
      });
    });

    screen.querySelectorAll('.quilt-mood-widget__paper').forEach((host, i) => {
      mountSurface(host, `${dk}:mood-paper:${i}`, {
        profile: 'newsprint',
        insertBefore: host.firstElementChild
      });
    });

    screen.querySelectorAll('.quilt-mood-widget__face--front, .quilt-mood-widget__face--back').forEach((host, i) => {
      const side = host.classList.contains('quilt-mood-widget__face--back') ? 'back' : 'front';
      const img = host.querySelector('.quilt-mood-widget__mood-clipping__image, img');
      mountSurface(host, `${dk}:mood-face:${side}:${i}`, {
        profile: 'newsprint',
        maskImage: img?.naturalWidth ? img : null,
        insertBefore: host.firstElementChild
      });
    });

    screen.querySelectorAll('.quilt-reflection-question-paper').forEach((host, i) => {
      mountSurface(host, `${dk}:reflection-question:${i}`, {
        profile: 'newsprint',
        insertBefore: host.querySelector('.quilt-reflection-question-paper-body') || host.firstElementChild
      });
    });

    screen.querySelectorAll('.quote-speaker-cutout').forEach((host, i) => {
      mountSurface(host, `${dk}:speaker-cutout:${i}`, {
        profile: 'newsprint',
        insertBefore: host.firstElementChild
      });
    });

    screen.querySelectorAll('.quilt-user-shape-card__surface, .quilt-user-shape-card__note-paper').forEach((host, i) => {
      const kind = host.classList.contains('quilt-user-shape-card__note-paper') ? 'note' : 'surface';
      mountSurface(host, `${dk}:user-color-${kind}:${i}`, {
        profile: 'newsprint',
        insertBefore: host.firstElementChild
      });
    });

    const exitSection = document.getElementById('exitChamberMoodPaper');
    const exitSheet = exitSection?.querySelector('.exit-chamber-mood-paper__sheet');
    if (exitSection && exitSheet && !exitSection.hasAttribute('hidden')) {
      mountSurface(exitSheet, `${dk}:exit-mood-sheet`, {
        profile: 'newsprint',
        insertBefore: exitSheet.querySelector('.exit-chamber-mood-paper__body') || exitSheet.firstElementChild
      });
    }
  }

  global.OdqScannerBed = {
    applyScannerBedVars,
    createScannerBed,
    mountScannerBed,
    syncMaskFromImage,
    bootstrapQuiltPaper,
    bootstrapTriptych
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {});
