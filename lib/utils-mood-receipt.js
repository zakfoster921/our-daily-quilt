/**
 * Mood receipt formatting and portal date/version labels. Extends UtilsCore.
 * Requires lib/utils-core.js and lib/utils-portal.js (portal greeting helpers).
 */
(function (root) {
  'use strict';

  const UtilsCore = root.UtilsCore;
  if (!UtilsCore) {
    throw new Error('lib/utils-core.js must load before lib/utils-mood-receipt.js');
  }

  Object.assign(UtilsCore, {
    /** Light desaturated thermal paper from the user's quilt color (fallback when missing). */
    moodReceiptPaperFromUserColor(hex) {
      const fallback = '#e8e2d6';
      const raw = String(hex || '').trim();
      if (!UtilsCore.validateHexColor(raw)) return fallback;
      const hsv = UtilsCore.hexToHsv(raw);
      const sat =
        hsv.s < 6
          ? 6
          : Math.min(14, Math.max(5, Math.round(hsv.s * 0.11)));
      const val = Math.max(94, Math.min(97, Math.round(93 + (100 - hsv.v) * 0.48)));
      const tinted = UtilsCore.hsvToHex(hsv.h, sat, val);
      const mix = 0.34;
      const parse = (h) => {
        const n = parseInt(String(h).replace('#', ''), 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
      };
      const a = parse(tinted);
      const b = parse('#f8f5ef');
      const ch = (k) =>
        Math.round(a[k] * (1 - mix) + b[k] * mix)
          .toString(16)
          .padStart(2, '0');
      return '#' + ch('r') + ch('g') + ch('b');
    },
    /** Denser warm stock for the quilt Pantone chip (footer + card face). */
    colorCardstockPaperFromUserColor(hex) {
      const tinted = UtilsCore.moodReceiptPaperFromUserColor(hex);
      const mix = 0.42;
      const parse = (h) => {
        const n = parseInt(String(h).replace('#', ''), 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
      };
      const a = parse(tinted);
      const b = parse('#e3ddd4');
      const ch = (k) =>
        Math.round(a[k] * (1 - mix) + b[k] * mix)
          .toString(16)
          .padStart(2, '0');
      return '#' + ch('r') + ch('g') + ch('b');
    },
    /** Receipt footer stamp: MM/DD/YY HH:MMA (POS-style, fixed width). */
    formatMoodReceiptStamp(date = new Date()) {
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const yy = String(date.getFullYear() % 100).padStart(2, '0');
      const datePart = `${mm}/${dd}/${yy}`;
      let hour12 = date.getHours() % 12;
      if (hour12 === 0) hour12 = 12;
      const min = String(date.getMinutes()).padStart(2, '0');
      const meridiem = date.getHours() >= 12 ? 'P' : 'A';
      const timePart = `${String(hour12).padStart(2, '0')}:${min}${meridiem}`;
      return `${datePart} ${timePart}`;
    },
    /** Receipt message body only (date/time is a separate line in the DOM). */
    formatMoodReceiptBody(bodyText) {
      return String(bodyText || '').trim().replace(/\s+/g, ' ');
    },
    /** Receipt header: MESSAGE FOR: NAME (uses portal greeting when name omitted). */
    formatMoodReceiptLabel(name) {
      const raw = name != null ? String(name).trim() : '';
      const display = raw || UtilsCore.getNameThanksDisplayName();
      return `MESSAGE FOR: ${String(display).toUpperCase()}`;
    },
    /** Full-width ===== rule for thermal receipt paper (measures container width). */
    moodReceiptRuleLine(containerEl) {
      const fallback = '='.repeat(24);
      if (!containerEl || typeof root.document === 'undefined') return fallback;
      const width = containerEl.clientWidth;
      if (width <= 0) return fallback;
      const sample =
        containerEl.querySelector('.quilt-mood-widget__paper-text, .exit-chamber-mood-paper__text') ||
        containerEl;
      const cs = getComputedStyle(sample);
      if (!UtilsCore._moodReceiptRuleCanvas) {
        UtilsCore._moodReceiptRuleCanvas = root.document.createElement('canvas');
      }
      const ctx = UtilsCore._moodReceiptRuleCanvas.getContext('2d');
      if (!ctx) return '='.repeat(Math.max(12, Math.floor(width / 9)));
      const fontStyle = cs.fontStyle && cs.fontStyle !== 'normal' ? `${cs.fontStyle} ` : '';
      ctx.font = `${fontStyle}${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const eqW = ctx.measureText('=').width;
      if (!eqW || eqW <= 0) return '='.repeat(Math.max(12, Math.floor(width / 9)));
      const ls = parseFloat(cs.letterSpacing);
      const charSpan = eqW + (Number.isFinite(ls) ? ls : 0);
      return '='.repeat(Math.max(8, Math.floor(width / charSpan)));
    },
    /** Screen-reader / announce string: message, label, then stamp. */
    formatMoodReceiptLine(bodyText, date = new Date()) {
      const body = UtilsCore.formatMoodReceiptBody(bodyText);
      const label = UtilsCore.formatMoodReceiptLabel();
      const stamp = UtilsCore.formatMoodReceiptStamp(date);
      const parts = [body, label, stamp].filter(Boolean);
      return parts.join('. ');
    },
    refreshPortalDateText() {
      UtilsCore.syncPortalVisitMode();
      const dateText = root.document.getElementById('date-text');
      if (dateText) {
        dateText.textContent = UtilsCore.formatDate();
      }
      if (root.document.body?.classList.contains('odq-boot-active')) {
        return;
      }
      UtilsCore.refreshPortalGreeting();
      if (root.app?._portalQuiltLoaded && typeof root.app.updateSquareCounter === 'function') {
        root.app.updateSquareCounter();
      }
    },
    /** Compact label: v1.20 = marketing major + Xcode build (native). Web omits non-numeric build. */
    formatPortalVersionLabel(version, build) {
      const versionStr = String(version || '').trim();
      const buildStr = String(build || '').trim();
      const major = versionStr.split('.')[0] || '1';
      if (/^\d+$/.test(buildStr)) {
        return `v${major}.${buildStr}`;
      }
      const parts = versionStr.split('.').filter(Boolean);
      if (parts.length >= 2) return `v${parts[0]}.${parts[1]}`;
      if (parts.length === 1) return `v${parts[0]}`;
      return '';
    },
    refreshPortalVersionLabel() {
      const el = root.document.getElementById('portal-version-label');
      if (!el || typeof root.CONFIG === 'undefined' || !root.CONFIG.APP) return;
    
      const fallbackVersion = root.CONFIG.APP.version || '?';
      const fallbackBuild = root.CONFIG.APP.buildId || 'dev';
      el.textContent = UtilsCore.formatPortalVersionLabel(fallbackVersion, fallbackBuild);
    
      const isNative =
        typeof root.odqIsCapacitorNative === 'function' && root.odqIsCapacitorNative();
      if (!isNative) return;
    
      const appPlugin = root.Capacitor?.Plugins?.App;
      if (!appPlugin || typeof appPlugin.getInfo !== 'function') return;
    
      appPlugin.getInfo()
        .then((info) => {
          if (!el) return;
          el.textContent = UtilsCore.formatPortalVersionLabel(
            info?.version || fallbackVersion,
            info?.build || fallbackBuild
          );
        })
        .catch(() => {});
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
