/**
 * Screen navigation and UI chrome
 * Exposes globalThis.UIService.
 */
(function (root) {
  'use strict';

class UIService {
  constructor(logger) {
    this.logger = logger;
    /** Cleared when leaving color screen so deferred theme work cannot run on the next screen. */
    this._colorScreenEntryThemeTimer = null;
    /** Screens opened from quilt scroll-end; return snaps to bottom with no scroll cue. */
    this._quiltScrollPreserveScreens = new Set([
      'screen-about',
      'screen-settings',
      'screen-reflection-themes-archive',
      'screen-social-posts',
      'screen-remember-today',
      'screen-remember-today-view'
    ]);
    this._savedQuiltScrollPosition = null;
    this._socialPostsViewportBase =
      'width=device-width, initial-scale=1, viewport-fit=cover';
  }

  showToast(message, duration = CONFIG.APP.toastDuration, link = null) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    const text = String(message ?? '');
    if (link) {
      // Create toast with link
      toast.innerHTML = `
        <span>${text}</span>
        <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="toast-link">
          ${link.text}
        </a>
      `;
    } else {
      // Regular toast without link
      toast.textContent = text;
    }

    const adminMenuOpen = !!document.querySelector('.admin-menu');
    toast.classList.toggle('toast--above-admin', adminMenuOpen);
    if (adminMenuOpen) {
      this._showAdminMenuFeedback(text, duration);
    }

    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.remove('toast--above-admin');
    }, duration);
  }

  _showAdminMenuFeedback(message, duration = CONFIG.APP.toastDuration) {
    const feedback = document.getElementById('admin-menu-feedback');
    if (!feedback) return;
    const text = String(message ?? '').trim();
    if (!text) {
      feedback.textContent = '';
      feedback.hidden = true;
      return;
    }
    feedback.textContent = text;
    feedback.hidden = false;
    if (this._adminMenuFeedbackTimer) clearTimeout(this._adminMenuFeedbackTimer);
    this._adminMenuFeedbackTimer = setTimeout(() => {
      if (feedback.textContent === text) {
        feedback.textContent = '';
        feedback.hidden = true;
      }
    }, duration);
  }

  /**
   * iOS-style top banner for milestone copy (not the bottom toast strip).
   * Pass `omitTitle: true` to render the card body-only (no title row,
   * no accent dot — the body becomes the sole text element). Useful
   * when the body is itself a complete sentence and a bolded title
   * above it would feel redundant.
   * @param {{ title?: string, body: string, accentColor?: string|null, duration?: number, iconUrl?: string, omitTitle?: boolean }} options
   */
  showInAppNotification(options = {}) {
    const body = typeof options.body === 'string' ? options.body.trim() : '';
    if (!body) return;

    const omitTitle = options.omitTitle === true;
    const title = omitTitle
      ? ''
      : (options.title && String(options.title).trim()) || CONFIG.APP.name || 'OUR DAILY QUILT';
    const duration = Math.max(
      2200,
      Number(options.duration) || CONFIG.APP.milestoneInAppNotificationMs || 7000
    );
    const accent = options.accentColor != null && String(options.accentColor).trim() ? String(options.accentColor).trim() : null;

    let host = document.getElementById('odq-inapp-notify-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'odq-inapp-notify-host';
      host.className = 'odq-inapp-notify-host';
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }

    const card = document.createElement('article');
    card.className = 'odq-inapp-notify';
    card.setAttribute('role', 'status');

    const iconWrap = document.createElement('div');
    iconWrap.className = 'odq-inapp-notify__icon-wrap';
    const img = document.createElement('img');
    img.className = 'odq-inapp-notify__icon';
    img.alt = '';
    img.decoding = 'async';
    const rawDefault = String(CONFIG.APP.defaultColor || '').trim();
    const fallbackHex = /^#?([0-9a-f]{6})$/i.test(rawDefault)
      ? `#${rawDefault.replace(/^#/, '')}`
      : '#ea9b9a';
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${fallbackHex}"/><path fill="rgba(255,255,255,0.35)" d="M10 10h18v18H10zm26 0h18v18H36zM10 36h18v18H10zm26 0h18v18H36z"/></svg>`;
    const fallbackDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fallbackSvg)}`;
    img.src = options.iconUrl || CONFIG.APP.notificationIconUrl || 'assets/icon.png';
    img.onerror = () => {
      img.onerror = null;
      img.src = fallbackDataUrl;
    };
    iconWrap.appendChild(img);

    const main = document.createElement('div');
    main.className = 'odq-inapp-notify__main';
    if (!omitTitle) {
      const titleRow = document.createElement('div');
      titleRow.className = 'odq-inapp-notify__title-row';
      const h = document.createElement('p');
      h.className = 'odq-inapp-notify__title';
      h.textContent = title;
      titleRow.appendChild(h);
      if (accent) {
        const dot = document.createElement('span');
        dot.className = 'odq-inapp-notify__accent';
        dot.style.backgroundColor = accent;
        dot.setAttribute('aria-hidden', 'true');
        titleRow.appendChild(dot);
      }
      main.appendChild(titleRow);
    }
    const p = document.createElement('p');
    p.className = 'odq-inapp-notify__body';
    p.textContent = body;
    main.appendChild(p);

    card.appendChild(iconWrap);
    card.appendChild(main);
    host.prepend(card);

    const removeCard = () => {
      if (!card.parentNode) return;
      card.classList.remove('odq-inapp-notify--in');
      card.classList.add('odq-inapp-notify--leaving');
      setTimeout(() => card.remove(), 400);
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => card.classList.add('odq-inapp-notify--in'));
    });

    let hideTimer = setTimeout(removeCard, duration);
    card.addEventListener('click', () => {
      clearTimeout(hideTimer);
      removeCard();
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        clearTimeout(hideTimer);
        removeCard();
      }
    });
    card.tabIndex = 0;

    return () => {
      clearTimeout(hideTimer);
      removeCard();
    };
  }

  showLoading(show = true) {
    const loading = document.getElementById('loading');
    if (!loading) return;
    if (show) {
      loading.classList.add('show');
    } else {
      loading.classList.remove('show');
    }
  }

  /**
   * Daily push opt-in: replaces window.confirm with a short fade + eased motion.
   * @param {{ sampleBody?: string, iconUrl?: string }} [options]
   * @returns {Promise<boolean>} true if user accepts reminders
   */
  showPushNotificationOptIn(options = {}) {
    const iconUrl = String(options.iconUrl || CONFIG.APP.notificationIconUrl || 'assets/icon.png').trim();
    const sampleBody = String(options.sampleBody || "Today's quote is ready.").trim();
    const escapeHtml = (value) =>
      String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'odq-push-optin-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'odq-push-optin-title');
      overlay.innerHTML = `
        <div class="odq-push-optin-scrim" data-odq-dismiss="1" aria-hidden="true"></div>
        <div class="odq-push-optin-dialog">
          <p id="odq-push-optin-title" class="odq-push-optin-copy">Something gets made here every day. Don't miss tomorrow's ♡</p>
          <p class="odq-push-optin-preview-label">↓ Today's notification ↓</p>
          <div class="odq-push-optin-preview">
            <div class="odq-push-optin-preview__stack">
              <div class="odq-push-optin-preview__card">
                <img class="odq-push-optin-preview__icon" src="${escapeHtml(iconUrl)}" alt="" width="38" height="38" decoding="async" />
                <div class="odq-push-optin-preview__main">
                  <div class="odq-push-optin-preview__meta">
                    <span class="odq-push-optin-preview__app">OUR DAILY QUILT</span>
                    <span class="odq-push-optin-preview__time">now</span>
                  </div>
                  <p class="odq-push-optin-preview__body">${escapeHtml(sampleBody)}</p>
                </div>
              </div>
            </div>
          </div>
          <div class="odq-push-optin-actions">
            <button type="button" class="odq-push-optin-btn odq-push-optin-btn--primary" data-odq-yes>Allow reminders</button>
            <button type="button" class="odq-push-optin-btn odq-push-optin-btn--secondary" data-odq-no>Not now</button>
          </div>
        </div>
      `;

      let settled = false;
      const cleanup = (accepted) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey);
        try {
          overlay.remove();
        } catch (e) {
          /* ignore */
        }
        resolve(accepted);
      };

      const finish = (accepted) => {
        if (settled || overlay._odqPushOptinFinishing) return;
        overlay._odqPushOptinFinishing = true;
        overlay.classList.remove('odq-push-optin--shown');
        overlay.classList.add('odq-push-optin--leaving');
        window.setTimeout(() => cleanup(accepted), 520);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') finish(false);
      };

      overlay.addEventListener('click', (e) => {
        const el = e.target;
        if (el && el.getAttribute && el.getAttribute('data-odq-dismiss') === '1') {
          finish(false);
        }
      });
      overlay.querySelector('[data-odq-yes]').addEventListener('click', () => finish(true));
      overlay.querySelector('[data-odq-no]').addEventListener('click', () => finish(false));

      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKey);
      const yesBtn = overlay.querySelector('[data-odq-yes]');
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const revealDelayMs = reducedMotion
        ? 0
        : Math.max(
            0,
            Number(options.revealDelayMs) || CONFIG.APP.pushOptInRevealDelayMs || 520
          );

      window.setTimeout(() => {
        overlay.classList.add('odq-push-optin--shown');
        if (yesBtn) {
          window.setTimeout(() => {
            try {
              yesBtn.focus({ preventScroll: true });
            } catch (_) {
              yesBtn.focus();
            }
          }, reducedMotion ? 0 : 480);
        }
      }, revealDelayMs);
    });
  }

  /**
   * One-time what's-new announcement (e.g. daily reminder time picker).
   * @param {{ title?: string, body?: string, primaryLabel?: string, secondaryLabel?: string, revealDelayMs?: number }} [options]
   * @returns {Promise<'primary' | 'secondary' | 'dismiss'>}
   */
  showWhatsNewAnnouncement(options = {}) {
    const title = String(
      options.title || 'When would you like your inspiration to arrive each day?'
    ).trim();
    const body = String(
      options.body || 'You can always change it later in Settings.'
    ).trim();
    const primaryLabel = String(options.primaryLabel || 'Choose my time').trim();
    const secondaryLabel = String(options.secondaryLabel || 'Not now').trim();
    const escapeHtml = (value) =>
      String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'odq-whats-new-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'odq-whats-new-title');
      overlay.innerHTML = `
        <div class="odq-whats-new-scrim" data-odq-dismiss="1" aria-hidden="true"></div>
        <div class="odq-whats-new-dialog">
          <h2 id="odq-whats-new-title" class="odq-whats-new-title">${escapeHtml(title)}</h2>
          <p class="odq-whats-new-body">${escapeHtml(body)}</p>
          <div class="odq-whats-new-actions">
            <button type="button" class="odq-whats-new-btn odq-whats-new-btn--primary" data-odq-primary>${escapeHtml(primaryLabel)}</button>
            <button type="button" class="odq-whats-new-btn odq-whats-new-btn--secondary" data-odq-secondary>${escapeHtml(secondaryLabel)}</button>
          </div>
        </div>
      `;

      let settled = false;
      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey);
        try {
          overlay.remove();
        } catch (_) {
          /* ignore */
        }
        resolve(result);
      };

      const finish = (result) => {
        if (settled || overlay._odqWhatsNewFinishing) return;
        overlay._odqWhatsNewFinishing = true;
        overlay.classList.remove('odq-whats-new--shown');
        overlay.classList.add('odq-whats-new--leaving');
        window.setTimeout(() => cleanup(result), 720);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') finish('dismiss');
      };

      overlay.addEventListener('click', (e) => {
        const el = e.target;
        if (el && el.getAttribute && el.getAttribute('data-odq-dismiss') === '1') {
          finish('dismiss');
        }
      });
      overlay.querySelector('[data-odq-primary]').addEventListener('click', () => finish('primary'));
      overlay.querySelector('[data-odq-secondary]').addEventListener('click', () => finish('secondary'));

      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKey);
      const primaryBtn = overlay.querySelector('[data-odq-primary]');
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const revealDelayMs = reducedMotion
        ? 0
        : Math.max(
            0,
            Number(options.revealDelayMs) || CONFIG.APP.whatsNewRevealDelayMs || 900
          );

      window.setTimeout(() => {
        overlay.classList.add('odq-whats-new--shown');
        if (primaryBtn) {
          window.setTimeout(() => {
            try {
              primaryBtn.focus({ preventScroll: true });
            } catch (_) {
              primaryBtn.focus();
            }
          }, reducedMotion ? 0 : 720);
        }
      }, revealDelayMs);
    });
  }

  /**
   * Same WKWebView fixed-layer leak as exit chamber: `remember-today-footer`
   * (viewport-fixed) can stay visible over #screen-quilt after navigation.
   */
  _syncRememberTodayFixedFooterLeakGuard() {
    try {
      ['screen-remember-today', 'screen-remember-today-view'].forEach((screenId) => {
        const screen = document.getElementById(screenId);
        const footer = screen?.querySelector?.('.remember-today-footer');
        if (!screen || !footer) return;
        if (screen.classList.contains('active')) {
          footer.style.removeProperty('display');
          footer.style.removeProperty('visibility');
          footer.style.removeProperty('pointer-events');
          footer.style.removeProperty('opacity');
        } else {
          footer.classList.remove('remember-today-footer--visible');
          footer.style.setProperty('display', 'none', 'important');
          footer.style.setProperty('visibility', 'hidden', 'important');
          footer.style.setProperty('pointer-events', 'none', 'important');
          footer.style.setProperty('opacity', '0', 'important');
        }
      });
      this._syncViewportFooterIconBarLeakGuard();
      window.app?._syncSettingsFixedFooterLeakGuard?.();
    } catch (_) {
      /* ignore */
    }
  }

  _syncViewportFooterIconBarLeakGuard() {
    try {
      [
        'screen-social-posts',
        'screen-settings',
        'screen-about',
        'screen-remember-today',
        'screen-remember-today-view',
        'screen-reflection-themes-archive'
      ].forEach((screenId) => {
        const screen = document.getElementById(screenId);
        const row = screen?.querySelector?.(':scope > .quilt-viewport-footer-icon-row');
        if (!screen || !row) return;
        if (screen.classList.contains('active')) {
          row.style.removeProperty('display');
          row.style.removeProperty('visibility');
          row.style.removeProperty('pointer-events');
          row.style.removeProperty('opacity');
        } else {
          row.style.setProperty('display', 'none', 'important');
          row.style.setProperty('visibility', 'hidden', 'important');
          row.style.setProperty('pointer-events', 'none', 'important');
          row.style.setProperty('opacity', '0', 'important');
        }
      });
    } catch (_) {
      /* ignore */
    }
  }

  _syncQuiltScrollIconFooterLeakGuard() {
    window.app?._syncQuiltScrollIconFooterLeakGuard?.();
  }

  /** Lock viewport scale on Studio Floor so pinch / input focus zoom cannot stick. */
  _syncSocialPostsViewportLock(active) {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return;
    const base = this._socialPostsViewportBase;
    viewport.setAttribute(
      'content',
      active ? `${base}, maximum-scale=1, user-scalable=no` : base
    );
  }

  _restoreQuoteLayoutBStripMarkup(el) {
    if (!el || el.dataset.odqStripCleared !== '1') return;
    if (el.dataset.odqStripHtml) {
      el.innerHTML = el.dataset.odqStripHtml;
    }
    delete el.dataset.odqStripHtml;
    delete el.dataset.odqStripCleared;
  }

  _purgeReflectionArchiveGhostLayers() {
    try {
      document.querySelectorAll('.quote-layoutb-strip, .quote-layoutb-stage').forEach((el) => el.remove());
      const quiltContainer = document.querySelector('#screen-quilt .quilt-container');
      const quiltScreen = document.getElementById('screen-quilt');
      if (quiltContainer && quiltScreen && !quiltScreen.classList.contains('active')) {
        quiltContainer.style.setProperty('visibility', 'hidden', 'important');
        quiltContainer.style.setProperty('opacity', '0', 'important');
        quiltContainer.style.setProperty('pointer-events', 'none', 'important');
      }
    } catch (_) {
      /* ignore */
    }
  }

  _syncQuoteLayoutBStripLeakGuard() {
    try {
      const reflectionArchiveActive = document
        .getElementById('screen-reflection-themes-archive')
        ?.classList?.contains('active');
      const quiltActive = document.getElementById('screen-quilt')?.classList?.contains('active');
      const portalScreen = document.getElementById('screen-portal');
      const portalGreetingStillVisible =
        portalScreen &&
        (portalScreen.classList.contains('active') ||
          portalScreen.classList.contains('flow-fade-exit'));
      const quoteScreen = document.getElementById('screen-quote');
      const quoteScreenLayoutBVisible =
        quoteScreen &&
        (quoteScreen.classList.contains('active') ||
          quoteScreen.classList.contains('flow-fade-enter') ||
          quoteScreen.classList.contains('flow-fade-enter-active'));
      document.querySelectorAll('.quote-layoutb-strip, .quote-layoutb-stage').forEach((el) => {
        /* Portal greeting uses absolute layout + transform; leave untouched while portal is still on screen (incl. crossfade). */
        if (portalGreetingStillVisible && el.closest('#portal-greeting-layoutb-card')) {
          return;
        }
        if (quoteScreenLayoutBVisible && el.closest('#screen-quote')) {
          if (el.classList.contains('quote-layoutb-strip')) {
            this._restoreQuoteLayoutBStripMarkup(el);
          }
          el.style.removeProperty('display');
          el.style.removeProperty('visibility');
          el.style.removeProperty('opacity');
          el.style.removeProperty('pointer-events');
          /* Keep strip rotate/center and stage recenter transforms — clearing breaks Layout B placement. */
          el.style.removeProperty('clip-path');
          return;
        }
        if (reflectionArchiveActive) {
          if (el.classList.contains('quote-layoutb-strip') && el.dataset.odqStripCleared !== '1') {
            el.dataset.odqStripHtml = el.innerHTML;
            el.dataset.odqStripCleared = '1';
            el.textContent = '';
          }
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('opacity', '0', 'important');
          el.style.setProperty('pointer-events', 'none', 'important');
          el.style.setProperty('transform', 'translate(-100vw, -100vh)', 'important');
          el.style.setProperty('clip-path', 'inset(100%)', 'important');
          return;
        }
        if (quiltActive && el.closest('#screen-quilt')) {
          if (el.classList.contains('quote-layoutb-strip')) {
            this._restoreQuoteLayoutBStripMarkup(el);
          }
          el.style.removeProperty('display');
          el.style.removeProperty('visibility');
          el.style.removeProperty('opacity');
          el.style.removeProperty('pointer-events');
          el.style.removeProperty('transform');
          el.style.removeProperty('clip-path');
          return;
        }
        if (el.classList.contains('quote-layoutb-strip')) {
          this._restoreQuoteLayoutBStripMarkup(el);
        }
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      });
    } catch (_) {
      /* ignore */
    }
  }

  _captureQuiltScrollForReturn() {
    const quiltScreen = document.getElementById('screen-quilt');
    const quiltButtonPanel = document.querySelector('#screen-quilt .button-container');
    const app = document.getElementById('app');
    this._savedQuiltScrollPosition = {
      quiltScreen: quiltScreen?.scrollTop || 0,
      quiltButtonPanel: quiltButtonPanel?.scrollTop || 0,
      app: app?.scrollTop || 0,
      window:
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0
    };
  }

  _restoreQuiltScrollIfSaved() {
    const saved = this._savedQuiltScrollPosition;
    if (!saved) return;
    const quiltScreen = document.getElementById('screen-quilt');
    const quiltButtonPanel = document.querySelector('#screen-quilt .button-container');
    const app = document.getElementById('app');
    const apply = () => {
      if (quiltScreen) quiltScreen.scrollTop = saved.quiltScreen;
      if (quiltButtonPanel) quiltButtonPanel.scrollTop = saved.quiltButtonPanel;
      if (app) app.scrollTop = saved.app;
      window.scrollTo(0, saved.window);
      document.documentElement.scrollTop = saved.window;
      document.body.scrollTop = saved.window;
    };
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }

  /** Instant scroll to quilt end (icon footer) — no animation; used when returning from settings/about/etc. */
  _snapQuiltScrollToBottomInstant() {
    const quiltScreen = document.getElementById('screen-quilt');
    const quiltButtonPanel = document.querySelector('#screen-quilt .button-container');
    const app = document.getElementById('app');
    const nodes = [quiltScreen, quiltButtonPanel, app].filter(Boolean);
    const apply = () => {
      nodes.forEach((el) => {
        const prevBehavior = el.style.scrollBehavior;
        el.style.scrollBehavior = 'auto';
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        const stopTop =
          typeof window.app?.getQuiltFooterScrollStopTop === 'function'
            ? window.app.getQuiltFooterScrollStopTop(el)
            : maxScroll;
        el.scrollTop = Math.max(0, Math.min(maxScroll, Number(stopTop) || 0));
        if (prevBehavior) el.style.scrollBehavior = prevBehavior;
        else el.style.removeProperty('scroll-behavior');
      });
      const winMax = Math.max(
        0,
        (document.documentElement.scrollHeight || 0) - (document.documentElement.clientHeight || 0),
        (document.body.scrollHeight || 0) - (document.body.clientHeight || 0)
      );
      window.scrollTo(0, winMax);
      document.documentElement.scrollTop = winMax;
      document.body.scrollTop = winMax;
    };
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }

  /** Snap to quilt scroll end once layout is stable (return from settings/about/remember). */
  _stabilizeQuiltScrollOnReturn() {
    window.app?.clearQuiltScrollCue?.();
    this._snapQuiltScrollToBottomInstant();
    requestAnimationFrame(() => {
      this._snapQuiltScrollToBottomInstant();
      requestAnimationFrame(() => {
        this._snapQuiltScrollToBottomInstant();
      });
    });
  }

  _resetScreenScrollToTop(target) {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const app = document.getElementById('app');
    if (app) {
      app.scrollTop = 0;
    }
    /* The target `.screen` is itself the scroll container (overflow-y:auto on
       #screen-quilt etc.). WebKit preserves its scrollTop across display swaps,
       so a return visit can land mid-scroll. Pin to top now and again on the
       next frame to cover content that streams in after activation
       (e.g. renderQuilt() after handleAddColor → showScreen('screen-quilt')). */
        if (target) {
          try {
            target.scrollTop = 0;
          } catch (_) {
            /* */
          }
          requestAnimationFrame(() => {
            try {
              target.scrollTop = 0;
            } catch (_) {
              /* */
            }
          });
        }
  }

  showScreen(screenId) {
    try {
      // #region agent log
      if (screenId === 'screen-quote') fetch('http://127.0.0.1:7433/ingest/0ed8adaa-5aed-4571-811f-aadcc7a8fddc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b7972'},body:JSON.stringify({sessionId:'5b7972',runId:'initial',hypothesisId:'I',location:'lib/ui-service.js:693',message:'showScreen quote requested',data:{firstActive:document.querySelector('.screen.active')?.id||'',quoteClasses:document.getElementById('screen-quote')?.className||'',portalClasses:document.getElementById('screen-portal')?.className||''},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const socialManageScreens = new Set([
        'screen-social-post-compose',
        'screen-social-post-manage'
      ]);
      if (
        socialManageScreens.has(screenId) &&
        window.app?.canManageSocialPosts &&
        !window.app.canManageSocialPosts()
      ) {
        window.app?.guardSocialPostsManageAccess?.();
        return;
      }
      if (screenId === 'screen-quote' && window.odqPerfMark) window.odqPerfMark('show-screen-quote');
      if (screenId === 'screen-quote') window.app?.markDailyQuoteSeen?.();
      window.app?.clearPortalToQuoteIntroTimer();
      window.app?.clearNameThanksAdvanceTimer?.();
      window.app?.clearFirstQuoteBridgeTimer?.();
      const activeScreenId = document.querySelector('.screen.active')?.id;
      if (activeScreenId === 'screen-quote' && screenId !== 'screen-quote') {
        window.app?.clearQuoteColorPickerSchedule?.();
      }
      const introIds = window.app?.getIntroScreenIds?.() || new Set();
      const inIntro = introIds.has(screenId);
      const introEnabled = !!window.app?.isIntroFlowEnabled?.();
      if (introEnabled && inIntro) {
        window.app.scrollIntroTo(screenId, 'smooth');
        return;
      }
      if (introEnabled && !inIntro) {
        window.app.disableIntroFlow();
      }
      document.documentElement?.classList?.toggle('odq-reflection-active', screenId === 'screen-reflection');
      document.body?.classList?.toggle('odq-reflection-active', screenId === 'screen-reflection');
      document.documentElement?.classList?.toggle('odq-about-active', screenId === 'screen-about');
      document.body?.classList?.toggle('odq-about-active', screenId === 'screen-about');
      document.documentElement?.classList?.toggle('odq-quote-submission-active', screenId === 'screen-quote-submission');
      document.body?.classList?.toggle('odq-quote-submission-active', screenId === 'screen-quote-submission');
      const rememberTodayActive =
        screenId === 'screen-remember-today' || screenId === 'screen-remember-today-view';
      document.documentElement?.classList?.toggle('odq-remember-today-active', rememberTodayActive);
      document.body?.classList?.toggle('odq-remember-today-active', rememberTodayActive);
      const socialPostsActive = screenId === 'screen-social-posts';
      document.documentElement?.classList?.toggle('odq-social-posts-active', socialPostsActive);
      document.body?.classList?.toggle('odq-social-posts-active', socialPostsActive);
      this._syncSocialPostsViewportLock(socialPostsActive);

      const previousActive = document.querySelector('.screen.active');
      const previousId = previousActive ? previousActive.id : null;
      if (previousId === 'screen-quilt' && this._quiltScrollPreserveScreens.has(screenId)) {
        this._captureQuiltScrollForReturn();
      }
      const returnToQuiltFromPreserve =
        screenId === 'screen-quilt' &&
        previousId &&
        this._quiltScrollPreserveScreens.has(previousId);

      if (screenId === 'screen-quilt' && !returnToQuiltFromPreserve) {
        try {
          Utils.syncReflectionPatchStarElement();
        } catch (_) {
          /* */
        }
        requestAnimationFrame(() => {
          document.getElementById('quiltMoodSpread')?._moodSpreadWidget?.remeasure?.() ||
          document.getElementById('quiltMoodSpread')?._moodTriptychWidget?.remeasure?.();
          void window.app?._primeQuiltQuoteChrome?.();
        });
      }
      const prevOrder = this._flowScreenOrder?.[previousId];
      const nextOrder = this._flowScreenOrder?.[screenId];
      const isFlowTransition =
        previousId &&
        previousId !== screenId &&
        prevOrder !== undefined &&
        nextOrder !== undefined;

      const introPersonaCrossfade =
        previousActive &&
        previousId &&
        ((previousId === 'screen-intro-zak' && screenId === 'screen-intro-mission') ||
          (previousId === 'screen-intro-mission' && screenId === 'screen-welcome') ||
          (previousId === 'screen-name-thanks' && screenId === 'screen-welcome'));

      const bridgeToQuoteFade =
        previousActive &&
        previousId === 'screen-first-quote-bridge' &&
        screenId === 'screen-quote';

      const target = document.getElementById(screenId);
      if (target) {
        if (screenId === 'screen-about') {
          target.classList.remove('about-lines-revealed');
        }
        if (isFlowTransition) {
          if (this._flowTransitioning) return;
          this._flowTransitioning = true;

          const flowClassCleanup = [
            'flow-enter-from-bottom',
            'flow-enter-from-top',
            'flow-enter-active',
            'flow-exit-to-top',
            'flow-exit-to-bottom',
            'flow-exit-active',
            'flow-fade-enter',
            'flow-fade-enter-active',
            'flow-fade-exit',
            'flow-fade-exit-active'
          ];

          const portalToQuoteFade =
            previousId === 'screen-portal' && screenId === 'screen-quote';

          const finishFlow = () => {
            // #region agent log
            if (target.id === 'screen-quote') fetch('http://127.0.0.1:7433/ingest/0ed8adaa-5aed-4571-811f-aadcc7a8fddc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b7972'},body:JSON.stringify({sessionId:'5b7972',runId:'initial',hypothesisId:'I,J',location:'lib/ui-service.js:808',message:'finishFlow quote start',data:{firstActive:document.querySelector('.screen.active')?.id||'',previousId,portalToQuoteFade,quoteClasses:target.className||'',previousClasses:previousActive?.className||''},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            if (previousActive) {
              previousActive.classList.remove('active', ...flowClassCleanup);
              previousActive.style.display = 'none';
            }
            target.classList.remove(...flowClassCleanup);
            this._flowTransitioning = false;
            if (target.id === 'screen-quote') {
              window.app?.applyQuoteScreenInitialRestLayout?.();
              window.app?.quoteService?.primeTodayQuoteFromLocalAssignment?.();
              if (!portalToQuoteFade) {
                window.app?.quoteService?.displayQuote?.();
              }
              this._syncQuoteLayoutBStripLeakGuard();
              if (portalToQuoteFade) {
                const qs = window.app?.quoteService;
                if (qs) qs._quoteLayoutBPortalSettlePending = false;
              }
              window.app?.quoteService?._flushDeferredQuoteScreenLayoutBPaintIfNeeded?.();
              window.app?.scheduleQuoteColorPickerReveal?.(CONFIG.APP.quoteColorPickerRevealMs);
              // #region agent log
              fetch('http://127.0.0.1:7433/ingest/0ed8adaa-5aed-4571-811f-aadcc7a8fddc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b7972'},body:JSON.stringify({sessionId:'5b7972',runId:'initial',hypothesisId:'I,J',location:'lib/ui-service.js:828',message:'finishFlow quote scheduled reveal',data:{firstActive:document.querySelector('.screen.active')?.id||'',quoteClasses:target.className||'',pickerHidden:!!document.getElementById('quoteColorPickerPane')?.hidden,imgNaturalW:document.querySelector('#screen-quote .quote-screen-clipping__image')?.naturalWidth||0,imgInlineW:document.querySelector('#screen-quote .quote-screen-clipping__image')?.style.width||''},timestamp:Date.now()})}).catch(()=>{});
              // #endregion
            }
          };

          target.style.display = 'flex';
          target.classList.remove(...flowClassCleanup);
          if (portalToQuoteFade) {
            target.classList.add('flow-fade-enter', 'active');
            // #region agent log
            fetch('http://127.0.0.1:7433/ingest/0ed8adaa-5aed-4571-811f-aadcc7a8fddc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b7972'},body:JSON.stringify({sessionId:'5b7972',runId:'initial',hypothesisId:'I',location:'lib/ui-service.js:836',message:'portal quote target marked active',data:{firstActive:document.querySelector('.screen.active')?.id||'',quoteClasses:target.className||'',portalClasses:previousActive?.className||''},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            window.app?.quoteService?._markQuoteLayoutBPortalSettlePending?.();
            window.app?.applyQuotePickerModeUI?.();
            window.app?.applyQuoteScreenInitialRestLayout?.();
            window.app?.quoteService?.primeTodayQuoteFromLocalAssignment?.();
            window.app?.quoteService?.displayQuote?.();
            window.app?.quoteService?._flushDeferredQuoteScreenLayoutBPaintIfNeeded?.();
          } else {
            const enteringClass =
              nextOrder > prevOrder ? 'flow-enter-from-bottom' : 'flow-enter-from-top';
            target.classList.add(enteringClass, 'active');
          }

          if (previousActive) {
            previousActive.classList.remove(...flowClassCleanup);
            if (portalToQuoteFade) {
              previousActive.classList.add('flow-fade-exit');
            } else {
              const exitingClass =
                nextOrder > prevOrder ? 'flow-exit-to-top' : 'flow-exit-to-bottom';
              previousActive.classList.add(exitingClass, 'flow-exit-active');
            }
          }

          target.offsetHeight;
          if (portalToQuoteFade) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                target.classList.add('flow-fade-enter-active');
                if (previousActive) previousActive.classList.add('flow-fade-exit-active');

                let settled = false;
                const settle = () => {
                  if (settled) return;
                  settled = true;
                  target.removeEventListener('transitionend', onTransEnd);
                  if (fallbackId != null) clearTimeout(fallbackId);
                  finishFlow();
                };
                const onTransEnd = (e) => {
                  if (e.target !== target || e.propertyName !== 'opacity') return;
                  settle();
                };
                target.addEventListener('transitionend', onTransEnd);
                const fallbackId = setTimeout(settle, 1800);
              });
            });
          } else {
            requestAnimationFrame(() => {
              target.classList.add('flow-enter-active');
            });
            setTimeout(finishFlow, 380);
          }
        } else if (introPersonaCrossfade) {
          if (this._flowTransitioning) return;
          this._flowTransitioning = true;

          const flowClassCleanup = [
            'flow-enter-from-bottom',
            'flow-enter-from-top',
            'flow-enter-active',
            'flow-exit-to-top',
            'flow-exit-to-bottom',
            'flow-exit-active',
            'flow-fade-enter',
            'flow-fade-enter-active',
            'flow-fade-exit',
            'flow-fade-exit-active'
          ];

          document.querySelectorAll('.screen').forEach(s => {
            if (s === previousActive || s === target) return;
            s.classList.remove('active');
            s.style.display = 'none';
          });

          target.style.display = 'flex';
          target.classList.remove(...flowClassCleanup);
          target.classList.add('active');

          if (previousActive) {
            previousActive.classList.remove('active', ...flowClassCleanup);
            previousActive.style.display = 'none';
          }

          this._flowTransitioning = false;
        } else if (bridgeToQuoteFade) {
          if (this._flowTransitioning) return;
          this._flowTransitioning = true;

          const flowClassCleanup = [
            'flow-enter-from-bottom',
            'flow-enter-from-top',
            'flow-enter-active',
            'flow-exit-to-top',
            'flow-exit-to-bottom',
            'flow-exit-active',
            'flow-fade-enter',
            'flow-fade-enter-active',
            'flow-fade-exit',
            'flow-fade-exit-active'
          ];

          const finishBridgeQuote = () => {
            if (previousActive) {
              previousActive.classList.remove('active', ...flowClassCleanup);
              previousActive.style.display = 'none';
            }
            target.classList.remove(...flowClassCleanup);
            this._flowTransitioning = false;
            if (target.id === 'screen-quote') {
              window.app?.markIntroPersonaSeen?.();
              window.app?.applyQuoteScreenInitialRestLayout?.();
              window.app?.quoteService?.primeTodayQuoteFromLocalAssignment?.();
              window.app?.quoteService?._scheduleQuoteLayoutBSettleRecenter?.('finishBridgeQuote');
              window.app?.quoteService?._ensureQuoteLayoutBFontRecenterHook?.();
              window.app?.scheduleQuoteColorPickerReveal?.(CONFIG.APP.quoteColorPickerRevealMs);
            }
          };

          document.querySelectorAll('.screen').forEach(s => {
            if (s === previousActive || s === target) return;
            s.classList.remove('active');
            s.style.display = 'none';
          });

          target.style.display = 'flex';
          target.classList.remove(...flowClassCleanup);
          target.classList.add('flow-fade-enter', 'active');
          window.app?.applyQuotePickerModeUI?.();
          window.app?.applyQuoteScreenInitialRestLayout?.();
          window.app?.quoteService?.primeTodayQuoteFromLocalAssignment?.();
          window.app?.quoteService?.displayQuote?.();
          window.app?.quoteService?._flushDeferredQuoteScreenLayoutBPaintIfNeeded?.();

          previousActive.classList.remove(...flowClassCleanup);
          previousActive.classList.add('flow-fade-exit');

          target.offsetHeight;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              target.classList.add('flow-fade-enter-active');
              previousActive.classList.add('flow-fade-exit-active');

              let settled = false;
              const settle = () => {
                if (settled) return;
                settled = true;
                target.removeEventListener('transitionend', onTransEnd);
                if (fallbackId != null) clearTimeout(fallbackId);
                finishBridgeQuote();
              };
              const onTransEnd = (e) => {
                if (e.target !== target || e.propertyName !== 'opacity') return;
                settle();
              };
              target.addEventListener('transitionend', onTransEnd);
              const fallbackId = setTimeout(settle, 1300);
            });
          });
        } else {
          document.querySelectorAll(".screen").forEach(s => {
            s.classList.remove("active");
            s.style.display = 'none';
          });

          target.style.display =
            screenId === 'screen-remember-today' || screenId === 'screen-remember-today-view' || screenId === 'screen-settings'
              ? 'block'
              : 'flex';
          target.classList.add("active");

          if (screenId === 'screen-settings') {
            window.app?._syncSettingsScrollFooter?.();
            try {
              window.app?.renderColorCalendar?.();
            } catch (_) {
              /* ignore */
            }
          }

          target.offsetHeight;
        }

        if (screenId === 'screen-quote' && !isFlowTransition && !bridgeToQuoteFade) {
          window.app?.applyQuoteScreenInitialRestLayout?.();
          window.app?.quoteService?.primeTodayQuoteFromLocalAssignment?.();
          window.app?.quoteService?.displayQuote?.();
          window.app?.quoteService?._flushDeferredQuoteScreenLayoutBPaintIfNeeded?.();
          window.app?.scheduleQuoteColorPickerReveal?.(CONFIG.APP.quoteColorPickerRevealMs);
        }

        if (screenId === 'screen-intro-zak' || screenId === 'screen-intro-mission') {
          const personaEl = document.getElementById(screenId);
          if (personaEl) {
            personaEl.classList.remove('intro-persona-visible');
            requestAnimationFrame(() => {
              requestAnimationFrame(() => personaEl.classList.add('intro-persona-visible'));
            });
            if (screenId === 'screen-intro-zak') {
              const lineFadeEls = personaEl.querySelectorAll('.intro-zak-line-fade-in');
              lineFadeEls.forEach((el) => el.classList.remove('visible'));
              const staggerBaseMs =
                previousId === 'screen-first-name' || previousId === 'screen-name-thanks' ? 320 : 0;
              const lineStaggerStartMs = staggerBaseMs + 450;
              lineFadeEls.forEach((el, index) => {
                setTimeout(() => {
                  el.classList.add('visible');
                }, lineStaggerStartMs + index * 200);
              });
            }
            if (screenId === 'screen-intro-mission') {
              const beautifulEl = personaEl.querySelector('.intro-mission-beautiful');
              const togetherEl = personaEl.querySelector('.intro-mission-together');
              personaEl.querySelectorAll('.intro-zak-line-fade-in').forEach((el) => el.classList.remove('visible'));
              const staggerBaseMs = previousId === 'screen-intro-zak' ? 320 : 0;
              const beautifulMs = staggerBaseMs + 850;
              const togetherMs = beautifulMs + 220;
              if (beautifulEl) {
                setTimeout(() => beautifulEl.classList.add('visible'), beautifulMs);
              }
              if (togetherEl) {
                setTimeout(() => togetherEl.classList.add('visible'), togetherMs);
              }
            }
          }
        }

        if (screenId === 'screen-first-quote-bridge') {
          window.app?.scheduleFirstQuoteBridgeAdvance?.(1200);
        }
        
        // Set date immediately when portal screen is shown
        if (screenId === 'screen-portal') {
          Utils.refreshPortalDateText();
        }
        

        
        // Populate quote display when quilt screen is shown (skip on return from settings/about/remember — already painted).
        if (screenId === 'screen-quilt') {
          window.app?.applyQuiltMoodTriptychPalette?.();
          window.app?.ensureQuiltScreenInteractive?.();
          window.app?._syncQuiltScrollIconFooterLeakGuard?.();
          if (!returnToQuiltFromPreserve) {
            window.app?.refreshQuiltUserShapeCard?.();
            setTimeout(() => {
              window.app?.ensureQuiltScreenInteractive?.();
              window.app?._syncQuiltScrollIconFooterLeakGuard?.();
            }, 1000);
            const quoteService = window.app?.quoteService;
            if (quoteService) {
              const paintQuiltQuote = () => {
                void window.app?._primeQuiltQuoteChrome?.();
                window.app?.renderQuiltContributorList?.();
                window.app?.updateBeforeYouGoSection?.();
              };
              paintQuiltQuote();
              void quoteService
                .hydratePinnedBlessingsForDateKeys([quoteService.getQuoteCalendarKeyNow()])
                .then(paintQuiltQuote)
                .catch(() => paintQuiltQuote());
              void quoteService
                .hydrateMoodFieldsForCalendarKey(quoteService.getQuoteCalendarKeyNow())
                .then((hydrated) => {
                  if (hydrated) window.app?.refreshQuiltMoodWidget?.(hydrated);
                })
                .catch(() => {});
            } else {
              window.app?.updateBeforeYouGoSection?.();
            }
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                window.app?.syncQuiltFilmGrainOverlay?.();
                window.app?.remeasureQuiltMoodSpread?.();
              });
            });
          } else {
            requestAnimationFrame(() => {
              window.app?.syncQuiltFilmGrainOverlay?.();
            });
          }
        }

        if (screenId === 'screen-reflection') {
          window.app?.quoteService?.populateReflectionPromptCard?.();
        }

        if (screenId === 'screen-reflection-themes-archive') {
          this._purgeReflectionArchiveGhostLayers();
          this._syncQuoteLayoutBStripLeakGuard();
          requestAnimationFrame(() => {
            this._purgeReflectionArchiveGhostLayers();
            this._syncQuoteLayoutBStripLeakGuard();
          });
        }
        
        if (screenId === 'screen-quote') {
          if (!window.app?.isColorPickerActive?.() && window.app) {
            window.app.colorHasBeenSelected = false;
            window.app._userExplicitSatPick = false;
          }
        } else {
          window.app?.clearQuoteColorPickerSchedule?.();
          if (window.ODQ_snapNeutralBeforeSwap) {
            window.ODQ_snapNeutralBeforeSwap();
          }
        }
        
         // Handle quote screen fade-in elements
        if (screenId === 'screen-quote') {
          // Reset fade-in elements to hidden state
          const fadeElements = document.querySelectorAll('.quote-screen-fade-in');
          fadeElements.forEach(el => el.classList.remove('visible'));
          
          // Trigger fade-in immediately (removed 3-second delay for testing)
          fadeElements.forEach(el => el.classList.add('visible'));
        }
        
        // Handle welcome screen fade-in elements
        if (screenId === 'screen-welcome') {
          const welcomeScreen = document.getElementById('screen-welcome');
          const stepEls = welcomeScreen?.querySelectorAll('.welcome-step.welcome-screen-fade-in') || [];
          const footerEl = welcomeScreen?.querySelector('.welcome-footer.welcome-screen-fade-in');
          welcomeScreen?.querySelectorAll('.welcome-screen-fade-in').forEach((el) => el.classList.remove('visible'));

          const staggerBaseMs =
            previousId === 'screen-intro-mission' ? 0 : previousId === 'screen-name-thanks' ? 200 : 0;
          const staggerStepMs = 200;
          stepEls.forEach((el, index) => {
            setTimeout(() => {
              el.classList.add('visible');
            }, staggerBaseMs + index * staggerStepMs);
          });
          if (footerEl) {
            setTimeout(() => {
              footerEl.classList.add('visible');
            }, staggerBaseMs + stepEls.length * staggerStepMs);
          }
        }

        if (screenId === 'screen-first-name') {
          const firstNameEl = document.getElementById('firstNameInput');
          const defaultExplainer = document.getElementById('firstNameDefaultExplainer');
          const pendingTerm =
            typeof Utils !== 'undefined' && typeof Utils.getPendingFriendTerm === 'function'
              ? Utils.getPendingFriendTerm()
              : null;
          if (firstNameEl) {
            if (!firstNameEl.value.trim() && pendingTerm) {
              firstNameEl.value = String(pendingTerm.name || 'Friend').trim() || 'Friend';
              firstNameEl.classList.add('first-name-input--default');
            } else if (!firstNameEl.value.trim()) {
              firstNameEl.classList.remove('first-name-input--default');
            }
          }
          if (defaultExplainer && pendingTerm && typeof Utils.formatFriendTermExplainerHtml === 'function') {
            defaultExplainer.innerHTML = Utils.formatFriendTermExplainerHtml(pendingTerm);
          }
        }
        
        if (returnToQuiltFromPreserve) {
          this._stabilizeQuiltScrollOnReturn();
          this._savedQuiltScrollPosition = null;
        } else {
          if (screenId === 'screen-quilt') {
            this._savedQuiltScrollPosition = null;
          }
          this._resetScreenScrollToTop(target);
        }

        this._syncRememberTodayFixedFooterLeakGuard();
        this._syncQuiltScrollIconFooterLeakGuard();
        this._syncQuoteLayoutBStripLeakGuard();
        requestAnimationFrame(() => {
          this._syncRememberTodayFixedFooterLeakGuard();
          this._syncQuiltScrollIconFooterLeakGuard();
          this._syncQuoteLayoutBStripLeakGuard();
        });

        if (typeof window.OdqAnalytics?.trackScreenOpen === 'function') {
          window.OdqAnalytics.trackScreenOpen(screenId, previousId);
        } else if (typeof window.odqTrack === 'function') {
          const screenEvents = {
            'screen-about': 'open_about',
            'screen-settings': 'open_settings',
            'screen-remember-today': 'open_remember',
            'screen-reflection-themes-archive': 'open_archive',
            'screen-social-posts': 'open_social_posts'
          };
          const eventName = screenEvents[screenId];
          if (eventName && screenId !== previousId) window.odqTrack(eventName);
        }

        // Dispatch custom event for screen change
        document.dispatchEvent(new CustomEvent('screenChange', {
          detail: {
            screenId: screenId,
            skipQuiltScrollCue: returnToQuiltFromPreserve === true
          }
        }));
        
      } else {
        this.logger.error(`❌ Screen not found: ${screenId}`);
        this.showScreen('screen-portal');
      }
    } catch (error) {
      this.logger.error(`❌ Error switching to screen ${screenId}:`, error);
      const portalScreen = document.getElementById('screen-portal');
      if (portalScreen) {
        document.documentElement?.classList?.remove('odq-reflection-active');
        document.body?.classList?.remove('odq-reflection-active');
        document.documentElement?.classList?.remove('odq-about-active');
        document.body?.classList?.remove('odq-about-active');
        document.documentElement?.classList?.remove('odq-remember-today-active');
        document.body?.classList?.remove('odq-remember-today-active');
        document.documentElement?.classList?.remove('odq-social-posts-active');
        document.body?.classList?.remove('odq-social-posts-active');
        this._syncSocialPostsViewportLock(false);
        document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
        portalScreen.classList.add("active");
        portalScreen.style.display = 'flex';
        this._syncRememberTodayFixedFooterLeakGuard();
        this._syncQuiltScrollIconFooterLeakGuard();
      }
    }
  }
}

  root.UIService = UIService;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
