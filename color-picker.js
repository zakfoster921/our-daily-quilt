/**
 * Color Picker Module
 * Handles color wheel interaction and color selection
 */

import { CONFIG } from './config.js';
import { 
  hslToHex, 
  validateHSL, 
  debounce, 
  throttle, 
  handleError,
  safeAddEventListener,
  safeRemoveEventListener,
  isTouchDevice
} from './utils.js';

export class ColorPicker {
  constructor() {
    this.canvas = null;
    this.indicator = null;
    this.preview = null;
    this.valueSlider = null;
    this.selectedHue = CONFIG.COLOR_PICKER.defaultHue;
    this.selectedLightness = CONFIG.COLOR_PICKER.defaultLightness;
    this.isInitialized = false;
    this.isDragging = false;
    
    // Debounced and throttled event handlers
    this.debouncedUpdatePreview = debounce(this.updatePreview.bind(this), 16);
    this.throttledSetHue = throttle(this.setHueFromCoords.bind(this), 16);
  }

  /**
   * Initialize the color picker
   */
  initialize() {
    try {
      this.canvas = document.getElementById('colorWheelCanvas');
      this.indicator = document.getElementById('colorIndicator');
      this.preview = document.getElementById('selectedColorPreview');
      this.valueSlider = document.getElementById('valueSlider');

      if (!this.canvas || !this.indicator || !this.preview || !this.valueSlider) {
        throw new Error('Required color picker elements not found');
      }

      this.setupEventListeners();
      this.drawColorWheel();
      this.updatePreview();
      this.isInitialized = true;

      console.log('ColorPicker initialized successfully');
    } catch (error) {
      handleError(error, 'ColorPicker.initialize');
      throw error;
    }
  }

  /**
   * Set up event listeners for the color picker
   */
  setupEventListeners() {
    // Mouse events
    safeAddEventListener(this.canvas, 'mousedown', this.handleMouseDown.bind(this));
    safeAddEventListener(document, 'mousemove', this.handleMouseMove.bind(this));
    safeAddEventListener(document, 'mouseup', this.handleMouseUp.bind(this));
    
    // Touch events for mobile
    if (isTouchDevice()) {
      safeAddEventListener(this.canvas, 'touchstart', this.handleTouchStart.bind(this), { passive: false });
      safeAddEventListener(this.canvas, 'touchmove', this.handleTouchMove.bind(this), { passive: false });
      safeAddEventListener(this.canvas, 'touchend', this.handleTouchEnd.bind(this));
    }

    // Click event for immediate selection
    safeAddEventListener(this.canvas, 'click', this.handleClick.bind(this));

    // Keyboard navigation
    safeAddEventListener(this.canvas, 'keydown', this.handleKeyDown.bind(this));

    // Value slider
    safeAddEventListener(this.valueSlider, 'input', this.handleSliderInput.bind(this));

    // Focus management for accessibility
    safeAddEventListener(this.canvas, 'focus', this.handleFocus.bind(this));
    safeAddEventListener(this.canvas, 'blur', this.handleBlur.bind(this));
  }

  /**
   * Draw the color wheel on the canvas
   */
  drawColorWheel() {
    try {
      const ctx = this.canvas.getContext('2d');
      const radius = this.canvas.width / 2;
      const toRad = Math.PI / 180;

      // Clear canvas
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw color wheel
      for (let angle = 0; angle < 360; angle++) {
        ctx.beginPath();
        ctx.moveTo(radius, radius);
        ctx.arc(radius, radius, radius, angle * toRad, (angle + 1) * toRad);
        ctx.closePath();
        ctx.fillStyle = `hsl(${angle}, ${CONFIG.COLOR_PICKER.saturation}%, 50%)`;
        ctx.fill();
      }

      // Update indicator position
      this.updateIndicatorPosition();
    } catch (error) {
      handleError(error, 'ColorPicker.drawColorWheel');
    }
  }

  /**
   * Update the color preview and slider
   */
  updatePreview() {
    try {
      if (!validateHSL(this.selectedHue, CONFIG.COLOR_PICKER.saturation, this.selectedLightness)) {
        console.warn('Invalid HSL values:', { h: this.selectedHue, s: CONFIG.COLOR_PICKER.saturation, l: this.selectedLightness });
        return;
      }

      const hslColor = `hsl(${this.selectedHue}, ${CONFIG.COLOR_PICKER.saturation}%, ${this.selectedLightness}%)`;
      
      if (this.preview) {
        this.preview.style.backgroundColor = hslColor;
      }
      
      if (this.valueSlider) {
        this.valueSlider.style.background = `linear-gradient(to right,
          hsl(${this.selectedHue}, ${CONFIG.COLOR_PICKER.saturation}%, 20%), 
          hsl(${this.selectedHue}, ${CONFIG.COLOR_PICKER.saturation}%, 90%))`;
      }
    } catch (error) {
      handleError(error, 'ColorPicker.updatePreview');
    }
  }

  /**
   * Set hue from coordinates
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  setHueFromCoords(x, y) {
    try {
      const rect = this.canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radius = rect.width / 2;

      // Check if click is within the color wheel
      if (distance > radius) {
        return;
      }

      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;
      
      this.selectedHue = Math.round(angle);
      
      // Update indicator position
      this.indicator.style.left = `${x}px`;
      this.indicator.style.top = `${y}px`;
      
      this.updatePreview();
    } catch (error) {
      handleError(error, 'ColorPicker.setHueFromCoords');
    }
  }

  /**
   * Update indicator position based on current hue
   */
  updateIndicatorPosition() {
    try {
      const rect = this.canvas.getBoundingClientRect();
      const radius = rect.width / 2;
      const angle = this.selectedHue * Math.PI / 180;
      
      const x = rect.left + radius + Math.cos(angle) * radius * 0.8;
      const y = rect.top + radius + Math.sin(angle) * radius * 0.8;
      
      this.indicator.style.left = `${x}px`;
      this.indicator.style.top = `${y}px`;
    } catch (error) {
      handleError(error, 'ColorPicker.updateIndicatorPosition');
    }
  }

  /**
   * Get the currently selected color in hex format
   * @returns {string} Hex color string
   */
  getSelectedColor() {
    return hslToHex(this.selectedHue, CONFIG.COLOR_PICKER.saturation, this.selectedLightness);
  }

  /**
   * Set the selected color from hex
   * @param {string} hexColor - Hex color string
   */
  setSelectedColor(hexColor) {
    // This would require hex to HSL conversion
    // For now, we'll just update the preview
    if (this.preview) {
      this.preview.style.backgroundColor = hexColor;
    }
  }

  // Event Handlers

  handleMouseDown(event) {
    this.isDragging = true;
    this.setHueFromCoords(event.clientX, event.clientY);
  }

  handleMouseMove(event) {
    if (this.isDragging) {
      this.throttledSetHue(event.clientX, event.clientY);
    }
  }

  handleMouseUp() {
    this.isDragging = false;
  }

  handleTouchStart(event) {
    event.preventDefault();
    this.isDragging = true;
    const touch = event.touches[0];
    this.setHueFromCoords(touch.clientX, touch.clientY);
  }

  handleTouchMove(event) {
    event.preventDefault();
    if (this.isDragging) {
      const touch = event.touches[0];
      this.throttledSetHue(touch.clientX, touch.clientY);
    }
  }

  handleTouchEnd() {
    this.isDragging = false;
  }

  handleClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.setHueFromCoords(x, y);
  }

  handleKeyDown(event) {
    const step = 15; // 15 degrees per key press
    
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.selectedHue = (this.selectedHue - step + 360) % 360;
        this.updateIndicatorPosition();
        this.updatePreview();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.selectedHue = (this.selectedHue + step) % 360;
        this.updateIndicatorPosition();
        this.updatePreview();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedLightness = Math.min(100, this.selectedLightness + 5);
        this.valueSlider.value = this.selectedLightness;
        this.updatePreview();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.selectedLightness = Math.max(0, this.selectedLightness - 5);
        this.valueSlider.value = this.selectedLightness;
        this.updatePreview();
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.handleClick(event);
        break;
    }
  }

  handleSliderInput(event) {
    this.selectedLightness = Number(event.target.value);
    this.updatePreview();
  }

  handleFocus() {
    this.canvas.style.outline = '2px solid #000';
    this.canvas.style.outlineOffset = '4px';
  }

  handleBlur() {
    this.canvas.style.outline = '';
    this.canvas.style.outlineOffset = '';
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    safeRemoveEventListener(this.canvas, 'mousedown', this.handleMouseDown.bind(this));
    safeRemoveEventListener(document, 'mousemove', this.handleMouseMove.bind(this));
    safeRemoveEventListener(document, 'mouseup', this.handleMouseUp.bind(this));
    
    if (isTouchDevice()) {
      safeRemoveEventListener(this.canvas, 'touchstart', this.handleTouchStart.bind(this));
      safeRemoveEventListener(this.canvas, 'touchmove', this.handleTouchMove.bind(this));
      safeRemoveEventListener(this.canvas, 'touchend', this.handleTouchEnd.bind(this));
    }
    
    safeRemoveEventListener(this.canvas, 'click', this.handleClick.bind(this));
    safeRemoveEventListener(this.canvas, 'keydown', this.handleKeyDown.bind(this));
    safeRemoveEventListener(this.canvas, 'focus', this.handleFocus.bind(this));
    safeRemoveEventListener(this.canvas, 'blur', this.handleBlur.bind(this));
    safeRemoveEventListener(this.valueSlider, 'input', this.handleSliderInput.bind(this));
  }
} 