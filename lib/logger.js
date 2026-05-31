/**
 * ODQ debug logger. Loaded before the main app module; exposes globalThis.Logger.
 */
(function (root) {
  'use strict';

  class Logger {
    constructor(debugMode = false) {
      this.debugMode = debugMode;
      this.prefix = '🧵';
    }

    log(message, data = null) {
      if (this.debugMode) {
        console.log(`${this.prefix} ${message}`, data || '');
      }
    }

    warn(message, data = null) {
      if (this.debugMode) {
        console.warn(`${this.prefix} ⚠️ ${message}`, data || '');
      }
    }

    error(message, error = null) {
      console.error(`${this.prefix} ❌ ${message}`, error || '');
    }
  }

  root.Logger = Logger;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
