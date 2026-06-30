/**
 * SimplifiedQuiltAppV2 quote UI slice: submission, color picker, quote-screen layout, portal→quote timers (Phase C7).
 * Methods merged onto SimplifiedQuiltAppV2.prototype in the main app module.
 */
(function (root) {
  'use strict';

  class SimplifiedQuiltAppV2QuoteUi {
      saveQuoteSubmissionLocally(payload) {
        try {
          const storageKey = 'ourDailyQuoteSubmissions';
          const raw = localStorage.getItem(storageKey);
          const parsed = raw ? JSON.parse(raw) : null;
          const submissions = Array.isArray(parsed?.submissions) ? parsed.submissions : [];
          submissions.push(payload);
          localStorage.setItem(storageKey, JSON.stringify({ submissions }));
        } catch (error) {
          console.warn('Could not save quote submission locally:', error);
        }
      }

      clearQuoteSubmissionReturnTimer() {
        if (this._quoteSubmissionReturnTimer) {
          clearTimeout(this._quoteSubmissionReturnTimer);
          this._quoteSubmissionReturnTimer = null;
        }
      }

      scheduleQuoteSubmissionReturnToQuilt(delayMs = 1000) {
        this.clearQuoteSubmissionReturnTimer();
        this._quoteSubmissionReturnTimer = setTimeout(() => {
          this._quoteSubmissionReturnTimer = null;
          const quoteSubmissionScreen = document.getElementById('screen-quote-submission');
          if (!quoteSubmissionScreen?.classList.contains('active')) return;
          this.uiService.showScreen('screen-quilt');
        }, delayMs);
      }

      normalizeSubmittedQuoteText(value) {
        return String(value || '')
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .map((line) => line.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join('\n')
          .replace(/["“”„‟«»]/g, '')
          .trim();
      }

      normalizeSubmittedAuthorName(value) {
        const raw = String(value || '')
          .replace(/^[\s—–-]+/, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!raw) return '';
        return raw.replace(/(^|[\s\-'.])([A-Za-zÀ-ÖØ-öø-ÿ])([A-Za-zÀ-ÖØ-öø-ÿ]*)/g, (match, prefix, first, rest) => {
          const normalizedRest =
            rest && (rest === rest.toLowerCase() || rest === rest.toUpperCase())
              ? rest.toLowerCase()
              : rest;
          return `${prefix}${first.toLocaleUpperCase()}${normalizedRest}`;
        });
      }

      async handleQuoteSubmission(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const quoteInput = document.getElementById('quoteSubmissionText');
        const authorInput = document.getElementById('quoteSubmissionAuthor');
        const nameInput = document.getElementById('quoteSubmissionName');
        const submitBtn = document.getElementById('quoteSubmissionSubmitBtn');
        const status = document.getElementById('quoteSubmissionStatus');

        const quoteText = this.normalizeSubmittedQuoteText(quoteInput?.value);
        const author = this.normalizeSubmittedAuthorName(authorInput?.value);
        const submitterName = String(nameInput?.value || '').trim();

        if (!quoteText || !author) {
          if (status) status.textContent = 'Please add both the quote and author.';
          return;
        }
        if (quoteInput) quoteInput.value = quoteText;
        if (authorInput) authorInput.value = author;

        const todayQuote = this.quoteService?.getTodayQuote?.() || null;
        const payload = {
          text: quoteText,
          quote: quoteText,
          author,
          submitterName,
          userId: this.currentUserId || Utils.getOrCreateUserId(),
          submittedAt: new Date().toISOString(),
          status: 'new',
          source: 'in_app',
          appDateKey: Utils.getTodayKey(),
          currentQuoteText: String(todayQuote?.text || '').slice(0, 220),
          currentQuoteAuthor: String(todayQuote?.author || '').slice(0, 160)
        };

        if (submitBtn) submitBtn.disabled = true;
        if (status) status.textContent = 'Sending...';

        let savedToBackend = false;
        let backendResult = null;
        try {
          const baseUrl = String(CONFIG.BACKEND?.baseUrl || '').replace(/\/$/, '');
          if (!baseUrl) throw new Error('CONFIG.BACKEND.baseUrl is not set');
          const res = await fetch(`${baseUrl}/api/quote-submission`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          backendResult = await res.json().catch(() => null);
          if (!res.ok || !backendResult?.success) {
            throw new Error(backendResult?.error || `Submission failed (${res.status})`);
          }
          savedToBackend = true;
        } catch (error) {
          console.warn('Quote submission backend save failed:', error);
        }

        this.saveQuoteSubmissionLocally({ ...payload, savedToBackend, backendResult });

        if (savedToBackend) {
          if (status) status.textContent = 'Thank you. Your quote was sent for review. Returning to the quilt...';
          form.reset();
          this.scheduleQuoteSubmissionReturnToQuilt(1000);
        } else {
          if (status) {
            status.textContent = 'Saved on this device, but it could not be sent yet. Please try again when you are online.';
          }
        }

        if (submitBtn) submitBtn.disabled = false;
      }


      _resolveThreeSliderPickerMode() {
        try {
          const params = new URLSearchParams(window.location.search);
          if (params.get('picker') === 'wheel') return false;
          if (params.get('picker') === '3slider') return true;
        } catch (_) {
          /* */
        }
        return !!CONFIG.APP.useThreeSliderPicker;
      }

      useThreeSliderPicker() {
        if (this._useThreeSliderPicker == null) {
          this._useThreeSliderPicker = this._resolveThreeSliderPickerMode();
        }
        return this._useThreeSliderPicker;
      }

      _pickerDefaultSaturation() {
        const n = Number(CONFIG.COLOR_PICKER?.hueBarSaturation);
        return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50;
      }

      /** Hue bar shows a vivid rainbow; not the low-sat daily swatch hint. */
      _hueSliderDisplaySV() {
        const s = this._pickerDefaultSaturation();
        const vRaw = Number(this.selectedLightness);
        const v = Number.isFinite(vRaw) ? Math.max(75, Math.min(90, Math.round(vRaw))) : 90;
        return { s, v };
      }

      applyQuotePickerModeUI() {
        const quoteScreen = document.getElementById('screen-quote');
        const three = this.useThreeSliderPicker();
        if (quoteScreen) {
          quoteScreen.classList.toggle('quote-picker-three-slider', three);
          quoteScreen.classList.toggle('quote-picker-wheel', !three);
        }
        const slidersEl = document.querySelector('.color-picker-container--sliders');
        const wheelEl = document.querySelector('.color-picker-container--wheel');
        if (slidersEl) {
          slidersEl.hidden = !three;
          slidersEl.setAttribute('aria-hidden', three ? 'false' : 'true');
        }
        if (wheelEl) {
          wheelEl.hidden = three;
          wheelEl.setAttribute('aria-hidden', three ? 'true' : 'false');
        }
      }

      _getActiveValueSlider() {
        if (this.useThreeSliderPicker()) {
          return document.getElementById('valueSlider');
        }
        return document.getElementById('wheelValueSlider');
      }

      setupColorPicker() {
        this.applyQuotePickerModeUI();

        if (this.useThreeSliderPicker()) {
          const hueSlider = document.getElementById('hueSlider');
          const satSlider = document.getElementById('satSlider');
          const valueSlider = document.getElementById('valueSlider');
          if (hueSlider) {
            hueSlider.addEventListener('input', this.handleHueSliderChange.bind(this));
          }
          if (satSlider) {
            satSlider.addEventListener('input', this.handleSatSliderChange.bind(this));
          }
          if (valueSlider) {
            valueSlider.addEventListener('input', this.handleValueSliderChange.bind(this));
          }
        } else {
          const colorWheel = document.getElementById('colorWheelCanvas');
          const valueSlider = document.getElementById('wheelValueSlider');

          if (colorWheel) {
            if (window.PointerEvent) {
              colorWheel.addEventListener('pointerdown', this.handleColorWheelPointerDown.bind(this));
              colorWheel.addEventListener('pointermove', this.handleColorWheelPointerMove.bind(this));
              colorWheel.addEventListener('pointerup', this.handleColorWheelPointerUp.bind(this));
              colorWheel.addEventListener('pointercancel', this.handleColorWheelPointerUp.bind(this));
            } else {
              colorWheel.addEventListener('mousedown', this.handleColorWheelMouseDown.bind(this));
              colorWheel.addEventListener('mousemove', this.handleColorWheelMouseMove.bind(this));
              colorWheel.addEventListener('mouseup', this.handleColorWheelMouseUp.bind(this));

              colorWheel.addEventListener('touchstart', this.handleColorWheelTouchStart.bind(this), { passive: false });
              colorWheel.addEventListener('touchmove', this.handleColorWheelTouchMove.bind(this), { passive: false });
              colorWheel.addEventListener('touchend', this.handleColorWheelTouchEnd.bind(this), { passive: false });
              colorWheel.addEventListener('click', this.handleColorWheelClick.bind(this));
            }

            colorWheel.addEventListener('keydown', this.handleColorWheelKeyDown.bind(this));
          }

          if (valueSlider) {
            valueSlider.addEventListener('input', this.handleValueSliderChange.bind(this));
          }
        }

        this.updateColorPickerUI();
      }

      handleColorWheelPointerDown(e) {
        if (e.isPrimary === false) return;
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch (_) {
          /* Pointer capture is best-effort for older embedded browsers. */
        }
        this.setHueFromCoords(e.clientX, e.clientY);
      }

      handleColorWheelPointerMove(e) {
        if (!this.isDragging || e.isPrimary === false) return;
        e.preventDefault();
        this.setHueFromCoords(e.clientX, e.clientY);
      }

      handleColorWheelPointerUp(e) {
        if (e.isPrimary === false) return;
        this.isDragging = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (_) {
          /* ignore */
        }
      }

      handleColorWheelMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
        this.setHueFromCoords(e.clientX, e.clientY);
      }

      handleColorWheelMouseMove(e) {
        if (this.isDragging) {
          e.preventDefault();
          this.setHueFromCoords(e.clientX, e.clientY);
        }
      }

      handleColorWheelMouseUp(e) {
        this.isDragging = false;
      }

      handleColorWheelClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.setHueFromCoords(e.clientX, e.clientY);
        this.updateColorPickerUI();
      }

      handleColorWheelTouchStart(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
        const touch = e.touches[0];
        this.setHueFromCoords(touch.clientX, touch.clientY);
      }

      handleColorWheelTouchMove(e) {
        if (this.isDragging) {
          e.preventDefault();
          const touch = e.touches[0];
          this.setHueFromCoords(touch.clientX, touch.clientY);
        }
      }

      handleColorWheelTouchEnd(e) {
        this.isDragging = false;
      }

      handleColorWheelKeyDown(e) {
        const step = 15;
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            this.selectedHue = (this.selectedHue - step + 360) % 360;
            this.updateColorPickerUI();
            break;
          case 'ArrowRight':
            e.preventDefault();
            this.selectedHue = (this.selectedHue + step) % 360;
            this.updateColorPickerUI();
            break;
          case 'ArrowUp':
            e.preventDefault();
            this.selectedLightness = Math.min(90, this.selectedLightness + 5);
            this.updateColorPickerUI();
            break;
          case 'ArrowDown':
            e.preventDefault();
            this.selectedLightness = Math.max(25, this.selectedLightness - 5);
            this.updateColorPickerUI();
            break;
        }
      }

      handleHueSliderChange(e) {
        this.selectedHue = parseInt(e.target.value, 10);
        if (!this._userExplicitSatPick && this.selectedSaturation < this._pickerDefaultSaturation()) {
          this.selectedSaturation = this._pickerDefaultSaturation();
        }
        this.colorHasBeenSelected = true;
        this.updateColorPickerUI();
      }

      handleSatSliderChange(e) {
        this._userExplicitSatPick = true;
        this.selectedSaturation = parseInt(e.target.value, 10);
        this.colorHasBeenSelected = true;
        this.updateColorPickerUI();
      }

      handleValueSliderChange(e) {
        this.selectedLightness = parseInt(e.target.value, 10);
        this.colorHasBeenSelected = true;
        this.updateColorPickerUI();
      }

      renderHueSlider() {
        const el = document.getElementById('hueSlider');
        if (!el) return;
        const disp = this._hueSliderDisplaySV();
        const stops = Array.from({ length: 13 }, (_, i) =>
          Utils.hsvToHex((i / 12) * 360, disp.s, disp.v)
        );
        el.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
      }

      renderSatSlider() {
        const el = document.getElementById('satSlider');
        if (!el) return;
        el.style.background = `linear-gradient(to right, ${Utils.hsvToHex(this.selectedHue, 0, this.selectedLightness)}, ${Utils.hsvToHex(this.selectedHue, 100, this.selectedLightness)})`;
      }

      renderValueSlider() {
        const el = this._getActiveValueSlider();
        if (!el) return;
        const vMin = parseInt(el.getAttribute('min') || '25', 10);
        const vMax = parseInt(el.getAttribute('max') || '90', 10);
        el.style.background = `linear-gradient(to right,
          ${Utils.hsvToHex(this.selectedHue, this.selectedSaturation, vMin)},
          ${Utils.hsvToHex(this.selectedHue, this.selectedSaturation, vMax)})`;
      }

      updateColorPickerUI() {
        const valueSlider = this._getActiveValueSlider();
        const hexColor = Utils.hsvToHex(this.selectedHue, this.selectedSaturation, this.selectedLightness);
        const quoteScreen = document.getElementById('screen-quote');

        if (quoteScreen && this.colorHasBeenSelected && this.isColorPickerActive()) {
          quoteScreen.style.backgroundColor = hexColor;
          document.documentElement.style.setProperty('--current-color', hexColor);
        }

        if (this.colorHasBeenSelected && hexColor && Utils.validateHexColor(hexColor) && this.isColorPickerActive()) {
          if (window.ODQ_onColorChange) {
            window.ODQ_onColorChange(hexColor);
          }
          this.applyQuiltMoodTriptychPalette?.();
        }

        if (this.useThreeSliderPicker()) {
          const hueSlider = document.getElementById('hueSlider');
          const satSlider = document.getElementById('satSlider');
          if (hueSlider) hueSlider.value = String(Math.round(this.selectedHue));
          if (satSlider) satSlider.value = String(Math.round(this.selectedSaturation));
          if (valueSlider) valueSlider.value = String(Math.round(this.selectedLightness));
          this.renderHueSlider();
          this.renderSatSlider();
          this.renderValueSlider();
          return;
        }

        if (valueSlider) {
          valueSlider.value = String(Math.round(this.selectedLightness));
          this.renderValueSlider();
        }

        const wEl = document.getElementById('colorWheelCanvas');
        const wheelKey = wEl
          ? `${Math.round(wEl.clientWidth)}x${Math.round(wEl.clientHeight)}|${Math.min(3, window.devicePixelRatio || 1)}`
          : '';
        if (wheelKey !== this._hsvWheelCanvasKey) {
          this._renderHsvWheelCanvas();
          this._hsvWheelCanvasKey = wheelKey;
        }
      }

      updateColorWheel() {
        this.updateColorPickerUI();
      }

      /** HSV disk at V=100 so hue/saturation stay vivid; selected brightness comes from the slider only. */
      _renderHsvWheelCanvas() {
        const wheel = document.getElementById('colorWheelCanvas');
        if (!wheel || wheel.tagName !== 'CANVAS') return;
        const ctx = wheel.getContext('2d', { alpha: true });
        const cssW = Math.max(1, wheel.clientWidth || 1);
        const cssH = Math.max(1, wheel.clientHeight || 1);
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        const W = Math.max(1, Math.round(cssW * dpr));
        const H = Math.max(1, Math.round(cssH * dpr));
        if (wheel.width !== W || wheel.height !== H) {
          wheel.width = W;
          wheel.height = H;
        }
        const R = Math.min(W, H) / 2 - 0.5;
        const cx = W / 2;
        const cy = H / 2;
        const V = 100;
        const img = ctx.createImageData(W, H);
        const d = img.data;
        for (let py = 0; py < H; py++) {
          for (let px = 0; px < W; px++) {
            const idx = (py * W + px) * 4;
            const udx = (px + 0.5 - cx) / R;
            const udy = (py + 0.5 - cy) / R;
            const dist = Math.hypot(udx, udy);
            if (dist > 1) {
              d[idx] = 0;
              d[idx + 1] = 0;
              d[idx + 2] = 0;
              d[idx + 3] = 0;
              continue;
            }
            let Hdeg = Math.atan2(-udy, udx) * 180 / Math.PI;
            if (Hdeg < 0) Hdeg += 360;
            const S = dist * 100;
            Utils.writeHsvRgbBytes(Hdeg, S, V, d, idx);
            d[idx + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      }

      setHueFromCoords(x, y) {
        const colorWheel = document.getElementById('colorWheelCanvas');
        const indicator = document.getElementById('colorIndicator');
        const valueSlider = document.getElementById('valueSlider');
        if (!colorWheel) return;
        const rect = colorWheel.getBoundingClientRect();
        const radiusPx = Math.min(rect.width, rect.height) / 2;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const udx = (x - centerX) / radiusPx;
        const udy = (y - centerY) / radiusPx;
        const distNorm = Math.hypot(udx, udy);

        let angleDeg = Math.atan2(-udy, udx) * 180 / Math.PI;
        if (angleDeg < 0) angleDeg += 360;
        this.selectedHue = Math.round(angleDeg);
        this.selectedSaturation = Math.round(Math.min(1, distNorm) * 100);
        this._userExplicitSatPick = true;

        if (distNorm > 1) {
          this.selectedSaturation = 100;
          const inv = 1 / distNorm;
          const cudx = udx * inv;
          const cudy = udy * inv;
          const clampedX = centerX + cudx * radiusPx;
          const clampedY = centerY + cudy * radiusPx;
          if (indicator) {
            indicator.style.left = `${clampedX - rect.left}px`;
            indicator.style.top = `${clampedY - rect.top}px`;
          }
        } else {
          if (indicator) {
            indicator.style.left = `${x - rect.left}px`;
            indicator.style.top = `${y - rect.top}px`;
          }
        }

        // Match the first wheel pick to the visible slider value (fixes lighter-than-picked tint).
        if (!this.colorHasBeenSelected && valueSlider) {
          const sliderLightness = parseInt(valueSlider.value, 10);
          if (!Number.isNaN(sliderLightness)) {
            this.selectedLightness = sliderLightness;
          }
        }

        this.colorHasBeenSelected = true;
        this.updateColorWheel();
      }


      clearPortalToQuoteIntroTimer() {
        if (this._portalToQuoteTimer) {
          clearTimeout(this._portalToQuoteTimer);
          this._portalToQuoteTimer = null;
        }
        this._clearPortalJoinLineWatchdog();
        this._blockPortalScrollNav = false;
      }

      clearNameThanksAdvanceTimer() {
        this.clearIntroPersonaAdvanceTimer();
      }

      clearIntroPersonaAdvanceTimer() {
        if (this._introPersonaAdvanceTimer) {
          clearTimeout(this._introPersonaAdvanceTimer);
          this._introPersonaAdvanceTimer = null;
        }
      }

      /** Zak → mission → welcome → quote bridge (first visit or one-time returning-user intro). */
      beginIntroPersonaSequence() {
        Utils.refreshPortalGreeting();
        const nameEl = document.getElementById('introZakName');
        if (nameEl) nameEl.textContent = Utils.getNameThanksDisplayName();
        this.clearIntroPersonaAdvanceTimer();
        this.uiService.showScreen('screen-intro-zak');
      }

      /** Tap-to-advance between intro persona screens (Zak → mission → welcome). */
      advanceIntroPersonaTo(targetScreenId, fromScreenId) {
        this.clearIntroPersonaAdvanceTimer();
        const fromEl = document.getElementById(fromScreenId);
        if (!fromEl?.classList?.contains('active')) return;
        if (this.uiService?._flowTransitioning) return;
        this.uiService.showScreen(targetScreenId);
      }

      clearFirstQuoteBridgeTimer() {
        if (this._firstQuoteBridgeTimer) {
          clearTimeout(this._firstQuoteBridgeTimer);
          this._firstQuoteBridgeTimer = null;
        }
      }

      /** After the quote bridge line appears, fade it out before crossfading to the quote screen. */
      scheduleFirstQuoteBridgeAdvance(delayMs = 1200) {
        this.clearFirstQuoteBridgeTimer();
        const line = document.getElementById('firstQuoteBridgeLine');
        if (line) {
          line.classList.remove('is-visible');
          requestAnimationFrame(() => {
            requestAnimationFrame(() => line.classList.add('is-visible'));
          });
        }
        const ms = Math.max(0, delayMs);
        this._firstQuoteBridgeTimer = setTimeout(() => {
          if (line) line.classList.remove('is-visible');
          this._firstQuoteBridgeTimer = setTimeout(() => {
            this._firstQuoteBridgeTimer = null;
            this.uiService.showScreen('screen-quote');
          }, 720);
        }, ms);
      }

      /**
       * When there is no stored first name (including before onboarding), portal gestures go to
       * the first-name step instead of the quote screen. Skip is stored as `Friend` in the name key.
       */
      portalGestureNextScreenId() {
        try {
          if (Utils.needsFirstNamePrompt()) return 'screen-first-name';
        } catch (_) {
          /* */
        }
        return 'screen-quote';
      }

      isColorPickerActive() {
        const quoteScreen = document.getElementById('screen-quote');
        const pane = document.getElementById('quoteColorPickerPane');
        return !!(
          quoteScreen?.classList.contains('active') &&
          pane?.classList.contains('quote-color-picker--revealed') &&
          (quoteScreen?.classList.contains('quote-picker-revealed') ||
            quoteScreen?.classList.contains('quote-has-color-picker'))
        );
      }

      _getQuoteStageElements() {
        return {
          quoteScreen: document.getElementById('screen-quote'),
          clip:
            document.querySelector('#screen-quote .quote-stage-clip') ||
            document.querySelector('#screen-quote .quote-color-combined'),
          quoteLayer:
            document.getElementById('quoteStageQuote') ||
            document.querySelector('#screen-quote .quote-stage-quote'),
          picker: document.getElementById('quoteColorPickerPane')
        };
      }

      _refreshQuoteScreenIfActive() {
        if (document.querySelector('.screen.active')?.id !== 'screen-quote') return;
        if (!this.isColorPickerActive()) {
          this.applyQuoteScreenInitialRestLayout();
        }
        this.quoteService?.primeTodayQuoteFromLocalAssignment?.();
        this.quoteService?.displayQuote?.();
      }

      /** Rest: quote in top half; picker hidden in bottom half until reveal. */
      applyQuoteScreenInitialRestLayout() {
        if (document.querySelector('.screen.active')?.id !== 'screen-quote') return;
        const { quoteScreen, picker } = this._getQuoteStageElements();
        if (!quoteScreen) return;

        const pickerVisible = this.isColorPickerActive();
        if (!pickerVisible) {
          quoteScreen.classList.remove('quote-picker-revealed', 'quote-has-color-picker');
          if (picker) {
            picker.classList.remove('quote-color-picker--revealed', 'quote-color-picker--measuring');
            picker.hidden = true;
            picker.setAttribute('aria-hidden', 'true');
          }
          const quoteStage = quoteScreen.querySelector('.quote-stage');
          if (quoteStage) quoteStage.style.maxHeight = '';
        }

        quoteScreen.classList.add('quote-scroll-layout--settled', 'quote-scroll-layout--ready');
      }

      /** After Layout B paints: mark layout ready (quote stays in top half). */
      finalizeQuoteColorScrollLayout() {
        if (document.querySelector('.screen.active')?.id !== 'screen-quote') return;
        const { quoteScreen } = this._getQuoteStageElements();
        if (!quoteScreen) return;
        quoteScreen.classList.add('quote-scroll-layout--settled', 'quote-scroll-layout--ready');
        window.app?.remeasureQuoteScreenClipping?.();
      }

      layoutQuoteColorScrollAtRest() {
        this.applyQuoteScreenInitialRestLayout();
        this.finalizeQuoteColorScrollLayout();
      }

      hideQuoteColorPickerPane() {
        const { quoteScreen, picker } = this._getQuoteStageElements();
        if (picker) {
          picker.classList.remove(
            'quote-color-picker--revealed',
            'quote-color-picker--measuring',
            'quote-color-picker--reveal-pending'
          );
          picker.hidden = true;
          picker.setAttribute('aria-hidden', 'true');
          picker.style.backgroundColor = '';
        }
        if (quoteScreen) {
          quoteScreen.classList.remove(
            'quote-has-color-picker',
            'quote-picker-revealed',
            'quote-scroll-layout--ready',
            'quote-scroll-layout--settled'
          );
          quoteScreen.style.backgroundColor = '';
          const quoteStage = quoteScreen.querySelector('.quote-stage');
          if (quoteStage) quoteStage.style.maxHeight = '';
        }
        document.body.classList.remove('color-mode-active');
        if (this._colorPickerEntryThemeTimer) {
          clearTimeout(this._colorPickerEntryThemeTimer);
          this._colorPickerEntryThemeTimer = null;
        }
      }

      clearQuoteColorPickerSchedule() {
        if (this._quoteColorPickerRevealTimer) {
          clearTimeout(this._quoteColorPickerRevealTimer);
          this._quoteColorPickerRevealTimer = null;
        }
        this._quoteColorPickerRevealWaitingLayoutB = false;
        this.hideQuoteColorPickerPane();
      }

      applyColorPickerEntryTheme() {
        if (this._colorPickerEntryThemeTimer) {
          clearTimeout(this._colorPickerEntryThemeTimer);
          this._colorPickerEntryThemeTimer = null;
        }
        this._colorPickerEntryThemeTimer = setTimeout(() => {
          this._colorPickerEntryThemeTimer = null;
          if (!this.isColorPickerActive()) return;
          if (!this.colorHasBeenSelected) {
            if (window.ODQ_onColorChange) {
              window.ODQ_onColorChange('#f6f4f1', true);
            }
            return;
          }
          const currentColor = Utils.hsvToHex(
            this.selectedHue,
            this.selectedSaturation,
            this.selectedLightness
          );
          if (currentColor && Utils.validateHexColor(currentColor)) {
            if (window.ODQ_onColorChange) {
              window.ODQ_onColorChange(currentColor);
            }
          }
        }, 100);
      }

      revealQuoteColorPickerPane() {
        if (document.querySelector('.screen.active')?.id !== 'screen-quote') return;
        const { quoteScreen, picker } = this._getQuoteStageElements();
        if (!quoteScreen || !picker) return;
        this.applyQuotePickerModeUI();

        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

        picker.hidden = false;
        picker.setAttribute('aria-hidden', 'false');
        picker.classList.remove('quote-color-picker--revealed');
        quoteScreen.classList.remove('quote-has-color-picker');
        void picker.offsetHeight;

        const finishSettled = () => {
          quoteScreen.classList.add('quote-has-color-picker');
        };

        const startFadeIn = () => {
          document.body.classList.add('color-mode-active');
          quoteScreen.classList.add('quote-picker-revealed');
          picker.classList.add('quote-color-picker--revealed');
          // #region agent log
          fetch('http://127.0.0.1:7433/ingest/0ed8adaa-5aed-4571-811f-aadcc7a8fddc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b7972'},body:JSON.stringify({sessionId:'5b7972',runId:'initial',hypothesisId:'B',location:'lib/simplified-quilt-app-quote-ui.js:769',message:'quote picker reveal started',data:{screenClasses:quoteScreen.className||'',pickerClasses:picker.className||'',pickerHidden:!!picker.hidden,imgInlineWidth:document.querySelector('#screen-quote .quote-screen-clipping__image')?.style.width||'',imgInlineHeight:document.querySelector('#screen-quote .quote-screen-clipping__image')?.style.height||''},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          window.app?.remeasureQuoteScreenClipping?.();
          this.applyColorPickerEntryTheme();
          requestAnimationFrame(() => {
            window.app?.remeasureQuoteScreenClipping?.();
            this._hsvWheelCanvasKey = '';
            if (typeof this.updateColorPickerUI === 'function') {
              this.updateColorPickerUI();
            } else if (typeof this.updateColorWheel === 'function') {
              this.updateColorWheel();
            }
          });

          if (reducedMotion) {
            finishSettled();
            return;
          }

          const onDone = (ev) => {
            if (ev.target !== picker || ev.propertyName !== 'opacity') return;
            picker.removeEventListener('transitionend', onDone);
            clearTimeout(fallback);
            finishSettled();
          };
          picker.addEventListener('transitionend', onDone);
          const fallback = setTimeout(finishSettled, 950);
        };

        if (reducedMotion) {
          startFadeIn();
          return;
        }
        requestAnimationFrame(() => requestAnimationFrame(startFadeIn));
      }

      /**
       * Quote in top half; after `readPauseMs` (default 1.5s) color picker fades into bottom half.
       * Waits for the quote clipping image when the quote card is in preview mode so sliders never beat the quote.
       */
      scheduleQuoteColorPickerReveal(readPauseMs = CONFIG.APP.quoteColorPickerRevealMs) {
        this._pendingQuoteColorPickerRevealMs = readPauseMs;
        this._beginQuoteColorPickerRevealCountdown();
      }

      notifyQuoteScreenLayoutBPainted() {
        window.app?.remeasureQuoteScreenClipping?.();
        if (!this._quoteColorPickerRevealWaitingLayoutB) return;
        this._beginQuoteColorPickerRevealCountdown();
      }

      _quoteScreenLayoutBStripsReady() {
        const card = document.querySelector('#screen-quote .quote-card');
        return !!(
          card?.classList.contains('layoutb-preview-card') &&
          window.app?.quoteService?._quoteScreenClippingReady?.(card)
        );
      }

      _beginQuoteColorPickerRevealCountdown() {
        if (this.isColorPickerActive()) return;

        if (this._quoteColorPickerRevealTimer) {
          clearTimeout(this._quoteColorPickerRevealTimer);
          this._quoteColorPickerRevealTimer = null;
        }
        if (document.querySelector('.screen.active')?.id === 'screen-quote') {
          this.hideQuoteColorPickerPane();
        }

        if (!this._quoteScreenLayoutBStripsReady()) {
          this._quoteColorPickerRevealWaitingLayoutB = true;
          return;
        }
        this._quoteColorPickerRevealWaitingLayoutB = false;

        const reveal = () => {
          if (document.querySelector('.screen.active')?.id !== 'screen-quote') return;
          this.revealQuoteColorPickerPane();
        };

        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
          reveal();
          return;
        }

        const wait = Math.max(0, this._pendingQuoteColorPickerRevealMs ?? CONFIG.APP.quoteColorPickerRevealMs);
        this._quoteColorPickerRevealTimer = setTimeout(() => {
          this._quoteColorPickerRevealTimer = null;
          reveal();
        }, wait);
      }

      /**
       * Hold `holdBeforeFadeMs` (default 1s) on portal from the moment this runs, then advance:
       * first-time visitors → `autoTransitionFromPortal()` (name → thanks → how it works → quote), others → quote.
       * Call after the join line has settled (counter visible). Respects prefers-reduced-motion.
       */
      schedulePortalToQuoteIntroFade(holdBeforeFadeMs = 1000) {
        this.clearPortalToQuoteIntroTimer();
        const todayKey = Utils.getTodayKey();
        void odqPrefetchLayoutBKeywordEmphasis(todayKey);
        void odqReadLayoutBStripLayoutSeed(todayKey).catch(() => {});
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          const activeRm = document.querySelector('.screen.active');
          if (activeRm && activeRm.id === 'screen-portal') {
            void this.autoTransitionFromPortal();
          }
          return;
        }
        this._blockPortalScrollNav = true;
        const hold = Math.max(0, holdBeforeFadeMs);
        this._portalToQuoteTimer = setTimeout(() => {
          this._portalToQuoteTimer = null;
          this._blockPortalScrollNav = false;
          const active = document.querySelector('.screen.active');
          if (active && active.id === 'screen-portal') {
            void this.autoTransitionFromPortal();
          }
        }, hold);
      }

  }

  root.SimplifiedQuiltAppV2QuoteUi = SimplifiedQuiltAppV2QuoteUi;
})(typeof globalThis !== 'undefined' ? globalThis : window);
