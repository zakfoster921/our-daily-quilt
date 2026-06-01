/**
 * Utility Functions
 * Common helper functions used throughout the application
 */

import { CONFIG } from './config.js';

/**
 * Debounce function to limit the rate of function calls
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
}

/**
 * Converts HSL color values to hexadecimal format
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {string} Hexadecimal color string
 */
export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Validates if a string is a valid hex color
 * @param {string} color - Color string to validate
 * @returns {boolean} True if valid hex color
 */
export function validateHexColor(color) {
  const hexRegex = /^#[0-9A-F]{6}$/i;
  return hexRegex.test(color);
}

/**
 * Validates HSL color values
 * @param {number} h - Hue value
 * @param {number} s - Saturation value
 * @param {number} l - Lightness value
 * @returns {boolean} True if valid HSL values
 */
export function validateHSL(h, s, l) {
  return h >= 0 && h <= 360 && 
         s >= 0 && s <= 100 && 
         l >= 0 && l <= 100;
}

/**
 * Gets today's date in YYYY-MM-DD format
 * @returns {string} Today's date string
 */
export function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Formats date for display
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Shows a toast notification
 * @param {string} message - Message to display
 * @param {number} duration - Duration in milliseconds
 */
export function showToast(message, duration = CONFIG.APP.toastDuration) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

/**
 * Shows loading indicator
 * @param {boolean} show - Whether to show or hide loading
 */
export function showLoading(show = true) {
  const loading = document.getElementById('loading');
  if (!loading) return;

  if (show) {
    loading.classList.add('show');
  } else {
    loading.classList.remove('show');
  }
}

/**
 * Handles errors gracefully with user feedback
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 */
export function handleError(error, context = 'Unknown') {
  console.error(`Error in ${context}:`, error);
  
  // User-friendly error messages
  const errorMessages = {
    'loadQuilt': 'Failed to load quilt data. Starting fresh.',
    'saveQuilt': 'Failed to save your color. Please try again.',
    'shareFlow': 'Failed to create share image. Saving instead.',
    'colorPicker': 'Color picker error. Please try again.'
  };
  
  const message = errorMessages[context] || 'Something went wrong. Please try again.';
  showToast(message);
}

/**
 * Throttle function to limit execution rate
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Generates a random number between min and max
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random number
 */
export function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Clamps a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Checks if device supports touch events
 * @returns {boolean} True if touch device
 */
export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Safely adds event listener with error handling
 * @param {Element} element - DOM element
 * @param {string} event - Event type
 * @param {Function} handler - Event handler
 * @param {Object} options - Event options
 */
export function safeAddEventListener(element, event, handler, options = {}) {
  try {
    if (element && typeof element.addEventListener === 'function') {
      element.addEventListener(event, handler, options);
    }
  } catch (error) {
    console.error('Failed to add event listener:', error);
  }
}

/**
 * Removes event listener safely
 * @param {Element} element - DOM element
 * @param {string} event - Event type
 * @param {Function} handler - Event handler
 * @param {Object} options - Event options
 */
export function safeRemoveEventListener(element, event, handler, options = {}) {
  try {
    if (element && typeof element.removeEventListener === 'function') {
      element.removeEventListener(event, handler, options);
    }
  } catch (error) {
    console.error('Failed to remove event listener:', error);
  }
}

/**
 * Checks if element is in viewport
 * @param {Element} element - DOM element
 * @returns {boolean} True if element is visible
 */
export function isInViewport(element) {
  if (!element) return false;
  
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Performs deep clone of an object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}

/**
 * Formats file size in human readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 