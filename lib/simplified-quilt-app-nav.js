/**
 * SimplifiedQuiltAppV2 nav slice: intro flow, scroll nav, quilt zoom/parallax, scroll cue (Phase C8).
 * Methods merged onto SimplifiedQuiltAppV2.prototype in the main app module.
 */
(function (root) {
  'use strict';

  class SimplifiedQuiltAppV2Nav {
      getIntroScreenIds() {
        return this._introScreenIds;
      }

      isIntroFlowEnabled() {
        return !!this._introFlowEnabled;
      }

      enableIntroFlow(initialScreenId = 'screen-portal') {
        if (this._introFlowEnabled) {
          this.scrollIntroTo(initialScreenId, 'auto');
          return;
        }
        const app = document.getElementById('app');
        if (!app) return;

        document.body.classList.add('intro-flow-active');
        this._introFlowEnabled = true;

        document.querySelectorAll('.screen').forEach((s) => {
          if (this._introScreenIds.has(s.id)) {
            s.style.display = 'flex';
            s.classList.add('active');
          } else {
            s.style.display = 'none';
            s.classList.remove('active');
          }
        });

        if (!this._introFlowScrollListener) {
          this._introFlowScrollListener = () => this.syncIntroFlowActiveSection();
          app.addEventListener('scroll', this._introFlowScrollListener, { passive: true });
        }

        this.scrollIntroTo(initialScreenId, 'auto');
        Utils.refreshPortalDateText();
      }

      disableIntroFlow() {
        if (this._introFlowEnabled) {
          const app = document.getElementById('app');
          if (app && this._introFlowScrollListener) {
            app.removeEventListener('scroll', this._introFlowScrollListener);
            this._introFlowScrollListener = null;
          }
          if (this._introQuoteLandTimer) {
            clearTimeout(this._introQuoteLandTimer);
            this._introQuoteLandTimer = null;
          }
          document.getElementById('screen-quote')?.classList.remove('intro-quote-land');
        }
        this._introFlowEnabled = false;
        document.body.classList.remove('intro-flow-active');
      }

      scrollIntroTo(screenId, behavior = 'smooth') {
        if (!this._introFlowEnabled || !this._introScreenIds.has(screenId)) return;
        const app = document.getElementById('app');
        const section = document.getElementById(screenId);
        if (!app || !section) return;
        app.scrollTo({ top: section.offsetTop, behavior });
        this.syncIntroFlowActiveSection();
      }

      syncIntroFlowActiveSection() {
        if (!this._introFlowEnabled) return;
        const app = document.getElementById('app');
        if (!app) return;
        let nearest = null;
        let nearestDist = Infinity;
        for (const id of this._introScreenIds) {
          const el = document.getElementById(id);
          if (!el) continue;
          const d = Math.abs(el.offsetTop - app.scrollTop);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = el;
          }
        }
        if (!nearest) return;
        const prevSnap = this._lastIntroSnapSectionId;
        const nextId = nearest.id;
        this._lastIntroSnapSectionId = nextId;
        for (const id of this._introScreenIds) {
          const el = document.getElementById(id);
          if (!el) continue;
          if (el === nearest) el.classList.add('active');
          else el.classList.remove('active');
        }
        const quoteScreenEl = document.getElementById('screen-quote');
        if (quoteScreenEl && nextId !== 'screen-quote') {
          quoteScreenEl.classList.remove('intro-quote-land');
          if (this._introQuoteLandTimer) {
            clearTimeout(this._introQuoteLandTimer);
            this._introQuoteLandTimer = null;
          }
        }

        if (
          quoteScreenEl &&
          nextId === 'screen-quote' &&
          prevSnap === 'screen-portal' &&
          !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        ) {
          quoteScreenEl.classList.remove('intro-quote-land');
          void quoteScreenEl.offsetWidth;
          quoteScreenEl.classList.add('intro-quote-land');
          if (this._introQuoteLandTimer) {
            clearTimeout(this._introQuoteLandTimer);
          }
          this._introQuoteLandTimer = setTimeout(() => {
            this._introQuoteLandTimer = null;
            quoteScreenEl.classList.remove('intro-quote-land');
          }, 1000);
        }

        if (nextId === 'screen-quote' && prevSnap !== 'screen-quote') {
          if (!this.isColorPickerActive()) {
            this.applyQuoteScreenInitialRestLayout();
            this.scheduleQuoteColorPickerReveal(CONFIG.APP.quoteColorPickerRevealMs);
          }
          this.quoteService?.primeTodayQuoteFromLocalAssignment?.();
          this.quoteService?.displayQuote?.();
        } else if (nextId !== 'screen-quote' && !this.isColorPickerActive()) {
          this.clearQuoteColorPickerSchedule();
        }
      }

      setupScreenScrollNavigation() {
        if (this.isIntroFlowEnabled()) return;
        const nextByScreen = {
          'screen-portal': 'screen-quote'
        };

        const triggerNext = () => {
          const currentScreen = document.querySelector('.screen.active');
          if (!currentScreen) return;
          if (currentScreen.id === 'screen-portal' && window.app?._blockPortalScrollNav) return;
          const now = Date.now();
          if (now - this._scrollNavLastTriggerAt < this._scrollNavCooldownMs) return;
          const next =
            currentScreen.id === 'screen-portal'
              ? this.portalGestureNextScreenId()
              : nextByScreen[currentScreen.id];
          if (!next) return;
          this._scrollNavLastTriggerAt = now;
          this.uiService.showScreen(next);
        };

        window.addEventListener('wheel', (e) => {
          const currentScreen = document.querySelector('.screen.active');
          if (!currentScreen) return;
          if (!nextByScreen[currentScreen.id]) return;
          if (e.deltaY > 28) {
            e.preventDefault();
            triggerNext();
          }
        }, { passive: false });

        window.addEventListener('touchstart', (e) => {
          const currentScreen = document.querySelector('.screen.active');
          if (!currentScreen || !nextByScreen[currentScreen.id]) return;
          this._scrollNavTouchStartY = e.touches?.[0]?.clientY ?? null;
        }, { passive: true });

        window.addEventListener('touchend', (e) => {
          const currentScreen = document.querySelector('.screen.active');
          if (!currentScreen || !nextByScreen[currentScreen.id]) return;
          const endY = e.changedTouches?.[0]?.clientY ?? null;
          if (this._scrollNavTouchStartY == null || endY == null) return;
          const dy = this._scrollNavTouchStartY - endY;
          this._scrollNavTouchStartY = null;
          if (dy > 56) triggerNext();
        }, { passive: true });
      }

      handleKeyDown(event) {
        if (event.key === 'ArrowDown' || event.key === 'PageDown') {
          const currentScreen = document.querySelector('.screen.active');
          const nextByScreen = {
            'screen-portal': 'screen-quote'
          };
          const next =
            currentScreen?.id === 'screen-portal'
              ? this.portalGestureNextScreenId()
              : currentScreen
                ? nextByScreen[currentScreen.id]
                : null;
          if (next) {
            event.preventDefault();
            this.uiService.showScreen(next);
            return;
          }
        }

        if (event.key === 'Escape') {
          const currentScreen = document.querySelector('.screen.active');
          if (currentScreen) {
            const currentId = currentScreen.id;
            if (currentId === 'screen-quote') {
              if (this.isColorPickerActive()) {
                this.clearQuoteColorPickerSchedule();
              } else {
                this.uiService.showScreen('screen-portal');
              }
            } else if (currentId === 'screen-quilt') {
              this.uiService.showScreen('screen-quote');
            }
          }
        }
      }


      cancelQuiltSingleTapSpotlight() {
        if (this._quiltSingleTapTimer) {
          clearTimeout(this._quiltSingleTapTimer);
          this._quiltSingleTapTimer = null;
        }
      }

      scheduleQuiltSingleTapSpotlight(delay = 0) {
        this.cancelQuiltSingleTapSpotlight();
        this._quiltSingleTapTimer = setTimeout(() => {
          this._quiltSingleTapTimer = null;
          this.handleShowMyBlock();
        }, Math.max(0, delay));
      }

      setupQuiltBlockSpotlightLongPress() {
        const container = document.querySelector('#screen-quilt .quilt-container');
        if (!container || container.dataset.blockSpotlightLongPress === '1') return;
        container.dataset.blockSpotlightLongPress = '1';

        const isQuiltActive = () =>
          !!document.getElementById('screen-quilt')?.classList.contains('active');

        this._bindSustainHoldGesture(container, {
          isEnabled: () => isQuiltActive(),
          shouldStartHold: (event) => {
            if (this.isInteractiveQuiltGestureTarget(event.target)) return false;
            if (Date.now() < this._suppressNextQuiltClickUntil) return false;
            return this.isClientPointInsideQuilt(event.clientX, event.clientY);
          },
          onPrime: () => this.cancelQuiltSingleTapSpotlight(),
          onHoldStart: () => this.setMyBlockShimmerActive(true),
          onHoldEnd: () => this.setMyBlockShimmerActive(false),
          attachKeyHold: false
        });
      }

      isInteractiveQuiltGestureTarget(target) {
        return !!(
          target &&
          typeof target.closest === 'function' &&
          target.closest('button, a, input, textarea, select, label, [data-next], [role="button"]')
        );
      }

      handleBacksideSwipeStart(event) {
        const quiltScreen = document.getElementById('screen-quilt');
        if (!quiltScreen || !quiltScreen.classList.contains('active')) return;
        if (this.isInteractiveQuiltGestureTarget(event.target)) return;
        if (!event.touches || event.touches.length !== 1) {
          this._backsideSwipeGesture = null;
          return;
        }
        const touch = event.touches[0];
        if (!this.isClientPointInsideQuilt(touch.clientX, touch.clientY)) return;
        this._backsideSwipeGesture = {
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          lastY: touch.clientY,
          active: false,
          rejected: false
        };
      }

      handleBacksideSwipeMove(event) {
        const gesture = this._backsideSwipeGesture;
        if (!gesture || gesture.rejected || !event.touches || event.touches.length !== 1) return;
        const touch = event.touches[0];
        gesture.lastX = touch.clientX;
        gesture.lastY = touch.clientY;
        const dx = gesture.lastX - gesture.startX;
        const dy = gesture.lastY - gesture.startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (!gesture.active && (absDx > 14 || absDy > 14)) {
          if (absDx > absDy * 1.35) {
            gesture.active = true;
            this.cancelQuiltSingleTapSpotlight();
            this.setMyBlockShimmerActive(false);
          } else {
            gesture.rejected = true;
            return;
          }
        }
        if (gesture.active) {
          event.preventDefault();
        }
      }

      async handleBacksideSwipeEnd(event) {
        const gesture = this._backsideSwipeGesture;
        this._backsideSwipeGesture = null;
        if (!gesture || gesture.rejected) return;
        const touch = event.changedTouches && event.changedTouches[0];
        const endX = touch ? touch.clientX : gesture.lastX;
        const endY = touch ? touch.clientY : gesture.lastY;
        const dx = endX - gesture.startX;
        const dy = endY - gesture.startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx < 70 || absDx < absDy * 1.6) return;
        this._suppressNextQuiltClickUntil = Date.now() + 700;
        this.cancelQuiltSingleTapSpotlight();
        await this.handleToggleBacksidePreview(event);
      }

      handleQuiltKeyboardSpotlight(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.scheduleQuiltSingleTapSpotlight(0);
      }

      setupQuiltZoom() {
        const container = document.querySelector('#screen-quilt .quilt-container');
        if (!container) return;
        const quiltSVG = document.getElementById('quilt');

        // Press and hold the quilt to shimmer your square; swipe horizontally for backside preview.
        this.setupQuiltBlockSpotlightLongPress();
        container.addEventListener('touchstart', this.handleBacksideSwipeStart.bind(this), { passive: true });
        container.addEventListener('touchmove', this.handleBacksideSwipeMove.bind(this), { passive: false });
        container.addEventListener('touchend', this.handleBacksideSwipeEnd.bind(this), { passive: false });
        container.addEventListener('touchcancel', () => {
          this._backsideSwipeGesture = null;
        }, { passive: true });
        if (quiltSVG) {
          quiltSVG.addEventListener('keydown', this.handleQuiltKeyboardSpotlight.bind(this));
        }
      }

      syncQuiltFilmGrainOverlay() {
        const qc = document.querySelector('#screen-quilt .quilt-container');
        const canvas = document.getElementById('quiltFilmGrainOverlay');
        if (!qc || !canvas) return;
        const quiltScreen = document.getElementById('screen-quilt');
        const visible = quiltScreen && quiltScreen.classList.contains('active');
        if (!visible) return;
        canvas.style.display = '';

        const paintCore = () => {
          const wPx = Math.max(1, Math.round(qc.clientWidth));
          const hPx = Math.max(1, Math.round(qc.clientHeight));
          const dpr =
            typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0
              ? Math.min(2.5, window.devicePixelRatio)
              : 1;
          const bw = Math.max(1, Math.round(wPx * dpr));
          const bh = Math.max(1, Math.round(hPx * dpr));
          if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw;
            canvas.height = bh;
            canvas.style.width = `${wPx}px`;
            canvas.style.height = `${hPx}px`;
          }
          const ctx = canvas.getContext('2d', { alpha: true });
          if (!ctx) return;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const svg = document.getElementById('quilt');
          const isNative =
            typeof odqIsCapacitorNative === 'function' && odqIsCapacitorNative();
          const clipPath = Utils.buildQuiltGrainClipPathFromSvg(svg, wPx, hPx);
          ctx.save();
          if (clipPath) {
            ctx.clip(clipPath);
          }
          Utils.applyFilmGrain(ctx, wPx, hPx, 0, { vignette: false, textureOnly: isNative });
          ctx.restore();
        };

        // Defer to after layout; WKWebView often has (0,0) CTM / rects on the first paint tick.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            paintCore();
            if (typeof odqIsCapacitorNative === 'function' && odqIsCapacitorNative()) {
              setTimeout(paintCore, 220);
            }
          });
        });
      }

      setupQuiltFilmGrainOverlay() {
        const qc = document.querySelector('#screen-quilt .quilt-container');
        if (!qc) return;
        if (typeof ResizeObserver !== 'undefined') {
          if (this._quiltFilmGrainResizeObserver) {
            this._quiltFilmGrainResizeObserver.disconnect();
          }
          this._quiltFilmGrainResizeObserver = new ResizeObserver(() => {
            this.syncQuiltFilmGrainOverlay();
          });
          this._quiltFilmGrainResizeObserver.observe(qc);
        }

        if (!this._quiltFilmGrainLifecycleBound) {
          this._quiltFilmGrainLifecycleBound = true;
          const bump = () => this.syncQuiltFilmGrainOverlay();
          window.addEventListener('pageshow', bump);
          window.addEventListener('orientationchange', () => requestAnimationFrame(bump));
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') bump();
          });
          document.addEventListener('screenChange', (e) => {
            if (e.detail?.screenId === 'screen-quilt') {
              requestAnimationFrame(() => requestAnimationFrame(bump));
            }
          });
        }
      }

      syncQuiltZoomAfterRender() {
        const quiltSVG = document.getElementById('quilt');
        const renderedViewBox = this.parseQuiltViewBox(quiltSVG?.getAttribute('viewBox'));
        if (!quiltSVG || !renderedViewBox) return;

        this.quiltZoomState.baseViewBox = renderedViewBox;
        const preservedViewBox = this.quiltZoomState.viewBox;
        const preservedZoom = preservedViewBox ? this.getQuiltZoom(preservedViewBox) : 1;

        if (preservedViewBox && preservedZoom > 1.001) {
          this.applyQuiltViewBox(preservedViewBox);
        } else {
          this.resetQuiltZoom();
        }
      }

      parseQuiltViewBox(value) {
        if (!value) return null;
        const parts = String(value).trim().split(/[\s,]+/).map(Number);
        if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
        const [x, y, width, height] = parts;
        if (width <= 0 || height <= 0) return null;
        return { x, y, width, height };
      }

      formatQuiltViewBox(viewBox) {
        return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
      }

      getCurrentQuiltViewBox() {
        const quiltSVG = document.getElementById('quilt');
        return this.parseQuiltViewBox(quiltSVG?.getAttribute('viewBox'));
      }

      getQuiltZoom(viewBox = null) {
        const base = this.quiltZoomState.baseViewBox;
        const current = viewBox || this.getCurrentQuiltViewBox();
        if (!base || !current || current.width <= 0) return 1;
        return base.width / current.width;
      }

      clampQuiltZoom(value) {
        const minZoom = this.quiltZoomState.minZoom;
        const maxZoom = this.quiltZoomState.maxZoom;
        return Math.min(maxZoom, Math.max(minZoom, value || minZoom));
      }

      clampQuiltViewBox(viewBox) {
        const base = this.quiltZoomState.baseViewBox;
        if (!base || !viewBox) return viewBox;
        const width = Math.min(base.width, Math.max(base.width / this.quiltZoomState.maxZoom, viewBox.width));
        const height = Math.min(base.height, Math.max(base.height / this.quiltZoomState.maxZoom, viewBox.height));
        const maxX = base.x + base.width - width;
        const maxY = base.y + base.height - height;
        const x = Math.min(maxX, Math.max(base.x, viewBox.x));
        const y = Math.min(maxY, Math.max(base.y, viewBox.y));
        return { x, y, width, height };
      }

      applyQuiltViewBox(viewBox) {
        const quiltSVG = document.getElementById('quilt');
        if (!quiltSVG || !viewBox) return;
        const clamped = this.clampQuiltViewBox(viewBox);
        const zoom = this.getQuiltZoom(clamped);
        quiltSVG.setAttribute('viewBox', this.formatQuiltViewBox(this.getParallaxAdjustedViewBox(clamped)));
        this.quiltZoomState.viewBox = zoom > 1.001 ? clamped : null;
        this.updateQuiltZoomClass(zoom > 1.001);
      }

      resetQuiltZoom() {
        const quiltSVG = document.getElementById('quilt');
        const base = this.quiltZoomState.baseViewBox;
        if (quiltSVG && base) {
          quiltSVG.setAttribute('viewBox', this.formatQuiltViewBox(this.getParallaxAdjustedViewBox(base)));
        }
        this.quiltZoomState.viewBox = null;
        this.updateQuiltZoomClass(false);
      }

      getParallaxBaseViewBox() {
        return this.quiltZoomState?.viewBox || this.quiltZoomState?.baseViewBox || this.getCurrentQuiltViewBox();
      }

      getParallaxAdjustedViewBox(viewBox) {
        if (!viewBox) return viewBox;
        const shift = Number(this.parallaxAppliedSvgShift || 0);
        if (!Number.isFinite(shift) || Math.abs(shift) < 0.001) return viewBox;
        return { ...viewBox, y: viewBox.y + shift };
      }

      updateQuiltZoomClass(isZoomed) {
        const container = document.querySelector('#screen-quilt .quilt-container');
        if (!container) return;
        container.classList.toggle('quilt-container--zoomed', !!isZoomed);
        container.classList.toggle('quilt-container--zooming', !!(this.quiltZoomState.isPinching || this.quiltZoomState.isPanning));
      }

      getQuiltSvgPointForClient(clientX, clientY, viewBox = null) {
        const quiltSVG = document.getElementById('quilt');
        const currentViewBox = viewBox || this.getCurrentQuiltViewBox();
        if (!quiltSVG || !currentViewBox) return null;
        const rect = quiltSVG.getBoundingClientRect();
        const scale = Math.min(rect.width / currentViewBox.width, rect.height / currentViewBox.height);
        if (!Number.isFinite(scale) || scale <= 0) return null;
        const renderedWidth = currentViewBox.width * scale;
        const renderedHeight = currentViewBox.height * scale;
        const offsetX = (rect.width - renderedWidth) / 2;
        const offsetY = (rect.height - renderedHeight) / 2;
        return {
          x: currentViewBox.x + ((clientX - rect.left - offsetX) / scale),
          y: currentViewBox.y + ((clientY - rect.top - offsetY) / scale)
        };
      }

      getQuiltViewBoxForAnchor(anchor, clientPoint, width, height) {
        const quiltSVG = document.getElementById('quilt');
        if (!quiltSVG || !anchor || !clientPoint) return null;
        const rect = quiltSVG.getBoundingClientRect();
        const scale = Math.min(rect.width / width, rect.height / height);
        if (!Number.isFinite(scale) || scale <= 0) return null;
        const renderedWidth = width * scale;
        const renderedHeight = height * scale;
        const offsetX = (rect.width - renderedWidth) / 2;
        const offsetY = (rect.height - renderedHeight) / 2;
        return {
          x: anchor.x - ((clientPoint.x - rect.left - offsetX) / scale),
          y: anchor.y - ((clientPoint.y - rect.top - offsetY) / scale),
          width,
          height
        };
      }

      getTouchDistance(touchA, touchB) {
        return Math.hypot(touchA.clientX - touchB.clientX, touchA.clientY - touchB.clientY);
      }

      getTouchCenter(touchA, touchB) {
        return {
          x: (touchA.clientX + touchB.clientX) / 2,
          y: (touchA.clientY + touchB.clientY) / 2
        };
      }

      getQuiltContainerCenterClientPoint() {
        const rect = this.getQuiltInteractionRect();
        if (!rect) {
          return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        }
        return {
          x: rect.left + (rect.width / 2),
          y: rect.top + (rect.height / 2)
        };
      }

      getQuiltInteractionRect() {
        const quiltSVG = document.getElementById('quilt');
        const quiltRect = quiltSVG?.getBoundingClientRect();
        if (quiltRect && quiltRect.width > 0 && quiltRect.height > 0) {
          return quiltRect;
        }

        const container = document.querySelector('#screen-quilt .quilt-container');
        const containerRect = container?.getBoundingClientRect();
        if (containerRect && containerRect.width > 0 && containerRect.height > 0) {
          return containerRect;
        }

        const quiltScreen = document.getElementById('screen-quilt');
        const screenRect = quiltScreen?.getBoundingClientRect();
        if (screenRect && screenRect.width > 0 && screenRect.height > 0) {
          const panel = document.querySelector('#screen-quilt .button-container');
          const panelRect = panel?.getBoundingClientRect();
          const bottom = panelRect && panelRect.top > screenRect.top ? panelRect.top : screenRect.bottom;
          return {
            left: screenRect.left,
            right: screenRect.right,
            top: screenRect.top,
            bottom,
            width: screenRect.width,
            height: Math.max(0, bottom - screenRect.top)
          };
        }

        return null;
      }

      isClientPointInsideQuilt(clientX, clientY) {
        const rect = this.getQuiltInteractionRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      }

      areTouchesInsideQuilt(touches) {
        if (!touches || touches.length === 0) return false;
        return Array.from(touches).every((touch) => this.isClientPointInsideQuilt(touch.clientX, touch.clientY));
      }

      isQuiltZoomAvailable() {
        const quiltScreen = document.getElementById('screen-quilt');
        const quiltSVG = document.getElementById('quilt');
        if (!quiltScreen || !quiltSVG) return false;
        const screenRect = quiltScreen.getBoundingClientRect();
        const screenVisible =
          quiltScreen.classList.contains('active') ||
          (screenRect.width > 0 && screenRect.height > 0 && screenRect.bottom > 0 && screenRect.top < window.innerHeight);
        if (!screenVisible) return false;
        if (!this.quiltZoomState.baseViewBox) {
          this.quiltZoomState.baseViewBox = this.getCurrentQuiltViewBox();
        }
        return !!this.quiltZoomState.baseViewBox;
      }

      zoomQuiltAtClientPoint(clientX, clientY, zoom) {
        if (!this.isQuiltZoomAvailable()) return;
        const base = this.quiltZoomState.baseViewBox;
        const current = this.getCurrentQuiltViewBox();
        const anchor = this.getQuiltSvgPointForClient(clientX, clientY, current);
        if (!base || !anchor) return;
        const nextZoom = this.clampQuiltZoom(zoom);
        const width = base.width / nextZoom;
        const height = base.height / nextZoom;
        const viewBox = this.getQuiltViewBoxForAnchor(anchor, { x: clientX, y: clientY }, width, height);
        this.applyQuiltViewBox(viewBox);
      }

      toggleQuiltZoomAt(clientX, clientY) {
        if (!this.isQuiltZoomAvailable()) return;
        const currentZoom = this.getQuiltZoom();
        if (currentZoom > 1.25) {
          this.resetQuiltZoom();
        } else {
          this.zoomQuiltAtClientPoint(clientX, clientY, 2.5);
        }
      }

      handleQuiltZoomTouchStart(event) {
        if (!this.isQuiltZoomAvailable()) return;
        const touches = event.touches;
        if (!touches || touches.length === 0) return;
        const state = this.quiltZoomState;

        if (touches.length === 1) {
          state.activeFromQuilt = this.areTouchesInsideQuilt(touches);
        } else if (touches.length >= 2) {
          state.activeFromQuilt = state.activeFromQuilt || this.areTouchesInsideQuilt(touches);
        }
        if (!state.activeFromQuilt) return;

        if (touches.length === 2) {
          event.preventDefault();
          event.stopPropagation();
          const center = this.getTouchCenter(touches[0], touches[1]);
          const startViewBox = this.getCurrentQuiltViewBox();
          state.isPinching = true;
          state.isPanning = false;
          state.moved = true;
          state.startDistance = this.getTouchDistance(touches[0], touches[1]);
          state.startZoom = this.getQuiltZoom(startViewBox);
          state.startViewBox = startViewBox;
          state.startCenter = center;
          state.startSvgPoint = this.getQuiltSvgPointForClient(center.x, center.y, startViewBox);
          this.updateQuiltZoomClass(true);
          return;
        }

        const touch = touches[0];
        state.touchStartedAt = Date.now();
        state.touchStartClient = { x: touch.clientX, y: touch.clientY };
        state.moved = false;

        if (this.getQuiltZoom() > 1.001) {
          state.isPanning = true;
          state.panStartClient = { x: touch.clientX, y: touch.clientY };
          state.panStartViewBox = this.getCurrentQuiltViewBox();
          this.updateQuiltZoomClass(true);
        }
      }

      handleQuiltZoomTouchMove(event) {
        if (!this.isQuiltZoomAvailable()) return;
        const touches = event.touches;
        const state = this.quiltZoomState;
        if (!touches || touches.length === 0) return;
        if (!state.activeFromQuilt) return;

        if (touches.length === 2 && state.isPinching) {
          event.preventDefault();
          event.stopPropagation();
          const base = state.baseViewBox;
          const distance = this.getTouchDistance(touches[0], touches[1]);
          const center = this.getTouchCenter(touches[0], touches[1]);
          const ratio = state.startDistance > 0 ? distance / state.startDistance : 1;
          const nextZoom = this.clampQuiltZoom(state.startZoom * ratio);
          const width = base.width / nextZoom;
          const height = base.height / nextZoom;
          const viewBox = this.getQuiltViewBoxForAnchor(state.startSvgPoint, center, width, height);
          this.applyQuiltViewBox(viewBox);
          return;
        }

        if (touches.length === 1 && state.isPanning && state.panStartClient && state.panStartViewBox) {
          const touch = touches[0];
          const dx = touch.clientX - state.panStartClient.x;
          const dy = touch.clientY - state.panStartClient.y;
          if (Math.hypot(dx, dy) < 3) return;
          event.preventDefault();
          event.stopPropagation();
          state.moved = true;

          const quiltSVG = document.getElementById('quilt');
          const rect = quiltSVG?.getBoundingClientRect();
          if (!rect) return;
          const scale = Math.min(rect.width / state.panStartViewBox.width, rect.height / state.panStartViewBox.height);
          if (!Number.isFinite(scale) || scale <= 0) return;
          this.applyQuiltViewBox({
            ...state.panStartViewBox,
            x: state.panStartViewBox.x - (dx / scale),
            y: state.panStartViewBox.y - (dy / scale)
          });
        }
      }

      handleQuiltZoomTouchEnd(event) {
        const state = this.quiltZoomState;
        const wasPinching = state.isPinching;
        const wasPanning = state.isPanning && state.moved;
        const remainingTouches = event.touches?.length || 0;

        if (remainingTouches >= 2) return;
        state.isPinching = false;
        state.isPanning = false;
        this.updateQuiltZoomClass(this.getQuiltZoom() > 1.001);
        if (remainingTouches === 0) {
          state.activeFromQuilt = false;
        }

        if (remainingTouches > 0 || wasPinching || wasPanning) return;

        const touch = event.changedTouches?.[0];
        const start = state.touchStartClient;
        if (!touch || !start) return;
        const elapsed = Date.now() - state.touchStartedAt;
        const movement = Math.hypot(touch.clientX - start.x, touch.clientY - start.y);
        if (elapsed > 280 || movement > 12) return;

        const now = Date.now();
        if (now - state.lastTapAt < 320) {
          event.preventDefault();
          event.stopPropagation();
          this.cancelQuiltSingleTapSpotlight();
          state.lastTapAt = 0;
          this.toggleQuiltZoomAt(touch.clientX, touch.clientY);
        } else {
          state.lastTapAt = now;
          this._lastQuiltTouchTapAt = now;
        }
      }

      handleQuiltZoomGestureStart(event) {
        if (!this.isQuiltZoomAvailable()) return;
        const fallbackPoint = this.getQuiltContainerCenterClientPoint();
        event.preventDefault();
        event.stopPropagation();
        const state = this.quiltZoomState;
        const clientPoint = {
          x: Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : fallbackPoint.x,
          y: Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : fallbackPoint.y
        };
        if (!this.isClientPointInsideQuilt(clientPoint.x, clientPoint.y)) return;
        const startViewBox = this.getCurrentQuiltViewBox();
        state.isPinching = true;
        state.isPanning = false;
        state.moved = true;
        state.activeFromQuilt = true;
        state.startZoom = this.getQuiltZoom(startViewBox);
        state.startViewBox = startViewBox;
        state.startSvgPoint = this.getQuiltSvgPointForClient(clientPoint.x, clientPoint.y, startViewBox);
        state.gestureStartClient = clientPoint;
        this.updateQuiltZoomClass(true);
      }

      handleQuiltZoomGestureChange(event) {
        const state = this.quiltZoomState;
        if (!this.isQuiltZoomAvailable() || !state.activeFromQuilt || !state.isPinching || !state.startSvgPoint) return;
        event.preventDefault();
        event.stopPropagation();
        const base = state.baseViewBox;
        const clientPoint = {
          x: Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : state.gestureStartClient?.x,
          y: Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : state.gestureStartClient?.y
        };
        if (!base || !Number.isFinite(clientPoint.x) || !Number.isFinite(clientPoint.y)) return;
        const nextZoom = this.clampQuiltZoom(state.startZoom * (Number(event.scale) || 1));
        const width = base.width / nextZoom;
        const height = base.height / nextZoom;
        const viewBox = this.getQuiltViewBoxForAnchor(state.startSvgPoint, clientPoint, width, height);
        this.applyQuiltViewBox(viewBox);
      }

      handleQuiltZoomGestureEnd(event) {
        event.preventDefault();
        event.stopPropagation();
        const state = this.quiltZoomState;
        state.isPinching = false;
        state.isPanning = false;
        state.moved = false;
        state.gestureStartClient = null;
        state.activeFromQuilt = false;
        this.updateQuiltZoomClass(this.getQuiltZoom() > 1.001);
      }

      handleQuiltZoomTouchCancel() {
        const state = this.quiltZoomState;
        state.isPinching = false;
        state.isPanning = false;
        state.moved = false;
        state.gestureStartClient = null;
        state.activeFromQuilt = false;
        this.updateQuiltZoomClass(this.getQuiltZoom() > 1.001);
      }

      setupQuiltParallax() {
        const app = document.getElementById('app');
        const quiltScreen = document.getElementById('screen-quilt');
        const quiltButtonPanel = document.querySelector('#screen-quilt .button-container');
        this.parallaxScrollListener = this.handleParallaxScroll.bind(this);

        if (!this.parallaxEnabled) return;

        window.addEventListener('scroll', this.parallaxScrollListener, { passive: true });
        this.parallaxInteractionListener = this.handleParallaxInteraction.bind(this);
        this.parallaxTouchStartListener = (event) => {
          const quiltScreen = document.getElementById('screen-quilt');
          if (!quiltScreen || !quiltScreen.classList.contains('active')) return;
          const touch = event.touches && event.touches[0];
          this.parallaxLastTouchY = touch ? touch.clientY : null;
        };
        const addParallaxInteractionListeners = (target) => {
          if (!target) return;
          target.addEventListener('wheel', this.parallaxInteractionListener, { passive: true });
          target.addEventListener('touchstart', this.parallaxTouchStartListener, { passive: true });
          target.addEventListener('touchmove', this.parallaxInteractionListener, { passive: true });
        };
        addParallaxInteractionListeners(window);
        addParallaxInteractionListeners(app);
        addParallaxInteractionListeners(quiltScreen);
        addParallaxInteractionListeners(quiltButtonPanel);
        if (app) {
          app.addEventListener('scroll', this.parallaxScrollListener, { passive: true });
        }
        if (quiltScreen) {
          quiltScreen.addEventListener('scroll', this.parallaxScrollListener, { passive: true });
        }
        if (quiltButtonPanel) {
          quiltButtonPanel.addEventListener('scroll', this.parallaxScrollListener, { passive: true });
        }

        // Update parallax anchor/target on screen changes
        document.addEventListener('screenChange', (e) => {
          if (e.detail.screenId === 'screen-quilt') {
            if (e.detail.skipQuiltScrollCue) {
              this.clearQuiltScrollCue();
              const scroller = this.getQuiltScrollContainer();
              if (scroller) {
                const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
                const stopTop =
                  typeof this.getQuiltFooterScrollStopTop === 'function'
                    ? this.getQuiltFooterScrollStopTop(scroller)
                    : maxScroll;
                scroller.scrollTop = Math.max(0, Math.min(maxScroll, Number(stopTop) || 0));
                this._quiltScrollAnchorTop = scroller.scrollTop;
              }
            }
            this.parallaxAnchorScrollTop = this.getCurrentQuiltScrollPosition();
            this._dailyQuotePromptedFromQuiltScroll = false;
            this._whatsNewPromptedFromQuiltScroll = false;
            this.resetQuiltParallaxVisualState();
            this.handleParallaxScroll();
            if (!e.detail.skipQuiltScrollCue) {
              this._quiltScrollCuePlayed = false;
              this.scheduleQuiltScrollCue();
            }
          } else {
            this.clearQuiltScrollCue();
            this.parallaxTargetShift = 0;
            this.requestParallaxFrame();
          }
        });
      }

      /**
       * Quilt notification opt-in: scroll + footer visibility (independent of parallax /
       * reduced-motion, which previously skipped all scroll listeners).
       */
      setupQuiltNotificationScrollPrompt() {
        if (this._quiltNotificationPromptReady) return;
        this._quiltNotificationPromptReady = true;

        const onScrollCheck = () => {
          if (this._quiltNotificationScrollRaf != null) return;
          this._quiltNotificationScrollRaf = requestAnimationFrame(() => {
            this._quiltNotificationScrollRaf = null;
            this.checkQuiltNotificationPromptFromLayout();
          });
        };
        this._quiltNotificationScrollHandler = onScrollCheck;

        const quiltScreen = document.getElementById('screen-quilt');
        const app = document.getElementById('app');
        const panel = document.querySelector('#screen-quilt .button-container');
        [window, app, quiltScreen, panel].filter(Boolean).forEach((el) => {
          el.addEventListener('scroll', onScrollCheck, { passive: true });
        });

        const footer = document.querySelector('#screen-quilt .quilt-scroll-icon-footer');
        if (footer && typeof IntersectionObserver !== 'undefined') {
          this._quiltNotificationFooterObserver = new IntersectionObserver(
            (entries) => {
              if (!entries.some((e) => e.isIntersecting)) return;
              this.handleQuiltNotificationPromptOnScroll({ fromFooterVisible: true });
            },
            { root: null, threshold: [0, 0.05, 0.12] }
          );
        }

        document.addEventListener('screenChange', (e) => {
          if (e.detail.screenId !== 'screen-quilt') {
            if (this._quiltNotificationLandTimer != null) {
              clearTimeout(this._quiltNotificationLandTimer);
              this._quiltNotificationLandTimer = null;
            }
            if (footer && this._quiltNotificationFooterObserver) {
              try {
                this._quiltNotificationFooterObserver.unobserve(footer);
              } catch (_) {
                /* ignore */
              }
            }
            this._syncQuiltScrollIconFooterLeakGuard();
            return;
          }
          const scroller = this.getQuiltScrollContainer();
          this._quiltScrollAnchorTop = scroller ? scroller.scrollTop : 0;
          this.parallaxAnchorScrollTop = this.getCurrentQuiltScrollPosition();
          this._dailyQuotePromptedFromQuiltScroll = false;
          this._whatsNewPromptedFromQuiltScroll = false;
          this._syncQuiltScrollIconFooterLeakGuard();
          if (footer && this._quiltNotificationFooterObserver) {
            try {
              this._quiltNotificationFooterObserver.observe(footer);
            } catch (_) {
              /* ignore */
            }
          }
          if (this._quiltNotificationLandTimer != null) {
            clearTimeout(this._quiltNotificationLandTimer);
          }
          this._quiltNotificationLandTimer = window.setTimeout(() => {
            this._quiltNotificationLandTimer = null;
            this.checkQuiltNotificationPromptFromLayout();
          }, 600);
        });
      }

      /** Which element actually scrolls on the quilt screen (largest scroll range). */
      getQuiltScrollContainer() {
        const quiltScreen = document.getElementById('screen-quilt');
        if (!quiltScreen) return null;
        const candidates = [
          quiltScreen,
          document.querySelector('#screen-quilt .button-container'),
          document.getElementById('app')
        ].filter(Boolean);
        let best = quiltScreen;
        let bestRange = 0;
        candidates.forEach((el) => {
          const range = Math.max(0, el.scrollHeight - el.clientHeight);
          if (range > bestRange) {
            bestRange = range;
            best = el;
          }
        });
        return best;
      }

      /** Footer/wordmark strip visible in the quilt viewport (scroll-end proxy). */
      isQuiltFooterVisibleInViewport() {
        const quiltScreen = document.getElementById('screen-quilt');
        const footer = document.querySelector('#screen-quilt .quilt-scroll-icon-footer');
        if (!quiltScreen?.classList.contains('active') || !footer) return false;

        const viewRect = quiltScreen.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        return footerRect.top < viewRect.bottom - 8 && footerRect.bottom <= viewRect.bottom + 96;
      }

      checkQuiltNotificationPromptFromLayout() {
        if (!document.getElementById('screen-quilt')?.classList.contains('active')) return;
        if (this.isQuiltFooterVisibleInViewport()) {
          this.handleQuiltNotificationPromptOnScroll({ fromFooterVisible: true });
          return;
        }
        if (this.isQuiltScrolledNearBottom()) {
          this.handleQuiltNotificationPromptOnScroll();
        }
      }

      clearQuiltScrollCue() {
        if (this._quiltScrollCueTimer != null) {
          clearTimeout(this._quiltScrollCueTimer);
          this._quiltScrollCueTimer = null;
        }
        if (this._quiltScrollCueAnimationFrame != null) {
          cancelAnimationFrame(this._quiltScrollCueAnimationFrame);
          this._quiltScrollCueAnimationFrame = null;
        }
        if (this._quiltScrollCueScroller) {
          this._quiltScrollCueScroller.style.scrollBehavior = this._quiltScrollCuePreviousScrollBehavior || '';
        }
        if (this._quiltScrollCueScrollListener) {
          const { scroller, handler } = this._quiltScrollCueScrollListener;
          try {
            scroller?.removeEventListener('scroll', handler);
          } catch (_) {
            /* */
          }
          this._quiltScrollCueScrollListener = null;
        }
        this._quiltScrollCuePlaying = false;
        this._quiltScrollCueScroller = null;
        this._quiltScrollCuePreviousScrollBehavior = '';
        this._quiltScrollCueCancelHandlers.forEach(({ target, type, handler, options }) => {
          try {
            target.removeEventListener(type, handler, options);
          } catch (_) {
            /* ignore stale listener cleanup */
          }
        });
        this._quiltScrollCueCancelHandlers = [];
      }

      scheduleQuiltScrollCue(delayMs = 500) {
        if (this._quiltScrollCuePlayed) return;
        this.clearQuiltScrollCue();
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

        const quiltScreen = document.getElementById('screen-quilt');
        if (!quiltScreen?.classList.contains('active')) return;

        const cancelCue = () => this.clearQuiltScrollCue();
        const registerCancel = (target, type, options = { passive: true }) => {
          if (!target) return;
          target.addEventListener(type, cancelCue, options);
          this._quiltScrollCueCancelHandlers.push({ target, type, handler: cancelCue, options });
        };
        registerCancel(quiltScreen, 'wheel');
        registerCancel(quiltScreen, 'touchstart');
        registerCancel(quiltScreen, 'pointerdown');
        registerCancel(window, 'keydown');

        this._quiltScrollCueTimer = setTimeout(() => {
          this._quiltScrollCueTimer = null;
          this._tryPlayQuiltScrollCue(0);
        }, Math.max(0, Number(delayMs) || 0));
      }

      _tryPlayQuiltScrollCue(attempt = 0) {
        if (this._quiltScrollCuePlayed) {
          this.clearQuiltScrollCue();
          return;
        }
        const activeQuiltScreen = document.getElementById('screen-quilt');
        if (!activeQuiltScreen?.classList.contains('active')) {
          this.clearQuiltScrollCue();
          return;
        }

        const maxScroll = activeQuiltScreen.scrollHeight - activeQuiltScreen.clientHeight;
        if (activeQuiltScreen.scrollTop > 4) {
          this.clearQuiltScrollCue();
          return;
        }
        if (maxScroll < 32) {
          if (attempt < 12) {
            this._quiltScrollCueTimer = setTimeout(() => {
              this._quiltScrollCueTimer = null;
              this._tryPlayQuiltScrollCue(attempt + 1);
            }, 500);
            return;
          }
          this.clearQuiltScrollCue();
          return;
        }

        const triptych = document.getElementById('quiltMoodSpread');
        if (triptych?.classList.contains('is-ready') && !triptych.hidden) {
          this._quiltScrollCuePlayed = true;
          this.clearQuiltScrollCue();
          this._playTriptychTransformPeekHint();
          return;
        }

        const bumpPx = Math.min(96, Math.max(56, maxScroll * 0.22));
        this._quiltScrollCuePlayed = true;
        this.playQuiltScrollCue(activeQuiltScreen, bumpPx);
      }

      playQuiltScrollCue(scroller, bumpPx) {
        if (!scroller) return;
        const startTop = scroller.scrollTop || 0;
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const peakTop = Math.min(maxScroll, startTop + bumpPx);
        if (peakTop <= startTop + 1) {
          this._quiltScrollCuePlayed = false;
          return;
        }

        this._quiltScrollCuePlaying = true;
        this._quiltScrollCueScroller = scroller;
        this._quiltScrollCueUserOverride = false;
        this._quiltScrollCuePeakTop = peakTop;
        const duration = 1500;
        const startedAt = performance.now();
        const distance = peakTop - startTop;
        const previousScrollBehavior = scroller.style.scrollBehavior;
        this._quiltScrollCuePreviousScrollBehavior = previousScrollBehavior;
        scroller.style.scrollBehavior = 'auto';

        const onCueScroll = () => {
          if (!this._quiltScrollCuePlaying) return;
          const top = scroller.scrollTop || 0;
          if (top > peakTop + 8 || top < startTop - 4) {
            this._quiltScrollCueUserOverride = true;
            this.clearQuiltScrollCue();
          }
        };
        scroller.addEventListener('scroll', onCueScroll, { passive: true });
        this._quiltScrollCueScrollListener = { scroller, handler: onCueScroll };

        const tick = (now) => {
          if (!this._quiltScrollCuePlaying) return;
          const progress = Math.min(1, (now - startedAt) / duration);
          const nextTop = startTop + distance * Math.sin(progress * Math.PI);
          scroller.scrollTop = Math.max(startTop, Math.min(maxScroll, nextTop));

          if (
            progress < 1 &&
            !this._quiltScrollCueUserOverride &&
            document.getElementById('screen-quilt')?.classList.contains('active')
          ) {
            this._quiltScrollCueAnimationFrame = requestAnimationFrame(tick);
          } else {
            if (!this._quiltScrollCueUserOverride && scroller.scrollTop <= peakTop + 6) {
              scroller.scrollTop = startTop;
            }
            this._quiltScrollCueAnimationFrame = null;
            this._quiltScrollCuePlaying = false;
            scroller.style.scrollBehavior = previousScrollBehavior;
            this._quiltScrollCueScroller = null;
            this._quiltScrollCuePreviousScrollBehavior = '';
            this.clearQuiltScrollCue();
          }
        };

        this._quiltScrollCueAnimationFrame = requestAnimationFrame(tick);
      }

      /** Triptych peek without touching scrollTop — avoids choppy native-scroll fights. */
      _playTriptychTransformPeekHint() {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        const stack = document.querySelector('#screen-quilt .quote-card-stack');
        if (!stack || stack.classList.contains('is-triptych-peek-hint')) return;
        stack.classList.add('is-triptych-peek-hint');
        const done = () => stack.classList.remove('is-triptych-peek-hint');
        stack.addEventListener('animationend', done, { once: true });
        window.setTimeout(done, 1500);
      }

      handleParallaxInteraction(event) {
        if (!this.parallaxEnabled) return;
        if (this._quiltScrollCuePlaying) return;

        const quiltScreen = document.getElementById('screen-quilt');
        const isQuiltActive = quiltScreen && quiltScreen.classList.contains('active');
        if (!isQuiltActive) {
          this.parallaxTargetShift = 0;
          this.requestParallaxFrame();
          return;
        }

        let interactionDelta = 0;
        if (event && event.type === 'wheel') {
          interactionDelta = Number(event.deltaY) || 0;
        } else if (event && event.type === 'touchmove') {
          const touch = event.touches && event.touches[0];
          if (touch && Number.isFinite(this.parallaxLastTouchY)) {
            interactionDelta = this.parallaxLastTouchY - touch.clientY;
          }
          this.parallaxLastTouchY = touch ? touch.clientY : null;
        }

        if (Math.abs(interactionDelta) > 0.5) {
          this._markParallaxScrollActive();
          const scrollDelta = this.getCurrentQuiltScrollPosition() - this.parallaxAnchorScrollTop;
          const interactionShift = interactionDelta * this.parallaxBaseRate * 0.7;
          const rawShift = scrollDelta * this.parallaxBaseRate + interactionShift;
          this.parallaxTargetShift = Math.max(-this.parallaxMaxShift, Math.min(this.parallaxMaxShift, rawShift));
          this.requestParallaxFrame();
        }

        requestAnimationFrame(() => this.handleParallaxScroll());
      }

      getCurrentQuiltScrollPosition() {
        const quiltScreen = document.getElementById('screen-quilt');
        const quiltButtonPanel = document.querySelector('#screen-quilt .button-container');
        const app = document.getElementById('app');

        // Prefer quilt-specific scroll containers first (most reliable on mobile).
        const quiltScreenScroll = quiltScreen ? quiltScreen.scrollTop : 0;
        const quiltPanelScroll = quiltButtonPanel ? quiltButtonPanel.scrollTop : 0;
        const appScroll = app ? app.scrollTop : 0;
        const windowScroll = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

        return quiltScreenScroll + quiltPanelScroll + appScroll + windowScroll;
      }

      _markParallaxScrollActive() {
        this._parallaxScrollActive = true;
        if (this._parallaxScrollEndTimer != null) {
          clearTimeout(this._parallaxScrollEndTimer);
        }
        this._parallaxScrollEndTimer = setTimeout(() => {
          this._parallaxScrollEndTimer = null;
          this._parallaxScrollActive = false;
          this.requestParallaxFrame();
        }, 140);
      }

      handleParallaxScroll() {
        if (!this.parallaxEnabled) return;
        if (this._quiltScrollCuePlaying) return;

        const quiltScreen = document.getElementById('screen-quilt');
        const isQuiltActive = quiltScreen && quiltScreen.classList.contains('active');

        if (!isQuiltActive) {
          this.parallaxTargetShift = 0;
          this.requestParallaxFrame();
          return;
        }

        this._markParallaxScrollActive();

        const scrollDelta = this.getCurrentQuiltScrollPosition() - this.parallaxAnchorScrollTop;
        const rawShift = scrollDelta * this.parallaxBaseRate;
        this.parallaxTargetShift = Math.max(-this.parallaxMaxShift, Math.min(this.parallaxMaxShift, rawShift));
        this.requestParallaxFrame();
        this.handleQuiltNotificationPromptOnScroll();
      }

      /** True when the quilt's primary scroll container is within thresholdPx of the bottom. */
      isQuiltScrolledNearBottom(thresholdPx = 96) {
        const quiltScreen = document.getElementById('screen-quilt');
        if (!quiltScreen?.classList.contains('active')) return false;
        if (this.isQuiltFooterVisibleInViewport()) return true;

        const scroller = this.getQuiltScrollContainer();
        if (!scroller) return false;
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        if (maxScroll < 24) return false;
        return maxScroll - scroller.scrollTop <= thresholdPx;
      }

      _syncQuiltScrollIconFooterLeakGuard() {
        try {
          const quiltScreen = document.getElementById('screen-quilt');
          const footer = document.querySelector('#screen-quilt .quilt-scroll-icon-footer');
          if (!quiltScreen || !footer) return;
          if (quiltScreen.classList.contains('active')) {
            footer.style.removeProperty('display');
            footer.style.removeProperty('visibility');
            footer.style.removeProperty('pointer-events');
            footer.style.removeProperty('opacity');
            footer.style.removeProperty('transform');
          } else {
            footer.style.setProperty('display', 'none', 'important');
            footer.style.setProperty('visibility', 'hidden', 'important');
            footer.style.setProperty('pointer-events', 'none', 'important');
            footer.style.setProperty('opacity', '0', 'important');
          }
        } catch (_) {
          /* ignore */
        }
      }

      /**
       * Quilt bottom prompts: what's-new (first) then daily push opt-in.
       * Both fire only after the user scrolls the quilt screen to the bottom.
       */
      handleQuiltNotificationPromptOnScroll({ fromFooterVisible = false } = {}) {
        const quiltScreen = document.getElementById('screen-quilt');
        if (!quiltScreen?.classList.contains('active')) return;
        if (this._quiltScrollCuePlaying) return;
        if (this._quiltBottomPromptsInFlight) return;

        const scroller = this.getQuiltScrollContainer();
        const scrollSinceLand = scroller
          ? Math.max(0, scroller.scrollTop - (this._quiltScrollAnchorTop || 0))
          : this.getCurrentQuiltScrollPosition() - (this.parallaxAnchorScrollTop || 0);

        if (fromFooterVisible || this.isQuiltFooterVisibleInViewport()) {
          if (scrollSinceLand < 32) return;
        } else {
          if (scrollSinceLand < 64) return;
          if (!this.isQuiltScrolledNearBottom()) return;
        }

        if (!this._whatsNewPromptedFromQuiltScroll) {
          this._whatsNewPromptedFromQuiltScroll = true;
          if (this.shouldOfferWhatsNewAnnouncement()) {
            this._quiltBottomPromptsInFlight = true;
            const pauseMs = Math.max(0, Number(CONFIG.APP.whatsNewBottomPauseMs) || 550);
            window.setTimeout(() => {
              void this.maybeShowWhatsNewAnnouncement()
                .catch((error) => {
                  this.logger.warn('Whats-new announcement failed:', error);
                })
                .finally(() => {
                  this._quiltBottomPromptsInFlight = false;
                });
            }, pauseMs);
            return;
          }
        }

        if (this._dailyQuotePromptedFromQuiltScroll || this._quiltNotificationPromptInFlight) return;

        this._quiltNotificationPromptInFlight = true;
        this.maybePromptForDailyQuoteNotifications()
          .catch((error) => {
            this.logger.warn('Daily quote push prompt failed:', error);
          })
          .finally(() => {
            this._quiltNotificationPromptInFlight = false;
            // One scroll-to-bottom attempt per quilt visit (yes, no, or already declined).
            this._dailyQuotePromptedFromQuiltScroll = true;
          });
      }

      requestParallaxFrame() {
        if (this.parallaxTicking) return;
        this.parallaxTicking = true;
        requestAnimationFrame(() => this.applyQuiltParallaxFrame());
      }

      applyQuiltParallaxFrame() {
        this.parallaxCurrentShift += (this.parallaxTargetShift - this.parallaxCurrentShift) * this.parallaxSmoothing;

        // Snap to target near rest to avoid infinite tiny updates
        if (Math.abs(this.parallaxTargetShift - this.parallaxCurrentShift) < 0.01) {
          this.parallaxCurrentShift = this.parallaxTargetShift;
        }

        const baseShift = this.parallaxCurrentShift.toFixed(3);
        const overlayShift = (this.parallaxCurrentShift * this.parallaxOverlayMultiplier).toFixed(3);

        document.documentElement.style.setProperty('--quilt-base-shift', `${baseShift}px`);
        document.documentElement.style.setProperty('--quilt-overlay-shift', `${overlayShift}px`);
        const layer = document.getElementById('quiltParallaxLayer');
        if (layer) layer.removeAttribute('transform');
        const quiltSvg = document.getElementById('quilt');
        const baseViewBox = this.getParallaxBaseViewBox();
        const rect = quiltSvg?.getBoundingClientRect();
        const scale = baseViewBox && rect && rect.width > 0 && rect.height > 0
          ? Math.min(rect.width / baseViewBox.width, rect.height / baseViewBox.height)
          : 1;
        const visualShiftPx = Math.max(-3.2, Math.min(3.2, this.parallaxCurrentShift * 0.42));
        const svgShift = scale > 0 ? visualShiftPx / scale : visualShiftPx;
        this.parallaxAppliedSvgShift = Math.abs(this.parallaxCurrentShift) < 0.01 ? 0 : svgShift;
        const blocks = Array.from(document.querySelectorAll('#quilt .quilt-parallax-block'));
        const applyBlockJitter = !this._parallaxScrollActive;
        if (!applyBlockJitter) {
          if (this._parallaxBlocksJittered) {
            blocks.forEach((node) => {
              node.setAttribute('transform', node.dataset.baseTransform || '');
            });
            this._parallaxBlocksJittered = false;
          }
        } else {
          const scrollSignal =
            (this.getCurrentQuiltScrollPosition() - this.parallaxAnchorScrollTop) +
            this.parallaxCurrentShift * 24;
          const stopMotionSignal = Math.round(scrollSignal / 9) * 9;
          const jitterIntensity = Math.min(1, Math.max(0.35, Math.abs(this.parallaxCurrentShift) / 1.1));
          if (Math.abs(this.parallaxAppliedSvgShift) < 0.001 || jitterIntensity <= 0.001) {
            if (this._parallaxBlocksJittered) {
              blocks.forEach((node) => {
                node.setAttribute('transform', node.dataset.baseTransform || '');
              });
              this._parallaxBlocksJittered = false;
            }
          } else {
            blocks.forEach((node, idx) => {
              const originalTransform = node.dataset.baseTransform || '';
              const phase = Number(node.dataset.parallaxPhase || idx);
              const phaseA = (phase + 1) * 1.973;
              const phaseB = (phase + 1) * 2.417;
              const phaseC = (phase + 1) * 1.331;
              const noiseX = Math.sin(stopMotionSignal * 0.032 + phaseA);
              const noiseY = Math.cos(stopMotionSignal * 0.041 + phaseB);
              const noiseR = Math.sin(stopMotionSignal * 0.052 + phaseC);
              const maxJitterSvg = Math.abs(this.parallaxAppliedSvgShift) * 0.05 * jitterIntensity;
              const offsetX = noiseX * maxJitterSvg;
              const offsetY = noiseY * maxJitterSvg;
              const cx = Number(node.dataset.parallaxCx);
              const cy = Number(node.dataset.parallaxCy);
              const rot = noiseR * (0.48 + (phase % 5) * 0.045) * jitterIntensity;
              const jitterTransforms = [
                `translate(${offsetX.toFixed(3)}, ${offsetY.toFixed(3)})`
              ];
              if (Number.isFinite(cx) && Number.isFinite(cy)) {
                jitterTransforms.push(`rotate(${rot.toFixed(3)} ${cx.toFixed(3)} ${cy.toFixed(3)})`);
              }
              node.setAttribute('transform', [...jitterTransforms, originalTransform].filter(Boolean).join(' '));
            });
            this._parallaxBlocksJittered = true;
          }
        }

        if (Math.abs(this.parallaxTargetShift - this.parallaxCurrentShift) > 0.01) {
          requestAnimationFrame(() => this.applyQuiltParallaxFrame());
        } else {
          this.parallaxTicking = false;
        }
      }

      setupAutoTransition() {
        if (this.isIntroFlowEnabled()) return;
        // Always set up the auto-transition regardless of current screen
        const delay = 1500; // Fixed 1.5 seconds for all devices
        
        console.log('🔄 Setting up auto-transition with delay:', delay);
        
        setTimeout(() => {
          const currentScreen = document.querySelector('.screen.active');
          console.log('🔄 Auto-transition check - current screen:', currentScreen?.id);
          
          if (currentScreen && currentScreen.id === 'screen-portal') {
            console.log('🔄 Auto-transitioning from portal...');
            this.autoTransitionFromPortal();
          } else {
            console.log('🔄 No auto-transition - portal not active');
          }
        }, delay);
      }
  }

  root.SimplifiedQuiltAppV2Nav = SimplifiedQuiltAppV2Nav;
})(typeof globalThis !== 'undefined' ? globalThis : window);
