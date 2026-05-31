/**
 * Pure date/color helpers shared across the app module.
 * Loaded before the main app module; exposes globalThis.UtilsCore.
 */
(function (root) {
  'use strict';

  class UtilsCore {
    static validateHexColor(color) {
      const hexRegex = /^#[0-9A-F]{6}$/i;
      return hexRegex.test(color);
    }

    static getAppDateKeyForDate(date) {
      // Map any Date to the app-day key using the same UTC + 7am cutoff as the quote service.
      const source = date instanceof Date ? date : new Date(date);
      if (!source || Number.isNaN(source.getTime())) return '';
      const adjustedDate = new Date(source);
      if (source.getUTCHours() < 7) {
        adjustedDate.setUTCDate(adjustedDate.getUTCDate() - 1);
      }
      const year = adjustedDate.getUTCFullYear();
      const month = String(adjustedDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(adjustedDate.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    static getTodayKey() {
      return UtilsCore.getAppDateKeyForDate(new Date());
    }

    static formatDate(date = new Date()) {
      return date.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  root.UtilsCore = UtilsCore;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
