/**
 * LAB color-space helpers for quilt similarity and palette naming.
 * Loaded before the main app module; exposes globalThis.ColorUtilsV2.
 */
(function (root) {
  'use strict';

  function quiltV2Config() {
    const cfg = root.CONFIG && root.CONFIG.QUILT_V2;
    return {
      LAB_COLOR_CACHE_SIZE: cfg?.LAB_COLOR_CACHE_SIZE ?? 1000,
      COLOR_SIMILARITY_THRESHOLD: cfg?.COLOR_SIMILARITY_THRESHOLD ?? 35
    };
  }

  class ColorUtilsV2 {
    static colorCache = new Map();

    static hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
          }
        : null;
    }

    static rgbToXyz(r, g, b) {
      let r1 = r / 255;
      let g1 = g / 255;
      let b1 = b / 255;

      r1 = r1 > 0.04045 ? Math.pow((r1 + 0.055) / 1.055, 2.4) : r1 / 12.92;
      g1 = g1 > 0.04045 ? Math.pow((g1 + 0.055) / 1.055, 2.4) : g1 / 12.92;
      b1 = b1 > 0.04045 ? Math.pow((b1 + 0.055) / 1.055, 2.4) : b1 / 12.92;

      const x = r1 * 0.4124 + g1 * 0.3576 + b1 * 0.1805;
      const y = r1 * 0.2126 + g1 * 0.7152 + b1 * 0.0722;
      const z = r1 * 0.0193 + g1 * 0.1192 + b1 * 0.9505;

      return { x, y, z };
    }

    static xyzToLab(x, y, z) {
      const xn = 0.95047;
      const yn = 1.0;
      const zn = 1.08883;

      const x1 = x / xn;
      const y1 = y / yn;
      const z1 = z / zn;

      const fx = x1 > 0.008856 ? Math.pow(x1, 1 / 3) : 7.787 * x1 + 16 / 116;
      const fy = y1 > 0.008856 ? Math.pow(y1, 1 / 3) : 7.787 * y1 + 16 / 116;
      const fz = z1 > 0.008856 ? Math.pow(z1, 1 / 3) : 7.787 * z1 + 16 / 116;

      const L = 116 * fy - 16;
      const a = 500 * (fx - fy);
      const b = 200 * (fy - fz);

      return { L, a, b };
    }

    static hexToLab(hex) {
      if (this.colorCache.has(hex)) {
        return this.colorCache.get(hex);
      }

      const rgb = this.hexToRgb(hex);
      if (!rgb) return null;

      const xyz = this.rgbToXyz(rgb.r, rgb.g, rgb.b);
      const lab = this.xyzToLab(xyz.x, xyz.y, xyz.z);
      const { LAB_COLOR_CACHE_SIZE } = quiltV2Config();

      if (this.colorCache.size < LAB_COLOR_CACHE_SIZE) {
        this.colorCache.set(hex, lab);
      }

      return lab;
    }

    static getColorDistance(color1, color2) {
      const lab1 = this.hexToLab(color1);
      const lab2 = this.hexToLab(color2);

      if (!lab1 || !lab2) return Infinity;

      const dL = lab1.L - lab2.L;
      const da = lab1.a - lab2.a;
      const db = lab1.b - lab2.b;

      return Math.sqrt(dL * dL + da * da + db * db);
    }

    static isColorSimilar(color1, color2) {
      const distance = this.getColorDistance(color1, color2);
      const { COLOR_SIMILARITY_THRESHOLD } = quiltV2Config();
      return distance <= COLOR_SIMILARITY_THRESHOLD;
    }

    static getColorFamilyName(hexColor) {
      const rgb = this.hexToRgb(hexColor);
      if (!rgb) return 'unknown';

      const { r, g, b } = rgb;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;

      if (delta === 0) return 'gray';

      let hue;
      if (max === r) {
        hue = ((g - b) / delta) % 6;
      } else if (max === g) {
        hue = (b - r) / delta + 2;
      } else {
        hue = (r - g) / delta + 4;
      }

      hue = Math.round(hue * 60);
      if (hue < 0) hue += 360;

      if (hue >= 0 && hue < 30) return 'red';
      if (hue >= 30 && hue < 60) return 'orange';
      if (hue >= 60 && hue < 90) return 'yellow';
      if (hue >= 90 && hue < 150) return 'green';
      if (hue >= 150 && hue < 210) return 'cyan';
      if (hue >= 210 && hue < 270) return 'blue';
      if (hue >= 270 && hue < 330) return 'purple';
      return 'pink';
    }
  }

  root.ColorUtilsV2 = ColorUtilsV2;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
