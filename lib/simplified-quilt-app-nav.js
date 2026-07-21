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

      getQuiltGestureSurface() {
        return document.getElementById('screen-quilt');
      }

      isQuiltArtHitAtPoint(clientX, clientY) {
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
        const screen = this.getQuiltGestureSurface();
        const isQuiltLayer = (el) => {
          if (!el) return false;
          if (el === screen) return true;
          if (el.id === 'quiltFilmGrainOverlay') return true;
          if (el.id === 'quiltHtmlSpotlightDim') return true;
          if (el.closest?.('#quilt')) return true;
          if (el.closest?.('.quilt-container')) return true;
          return false;
        };
        if (typeof document.elementsFromPoint === 'function') {
          const stack = document.elementsFromPoint(clientX, clientY);
          for (const el of stack) {
            if (this.isInteractiveQuiltGestureTarget(el)) return false;
            if (el.closest?.('.quilt-reflection-carousel, [data-reflection-carousel-viewport]')) {
              const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
              if (style?.pointerEvents !== 'none') return false;
              continue;
            }
            if (this.isQuiltOverlayContentTarget(el)) {
              const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
              if (style?.pointerEvents === 'none') continue;
              return false;
            }
            if (isQuiltLayer(el)) return true;
          }
          return false;
        }
        if (typeof document.elementFromPoint !== 'function') return true;
        const top = document.elementFromPoint(clientX, clientY);
        if (this.isInteractiveQuiltGestureTarget(top)) return false;
        if (top?.closest?.('.quilt-reflection-carousel, [data-reflection-carousel-viewport]')) return false;
        if (this.isQuiltOverlayContentTarget(top)) return false;
        return isQuiltLayer(top);
      }

      suppressQuiltSpotlightGestures(ms = 700) {
        this._suppressQuiltSpotlightUntil = Date.now() + Math.max(0, Number(ms) || 0);
        this.cancelQuiltSingleTapSpotlight();
        this._quiltTapSpotlightState = null;
      }

      isQuiltSpotlightGestureAllowed(event) {
        const screen = this.getQuiltGestureSurface();
        if (!screen?.classList.contains('active')) return false;
        if (Date.now() < this._suppressNextQuiltClickUntil) return false;
        if (Date.now() < (this._suppressQuiltSpotlightUntil || 0)) return false;
        if (this.isInteractiveQuiltGestureTarget(event?.target)) return false;
        const x = Number(event?.clientX);
        const y = Number(event?.clientY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        if (!this.isClientPointInsideQuilt(x, y)) return false;

        const rawTarget = event?.target;
        if (
          rawTarget?.closest?.(
            '.quilt-reflection-carousel, [data-reflection-carousel-viewport], .quilt-reflection-scrap-widget'
          )
        ) {
          return false;
        }

        return true;
      }

      setupQuiltBlockSpotlightLongPress() {
        const surface = this.getQuiltGestureSurface();
        if (!surface || surface.dataset.blockSpotlightLongPress === '1') return;
        surface.dataset.blockSpotlightLongPress = '1';

        this._bindSustainHoldGesture(surface, {
          isEnabled: () => !!surface.classList.contains('active'),
          shouldStartHold: (event) => this.isQuiltSpotlightGestureAllowed(event),
          holdMsTouch: 1000,
          holdMsDefault: 1000,
          preventDefaultOnDown: false,
          onPrime: () => {
            this.cancelQuiltSingleTapSpotlight();
            this.setMyBlockShimmerActive(true);
          },
          onHoldStart: () => {
            this._quiltSpotlightHoldFired = true;
            this.setMyBlockShimmerActive(false);
            void this.handleShowMyBlock();
          },
          onHoldEnd: () => {
            this._quiltSpotlightHoldFired = false;
            this.setMyBlockShimmerActive(false);
          },
          attachKeyHold: false
        });
      }

      hasCompletedBlockSpotlightCoach() {
        try {
          return localStorage.getItem('ourDailyBlockSpotlightCoachDone') === '1';
        } catch (_) {
          return true;
        }
      }

      markBlockSpotlightCoachDone() {
        try {
          localStorage.setItem('ourDailyBlockSpotlightCoachDone', '1');
        } catch (_) {
          /* ignore */
        }
      }

      shouldOfferBlockSpotlightCoach() {
        if (this.hasCompletedBlockSpotlightCoach()) return false;
        if (this._blockSpotlightCoachDismissedThisVisit) return false;
        if (typeof this.getExitChamberTodayPieceData !== 'function') return false;
        if (!this.getExitChamberTodayPieceData()) return false;
        return true;
      }

      isBlockSpotlightCoachVisible() {
        const coach = document.getElementById('quiltBlockSpotlightCoach');
        return !!(
          coach &&
          !coach.hidden &&
          !coach.hasAttribute('hidden') &&
          coach.classList.contains('is-visible')
        );
      }

      _finalizeBlockSpotlightCoachHide() {
        const coach = document.getElementById('quiltBlockSpotlightCoach');
        const target = document.getElementById('quiltBlockSpotlightCoachTarget');
        if (coach) {
          coach.classList.remove('is-visible', 'is-fading-out');
          coach.hidden = true;
          coach.setAttribute('aria-hidden', 'true');
        }
        if (target) {
          target.classList.remove('is-holding');
        }
      }

      getBlockSpotlightCoachHandoffFadeMs() {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return 0;
        const coach = document.getElementById('quiltBlockSpotlightCoach');
        const screenStyle =
          coach && typeof getComputedStyle === 'function' ? getComputedStyle(coach) : null;
        const tokenMs = parseFloat(
          screenStyle?.getPropertyValue('--quilt-block-spotlight-coach-exit-duration') || ''
        );
        return Number.isFinite(tokenMs) ? tokenMs * 1000 : 2000;
      }

      fadeOutBlockSpotlightCoach(fadeMs) {
        const coach = document.getElementById('quiltBlockSpotlightCoach');
        if (!coach || coach.hidden || coach.hasAttribute('hidden')) return;

        if (this._blockSpotlightCoachFadeTimer != null) {
          clearTimeout(this._blockSpotlightCoachFadeTimer);
          this._blockSpotlightCoachFadeTimer = null;
        }
        this._teardownBlockSpotlightCoachDismissListeners();
        coach.classList.remove('is-visible');
        coach.classList.add('is-fading-out');
        this.setMyBlockShimmerActive?.(false);

        const screenStyle =
          typeof getComputedStyle === 'function' ? getComputedStyle(coach) : null;
        const tokenMs = parseFloat(
          screenStyle?.getPropertyValue('--quilt-block-spotlight-coach-exit-duration') || ''
        );
        const cssExitMs = Number.isFinite(tokenMs) ? tokenMs * 1000 : 2000;
        const waitMs = Math.max(0, Number(fadeMs) || cssExitMs);
        if (waitMs <= 0) {
          this._finalizeBlockSpotlightCoachHide();
          return;
        }
        this._blockSpotlightCoachFadeTimer = window.setTimeout(() => {
          this._blockSpotlightCoachFadeTimer = null;
          this._finalizeBlockSpotlightCoachHide();
        }, waitMs);
      }

      clearBlockSpotlightCoach() {
        if (this._blockSpotlightCoachTimer != null) {
          clearTimeout(this._blockSpotlightCoachTimer);
          this._blockSpotlightCoachTimer = null;
        }
        if (this._blockSpotlightCoachFadeTimer != null) {
          clearTimeout(this._blockSpotlightCoachFadeTimer);
          this._blockSpotlightCoachFadeTimer = null;
        }
        if (this._blockSpotlightCoachReleaseHintsTimer != null) {
          clearTimeout(this._blockSpotlightCoachReleaseHintsTimer);
          this._blockSpotlightCoachReleaseHintsTimer = null;
        }
        this._teardownBlockSpotlightCoachDismissListeners?.();
        this._finalizeBlockSpotlightCoachHide();
        this.setMyBlockShimmerActive?.(false);
      }

      shouldDeferQuiltScrollHintsForCoach() {
        const coach = document.getElementById('quiltBlockSpotlightCoach');
        const coachPending =
          coach &&
          !coach.hidden &&
          !coach.hasAttribute('hidden') &&
          (coach.classList.contains('is-visible') || coach.classList.contains('is-fading-out'));
        return this.shouldOfferBlockSpotlightCoach() || !!coachPending;
      }

      _teardownBlockSpotlightCoachDismissListeners() {
        const bindings = this._blockSpotlightCoachDismissBindings;
        if (!bindings?.length) return;
        bindings.forEach(({ target, type, handler, options }) => {
          try {
            target.removeEventListener(type, handler, options);
          } catch (_) {
            /* ignore stale listener cleanup */
          }
        });
        this._blockSpotlightCoachDismissBindings = [];
      }

      _bindBlockSpotlightCoachDismissListeners() {
        this._teardownBlockSpotlightCoachDismissListeners();
        const quiltScreen = document.getElementById('screen-quilt');
        const coachTarget = document.getElementById('quiltBlockSpotlightCoachTarget');
        if (!quiltScreen || !coachTarget) return;

        const bindings = [];
        const register = (target, type, handler, options = { passive: true }) => {
          target.addEventListener(type, handler, options);
          bindings.push({ target, type, handler, options });
        };

        const dismiss = (event) => {
          if (!this.isBlockSpotlightCoachVisible()) return;
          if (event?.target?.closest?.('#quiltBlockSpotlightCoachTarget')) return;
          this._blockSpotlightCoachDismissedThisVisit = true;
          this.markBlockSpotlightCoachDone();
          this.clearBlockSpotlightCoach();

          if (event.type === 'scroll') {
            this.releaseDeferredQuiltScrollHints?.();
            return;
          }

          // Card-bounce / scroll-hint setup can scroll #screen-quilt mid-tap and cancel spotlight.
          if (this._blockSpotlightCoachReleaseHintsTimer != null) {
            clearTimeout(this._blockSpotlightCoachReleaseHintsTimer);
          }
          this._blockSpotlightCoachReleaseHintsTimer = window.setTimeout(() => {
            this._blockSpotlightCoachReleaseHintsTimer = null;
            this.releaseDeferredQuiltScrollHints?.();
          }, 480);
        };

        register(quiltScreen, 'scroll', dismiss);
        register(quiltScreen, 'pointerdown', dismiss);
        register(quiltScreen, 'touchstart', dismiss);
        this._blockSpotlightCoachDismissBindings = bindings;
      }

      releaseDeferredQuiltScrollHints() {
        if (this.shouldDeferQuiltScrollHintsForCoach()) return;
        const quiltScreen = document.getElementById('screen-quilt');
        if (!quiltScreen?.classList.contains('active')) return;
        if (this._quiltFabricPeekHintPlayed || this._quiltScrollCuePlayed) return;

        if (
          this._quiltUserColorCardVisible?.() ||
          (typeof this.getExitChamberTodayPieceData === 'function' && this.getExitChamberTodayPieceData())
        ) {
          this.playQuiltUserColorCardBounce?.();
          this.scheduleFabricScrollPeekHint?.();
        } else {
          this.scheduleQuiltScrollCue?.(1000);
        }
      }

      showBlockSpotlightCoach() {
        const coach = document.getElementById('quiltBlockSpotlightCoach');
        const quiltScreen = document.getElementById('screen-quilt');
        if (!coach || !quiltScreen?.classList.contains('active')) return false;
        if (!this.shouldOfferBlockSpotlightCoach()) return false;

        this.clearQuiltScrollCue();
        coach.classList.remove('is-visible', 'is-fading-out');
        coach.hidden = false;
        coach.removeAttribute('hidden');
        coach.setAttribute('aria-hidden', 'false');
        void coach.offsetWidth;
        requestAnimationFrame(() => {
          coach.classList.add('is-visible');
        });
        this._bindBlockSpotlightCoachDismissListeners();
        return true;
      }

      scheduleBlockSpotlightCoach(delayMs = 2000) {
        if (!this.shouldOfferBlockSpotlightCoach()) return;
        if (this._blockSpotlightCoachTimer != null) return;

        const quiltScreen = document.getElementById('screen-quilt');
        if (!quiltScreen?.classList.contains('active')) return;

        this.clearQuiltScrollCue();
        this._blockSpotlightCoachTimer = window.setTimeout(() => {
          this._blockSpotlightCoachTimer = null;
          this.showBlockSpotlightCoach();
        }, Math.max(0, Number(delayMs) || 0));
      }

      setupBlockSpotlightCoach() {
        const target = document.getElementById('quiltBlockSpotlightCoachTarget');
        if (!target || target.dataset.blockSpotlightCoachHold === '1') return;
        target.dataset.blockSpotlightCoachHold = '1';

        const completeCoachSpotlight = () => {
          if (!this.isBlockSpotlightCoachVisible()) return;
          target.classList.remove('is-holding');
          this._blockSpotlightCoachDismissedThisVisit = true;
          const handoffMs = this.getBlockSpotlightCoachHandoffFadeMs();
          this.fadeOutBlockSpotlightCoach(handoffMs);
          void this.handleShowMyBlock?.({
            fromCoach: true,
            fadeMs: handoffMs,
            coachFadeStarted: true
          }).then((ok) => {
            if (ok) {
              this.markBlockSpotlightCoachDone();
            }
            this.releaseDeferredQuiltScrollHints?.();
          });
        };

        target.addEventListener('click', (event) => {
          if (!this.isBlockSpotlightCoachVisible()) return;
          event.preventDefault();
          event.stopPropagation();
          this.setMyBlockShimmerActive?.(false);
          completeCoachSpotlight();
        });

        this._bindSustainHoldGesture(target, {
          isEnabled: () => this.isBlockSpotlightCoachVisible(),
          shouldStartHold: () => this.isBlockSpotlightCoachVisible(),
          holdMsTouch: 1000,
          holdMsDefault: 1000,
          preventDefaultOnDown: true,
          onPrime: () => {
            target.classList.add('is-holding');
            this.setMyBlockShimmerActive?.(true);
          },
          onHoldStart: () => {
            completeCoachSpotlight();
          },
          onHoldEnd: () => {
            target.classList.remove('is-holding');
            this.setMyBlockShimmerActive?.(false);
          },
          attachKeyHold: false
        });
      }

      setupQuiltTapSpotlight() {
        const surface = this.getQuiltGestureSurface();
        if (!surface || surface.dataset.quiltTapSpotlight === '1') return;
        surface.dataset.quiltTapSpotlight = '1';

        const finishTapSpotlight = (event, clientX, clientY) => {
          const state = this._quiltTapSpotlightState;
          this._quiltTapSpotlightState = null;
          if (!state) return;
          if (event?.pointerId != null && state.pointerId != null && event.pointerId !== state.pointerId) {
            return;
          }
          if (this._quiltSpotlightHoldFired) return;
          const elapsed = Date.now() - state.startedAt;
          const movement = Math.hypot(clientX - state.startX, clientY - state.startY);
          const movementLimit =
            event?.pointerType === 'touch' || event?.type === 'touchend' ? 24 : 14;
          if (elapsed > 320 || movement > movementLimit) return;
          this.scheduleQuiltSingleTapSpotlight(0);
        };

        surface.addEventListener('pointerdown', (event) => {
          if (!this.isQuiltSpotlightGestureAllowed(event)) {
            if (event.pointerType !== 'touch') {
              this._quiltTapSpotlightState = null;
            }
            return;
          }
          this._quiltTapSpotlightState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startedAt: Date.now(),
            handled: false
          };
        });
        if (!surface.dataset.quiltTapScrollCancel) {
          surface.dataset.quiltTapScrollCancel = '1';
          surface.addEventListener(
            'scroll',
            () => {
              this._quiltTapSpotlightState = null;
              this.cancelQuiltSingleTapSpotlight();
            },
            { passive: true }
          );
        }
        surface.addEventListener('touchstart', (event) => {
          if (event.touches?.length !== 1 || this._quiltTapSpotlightState) return;
          const touch = event.touches[0];
          if (
            !this.isQuiltSpotlightGestureAllowed({
              clientX: touch.clientX,
              clientY: touch.clientY,
              target: event.target
            })
          ) {
            return;
          }
          this._quiltTapSpotlightState = {
            pointerId: null,
            startX: touch.clientX,
            startY: touch.clientY,
            startedAt: Date.now(),
            handled: false
          };
        }, { passive: true });
        surface.addEventListener('pointerup', (event) => {
          const state = this._quiltTapSpotlightState;
          if (!state) return;
          state.handled = true;
          finishTapSpotlight(event, event.clientX, event.clientY);
        });
        surface.addEventListener('touchend', (event) => {
          const state = this._quiltTapSpotlightState;
          if (!state || state.handled) return;
          const touch = event.changedTouches?.[0];
          if (!touch) return;
          finishTapSpotlight(event, touch.clientX, touch.clientY);
        }, { passive: true });
        surface.addEventListener('pointercancel', () => {
          this._quiltTapSpotlightState = null;
        });
      }

      isInteractiveQuiltGestureTarget(target) {
        return !!(
          target &&
          typeof target.closest === 'function' &&
          target.closest('button, a, input, textarea, select, label, [data-next], [role="button"]')
        );
      }

      isQuiltOverlayContentTarget(target) {
        return !!(
          target &&
          typeof target.closest === 'function' &&
          target.closest(
            '.quote-card-stack, .quilt-mood-duo, .quilt-fabric-color-stage, .quilt-name-ballot-wrap, .button-container, .quote-speaker-stage, .odq-admin-daily-task-banner, .quilt-user-color-card-wrap, .quilt-mood-terminal-host, .quilt-quote-display, .quilt-mood-collage, .quilt-mood-triptych, .quilt-reflection-scrap-widget, .quilt-reflection-wall, .quilt-reflection-carousel, [data-reflection-carousel]'
          )
        );
      }

      isQuiltOverlayContentAtPoint(clientX, clientY) {
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
        if (typeof document.elementFromPoint !== 'function') return false;
        const top = document.elementFromPoint(clientX, clientY);
        return this.isQuiltOverlayContentTarget(top) || this.isInteractiveQuiltGestureTarget(top);
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
        if (!this.isClientPointInsidePrimaryQuilt(touch.clientX, touch.clientY)) return;
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
        const surface = this.getQuiltGestureSurface();
        if (!surface) return;
        const quiltSVG = document.getElementById('quilt');

        // Tap or press-and-hold on quilt art to spotlight your square.
        // Bind to #screen-quilt (not .quilt-container): mobile CSS sets pointer-events:none on the fixed quilt shell so scroll passes through.
        this.setupQuiltBlockSpotlightLongPress();
        this.setupBlockSpotlightCoach();
        this.setupQuiltTapSpotlight();
        this.setupQuiltBlockDragScrub();
        if (quiltSVG) {
          quiltSVG.addEventListener('keydown', this.handleQuiltKeyboardSpotlight.bind(this));
          if (!quiltSVG.dataset.quiltSpotlightClickBound) {
            quiltSVG.dataset.quiltSpotlightClickBound = '1';
            quiltSVG.addEventListener('click', (event) => {
              if (this._quiltSpotlightHoldFired) return;
              if (!this.isQuiltSpotlightGestureAllowed(event)) return;
              this.cancelQuiltSingleTapSpotlight();
              void this.handleShowMyBlock();
            });
          }
        }
      }

      /**
       * Drag across the quilt: each block under the finger tips once, then settles.
       * Vertical page scroll used to steal the gesture (pan-y) — while scrubbing on the quilt
       * we preventDefault so up/down tips work like left/right. Scroll from below the quilt.
       */
      setupQuiltBlockDragScrub() {
        if (!this.quiltDragScrubEnabled || this._quiltDragScrubBound) return;
        const surface = this.getQuiltGestureSurface();
        if (!surface) return;
        this._quiltDragScrubBound = true;

        const overQuilt = (x, y) =>
          this.isClientPointInsideQuilt?.(x, y) || this.isQuiltArtHitAtPoint?.(x, y);

        const unbindDoc = () => {
          if (!this._quiltScrubDocBound) return;
          document.removeEventListener('touchmove', this._quiltScrubDocMove, true);
          document.removeEventListener('touchend', this._quiltScrubDocEnd, true);
          document.removeEventListener('touchcancel', this._quiltScrubDocEnd, true);
          this._quiltScrubDocBound = false;
        };

        const endScrub = () => {
          this._quiltScrubActive = false;
          this._quiltScrubVisited = null;
          this._quiltScrubLastSample = null;
          this._quiltScrubHitCache = null;
          unbindDoc();
        };

        const onScrubMove = (event) => {
          if (!this._quiltScrubActive) return;
          if (event.touches?.length !== 1) {
            endScrub();
            return;
          }
          if (this.quiltZoomState?.isPinching || this.quiltZoomState?.isPanning) {
            endScrub();
            return;
          }
          if (this.isQuiltSpotlightActive?.()) {
            endScrub();
            return;
          }
          const touch = event.touches[0];
          const onQuilt = overQuilt(touch.clientX, touch.clientY);
          // Hold the gesture so vertical pans aren't taken by #screen-quilt scrolling.
          if (onQuilt && event.cancelable) {
            event.preventDefault();
          }
          if (!onQuilt) return;
          const last = this._quiltScrubLastSample;
          if (last && Math.hypot(touch.clientX - last.x, touch.clientY - last.y) < 3) return;
          this._quiltScrubLastSample = { x: touch.clientX, y: touch.clientY };
          this._scrubQuiltBlockAtPoint(touch.clientX, touch.clientY);
        };

        this._quiltScrubDocMove = onScrubMove;
        this._quiltScrubDocEnd = () => endScrub();

        const bindDoc = () => {
          if (this._quiltScrubDocBound) return;
          this._quiltScrubDocBound = true;
          document.addEventListener('touchmove', this._quiltScrubDocMove, {
            capture: true,
            passive: false
          });
          document.addEventListener('touchend', this._quiltScrubDocEnd, {
            capture: true,
            passive: true
          });
          document.addEventListener('touchcancel', this._quiltScrubDocEnd, {
            capture: true,
            passive: true
          });
        };

        surface.addEventListener(
          'touchstart',
          (event) => {
            if (!this.quiltDragScrubEnabled) return;
            if (event.touches?.length !== 1) return;
            if (this.quiltZoomState?.isPinching || this.quiltZoomState?.isPanning) return;
            if (this.isQuiltSpotlightActive?.()) return;
            const touch = event.touches[0];
            if (!overQuilt(touch.clientX, touch.clientY)) return;
            this._quiltScrubActive = true;
            this._quiltScrubVisited = new WeakSet();
            this._quiltScrubLastSample = { x: touch.clientX, y: touch.clientY };
            this._cacheQuiltScrubHitRects();
            bindDoc();
            this._scrubQuiltBlockAtPoint(touch.clientX, touch.clientY);
          },
          { passive: true }
        );
      }

      _cacheQuiltScrubHitRects() {
        const svg = document.getElementById('quilt');
        if (!svg) {
          this._quiltScrubHitCache = [];
          return;
        }
        const list = [];
        svg.querySelectorAll('.quilt-parallax-block').forEach((block) => {
          if (block.classList.contains('quilt-parallax-block--hst')) return;
          if (this.isQuiltParallaxProtectedNode?.(block)) return;
          const rect = block.getBoundingClientRect?.();
          if (!rect || rect.width < 2 || rect.height < 2) return;
          list.push({
            block,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            area: rect.width * rect.height
          });
        });
        this._quiltScrubHitCache = list;
      }

      _quiltBlockAtClientPoint(clientX, clientY) {
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
        // Compare finger to on-screen block boxes (handles split-band / mirror transforms).
        if (!Array.isArray(this._quiltScrubHitCache) || !this._quiltScrubHitCache.length) {
          this._cacheQuiltScrubHitRects();
        }
        const cache = this._quiltScrubHitCache || [];
        let best = null;
        let bestArea = Infinity;
        for (let i = 0; i < cache.length; i++) {
          const hit = cache[i];
          if (
            clientX < hit.left ||
            clientX > hit.right ||
            clientY < hit.top ||
            clientY > hit.bottom
          ) {
            continue;
          }
          if (hit.area < bestArea) {
            bestArea = hit.area;
            best = hit.block;
          }
        }
        return best;
      }

      _scrubQuiltBlockAtPoint(clientX, clientY) {
        const block = this._quiltBlockAtClientPoint(clientX, clientY);
        if (!block || !this._quiltScrubVisited) return;
        if (this._quiltScrubVisited.has(block)) return;
        this._quiltScrubVisited.add(block);
        this._playQuiltBlockScrubTip(block);
      }

      _playQuiltBlockScrubTip(node) {
        if (!node || typeof node.setAttribute !== 'function') return;
        let cx = Number(node.dataset.parallaxCx);
        let cy = Number(node.dataset.parallaxCy);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
          try {
            const bbox = node.getBBox?.();
            if (bbox && bbox.width > 0 && bbox.height > 0) {
              cx = bbox.x + bbox.width / 2;
              cy = bbox.y + bbox.height / 2;
            }
          } catch (_) {
            return;
          }
        }
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
        const base = node.dataset.baseTransform || node.getAttribute('transform') || '';
        const sign = this._quiltScrubTipSign === -1 ? -1 : 1;
        this._quiltScrubTipSign = -sign;
        const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const dur = 380;
        const tick = (now) => {
          if (this.isQuiltSpotlightActive?.()) {
            node.setAttribute('transform', base);
            return;
          }
          const t = Math.min(1, (now - start) / dur);
          const wave = Math.sin(t * Math.PI);
          const scale = 1 + 0.1 * wave;
          const rot = 5.5 * wave * sign;
          node.setAttribute(
            'transform',
            [
              `translate(${cx.toFixed(3)}, ${cy.toFixed(3)})`,
              `rotate(${rot.toFixed(2)})`,
              `scale(${scale.toFixed(4)})`,
              `translate(${(-cx).toFixed(3)}, ${(-cy).toFixed(3)})`,
              base
            ]
              .filter(Boolean)
              .join(' ')
          );
          if (t < 1) {
            requestAnimationFrame(tick);
          } else {
            node.setAttribute('transform', base);
          }
        };
        requestAnimationFrame(tick);
      }

      syncQuiltFilmGrainOverlay() {
        const qc = document.querySelector('#screen-quilt .quilt-container');
        const canvas = document.getElementById('quiltFilmGrainOverlay');
        if (!qc || !canvas) return;
        const quiltScreen = document.getElementById('screen-quilt');
        const visible = quiltScreen && quiltScreen.classList.contains('active');
        if (!visible) return;
        const svg = document.getElementById('quilt');
        if (!svg || svg.childElementCount === 0) {
          canvas.classList.remove('quilt-film-grain-ready');
          return;
        }
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
          const sizeKey = `${wPx}x${hPx}`;
          if (canvas.dataset.grainSize === sizeKey && canvas.classList.contains('quilt-film-grain-ready')) {
            return;
          }
          const sizeChanged = canvas.width !== bw || canvas.height !== bh;
          if (sizeChanged) {
            canvas.classList.remove('quilt-film-grain-ready');
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
          const isNative =
            typeof odqIsCapacitorNative === 'function' && odqIsCapacitorNative();
          const clipPath = Utils.buildQuiltGrainClipPathFromSvg(svg, wPx, hPx);
          ctx.save();
          if (clipPath) {
            ctx.clip(clipPath);
          }
          Utils.applyFilmGrain(ctx, wPx, hPx, 0, { vignette: false, textureOnly: isNative });
          ctx.restore();
          canvas.dataset.grainSize = sizeKey;
          canvas.classList.add('quilt-film-grain-ready');
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
        const quiltSVG = document.getElementById('quilt');
        if (quiltSVG?.getAttribute('data-quilt-split-band') === '1') return viewBox;
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

      getQuiltPrimaryBandRect() {
        const svg = document.getElementById('quilt');
        if (!svg || svg.getAttribute('data-quilt-split-band') !== '1') {
          return this.getQuiltInteractionRect();
        }
        const primaryBand = svg.querySelector('#quiltPrimaryBand');
        if (primaryBand) {
          const rect = primaryBand.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return rect;
        }
        const quiltRect = this.getQuiltInteractionRect();
        if (!quiltRect) return null;
        const height = quiltRect.height * 0.52;
        return {
          left: quiltRect.left,
          right: quiltRect.right,
          top: quiltRect.top,
          bottom: quiltRect.top + height,
          width: quiltRect.width,
          height
        };
      }

      isClientPointInsideQuilt(clientX, clientY) {
        // Full quilt field (primary + mirror). Spotlight long-press/tap must work on either half.
        const rect = this.getQuiltInteractionRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      }

      isClientPointInsidePrimaryQuilt(clientX, clientY) {
        const rect = this.getQuiltPrimaryBandRect() || this.getQuiltInteractionRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      }

      isQuiltSpotlightActive() {
        const svg = document.getElementById('quilt');
        return !!(
          svg?.classList.contains('quilt-spotlight-active') ||
          document.getElementById('quiltHtmlSpotlightDim')?.classList.contains('is-active') ||
          this._myBlockSpotlightRestore?.group ||
          this._myBlockSpotlightHoldTimer ||
          this._myBlockSpotlightFadeTimer
        );
      }

      isQuiltParallaxProtectedNode(node) {
        return !!(node && typeof node.closest === 'function' && node.closest('#quiltSpotlightOverlay'));
      }

      areTouchesInsideQuilt(touches) {
        if (!touches || touches.length === 0) return false;
        return Array.from(touches).every((touch) => this.isClientPointInsideQuilt(touch.clientX, touch.clientY));
      }

      isQuiltZoomAvailable() {
        const quiltScreen = document.getElementById('screen-quilt');
        const quiltSVG = document.getElementById('quilt');
        if (!quiltScreen || !quiltSVG) return false;
        if (quiltSVG.getAttribute('data-quilt-split-band') === '1') return false;
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

      /** Lightweight scroll-active flag for quiet-queue / keep-warm (no visual work). */
      setupQuiltScrollActivityTracker() {
        if (this._quiltScrollActivityBound) return;
        this._quiltScrollActivityBound = true;
        const onScroll = () => {
          this._markParallaxScrollActive?.();
        };
        const quiltScreen = document.getElementById('screen-quilt');
        const scroller =
          (typeof this.getQuiltScrollContainer === 'function' && this.getQuiltScrollContainer()) ||
          quiltScreen;
        [scroller, quiltScreen].filter(Boolean).forEach((el) => {
          el.addEventListener('scroll', onScroll, { passive: true });
        });
      }

      setupQuiltParallax() {
        const app = document.getElementById('app');
        const quiltScreen = document.getElementById('screen-quilt');
        const quiltButtonPanel = document.querySelector('#screen-quilt .button-container');
        this.parallaxScrollListener = this.handleParallaxScroll.bind(this);
        // Always track scroll activity, even when motion FX are off (native).
        this.setupQuiltScrollActivityTracker();

        if (this.isAndroidClient()) {
          document.documentElement.classList.add('odq-android-client');
        }

        if (!this.parallaxEnabled && !this.blockJitterEnabled && !this.quiltWobbleEnabled) return;

        const parallaxRenderEnabled = this.isQuiltParallaxRenderEnabled();
        if (parallaxRenderEnabled) {
          window.addEventListener('scroll', this.parallaxScrollListener, { passive: true });
        }
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
          if (this.isAndroidClient()) return;
          target.addEventListener('touchstart', this.parallaxTouchStartListener, { passive: true });
          target.addEventListener('touchmove', this.parallaxInteractionListener, { passive: true });
        };
        if (parallaxRenderEnabled) {
          addParallaxInteractionListeners(window);
          addParallaxInteractionListeners(app);
          addParallaxInteractionListeners(quiltScreen);
          addParallaxInteractionListeners(quiltButtonPanel);
        }
        if (parallaxRenderEnabled && app) {
          app.addEventListener('scroll', this.parallaxScrollListener, { passive: true });
        }
        if (parallaxRenderEnabled && quiltScreen) {
          quiltScreen.addEventListener('scroll', this.parallaxScrollListener, { passive: true });
        }
        if (parallaxRenderEnabled && quiltButtonPanel) {
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
            this._quiltBottomModalShownThisVisit = false;
            this._blockSpotlightCoachDismissedThisVisit = false;
            this.resetStudioFloorFooterBottomVisitTracking?.();
            this.resetQuiltParallaxVisualState();
            this.handleParallaxScroll();
            if (!e.detail.skipQuiltScrollCue) {
              this._quiltScrollCuePlayed = false;
              this._quiltFabricPeekHintPlayed = false;
              if (this.shouldDeferQuiltScrollHintsForCoach()) {
                this.clearQuiltScrollCue();
                this.scheduleBlockSpotlightCoach();
              } else if (
                this._quiltUserColorCardVisible?.() ||
                typeof this.getExitChamberTodayPieceData === 'function' &&
                this.getExitChamberTodayPieceData()
              ) {
                this.scheduleFabricScrollPeekHint();
              } else {
                this.scheduleQuiltScrollCue(1000);
              }
            }
          } else {
            this.clearBlockSpotlightCoach();
            this.clearQuiltScrollCue();
            this.parallaxTargetShift = 0;
            this._wobbleEnergyTarget = 0;
            this.requestParallaxFrame();
          }
        });

        if (this.parallaxEnabled || this.blockJitterEnabled) {
          this.requestParallaxFrame();
        }
      }

      isAndroidClient() {
        try {
          const platform = window.Capacitor?.getPlatform?.();
          if (platform === 'android') return true;
        } catch (_) {
          /* fall back to user agent */
        }
        return /Android/i.test(String(window.navigator?.userAgent || ''));
      }

      isQuiltParallaxRenderEnabled() {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
        // Soft per-block ripple is fine on Android; whole-quilt CSS shift stays iOS/web-only.
        if (this.isAndroidClient()) return !!this.blockJitterEnabled || !!this.quiltWobbleEnabled;
        return !!this.parallaxEnabled || !!this.blockJitterEnabled || !!this.quiltWobbleEnabled;
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
              this.checkQuiltNotificationPromptFromLayout();
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
          this._quiltBottomModalShownThisVisit = false;
          this.resetStudioFloorFooterBottomVisitTracking?.();
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
        const footerVisible = this.isQuiltFooterVisibleInViewport();
        this.noteStudioFloorFooterBottomVisit?.(footerVisible);
        if (footerVisible) {
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
        if (this._quiltFabricPeekTimer != null) {
          clearTimeout(this._quiltFabricPeekTimer);
          this._quiltFabricPeekTimer = null;
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

      scheduleQuiltScrollCue(delayMs = 1000, options = {}) {
        const force = options?.force === true;
        if (this._quiltScrollCuePlayed && !force) return;
        if (force && this._quiltFabricPeekHintPlayed) return;
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

      scheduleFabricScrollPeekHint(delayMs) {
        if (this.shouldDeferQuiltScrollHintsForCoach?.()) return;
        if (this._quiltFabricPeekHintPlayed) return;
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

        const screenStyle =
          typeof getComputedStyle === 'function' ? getComputedStyle(quiltScreen) : null;
        const tokenDelay = parseFloat(
          screenStyle?.getPropertyValue('--quilt-fabric-peek-delay') || ''
        );
        const waitMs = Math.max(
          0,
          Number(delayMs) ||
            (Number.isFinite(tokenDelay) ? tokenDelay : 0) ||
            1000
        );

        this._quiltFabricPeekTimer = setTimeout(() => {
          this._quiltFabricPeekTimer = null;
          this._tryPlayFabricScrollPeekHint(0);
        }, waitMs);
      }

      _quiltUserColorCardVisible() {
        const wrap = document.getElementById('quiltUserColorCardWrap');
        return !!(wrap && !wrap.hidden && !wrap.hasAttribute('hidden'));
      }

      _quiltScrollPeekHintTarget() {
        if (this._quiltUserColorCardVisible()) {
          return document.getElementById('quiltUserColorCardWrap') || document.getElementById('quiltFabricColorStage');
        }
        const moodSpread = document.getElementById('quiltMoodSpread');
        if (moodSpread?.classList.contains('is-ready') && !moodSpread.hidden) {
          return document.querySelector('#screen-quilt .quote-card-stack');
        }
        return null;
      }

      _waitingForFabricScrollPeek() {
        if (typeof this.getExitChamberTodayPieceData !== 'function') return false;
        if (!this.getExitChamberTodayPieceData()) return false;
        return !this._quiltUserColorCardVisible();
      }

      _tryPlayFabricScrollPeekHint(attempt = 0) {
        if (this._quiltFabricPeekHintPlayed) return;
        const activeQuiltScreen = document.getElementById('screen-quilt');
        if (!activeQuiltScreen?.classList.contains('active')) return;

        if (!this._quiltUserColorCardVisible()) {
          if (attempt < 40) {
            this._quiltFabricPeekTimer = setTimeout(() => {
              this._quiltFabricPeekTimer = null;
              this._tryPlayFabricScrollPeekHint(attempt + 1);
            }, 200);
          }
          return;
        }

        const cardWrap = document.getElementById('quiltUserColorCardWrap');
        if (!cardWrap || cardWrap.hidden || cardWrap.hasAttribute('hidden')) return;

        this._quiltFabricPeekHintPlayed = true;
        this._quiltScrollCuePlayed = true;
        this.clearQuiltScrollCue();
        // IMPORTANT: This is the after-quilt-load color card peek. Use the card's
        // restartable bounce helper so an earlier hidden/early bounce cannot consume it.
        if (typeof this.playQuiltUserColorCardBounce === 'function') {
          this.playQuiltUserColorCardBounce();
        } else {
          this._playTransformPeekHintOn(cardWrap);
        }
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

        if (this._waitingForFabricScrollPeek() && attempt < 24) {
          this._quiltScrollCueTimer = setTimeout(() => {
            this._quiltScrollCueTimer = null;
            this._tryPlayQuiltScrollCue(attempt + 1);
          }, 250);
          return;
        }

        if (
          typeof this.getExitChamberTodayPieceData === 'function' &&
          this.getExitChamberTodayPieceData()
        ) {
          if (this._quiltUserColorCardVisible()) {
            this._tryPlayFabricScrollPeekHint(0);
          }
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

        const peekTarget = this._quiltScrollPeekHintTarget();
        if (peekTarget) {
          this._quiltScrollCuePlayed = true;
          this.clearQuiltScrollCue();
          this._playTransformPeekHintOn(peekTarget);
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

      /** Transform peek without touching scrollTop — fabric card when visible, else quote stack. */
      _playTransformPeekHintOn(target) {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        if (!target || target.classList.contains('is-triptych-peek-hint')) return;
        target.classList.add('is-triptych-peek-hint');
        if (target.id === 'quiltFabricColorStage' || target.id === 'quiltUserColorCardWrap') {
          this._quiltFabricPeekHintPlayed = true;
        }
        const done = () => target.classList.remove('is-triptych-peek-hint');
        target.addEventListener('animationend', done, { once: true });
        const isFabricPeek =
          target.id === 'quiltFabricColorStage' || target.id === 'quiltUserColorCardWrap';
        const screenStyle =
          isFabricPeek && typeof getComputedStyle === 'function'
            ? getComputedStyle(document.getElementById('screen-quilt') || document.documentElement)
            : null;
        const fabricDurationMs = isFabricPeek
          ? parseFloat(screenStyle?.getPropertyValue('--quilt-fabric-peek-duration') || '') * 1000
          : 0;
        window.setTimeout(done, Number.isFinite(fabricDurationMs) && fabricDurationMs > 0 ? fabricDurationMs + 80 : 1500);
      }

      _playTriptychTransformPeekHint() {
        this._playTransformPeekHintOn(this._quiltScrollPeekHintTarget());
      }

      handleParallaxInteraction(event) {
        if (!this.isQuiltParallaxRenderEnabled()) return;
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
          if (this.parallaxEnabled) {
            const scrollDelta = this.getCurrentQuiltScrollPosition() - this.parallaxAnchorScrollTop;
            const interactionShift = interactionDelta * this.parallaxBaseRate * 0.7;
            const rawShift = scrollDelta * this.parallaxBaseRate + interactionShift;
            this.parallaxTargetShift = Math.max(-this.parallaxMaxShift, Math.min(this.parallaxMaxShift, rawShift));
          }
          if (this.quiltWobbleEnabled) {
            this._wobbleEnergyTarget = Math.min(
              1,
              Math.max(this._wobbleEnergyTarget || 0, 0.55 + Math.abs(interactionDelta) / 40)
            );
          }
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
        // Hold through sparse scroll events so the zoom cycle can finish in→out→in.
        this._parallaxScrollEndTimer = setTimeout(() => {
          this._parallaxScrollEndTimer = null;
          this._parallaxScrollActive = false;
          if (this.parallaxScrollOnly) this.parallaxTargetShift = 0;
          this._flushQuiltScrollQuietQueue?.();
          this.requestParallaxFrame();
        }, 420);
      }

      handleParallaxScroll() {
        if (!this.isQuiltParallaxRenderEnabled()) return;
        // Still allow inflate during the scroll cue; only skip prompt side-effects below.
        const scrollCuePlaying = !!this._quiltScrollCuePlaying;
        if (this.isQuiltSpotlightActive()) return;

        const quiltScreen = document.getElementById('screen-quilt');
        const isQuiltActive = quiltScreen && quiltScreen.classList.contains('active');

        if (!isQuiltActive) {
          this.parallaxTargetShift = 0;
          this.requestParallaxFrame();
          return;
        }

        this._markParallaxScrollActive();

        if (this.parallaxEnabled) {
          const scrollDelta = this.getCurrentQuiltScrollPosition() - this.parallaxAnchorScrollTop;
          const rawShift = scrollDelta * this.parallaxBaseRate;
          this.parallaxTargetShift = Math.max(-this.parallaxMaxShift, Math.min(this.parallaxMaxShift, rawShift));
        }
        if (this.quiltWobbleEnabled) {
          const scrollDelta = Math.abs(this.getCurrentQuiltScrollPosition() - this.parallaxAnchorScrollTop);
          this._wobbleEnergyTarget = Math.min(1, 0.35 + scrollDelta / 180);
        }
        this.requestParallaxFrame();
        if (!scrollCuePlaying) {
          this.handleQuiltNotificationPromptOnScroll();
        }
      }

      /** Scroll-only parallax: hold a soft tip while the gesture is live, ease to 0 when quiet. */
      _syncScrollOnlyParallaxTarget() {
        if (!this.parallaxEnabled || !this.parallaxScrollOnly) return;
        if (this._parallaxScrollActive) return;
        this.parallaxTargetShift = 0;
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
       * Quilt bottom prompts: what's-new (first), then daily push opt-in, then feature-feedback nudge.
       * All three fire only after the user scrolls the quilt screen to the bottom.
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
            void this.maybeOfferFeatureFeedbackNudge().catch((error) => {
              this.logger.warn('Feature feedback nudge failed:', error);
            });
          });
      }

      requestParallaxFrame() {
        if (!this.isQuiltParallaxRenderEnabled()) {
          this.parallaxTicking = false;
          return;
        }
        if (this.parallaxTicking) return;
        this.parallaxTicking = true;
        requestAnimationFrame(() => this.applyQuiltParallaxFrame());
      }

      /** Smaller blocks get quieter scroll jitter; large blocks stay at full current amount. */
      getParallaxBlockJitterSizeScale(node) {
        const cached = Number(node?.dataset?.parallaxSizeScale);
        if (Number.isFinite(cached) && cached > 0) return cached;

        let minSide = Number(node?.dataset?.parallaxMinSide);
        if (!(Number.isFinite(minSide) && minSide > 0)) {
          minSide = 72;
          try {
            const bbox = node.getBBox?.();
            if (bbox && Number.isFinite(bbox.width) && Number.isFinite(bbox.height) && bbox.width > 0 && bbox.height > 0) {
              minSide = Math.min(bbox.width, bbox.height);
            }
          } catch (_) {
            /* detached / not rendered yet */
          }
        }

        // Tiny ~0.22; mid (~60) ~0.45; large (110+) = 1.0.
        const t = Math.min(1, Math.max(0, (minSide - 12) / 100));
        const sizeScale = 0.22 + t * t * 0.78;
        if (node?.dataset) node.dataset.parallaxSizeScale = String(sizeScale);
        return sizeScale;
      }

      _clearQuiltWobbleCss() {
        document.documentElement.style.setProperty('--quilt-wobble-x', '0px');
        document.documentElement.style.setProperty('--quilt-wobble-y', '0px');
        document.documentElement.style.setProperty('--quilt-wobble-rot', '0deg');
      }

      _resetQuiltBlockMotionTransforms(blocks) {
        (blocks || []).forEach((node) => {
          if (this.isQuiltParallaxProtectedNode(node)) return;
          node.setAttribute('transform', node.dataset.baseTransform || '');
        });
        this._parallaxBlocksJittered = false;
        this._parallaxBlocksWobbled = false;
      }

      /**
       * Whole-quilt CSS breath + overlay ripple.
       * Moves the full field (and grain/glow slightly out of phase) — no per-piece transforms, no seam gaps.
       */
      applyQuiltWobbleFrame(blocks) {
        const quiltScreen = document.getElementById('screen-quilt');
        const quiltActive = !!quiltScreen?.classList.contains('active');
        const quiltSvg = document.getElementById('quilt');
        if (!quiltActive || this.isQuiltSpotlightActive()) {
          this._wobbleEnergy = 0;
          this._wobbleEnergyTarget = 0;
          this._clearQuiltWobbleCss();
          if (!this.parallaxEnabled) {
            document.documentElement.style.setProperty('--quilt-overlay-shift', '0px');
          }
          quiltSvg?.classList.remove('quilt--wobble-live');
          if (this._parallaxBlocksWobbled) this._resetQuiltBlockMotionTransforms(blocks);
          return false;
        }

        // Clear any leftover per-piece wobble transforms from earlier experiments.
        if (this._parallaxBlocksWobbled) {
          this._resetQuiltBlockMotionTransforms(blocks);
        }
        quiltSvg?.classList.remove('quilt--wobble-live');

        const resting = 0.55;
        if (!this._parallaxScrollActive) {
          this._wobbleEnergyTarget = resting;
        } else {
          this._wobbleEnergyTarget = Math.min(1, Math.max(this._wobbleEnergyTarget || 0, 0.75));
        }
        const energy = Number(this._wobbleEnergy) || 0;
        const target = Number(this._wobbleEnergyTarget) || 0;
        this._wobbleEnergy = energy + (target - energy) * 0.08;
        if (this._wobbleEnergy < 0.35) this._wobbleEnergy = 0.35;

        const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        const e = Math.max(0, Math.min(1.15, this._wobbleEnergy));
        // Slow, small, GPU CSS transform — reads as breath, not jitter.
        const ampX = 0.7 + e * 1.6;
        const ampY = 0.55 + e * 1.25;
        const ampRot = 0.08 + e * 0.18;
        const x = Math.sin(t * 0.55) * ampX + Math.sin(t * 0.23 + 1.2) * ampX * 0.35;
        const y = Math.cos(t * 0.42 + 0.3) * ampY + Math.sin(t * 0.19) * ampY * 0.3;
        const rot = Math.sin(t * 0.33 + 0.5) * ampRot;
        // Grain / paper-dot overlay drifts a little differently → soft ripple depth.
        const overlayY =
          Math.sin(t * 0.48 + 0.9) * (1.1 + e * 2.2) +
          Math.cos(t * 0.21 + 0.4) * (0.5 + e * 0.9);

        document.documentElement.style.setProperty('--quilt-wobble-x', `${x.toFixed(3)}px`);
        document.documentElement.style.setProperty('--quilt-wobble-y', `${y.toFixed(3)}px`);
        document.documentElement.style.setProperty('--quilt-wobble-rot', `${rot.toFixed(3)}deg`);
        if (!this.parallaxEnabled) {
          document.documentElement.style.setProperty('--quilt-overlay-shift', `${overlayY.toFixed(3)}px`);
        }
        return true;
      }

      applyQuiltParallaxFrame() {
        if (this.isQuiltSpotlightActive()) {
          this.parallaxTicking = false;
          this._clearQuiltWobbleCss();
          this._blockRippleScrollQuiet = 0;
          this._blockInflateShown = 1;
          this._resetQuiltBlockMotionTransforms(
            Array.from(document.querySelectorAll('#quilt .quilt-parallax-block'))
          );
          return;
        }

        const quiltSvg = document.getElementById('quilt');
        const baseViewBox = this.getParallaxBaseViewBox();
        const rect = quiltSvg?.getBoundingClientRect();
        const scale = baseViewBox && rect && rect.width > 0 && rect.height > 0
          ? Math.min(rect.width / baseViewBox.width, rect.height / baseViewBox.height)
          : 1;

        // Whole-quilt CSS drift: iOS/web only (Android keeps per-block ripple without field shift).
        if (this.parallaxEnabled && !this.isAndroidClient()) {
          this._syncScrollOnlyParallaxTarget();
          this.parallaxCurrentShift += (this.parallaxTargetShift - this.parallaxCurrentShift) * this.parallaxSmoothing;

          if (Math.abs(this.parallaxTargetShift - this.parallaxCurrentShift) < 0.01) {
            this.parallaxCurrentShift = this.parallaxTargetShift;
          }

          const baseShift = this.parallaxCurrentShift.toFixed(3);
          const overlayShift = (this.parallaxCurrentShift * this.parallaxOverlayMultiplier).toFixed(3);

          document.documentElement.style.setProperty('--quilt-base-shift', `${baseShift}px`);
          document.documentElement.style.setProperty('--quilt-overlay-shift', `${overlayShift}px`);
          const layer = document.getElementById('quiltParallaxLayer');
          if (layer) layer.removeAttribute('transform');
          // Soft tip — keep under ~2px on native scroll-only so it never fights the finger.
          const visualCap = this.parallaxScrollOnly ? 2.1 : 3.2;
          const visualShiftPx = Math.max(
            -visualCap,
            Math.min(visualCap, this.parallaxCurrentShift * (this.parallaxScrollOnly ? 0.36 : 0.42))
          );
          const svgShift = scale > 0 ? visualShiftPx / scale : visualShiftPx;
          this.parallaxAppliedSvgShift = Math.abs(this.parallaxCurrentShift) < 0.01 ? 0 : svgShift;
        } else if (!this.parallaxEnabled || this.isAndroidClient()) {
          this.parallaxCurrentShift = 0;
          this.parallaxTargetShift = 0;
          this.parallaxAppliedSvgShift = 0;
          document.documentElement.style.setProperty('--quilt-base-shift', '0px');
          document.documentElement.style.setProperty('--quilt-overlay-shift', '0px');
        }

        const blocks = Array.from(document.querySelectorAll('#quilt .quilt-parallax-block'));
        const quiltScreen = document.getElementById('screen-quilt');
        const quiltActive = !!quiltScreen?.classList.contains('active');
        // Soft per-block ripple: each piece drifts on its own phase (translate-only → fewer seam gaps).
        const applyBlockRipple = !!this.blockJitterEnabled && quiltActive;
        if (!applyBlockRipple) {
          if (this._parallaxBlocksJittered || this._parallaxBlocksWobbled) {
            this._resetQuiltBlockMotionTransforms(blocks);
          }
        } else {
          // Per-block inflate↔deflate while scrolling; freeze mid-cycle when idle (resume later).
          // Keep whole-quilt CSS zoom off so only pieces move.
          document.documentElement.style.setProperty('--quilt-scroll-zoom', '1');

          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const lastTs = Number(this._blockInflateLastTs);
          const dt = Number.isFinite(lastTs)
            ? Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000))
            : 0.016;
          this._blockInflateLastTs = now;

          let shown = Number(this._blockInflateShown);
          if (!Number.isFinite(shown) || shown < 1) shown = 1;

          const scrolling = !!this._parallaxScrollActive;
          if (scrolling) {
            let cycleT = Number(this._blockInflateCycleT);
            if (!Number.isFinite(cycleT)) {
              // Start at fully “deflated” so the first move eases out from 1×.
              cycleT = 0.75;
            }
            // ~0.75 Hz — clear inflate and deflate, repeatedly.
            cycleT += dt * 0.75;
            this._blockInflateCycleT = cycleT;

            let ampEnv = Number(this._blockZoomAmpEnv);
            if (!Number.isFinite(ampEnv)) ampEnv = 0;
            ampEnv += (1 - ampEnv) * (1 - Math.exp(-dt / 0.14));
            if (ampEnv > 0.998) ampEnv = 1;
            this._blockZoomAmpEnv = ampEnv;

            const wave = 0.5 + 0.5 * Math.sin(cycleT * Math.PI * 2);
            shown = 1 + 0.014 * ampEnv * wave;
            // Same tip angle for every block (tick-tock around each piece’s own center).
            const rot = 1.0 * ampEnv * Math.cos(cycleT * Math.PI * 2);
            this._blockInflateShown = shown;
            this._blockInflateSettle = shown;
            this._blockRippleScrollQuiet = 1;

            blocks.forEach((node) => {
              if (this.isQuiltParallaxProtectedNode(node)) return;
              const originalTransform = node.dataset.baseTransform || '';
              const cx = Number(node.dataset.parallaxCx);
              const cy = Number(node.dataset.parallaxCy);
              if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
                node.setAttribute('transform', originalTransform);
                return;
              }
              node.setAttribute(
                'transform',
                [
                  `translate(${cx.toFixed(3)}, ${cy.toFixed(3)})`,
                  `rotate(${rot.toFixed(3)})`,
                  `scale(${shown.toFixed(5)})`,
                  `translate(${(-cx).toFixed(3)}, ${(-cy).toFixed(3)})`,
                  originalTransform
                ].filter(Boolean).join(' ')
              );
            });
            this._parallaxBlocksJittered = true;
            this._parallaxBlocksWobbled = false;
          } else {
            // Idle — ease back to original formation (no leftover scale/tip).
            this._blockRippleScrollQuiet = 0;
            let settle = Number(this._blockInflateSettle);
            if (!Number.isFinite(settle)) settle = shown;
            settle += (1 - settle) * (1 - Math.exp(-dt / 0.14));
            if (Math.abs(settle - 1) < 0.002) settle = 1;
            this._blockInflateSettle = settle;
            this._blockInflateShown = settle;

            if (settle <= 1) {
              if (this._parallaxBlocksJittered || this._parallaxBlocksWobbled) {
                this._resetQuiltBlockMotionTransforms(blocks);
              }
            } else {
              // Keep a fading uniform scale while tips go to zero (formation rest).
              blocks.forEach((node) => {
                if (this.isQuiltParallaxProtectedNode(node)) return;
                const originalTransform = node.dataset.baseTransform || '';
                const cx = Number(node.dataset.parallaxCx);
                const cy = Number(node.dataset.parallaxCy);
                if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
                  node.setAttribute('transform', originalTransform);
                  return;
                }
                node.setAttribute(
                  'transform',
                  [
                    `translate(${cx.toFixed(3)}, ${cy.toFixed(3)})`,
                    `scale(${settle.toFixed(5)})`,
                    `translate(${(-cx).toFixed(3)}, ${(-cy).toFixed(3)})`,
                    originalTransform
                  ].filter(Boolean).join(' ')
                );
              });
              this._parallaxBlocksJittered = true;
            }
          }
        }

        const wobbleActive = !!this.quiltWobbleEnabled && this.applyQuiltWobbleFrame(blocks);
        const parallaxSettling = this.parallaxEnabled &&
          Math.abs(this.parallaxTargetShift - this.parallaxCurrentShift) > 0.01;
        // RAF while scrolling, or while easing home to the original layout.
        const breathActive = applyBlockRipple && (
          this._parallaxScrollActive || Number(this._blockInflateShown || 1) > 1.002
        );
        if (parallaxSettling || breathActive || wobbleActive) {
          requestAnimationFrame(() => this.applyQuiltParallaxFrame());
        } else {
          this.parallaxTicking = false;
        }
      }

      _getPublicQuiltNameApiBaseUrl() {
        const configured = String(
          (typeof CONFIG !== 'undefined' && CONFIG.BACKEND?.baseUrl) ||
            ''
        ).replace(/\/$/, '');
        const origin = String(window.location?.origin || '').replace(/\/$/, '');
        if (configured) return configured;
        return /^https?:\/\//i.test(origin) ? origin : '';
      }

      _generatePublicQuiltNameFallbackWords() {
        const base = [
          'Cerulean', 'Ember', 'Confluence', 'Velvet', 'Meridian',
          'Friction', 'Sapphire', 'Kindle', 'Hexagon', 'Undertow',
          'Crimson', 'Weave', 'Threshold', 'Scarlet', 'Tempest',
          'Stitch', 'Prism', 'Pulse', 'Indigo', 'Cartography'
        ];
        return base.sort(() => Math.random() - 0.5);
      }

      mountPublicQuiltNameBallot() {
        const wrap = document.getElementById('quiltNameBallotWrap');
        const cloud = document.getElementById('quiltNameBallotCloud');
        const statusEl = document.getElementById('quiltNameBallotStatus');
        if (!wrap || !cloud || !statusEl) return;
        wrap.hidden = false;
        wrap.removeAttribute('aria-hidden');

        if (wrap.dataset.quiltNameMounted === '1') return;
        wrap.dataset.quiltNameMounted = '1';

        const d = new Date();
        const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const baseUrl = this._getPublicQuiltNameApiBaseUrl();
        const voteKey = `quiltNameVote_${dateKey}`;
        let myVote = localStorage.getItem(voteKey) || null;
        let currentNameDoc = null;
        const getContributorCount = () => {
          const submitted = Number(this.quiltEngine?.submissionCount) || 0;
          const blockCount = Array.isArray(this.quiltEngine?.blocks) ? Math.max(0, this.quiltEngine.blocks.length - 1) : 0;
          return Math.max(submitted, blockCount);
        };
        const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[ch]));
        const renderPendingNote = () => {
          currentNameDoc = null;
          cloud.classList.add('admin-name-cloud--pending-note');
          cloud.innerHTML = `
            <div class="admin-name-pending-note" role="status" aria-live="polite">
              <p class="admin-name-pending-note__message">
                <span>PLEASE</span>
                <span>COME BACK</span>
                <span>LATER TO CAST</span>
                <span>YOUR VOTE</span>
              </p>
              <span class="admin-name-pending-note__signature" aria-hidden="true">XOZ</span>
            </div>
          `;
          statusEl.hidden = true;
        };
        const normalizeWords = (words) => (Array.isArray(words) ? words : [])
          .map((item) => {
            if (typeof item === 'string') {
              return { word: item.trim(), votes: 0, eliminated: false };
            }
            return {
              word: String(item?.word || '').trim(),
              votes: Number(item?.votes) || 0,
              eliminated: item?.eliminated === true
            };
          })
          .filter((item) => item.word);

        const fitNameCloudWords = () => {
          const buttons = cloud.querySelectorAll('.admin-name-cloud-word');
          buttons.forEach((button) => {
            const label = button.querySelector('.admin-name-cloud-word-label');
            if (!label) return;
            const tally = button.querySelector('.admin-name-cloud-word-tally');
            button.style.fontSize = '';
            button.style.letterSpacing = '';
            label.style.maxWidth = '';
            label.style.transform = '';
            label.style.transformOrigin = '';

            const baseSize = parseFloat(getComputedStyle(button).fontSize) || 16;
            const minSize = Math.max(9, baseSize * 0.52);
            const tallyWidth = tally ? tally.getBoundingClientRect().width + (baseSize * 0.4) : 0;
            const maxWidth = Math.max(20, button.clientWidth - tallyWidth - 4);
            let nextSize = baseSize;

            while (nextSize > minSize && label.scrollWidth > maxWidth) {
              nextSize -= 0.5;
              button.style.fontSize = `${nextSize}px`;
            }

            if (label.scrollWidth > maxWidth) {
              button.style.letterSpacing = '-0.035em';
              label.style.maxWidth = 'none';
              const naturalWidth = label.scrollWidth || label.getBoundingClientRect().width;
              const scale = Math.max(0.72, Math.min(1, maxWidth / Math.max(1, naturalWidth)));
              label.style.transform = `scaleX(${scale})`;
              label.style.transformOrigin = 'center';
            }
          });
        };

        const scheduleFitNameCloudWords = () => {
          requestAnimationFrame(() => {
            fitNameCloudWords();
            if (document.fonts?.ready) {
              document.fonts.ready.then(fitNameCloudWords).catch(() => {});
            }
          });
        };

        const getBallotScatterStyle = (word, idx) => {
          let seed = 0;
          const text = `${dateKey}:${idx}:${word}`;
          for (let i = 0; i < text.length; i += 1) {
            seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
          }
          const next = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
          };
          const x = ((next() - 0.5) * 4.8).toFixed(2);
          const y = ((next() - 0.5) * 12).toFixed(2);
          const rot = ((next() - 0.5) * 1.8).toFixed(2);
          return `--admin-name-scatter-x:${x}%;--admin-name-scatter-y:${y}%;--admin-name-scatter-rot:${rot}deg;`;
        };

        const renderCloud = (words) => {
          const slots = normalizeWords(words).slice(0, 20);
          while (slots.length < 20) slots.push({ word: '', votes: 0, eliminated: true });
          const showTallies = !!myVote;
          const winningVoteCount = showTallies
            ? slots.reduce((bestVotes, item) => {
              if (!item?.word || item.eliminated) return bestVotes;
              const votes = Number(item.votes) || 0;
              return votes > bestVotes ? votes : bestVotes;
            }, 0)
            : 0;
          const paperLayer = '<span class="admin-name-card-paper" aria-hidden="true"></span>';
          const cardImage = '<img class="admin-name-card-bg" src="assets/quilt-name-card.webp?v=4" alt="" aria-hidden="true" decoding="async" draggable="false">';
          const descriptor = `
            <button type="button" class="admin-name-ballot-info-btn" aria-label="How quilt naming works" aria-controls="quiltNameBallotInfoModal">?</button>
            <div class="admin-name-ballot-info-modal" id="quiltNameBallotInfoModal" role="dialog" aria-modal="true" aria-label="How quilt naming works" hidden>
              <div class="admin-name-ballot-info-card">
                <button type="button" class="admin-name-ballot-info-close" aria-label="Close">&times;</button>
                <p>You vote on one of <strong>20 words</strong> each day.</p>
                <p>Each early vote also removes another word from our list, narrowing the field until just <strong>four remain</strong>.</p>
                <p>At the end of each day, most votes wins the title.</p>
                <p><strong>Change your mind?</strong> Just tap another word &lt;3</p>
              </div>
            </div>
          `;
          const wordSlots = slots.map((w, idx) => {
            const row = idx % 10;
            const col = idx >= 10 ? 1 : 0;
            const topStep = Array.from({ length: row }, () => 'var(--admin-name-ballot-row-step)').join(' + ');
            const slotTop = topStep
              ? `calc(var(--admin-name-ballot-top, 31.6%) + ${topStep})`
              : 'var(--admin-name-ballot-top, 31.6%)';
            const slotLeft = col
              ? 'calc(var(--admin-name-ballot-left, 15.1%) + var(--admin-name-ballot-col-width) + var(--admin-name-ballot-gap, 4%))'
              : 'var(--admin-name-ballot-left, 15.1%)';
            const slotStyle = `--admin-name-slot-top:${slotTop};--admin-name-slot-left:${slotLeft};`;
            const colClass = col ? 'admin-name-card-slot--right' : 'admin-name-card-slot--left';
            if (!w?.word || w.eliminated) {
              return `<span class="admin-name-card-slot ${colClass} admin-name-card-slot--empty" style="${slotStyle}" aria-hidden="true"></span>`;
            }
            const isVoted = w.word === myVote;
            const safeVotes = Number(w.votes) || 0;
            const cls = [
              'admin-name-card-slot',
              colClass,
              'admin-name-cloud-word',
              isVoted ? 'admin-name-cloud-word--selected' : '',
              showTallies && winningVoteCount > 0 && safeVotes === winningVoteCount ? 'admin-name-cloud-word--winning' : ''
            ].filter(Boolean).join(' ');
            const safeWord = escapeHtml(w.word);
            const tally = showTallies
              ? `<span class="admin-name-cloud-word-tally" aria-label="${safeVotes} votes">${safeVotes}</span>`
              : '';
            return `<button type="button" class="${cls}" style="${slotStyle}${getBallotScatterStyle(w.word, idx)}" data-word="${safeWord}"><span class="admin-name-cloud-word-label">${safeWord}</span>${tally}</button>`;
          }).join('');
          return paperLayer + cardImage + wordSlots + descriptor;
        };

        const renderDoc = (doc) => {
          if (!doc || !Array.isArray(doc.words) || doc.words.length < 10) {
            renderPendingNote();
            return;
          }
          currentNameDoc = doc;
          cloud.classList.remove('admin-name-cloud--pending-note');
          cloud.innerHTML = renderCloud(doc.words);
          scheduleFitNameCloudWords();
          statusEl.hidden = true;
        };

        const castVote = async (word) => {
          const previousWord = myVote && myVote !== word ? myVote : '';
          if (myVote === word) {
            statusEl.hidden = true;
            return;
          }
          myVote = word;
          localStorage.setItem(voteKey, word);
          cloud.querySelectorAll('.admin-name-cloud-word').forEach((b) => {
            b.classList.toggle('admin-name-cloud-word--selected', b.dataset.word === word);
          });
          try {
            if (!baseUrl) throw new Error('No API base URL configured');
            const res = await fetch(`${baseUrl}/api/quilt-vote`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dateKey,
                word,
                previousWord,
                words: currentNameDoc?.words || [],
                contributorCount: getContributorCount()
              })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) throw new Error(data?.error || `Vote API returned ${res.status}`);
            if (data.doc?.words) renderDoc(data.doc);
          } catch (err) {
            console.warn('Name today quilt vote failed:', err);
          }
        };

        cloud.addEventListener('click', (e) => {
          if (e.target.closest('.admin-name-ballot-info-btn')) {
            cloud.querySelector('.admin-name-ballot-info-modal')?.removeAttribute('hidden');
            return;
          }
          if (
            e.target.closest('.admin-name-ballot-info-close') ||
            (e.target.classList?.contains('admin-name-ballot-info-modal'))
          ) {
            cloud.querySelector('.admin-name-ballot-info-modal')?.setAttribute('hidden', '');
            return;
          }
          const btn = e.target.closest('.admin-name-cloud-word');
          if (!btn) return;
          castVote(btn.dataset.word);
        });

        const init = async () => {
          const contributorCount = getContributorCount();
          renderPendingNote();
          try {
            if (!baseUrl) throw new Error('No API base URL configured');
            const colorFamilies = typeof this.analyzeColorFamilies === 'function'
              ? this.analyzeColorFamilies().slice(0, 5)
              : [];
            const res = await fetch(`${baseUrl}/api/quilt-name-generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dateKey, colorFamilies, blockCount: contributorCount })
            });
            const text = await res.text();
            let data = null;
            try {
              data = text ? JSON.parse(text) : null;
            } catch (_) {
              throw new Error(`API returned ${res.status}: ${text.slice(0, 120)}`);
            }
            if (!res.ok) throw new Error(data?.error || `API returned ${res.status}`);
            if (!data.success) throw new Error(data.error);
            if (Array.isArray(data.words) && data.words.length >= 10) {
              renderDoc({ words: data.words, status: 'active' });
              return;
            }
            renderPendingNote();
          } catch (err) {
            console.warn('Name today quilt words unavailable; showing pending note:', err);
            renderPendingNote();
          }
        };

        init();
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
