/**
 * Color conversion helpers for the picker wheel. Extends UtilsCore static methods.
 * Requires lib/utils-core.js to load first.
 */
(function (root) {
  'use strict';

  const UtilsCore = root.UtilsCore;
  if (!UtilsCore) {
    throw new Error('lib/utils-core.js must load before lib/utils-color.js');
  }

  function colorPickerDefaults() {
    const cp = root.CONFIG && root.CONFIG.COLOR_PICKER;
    return {
      defaultHue: cp?.defaultHue ?? 36,
      saturation: cp?.saturation ?? 21.7,
      defaultLightness: cp?.defaultLightness ?? 90
    };
  }

  Object.assign(UtilsCore, {
    hslToHex(h, s, l) {
      h /= 360;
      s /= 100;
      l /= 100;

      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      let r;
      let g;
      let b;

      if (s === 0) {
        r = g = b = l;
      } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
      }

      const toHex = (c) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? `0${hex}` : hex;
      };

      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    },

    hexToHsv(hex) {
      const normalized = String(hex || '').trim();
      const m = /^#?([0-9a-f]{6})$/i.exec(normalized);
      if (!m) {
        const defaults = colorPickerDefaults();
        return {
          h: defaults.defaultHue,
          s: defaults.saturation,
          v: defaults.defaultLightness
        };
      }
      const n = parseInt(m[1], 16);
      const r = ((n >> 16) & 255) / 255;
      const g = ((n >> 8) & 255) / 255;
      const b = (n & 255) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      let h = 0;
      if (d > 1e-10) {
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
      }
      const s = max < 1e-10 ? 0 : (d / max) * 100;
      const v = max * 100;
      return {
        h: (h * 360 + 360) % 360,
        s,
        v
      };
    },

    hsvToHex(h, s, v) {
      h = ((h % 360) + 360) % 360;
      s = Math.max(0, Math.min(100, s)) / 100;
      v = Math.max(0, Math.min(100, v)) / 100;
      if (s === 0) {
        const g = Math.round(v * 255);
        const hex = (n) => {
          const x = n.toString(16);
          return x.length === 1 ? `0${x}` : x;
        };
        return `#${hex(g)}${hex(g)}${hex(g)}`;
      }
      const i = Math.floor(h / 60) % 6;
      const f = h / 60 - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      let r;
      let g;
      let b;
      switch (i) {
        case 0:
          r = v;
          g = t;
          b = p;
          break;
        case 1:
          r = q;
          g = v;
          b = p;
          break;
        case 2:
          r = p;
          g = v;
          b = t;
          break;
        case 3:
          r = p;
          g = q;
          b = v;
          break;
        case 4:
          r = t;
          g = p;
          b = v;
          break;
        default:
          r = v;
          g = p;
          b = q;
          break;
      }
      const toHex = (c) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? `0${hex}` : hex;
      };
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    },

    writeHsvRgbBytes(h, s, v, out, i) {
      h = ((h % 360) + 360) % 360;
      s = Math.max(0, Math.min(100, s)) / 100;
      v = Math.max(0, Math.min(100, v)) / 100;
      if (s === 0) {
        const u = Math.round(v * 255);
        out[i] = u;
        out[i + 1] = u;
        out[i + 2] = u;
        return;
      }
      const seg = Math.floor(h / 60) % 6;
      const f = h / 60 - seg;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      let r;
      let g;
      let b;
      switch (seg) {
        case 0:
          r = v;
          g = t;
          b = p;
          break;
        case 1:
          r = q;
          g = v;
          b = p;
          break;
        case 2:
          r = p;
          g = v;
          b = t;
          break;
        case 3:
          r = p;
          g = q;
          b = v;
          break;
        case 4:
          r = t;
          g = p;
          b = v;
          break;
        default:
          r = v;
          g = p;
          b = q;
          break;
      }
      out[i] = Math.round(r * 255);
      out[i + 1] = Math.round(g * 255);
      out[i + 2] = Math.round(b * 255);
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
