/**
 * ODQ user-facing error toasts. Loaded before the main app module; exposes globalThis.ErrorHandler.
 */
(function (root) {
  'use strict';

  class ErrorHandler {
    constructor(uiService, logger) {
      this.uiService = uiService;
      this.logger = logger;
    }

    handleError(error, context = 'Unknown') {
      // Web Share API and other user gestures reject with AbortError when the user dismisses the sheet — not an app failure.
      if (error && error.name === 'AbortError') return;

      this.logger.error(`Error in ${context}:`, error);

      const silentToastContexts = new Set(['shareFlow', 'shareFlowExperimental', 'testInstagramImage']);
      if (silentToastContexts.has(context)) return;

      const errorMessages = {
        loadQuilt: 'Failed to load quilt data. Starting fresh.',
        saveQuilt: 'Failed to save your color. Please try again.',
        shareFlow: 'Failed to create share image. Saving instead.',
        colorPicker: 'Color picker error. Please try again.',
        'App initialization': 'Failed to initialize app. Please refresh.',
        renderQuilt: 'Failed to render quilt. Please try again.',
        addColorToQuilt: 'Failed to add color. Please try again.',
        handleAddColor: 'Could not place your color. Try again, or close and reopen the app.',
        syntheticReel: 'Could not export synthetic reel. Try Chrome on desktop.'
      };

      const message = errorMessages[context] || 'Something went wrong. Please try again.';
      this.uiService.showToast(message);
    }

    validateColor(color) {
      const hexRegex = /^#[0-9A-F]{6}$/i;
      if (!hexRegex.test(color)) {
        throw new Error(`Invalid color format: ${color}`);
      }
      return true;
    }
  }

  root.ErrorHandler = ErrorHandler;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
