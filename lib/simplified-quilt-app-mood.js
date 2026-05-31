/**
 * SimplifiedQuiltAppV2 mood slice: mood paper roll, mood pick storage, reflection scrap (Phase C6).
 * Methods merged onto SimplifiedQuiltAppV2.prototype in the main app module.
 */
(function (root) {
  'use strict';

  class SimplifiedQuiltAppV2Mood {
      _refreshQuiltMoodWidgetImpl(quote = null) {
        const host = document.getElementById('quiltMoodWidget');
        if (!host) return;

        const todayQuote = this._quoteForMoodWidget(quote);

        if (this._quiltMoodSpreadEnabled()) {
          this._stripLegacyQuoteClippingPng();
        }

        if (!this._quiltMoodSpreadEnabled()) {
          host.setAttribute('hidden', 'hidden');
          this._unmountQuiltMoodSpread();
          this.logger?.warn?.('QuiltMoodTriptychWidget missing — mood triptych hidden');
          this._fallbackQuiltQuoteClipping(todayQuote);
          return;
        }
        let { goodDay, roughDay } = this.quoteService?._moodLinesFromQuote?.(todayQuote || {}) || {
          goodDay: '',
          roughDay: ''
        };
        const previewForced = this._quiltMoodPreviewForced();
        if (previewForced && (!goodDay || !roughDay)) {
          if (!goodDay) goodDay = 'Hard mute the inner critic.';
          if (!roughDay) roughDay = 'Love is enough today.';
        }

        if (!goodDay || !roughDay) {
          this._scheduleQuiltMoodFieldsHydrate(todayQuote, host);
          if (host.dataset.moodHydratePending === '1') {
            host.classList.remove('is-active', 'is-good', 'is-rough');
            host.setAttribute('hidden', 'hidden');
            host.innerHTML = '';
            this._unmountQuiltMoodSpread();
            this._showQuiltQuoteTextFallback(todayQuote);
            return;
          }
          host.classList.remove('is-hydrating');
          if (!goodDay || !roughDay) {
            host.classList.remove('is-active', 'is-good', 'is-rough');
            this._resetQuiltMoodCardState(host);
            host.setAttribute('hidden', 'hidden');
            delete host.dataset.goodDay;
            delete host.dataset.roughDay;
            delete host.dataset.contentSig;
            host.innerHTML = '';
            this._unmountQuiltMoodSpread();
            this._showQuiltQuoteTextFallback(todayQuote);
          }
          return;
        }

        const sig = `${goodDay}\u0001${roughDay}`;
        const spreadHost = document.getElementById('quiltMoodSpread');
        const saved = this._readQuiltMoodPickFromStorage(sig);
        if (
          spreadHost &&
          spreadHost.dataset.contentSig === sig &&
          spreadHost._moodTriptychWidget
        ) {
          this._prepareQuiltMoodHostForSpread(host, {
            goodDay,
            roughDay,
            initialMood: saved?.mood || null
          });
          void this._refreshQuiltMoodSpread(todayQuote, goodDay, roughDay, {
            initialMood: saved?.mood || null
          });
          return;
        }

        this._prepareQuiltMoodHostForSpread(host, {
          goodDay,
          roughDay,
          initialMood: saved?.mood || null
        });
        void this._refreshQuiltMoodSpread(todayQuote, goodDay, roughDay, {
          initialMood: saved?.mood || null,
          instant: !!saved
        });
        if (saved?.mood) {
          this.refreshExitChamberMoodPaper?.();
          const announcer = document.getElementById('quiltMoodWidgetAnnouncer');
          const bodyText = String(saved.mood === 'good' ? goodDay : roughDay).trim();
          if (announcer && bodyText) {
            announcer.textContent = this._quiltMoodTerminalAnnounceText(
              bodyText,
              saved.stampAt,
              this._quiltMoodTerminalRecipientName()
            );
          }
        } else {
          this._scheduleQuiltMoodPickRestore(host);
        }
      }

      /** No-op: flip cards replace the old receipt roll reflow. */
      _reflowQuiltMoodPaperIfRestored() {}

      _scheduleQuiltMoodPickRestore(widget) {
        if (!widget) return;
        if (widget._moodRestoreFrame != null) {
          cancelAnimationFrame(widget._moodRestoreFrame);
          widget._moodRestoreFrame = null;
        }
        widget._moodRestoreFrame = requestAnimationFrame(() => {
          widget._moodRestoreFrame = requestAnimationFrame(() => {
            widget._moodRestoreFrame = null;
            try {
              this._restoreQuiltMoodPickFromStorage(widget);
            } catch (err) {
              this.logger?.warn?.('Quilt mood restore failed:', err);
              this._clearQuiltMoodPickStorage();
            }
          });
        });
      }

      _clearQuiltMoodPickStorage() {
        try {
          localStorage.removeItem(Utils.QUILT_MOOD_PICK_KEY);
        } catch (_) {
          /* */
        }
      }

      _readQuiltMoodPickFromStorage(expectedSig = '') {
        try {
          const raw = localStorage.getItem(Utils.QUILT_MOOD_PICK_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          const today = Utils.getTodayKey();
          if (String(parsed?.dateKey || '') !== today) {
            this._clearQuiltMoodPickStorage();
            return null;
          }
          const sig = String(expectedSig || '').trim();
          if (sig && String(parsed?.contentSig || '') !== sig) {
            this._clearQuiltMoodPickStorage();
            return null;
          }
          const mood = parsed?.mood;
          if (mood !== 'good' && mood !== 'rough') {
            this._clearQuiltMoodPickStorage();
            return null;
          }
          let stampAt = new Date();
          if (parsed?.stampAt) {
            const parsedStamp = new Date(parsed.stampAt);
            if (!Number.isNaN(parsedStamp.getTime())) stampAt = parsedStamp;
          }
          return { mood, stampAt };
        } catch (_) {
          return null;
        }
      }

      _saveQuiltMoodPickToStorage(widget, mood, stampAt = new Date()) {
        if (!widget || (mood !== 'good' && mood !== 'rough')) return;
        try {
          localStorage.setItem(
            Utils.QUILT_MOOD_PICK_KEY,
            JSON.stringify({
              dateKey: Utils.getTodayKey(),
              mood,
              contentSig: String(widget.dataset.contentSig || ''),
              stampAt: stampAt instanceof Date ? stampAt.toISOString() : String(stampAt || ''),
            })
          );
        } catch (_) {
          /* */
        }
      }

      _restoreQuiltMoodPickFromStorage(widget) {
        if (!widget || widget.classList.contains('is-active')) return;
        const saved = this._readQuiltMoodPickFromStorage(widget.dataset.contentSig || '');
        if (!saved) return;
        if (!this._quiltMoodTerminalUiEnabled()) {
          const bodyText = String(
            saved.mood === 'good' ? widget.dataset.goodDay : widget.dataset.roughDay || ''
          ).trim();
          if (!bodyText) return;
          this._onQuiltMoodTerminalPicked(widget, saved.mood, bodyText, {
            printedAt: saved.stampAt
          });
          return;
        }
        if (widget.hasAttribute('hidden')) return;
        this._applyQuiltMoodSelectionRestored(widget, saved.mood, saved.stampAt);
      }

      /** Restore saved pick — flip chosen card and dismiss the other instantly. */
      _applyQuiltMoodSelectionRestored(widget, mood, stampAt = new Date()) {
        if (!widget || (mood !== 'good' && mood !== 'rough')) return false;
        if (widget.classList.contains('is-active')) return false;

        const bodyText =
          mood === 'good' ? widget.dataset.goodDay || '' : widget.dataset.roughDay || '';
        if (!bodyText) return false;

        return this._applyQuiltMoodSelection(widget, mood, {
          instant: true,
          stampAt,
          announce: true,
        });
      }

      /**
       * Apply good / rough selection: flip chosen card and slide the other off-screen.
       * @returns {boolean} false when copy is missing or widget already active
       */
      _applyQuiltMoodSelection(widget, mood, { instant = false, stampAt = new Date(), announce = true } = {}) {
        if (!widget || (mood !== 'good' && mood !== 'rough')) return false;
        if (widget.classList.contains('is-active')) return false;

        const bodyText =
          mood === 'good' ? widget.dataset.goodDay || '' : widget.dataset.roughDay || '';
        if (!bodyText) return false;

        const term = widget.querySelector('.mood-terminal');
        const T = globalThis.QuiltMoodTerminal;
        if (term && T?.revealMoodMessage) {
          if (term.classList.contains('is-answered')) return false;
          this._clearQuiltMoodPaperTimers(widget);
          T.revealMoodMessage(term, 'mood-terminal', mood, bodyText, {
            goodDay: widget.dataset.goodDay || '',
            roughDay: widget.dataset.roughDay || '',
            recipientName: this._quiltMoodTerminalRecipientName(),
            printedAt: stampAt,
            typewriter: !instant,
            typewriterMs: 26,
            onSelect: (pickedMood, line, meta) => {
              this._onQuiltMoodTerminalPicked(widget, pickedMood, line, meta);
              if (!announce) {
                const announcer = document.getElementById('quiltMoodWidgetAnnouncer');
                if (announcer) announcer.textContent = '';
              }
            }
          });
          widget.classList.add('is-active');
          widget.classList.toggle('is-good', mood === 'good');
          widget.classList.toggle('is-rough', mood === 'rough');
          if (announce && instant) {
            const announcer = document.getElementById('quiltMoodWidgetAnnouncer');
            if (announcer) {
              announcer.textContent = this._quiltMoodTerminalAnnounceText(
                Utils.formatMoodReceiptBody(bodyText),
                stampAt,
                this._quiltMoodTerminalRecipientName()
              );
            }
          }
          this.refreshExitChamberMoodPaper?.();
          return true;
        }

        return false;
      }

      /** Snapshot of the reader's mood pick on the quilt (good / rough + receipt copy). */
      _getQuiltMoodPickSnapshot() {
        const widget = document.getElementById('quiltMoodWidget');
        if (!widget || !widget.classList.contains('is-active')) {
          return null;
        }
        if (widget.hasAttribute('hidden') && this._quiltMoodTerminalUiEnabled()) {
          return null;
        }
        let mood = null;
        if (widget.classList.contains('is-good')) mood = 'good';
        else if (widget.classList.contains('is-rough')) mood = 'rough';
        else {
          const termMood = widget.querySelector('.mood-terminal')?.dataset?.selectedMood;
          if (termMood === 'good' || termMood === 'rough') mood = termMood;
        }
        if (!mood) return null;

        const term = widget.querySelector('.mood-terminal');
        const msgEl = term?.querySelector('.mood-terminal__message');
        const leadEl = term?.querySelector('.mood-terminal__lead');
        let lead = String(leadEl?.textContent || '').trim() || 'A SPECIAL MESSAGE FOR';
        let recipient = String(term?.dataset?.recipientName || '').trim();
        if (!recipient) recipient = this._quiltMoodTerminalRecipientName().toUpperCase();
        let body = String(msgEl?.textContent || '').trim();
        if (!body) {
          body = String(
            mood === 'good' ? widget.dataset.goodDay || '' : widget.dataset.roughDay || ''
          ).trim();
        }
        body = Utils.formatMoodReceiptBody(body);
        if (!body) return null;

        let stamp = Utils.formatMoodReceiptStamp(new Date());
        const label = [lead, recipient].filter(Boolean).join('\n');
        return { mood, label, lead, recipient, body, stamp };
      }

      /** Static printed receipt under the exit-chamber calendar (no slot / animation). */
      refreshExitChamberMoodPaper() {
        const section = document.getElementById('exitChamberMoodPaper');
        const labelEl = document.getElementById('exitChamberMoodPaperLabel');
        const textEl = document.getElementById('exitChamberMoodPaperText');
        const stampEl = document.getElementById('exitChamberMoodPaperStamp');
        if (!section || !labelEl || !textEl || !stampEl) return;

        const pick = this._getQuiltMoodPickSnapshot();
        if (!pick) {
          section.setAttribute('hidden', 'hidden');
          labelEl.textContent = '';
          textEl.textContent = '';
          stampEl.textContent = '';
          section
            .querySelectorAll('.exit-chamber-mood-paper__rule')
            .forEach((rule) => {
              rule.textContent = '';
            });
          return;
        }

        labelEl.textContent = [pick.lead || 'A SPECIAL MESSAGE FOR', pick.recipient]
          .filter(Boolean)
          .join('\n');
        textEl.textContent = pick.body;
        stampEl.textContent = pick.stamp;
        section.removeAttribute('hidden');
        const body = section.querySelector('.exit-chamber-mood-paper__body');
        this._syncMoodReceiptRules(body);
        requestAnimationFrame(() => this._syncMoodReceiptRules(body));
        this.scheduleExitChamberCollageLayout(this.getExitChamberTodayPieceData()?.block || null);
        section.setAttribute(
          'aria-label',
          pick.mood === 'good' ? 'Your good-day line' : 'Your rough-day line'
        );
      }

      _syncMoodReceiptRules(bodyEl) {
        if (!bodyEl) return;
        const line = Utils.moodReceiptRuleLine(bodyEl);
        bodyEl
          .querySelectorAll('.quilt-mood-widget__paper-rule, .exit-chamber-mood-paper__rule')
          .forEach((rule) => {
            rule.textContent = line;
          });
      }

      _populateQuiltMoodPaper(widget, bodyText, stampAt = new Date()) {
        if (!widget) return;
        const label = widget.querySelector('.quilt-mood-widget__paper-label');
        const line = widget.querySelector('.quilt-mood-widget__paper-text');
        const stamp = widget.querySelector('.quilt-mood-widget__paper-stamp');
        const body = widget.querySelector('.quilt-mood-widget__paper-body');
        if (label) label.textContent = Utils.formatMoodReceiptLabel();
        if (line) line.textContent = Utils.formatMoodReceiptBody(bodyText);
        if (stamp) stamp.textContent = Utils.formatMoodReceiptStamp(stampAt);
        this._syncMoodReceiptRules(body);
        requestAnimationFrame(() => {
          if (widget.classList.contains('is-active')) this._syncMoodReceiptRules(body);
        });
      }

      _quiltMoodPaperAnnounceText(bodyText, stampAt = new Date()) {
        return Utils.formatMoodReceiptLine(bodyText, stampAt);
      }

      _clearQuiltMoodPaperTimers(widget) {
        if (!widget) return;
        if (widget._moodPaperLineTimer != null) {
          window.clearTimeout(widget._moodPaperLineTimer);
          widget._moodPaperLineTimer = null;
        }
        if (widget._moodPaperAnnounceTimer != null) {
          window.clearTimeout(widget._moodPaperAnnounceTimer);
          widget._moodPaperAnnounceTimer = null;
        }
        if (widget._moodDismissTimer != null) {
          window.clearTimeout(widget._moodDismissTimer);
          widget._moodDismissTimer = null;
        }
      }

      _cancelQuiltMoodPaperRoll(widget) {
        if (!widget) return;
        if (widget._moodRollAnimation) {
          try {
            widget._moodRollAnimation.cancel();
          } catch (_) { /* already finished */ }
          widget._moodRollAnimation = null;
        }
      }

      _finishQuiltMoodPaperRoll(widget) {
        const feed = widget?.querySelector('.quilt-mood-widget__slot-feed');
        if (feed) feed.classList.add('quilt-mood-widget__slot-feed--unrolled');
        const paper = widget?.querySelector('.quilt-mood-widget__paper');
        if (paper) paper.style.transform = '';
        this._syncQuiltMoodPaperCastPosition(widget);
      }

      /** Slit lip line in slot coordinates (top of throat opening). */
      _quiltMoodCastLipTopPx(widget) {
        const slot = widget?.querySelector('.quilt-mood-widget__slot');
        const viewport = widget?.querySelector('.quilt-mood-widget__slot-viewport');
        if (!slot) return 0;
        const slotRect = slot.getBoundingClientRect();
        if (viewport) return viewport.getBoundingClientRect().top - slotRect.top;
        const frame = parseFloat(getComputedStyle(widget).getPropertyValue('--mood-slot-frame'));
        return (Number.isFinite(frame) ? frame : 0) + this._quiltMoodSlitHeightPx(widget);
      }

      /** Shadow rides the emerging paper top until it meets the slit lip, then holds at the lip. */
      _syncQuiltMoodPaperCastPosition(widget) {
        const cast = widget?.querySelector('.quilt-mood-widget__paper-cast');
        const paper = widget?.querySelector('.quilt-mood-widget__paper');
        const feed = widget?.querySelector('.quilt-mood-widget__slot-feed');
        const slot = widget?.querySelector('.quilt-mood-widget__slot');
        if (!cast || !paper || !slot) return;
        const slotRect = slot.getBoundingClientRect();
        const lipTop = this._quiltMoodCastLipTopPx(widget);
        const paperTop = paper.getBoundingClientRect().top - slotRect.top;
        const feedTop = feed ? feed.getBoundingClientRect().top - slotRect.top : lipTop;
        const emergingTop = Math.max(feedTop, paperTop);
        const top = Math.min(lipTop, emergingTop);
        cast.style.top = `${top}px`;
      }

      _clearQuiltMoodPaperCastPosition(widget) {
        const cast = widget?.querySelector('.quilt-mood-widget__paper-cast');
        if (cast) cast.style.top = '';
      }

      /** Keep receipt strip (paper + type) scrolling up with the feed for the whole WAAPI roll. */
      _bindQuiltMoodPaperScrollToRoll(widget, anim, feed) {
        const paper = widget?.querySelector('.quilt-mood-widget__paper');
        if (!paper || !feed || !anim?.effect) return;

        const tick = () => {
          if (widget._moodRollAnimation !== anim) return;
          const feedH = feed.offsetHeight;
          const paperH = paper.offsetHeight;
          const offset = Math.max(0, Math.ceil(paperH - feedH));
          paper.style.transform = offset > 0 ? `translateY(${-offset}px)` : '';
          this._syncQuiltMoodPaperCastPosition(widget);

          const timing = anim.effect.getComputedTiming();
          const progress = Number.isFinite(timing.progress) ? timing.progress : 1;
          if (anim.playState === 'running' && progress < 1) {
            requestAnimationFrame(tick);
          } else {
            paper.style.transform = '';
            this._syncQuiltMoodPaperCastPosition(widget);
          }
        };

        requestAnimationFrame(tick);
      }

      _measureQuiltMoodRollHeight(widget) {
        const feed = widget?.querySelector('.quilt-mood-widget__slot-feed');
        const paper = feed?.querySelector('.quilt-mood-widget__paper');
        if (!feed || !paper) return 0;
        const prevHeight = feed.style.height;
        const prevMaxHeight = feed.style.maxHeight;
        feed.style.height = 'auto';
        feed.style.maxHeight = 'none';
        const height = Math.ceil(paper.getBoundingClientRect().height);
        feed.style.height = prevHeight;
        feed.style.maxHeight = prevMaxHeight;
        return height;
      }

      /** Feed height (flex-end) so receipt bottom sits just below quote-card-stack. */
      _quiltMoodRollHeightPastCardBottom(widget, pastPx = null) {
        const feed = widget?.querySelector('.quilt-mood-widget__slot-feed');
        const stack = widget?.closest('.quote-card-stack');
        if (!feed || !stack) return 0;
        let past = pastPx;
        if (past == null || !Number.isFinite(past)) {
          const raw = getComputedStyle(widget).getPropertyValue('--mood-receipt-roll-past').trim();
          const n = parseFloat(raw);
          past = Number.isFinite(n) && n > 0 ? n : 32;
        }
        const feedTop = feed.getBoundingClientRect().top;
        const stackBottom = stack.getBoundingClientRect().bottom;
        return Math.max(0, Math.ceil(stackBottom - feedTop + past));
      }

      _quiltMoodSlitHeightPx(widget) {
        const raw = getComputedStyle(widget).getPropertyValue('--mood-slot-slit').trim();
        const n = parseFloat(raw);
        return Number.isFinite(n) && n > 0 ? n : 8;
      }

      /**
       * Roll the feed open with Web Animations API — CSS max-height transitions are
       * skipped or truncated in WKWebView when classes batch in one frame.
       */
      _startQuiltMoodPaperRoll(widget, durationMs, { instant = false } = {}) {
        const feed = widget?.querySelector('.quilt-mood-widget__slot-feed');
        if (!feed) return;

        this._syncMoodReceiptRules(widget?.querySelector('.quilt-mood-widget__paper-body'));
        this._cancelQuiltMoodPaperRoll(widget);

        const slitPx = this._quiltMoodSlitHeightPx(widget);
        const rollHeight = this._measureQuiltMoodRollHeight(widget);
        const pastCardHeight = this._quiltMoodRollHeightPastCardBottom(widget);
        let endHeight = Math.max(slitPx + 1, rollHeight, pastCardHeight);
        if (!Number.isFinite(endHeight) || endHeight <= 0) {
          endHeight = slitPx + 1;
        }

        widget.style.setProperty('--mood-roll-height', `${endHeight}px`);
        widget.classList.add('quilt-mood-widget--paper-out');

        feed.style.maxHeight = 'none';

        if (instant || durationMs <= 0) {
          feed.style.height = `${endHeight}px`;
          this._finishQuiltMoodPaperRoll(widget);
          requestAnimationFrame(() => this._syncQuiltMoodPaperCastPosition(widget));
          return;
        }

        feed.style.height = `${slitPx}px`;
        void feed.offsetHeight;
        this._syncQuiltMoodPaperCastPosition(widget);

        if (typeof feed.animate !== 'function') {
          feed.style.height = `${endHeight}px`;
          window.setTimeout(() => this._finishQuiltMoodPaperRoll(widget), durationMs);
          return;
        }

        try {
          const anim = feed.animate(
            [
              { height: `${slitPx}px` },
              { height: `${endHeight}px` },
            ],
            {
              duration: durationMs,
              easing: 'cubic-bezier(0.38, 0, 0.16, 1)',
              fill: 'forwards',
            }
          );

          widget._moodRollAnimation = anim;
          this._bindQuiltMoodPaperScrollToRoll(widget, anim, feed);
          anim.onfinish = () => {
            if (widget._moodRollAnimation !== anim) return;
            widget._moodRollAnimation = null;
            feed.style.height = `${endHeight}px`;
            this._finishQuiltMoodPaperRoll(widget);
          };
          anim.oncancel = () => {
            if (widget._moodRollAnimation === anim) widget._moodRollAnimation = null;
          };
        } catch (_) {
          feed.style.height = `${endHeight}px`;
          this._finishQuiltMoodPaperRoll(widget);
        }
      }

      _bindQuiltMoodPaperRollEnd(widget) {
        const feed = widget?.querySelector('.quilt-mood-widget__slot-feed');
        if (feed) feed.classList.remove('quilt-mood-widget__slot-feed--unrolled');
      }

      _resetQuiltMoodCardState(widget) {
        if (!widget) return;
        this._clearQuiltMoodPaperTimers(widget);
        widget.classList.remove('is-hydrating');
        const term = widget.querySelector('.mood-terminal');
        term?.disconnectTerminalWake?.();
        if (term?.resetTerminalMood) {
          term.resetTerminalMood();
        }
        const announcer = document.getElementById('quiltMoodWidgetAnnouncer');
        if (announcer) announcer.textContent = '';
      }

      _resetQuiltMoodPaperState(widget) {
        this._resetQuiltMoodCardState(widget);
      }

      setupQuiltMoodWidget() {
        const host = document.getElementById('quiltMoodWidget');
        if (!host || host.dataset.listenerAttached === '1') return;
        host.dataset.listenerAttached = '1';
        globalThis.QuiltMoodTerminal?.injectTerminalStyles?.();
      }

      _setReflectionSubmitLabel(submit, label) {
        if (!submit) return;
        const text = String(label || '');
        const idleLabel = 'add yours';
        const SGM = globalThis.SpeakerGuideMarker;
        if (text === idleLabel && SGM?.buildSpeakerGuideMarkerHtml) {
          const html = SGM.buildSpeakerGuideMarkerHtml(text, text);
          if (html.includes('<mark')) {
            submit.innerHTML = html;
            const runSync = () => SGM.syncMarkerStrokeWidths?.(submit);
            if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(() => requestAnimationFrame(runSync));
            } else {
              runSync();
            }
            return;
          }
        }
        submit.textContent = text;
      }

      applyReflectionAddYoursMarkerStyle() {
        const submit = document.getElementById('quiltReflectionResponseSubmit');
        if (!submit) return;
        const markerColor = String(
          this.getBrightQuiltMarkerColor?.() || CONFIG.APP.defaultColor || '#ea9b9a'
        ).trim();
        const match = /^#?([0-9a-f]{6})$/i.exec(markerColor);
        if (match) {
          const hex = match[1];
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          submit.style.setProperty('--speaker-guide-marker-rgb', `${r}, ${g}, ${b}`);
          submit.style.setProperty('--speaker-guide-marker-opacity', '0.42');
        }
        this._setReflectionSubmitLabel(submit, 'add yours');
      }

      refreshQuiltReflectionScrapWidget(quote = null) {
        const widget = document.getElementById('quiltReflectionScrapWidget');
        if (!widget) return;
        const textEl = document.getElementById('quiltReflectionScrapText');
        const todayQuote = quote || this.quoteService?.getTodayQuote?.() || null;
        if (textEl) {
          const promptText = this.getQuiltReflectionPromptText(todayQuote);
          textEl.innerHTML =
            typeof this.quoteService?.formatQuoteLineForQuiltDisplay === 'function'
              ? this.quoteService.formatQuoteLineForQuiltDisplay(promptText)
              : this.escapeQuiltFortuneText(promptText);
        }
        const paletteColors = (this.getQuiltPaletteSummary()?.palette || [])
          .map((item) => item?.color)
          .filter((color) => /^#[0-9A-Fa-f]{6}$/.test(String(color || '').trim()));
        const colors = [...paletteColors, ...this.getQuiltFortuneColors()];
        const uniqueColors = [];
        const isLightScrapColor = (color) => {
          const match = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim());
          if (!match) return false;
          const hex = match[1];
          const r = parseInt(hex.slice(0, 2), 16) / 255;
          const g = parseInt(hex.slice(2, 4), 16) / 255;
          const b = parseInt(hex.slice(4, 6), 16) / 255;
          return (0.2126 * r + 0.7152 * g + 0.0722 * b) >= 0.48;
        };
        colors.forEach((color) => {
          const value = String(color || '').trim();
          if (/^#[0-9A-Fa-f]{6}$/.test(value) && isLightScrapColor(value) && !uniqueColors.includes(value)) {
            uniqueColors.push(value);
          }
        });
        ['#ea9b9a', '#e7d8bc', '#b9a7d8', '#c7b299', '#8bd5d8', '#f2c7ba'].forEach((color) => {
          if (uniqueColors.length < 5 && !uniqueColors.includes(color)) uniqueColors.push(color);
        });
        const sortedColors = uniqueColors
          .map((color) => ({ color, hsv: Utils.hexToHsv(color) }))
          .sort((a, b) => a.hsv.h - b.hsv.h || b.hsv.s - a.hsv.s)
          .map((item) => item.color);
        if (!this._reflectionScrapReloadSeed) {
          this._reflectionScrapReloadSeed = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
        }
        const seed = Utils.hashStringToUint(`${Utils.getTodayKey()}:reflection-scraps:${this._reflectionScrapReloadSeed}:${sortedColors.join('|')}`);
        const randomUnit = (salt) => {
          const value = Utils.hashStringToUint(`${seed}:${salt}`) % 10000;
          return value / 9999;
        };
        const hexToScrapInk = (color) => {
          const match = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim());
          if (!match) {
            return { rgb: '231, 216, 188', luminance: 178 };
          }
          const hex = match[1];
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          return {
            rgb: `${r}, ${g}, ${b}`,
            luminance: 0.299 * r + 0.587 * g + 0.114 * b
          };
        };
        const baseRotations = [-6, 3, 8, 7, -4, -7, 4, -3, 5, -8, 11, -10, 9, -5, 12, -12, 7, -11, 14, -15, 13, -9, -13, 16, 10, -14, 15, -7, -11, 13, -15, 8];
        const scrapCuts = [
          '2% 0%, 99% 4%, 97% 100%, 0% 96%',
          '0% 3%, 98% 0%, 100% 96%, 3% 100%',
          '3% 1%, 100% 2%, 96% 98%, 1% 100%',
          '1% 0%, 97% 3%, 100% 100%, 4% 97%',
          '4% 2%, 100% 0%, 98% 96%, 0% 100%',
          '0% 0%, 96% 3%, 100% 97%, 2% 100%'
        ];
        const getGapBands = () => {
          const layer = widget.querySelector('.quilt-reflection-scraps-after');
          if (!layer) return [];
          const layerRect = layer.getBoundingClientRect?.();
          if (!layerRect) return [];
          const bandBetween = (a, b) => {
            if (!a || !b || a.offsetParent === null || b.offsetParent === null) return null;
            const aRect = a.getBoundingClientRect?.();
            const bRect = b.getBoundingClientRect?.();
            if (!aRect || !bRect) return null;
            const top = aRect.bottom - layerRect.top;
            const bottom = bRect.top - layerRect.top;
            const height = Math.max(20, bottom - top);
            return { top, height };
          };
          return [
            bandBetween(widget.querySelector('.quilt-reflection-question-paper'), widget.querySelector('.quilt-reflection-wall:not([hidden])')),
            bandBetween(widget.querySelector('.quilt-reflection-wall:not([hidden])'), widget.querySelector('.quilt-reflection-archive-link'))
          ].filter(Boolean);
        };
        const gapExtras = Array.from(widget.querySelectorAll('.quilt-reflection-scrap--gap-extra'));
        const positionGapExtras = () => {
          const gapBands = getGapBands();
          if (!gapBands.length) return;
          gapExtras.forEach((scrap, gapIndex) => {
            const band = gapBands[Math.floor(gapIndex / 5) % gapBands.length];
            const xPct = 10 + randomUnit(`gap-extra-x:${gapIndex}`) * 80;
            const yPx = band.top + band.height * (0.25 + randomUnit(`gap-extra-y:${gapIndex}`) * 0.5);
            const w = (1.75 + randomUnit(`gap-extra-w:${gapIndex}`) * 1.35).toFixed(2);
            const h = (1.7 + randomUnit(`gap-extra-h:${gapIndex}`) * 1.25).toFixed(2);
            scrap.style.left = `${xPct.toFixed(2)}%`;
            scrap.style.top = `${yPx.toFixed(2)}px`;
            scrap.style.right = 'auto';
            scrap.style.bottom = 'auto';
            scrap.style.width = `${w}rem`;
            scrap.style.height = `${h}rem`;
          });
        };
        const scraps = Array.from(widget.querySelectorAll('.quilt-reflection-scrap'));
        scraps.forEach((scrap, i) => {
          const color = sortedColors[(seed + i) % sortedColors.length] || CONFIG.APP.defaultColor;
          const ink = hexToScrapInk(color);
          const darkerColorFactor = ink.luminance <= 72 ? 0.52 : ink.luminance <= 108 ? 0.68 : ink.luminance <= 150 ? 0.84 : 1;
          const textureOpacity = (0.14 + randomUnit(`texture:${i}`) * 0.12) * darkerColorFactor;
          const paperOpacity = (ink.luminance <= 118 ? 0.12 : 0.18) + randomUnit(`paper:${i}`) * 0.08;
          widget.style.setProperty(`--reflection-scrap-${i + 1}`, color);
          scrap.style.setProperty('--reflection-scrap-color', color);
          scrap.style.setProperty('--reflection-scrap-rgb', ink.rgb);
          const x = (randomUnit(`x:${i}`) * 1.5 - 0.75).toFixed(2);
          const y = (randomUnit(`y:${i}`) * 1.15 - 0.58).toFixed(2);
          const inkX = (randomUnit(`ink-x:${i}`) * 0.16 - 0.08).toFixed(3);
          const inkY = (randomUnit(`ink-y:${i}`) * 0.16 - 0.08).toFixed(3);
          const toothX = (randomUnit(`tooth-x:${i}`) * 0.14 - 0.07).toFixed(3);
          const toothY = (randomUnit(`tooth-y:${i}`) * 0.14 - 0.07).toFixed(3);
          const rotation = (baseRotations[i % baseRotations.length] || 0) + Math.round(randomUnit(`r:${i}`) * 20 - 10);
          const scale = (0.84 + randomUnit(`s:${i}`) * 0.36).toFixed(2);
          scrap.style.setProperty('--reflection-scrap-x', `${x}rem`);
          scrap.style.setProperty('--reflection-scrap-y', `${y}rem`);
          scrap.style.setProperty('--reflection-scrap-ink-x', `${inkX}rem`);
          scrap.style.setProperty('--reflection-scrap-ink-y', `${inkY}rem`);
          scrap.style.setProperty('--reflection-scrap-tooth-x', `${toothX}rem`);
          scrap.style.setProperty('--reflection-scrap-tooth-y', `${toothY}rem`);
          scrap.style.setProperty('--reflection-scrap-texture-opacity', textureOpacity.toFixed(3));
          scrap.style.setProperty('--reflection-scrap-paper-opacity', paperOpacity.toFixed(3));
          scrap.style.setProperty('--reflection-scrap-rotation', `${rotation}deg`);
          scrap.style.setProperty('--reflection-scrap-scale', scale);
          scrap.style.setProperty('--reflection-scrap-cut', scrapCuts[i % scrapCuts.length]);
        });
        positionGapExtras();
        requestAnimationFrame(() => positionGapExtras());
        this.applyReflectionAddYoursMarkerStyle();
        this.loadReflectionThemesForToday()
          .then(() => requestAnimationFrame(() => positionGapExtras()))
          .catch((error) => {
            this.logger?.warn?.('Reflection themes refresh failed:', error);
          });
      }
  }

  root.SimplifiedQuiltAppV2Mood = SimplifiedQuiltAppV2Mood;
})(typeof globalThis !== 'undefined' ? globalThis : window);
