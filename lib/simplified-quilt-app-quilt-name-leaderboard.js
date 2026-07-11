/**
 * SimplifiedQuiltAppV2 quilt name leaderboard slice (admin preview).
 * Launch from admin menu only — not wired to quilt screen yet.
 */
(function (root) {
  'use strict';

  class SimplifiedQuiltAppV2QuiltNameLeaderboard {
    quiltNameLeaderboardApiBaseUrl() {
      const configured = String(
        (typeof CONFIG !== 'undefined' && CONFIG.BACKEND?.baseUrl) || ''
      ).replace(/\/$/, '');
      const origin = String(root.location?.origin || '').replace(/\/$/, '');
      if (configured) return configured;
      return /^https?:\/\//i.test(origin) ? origin : '';
    }

    quiltNameLeaderboardClientId() {
      if (typeof Utils !== 'undefined' && typeof Utils.getOrCreateUserId === 'function') {
        return Utils.getOrCreateUserId();
      }
      if (typeof UtilsCore !== 'undefined' && typeof UtilsCore.getOrCreateUserId === 'function') {
        return UtilsCore.getOrCreateUserId();
      }
      return this.currentUserId || 'anonymous';
    }

    quiltNameLeaderboardDateKey() {
      if (typeof Utils !== 'undefined' && typeof Utils.getTodayKey === 'function') {
        return Utils.getTodayKey();
      }
      if (typeof UtilsCore !== 'undefined' && typeof UtilsCore.getTodayKey === 'function') {
        return UtilsCore.getTodayKey();
      }
      return '';
    }

    quiltNameLeaderboardVoteStorageKey(dateKey) {
      return `quiltNameLeaderboardVote_${dateKey || 'unknown'}`;
    }

    revealQuiltNameLeaderboardScreen() {
      const screen = document.getElementById('screen-quilt-name-leaderboard');
      if (!screen) return null;
      screen.hidden = false;
      screen.removeAttribute('hidden');
      screen.setAttribute('aria-hidden', 'false');
      return screen;
    }

    openQuiltNameLeaderboard() {
      document.querySelectorAll('.admin-menu').forEach((el) => el.remove());
      const screen = this.revealQuiltNameLeaderboardScreen();
      this.setupQuiltNameLeaderboardScreen();
      this.uiService?.showScreen?.('screen-quilt-name-leaderboard');
      if (screen) screen.scrollTop = 0;
      void this.refreshQuiltNameLeaderboard();
    }

    setupQuiltNameLeaderboardScreen() {
      const screen = document.getElementById('screen-quilt-name-leaderboard');
      const form = document.getElementById('qnlbSubmitForm');
      if (!screen || !form || screen.dataset.qnlbBound === '1') return;
      screen.dataset.qnlbBound = '1';

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await this.submitQuiltNameLeaderboardEntry();
      });

      const nameInput = document.getElementById('qnlbNameInput');
      nameInput?.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Spacebar') event.preventDefault();
      });
      nameInput?.addEventListener('paste', (event) => {
        const pasted = String(event.clipboardData?.getData('text') || '');
        if (/\s/.test(pasted)) {
          event.preventDefault();
          this.setQuiltNameLeaderboardStatus('Please choose just one word.', 'error');
        }
      });
      nameInput?.addEventListener('input', () => {
        const cleaned = String(nameInput.value || '').replace(/[^A-Za-z]/g, '');
        if (cleaned !== nameInput.value) nameInput.value = cleaned;
      });

      const list = document.getElementById('qnlbEntryList');
      list?.addEventListener('click', async (event) => {
        const row = event.target?.closest?.('.qnlb-entry[data-qnlb-vote-word]');
        if (!row) return;
        const word = String(row.getAttribute('data-qnlb-vote-word') || '').trim();
        if (!word) return;
        if (String(this._qnlbLastPayload?.myVote || '').trim() === word) return;
        if (this._qnlbDemoMode || this._qnlbLastPayload?.demo) {
          this.applyQuiltNameLeaderboardDemoVote(word);
          return;
        }
        await this.castQuiltNameLeaderboardVote(word);
      });

      list?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const row = event.target?.closest?.('.qnlb-entry[data-qnlb-vote-word]');
        if (!row) return;
        event.preventDefault();
        const word = String(row.getAttribute('data-qnlb-vote-word') || '').trim();
        if (!word) return;
        if (String(this._qnlbLastPayload?.myVote || '').trim() === word) return;
        if (this._qnlbDemoMode || this._qnlbLastPayload?.demo) {
          this.applyQuiltNameLeaderboardDemoVote(word);
          return;
        }
        await this.castQuiltNameLeaderboardVote(word);
      });

      const expandBtn = document.getElementById('qnlbExpandBtn');
      expandBtn?.addEventListener('click', () => {
        screen.dataset.qnlbExpanded = '1';
        void this.refreshQuiltNameLeaderboard({ renderOnly: true });
      });

      const refreshBtn = document.getElementById('qnlbRefreshBtn');
      refreshBtn?.addEventListener('click', () => {
        this._qnlbDemoMode = false;
        void this.refreshQuiltNameLeaderboard();
      });

      const demoBtn = document.getElementById('qnlbDemoBtn');
      demoBtn?.addEventListener('click', () => {
        this.loadQuiltNameLeaderboardDemo();
      });

      const clearBtn = document.getElementById('qnlbClearBtn');
      clearBtn?.addEventListener('click', () => {
        void this.clearQuiltNameLeaderboardAll();
      });

      this.applyQuiltNameLeaderboardSubmitStyle();
    }

    getQuiltNameLeaderboardEmptyPayload() {
      const dateKey = this.quiltNameLeaderboardDateKey();
      const dayOpen = Date.parse(`${dateKey}T07:00:00.000Z`);
      const submissionsCloseAt = new Date(dayOpen + 8 * 60 * 60 * 1000).toISOString();
      const votingEndsAt = new Date(dayOpen + 24 * 60 * 60 * 1000).toISOString();
      return {
        success: true,
        dateKey,
        phase: 'submissions',
        submissionsCloseAt,
        votingEndsAt,
        entries: [],
        myVote: null,
        canSubmit: true,
        canVote: false
      };
    }

    clearQuiltNameLeaderboardLocalState() {
      const dateKey = this.quiltNameLeaderboardDateKey();
      const screen = document.getElementById('screen-quilt-name-leaderboard');
      if (screen) screen.dataset.qnlbExpanded = '0';
      this._qnlbDemoMode = false;
      try {
        localStorage.removeItem(this.quiltNameLeaderboardVoteStorageKey(dateKey));
      } catch (_) {
        /* ignore */
      }
      this._qnlbLastPayload = this.getQuiltNameLeaderboardEmptyPayload();
      this.renderQuiltNameLeaderboard(this._qnlbLastPayload);
    }

    async clearQuiltNameLeaderboardAll() {
      const hasEntries = Array.isArray(this._qnlbLastPayload?.entries) && this._qnlbLastPayload.entries.length > 0;
      const isDemo = !!(this._qnlbDemoMode || this._qnlbLastPayload?.demo);
      if (!hasEntries && !isDemo) {
        this.setQuiltNameLeaderboardStatus('No names to clear.');
        return;
      }
      if (!window.confirm('Clear all names for today? This cannot be undone.')) return;

      if (isDemo) {
        this.clearQuiltNameLeaderboardLocalState();
        this.setQuiltNameLeaderboardStatus('Sample names cleared.', 'success');
        return;
      }

      const baseUrl = this.quiltNameLeaderboardApiBaseUrl();
      if (!baseUrl) {
        this.setQuiltNameLeaderboardStatus('API base URL is not configured.', 'error');
        return;
      }

      const token = await this.getAdminServerMutationToken?.();
      if (!token) {
        this.setQuiltNameLeaderboardStatus('Admin token required to clear names.', 'error');
        return;
      }

      const clearBtn = document.getElementById('qnlbClearBtn');
      if (clearBtn) clearBtn.disabled = true;
      this.setQuiltNameLeaderboardStatus('Clearing…');

      try {
        const res = await fetch(`${baseUrl}/api/quilt-name-leaderboard-clear`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-reset-token': token
          },
          body: JSON.stringify({ dateKey: this.quiltNameLeaderboardDateKey() })
        });
        const payload = await res.json().catch(() => ({}));
        if (res.status === 401) {
          try {
            localStorage.removeItem('ourDailyResetToken');
          } catch (_) {
            /* ignore */
          }
          throw new Error('Unauthorized — check your RESET_TOKEN');
        }
        if (!res.ok || !payload.success) {
          throw new Error(payload.error || `HTTP ${res.status}`);
        }
        try {
          localStorage.removeItem(this.quiltNameLeaderboardVoteStorageKey(this.quiltNameLeaderboardDateKey()));
        } catch (_) {
          /* ignore */
        }
        this._qnlbDemoMode = false;
        const screen = document.getElementById('screen-quilt-name-leaderboard');
        if (screen) screen.dataset.qnlbExpanded = '0';
        await this.refreshQuiltNameLeaderboard();
        this.setQuiltNameLeaderboardStatus('All names cleared.', 'success');
      } catch (error) {
        const message = String(error?.message || 'Clear failed');
        if (/failed to fetch/i.test(message)) {
          this.setQuiltNameLeaderboardStatus(
            'Could not reach the server — wait for deploy or check CORS/API URL.',
            'error'
          );
        } else {
          this.setQuiltNameLeaderboardStatus(message, 'error');
        }
      } finally {
        if (clearBtn) clearBtn.disabled = false;
      }
    }

    getQuiltNameLeaderboardDemoPayload() {
      const dateKey = this.quiltNameLeaderboardDateKey();
      const dayOpen = Date.parse(`${dateKey}T07:00:00.000Z`);
      const submissionsCloseAt = new Date(dayOpen + 8 * 60 * 60 * 1000).toISOString();
      const votingEndsAt = new Date(dayOpen + 24 * 60 * 60 * 1000).toISOString();
      const myVote = String(this._qnlbLastPayload?.myVote || '').trim()
        || localStorage.getItem(this.quiltNameLeaderboardVoteStorageKey(dateKey))
        || '';
      const samples = [
        { word: 'Ember', votes: 12, source: 'community' },
        { word: 'Glimmer', votes: 9, source: 'community' },
        { word: 'Threshold', votes: 7, source: 'community' },
        { word: 'Confluence', votes: 6, source: 'community' },
        { word: 'Velvet', votes: 4, source: 'community' },
        { word: 'Meridian', votes: 6, source: 'community', isMine: true },
        { word: 'Weave', votes: 2, source: 'community' },
        { word: 'Prism', votes: 2, source: 'ai' },
        { word: 'Indigo', votes: 1, source: 'ai' },
        { word: 'Pulse', votes: 1, source: 'ai' }
      ];
      return {
        success: true,
        demo: true,
        dateKey,
        phase: 'voting',
        submissionsCloseAt,
        votingEndsAt,
        entries: samples.map((item, index) => ({
          id: `demo-${index}`,
          word: item.word,
          votes: item.votes,
          source: item.source,
          isMine: !!item.isMine
        })),
        myVote: myVote || null,
        canSubmit: false,
        canVote: true
      };
    }

    loadQuiltNameLeaderboardDemo() {
      this._qnlbDemoMode = true;
      const screen = document.getElementById('screen-quilt-name-leaderboard');
      if (screen) screen.dataset.qnlbExpanded = '0';
      this._qnlbLastPayload = this.getQuiltNameLeaderboardDemoPayload();
      this.renderQuiltNameLeaderboard(this._qnlbLastPayload);
      this.setQuiltNameLeaderboardStatus('Sample names only — Refresh to load the real list.', 'success');
    }

    applyQuiltNameLeaderboardDemoVote(word) {
      if (!this._qnlbLastPayload?.demo || !Array.isArray(this._qnlbLastPayload.entries)) return;
      const previous = String(this._qnlbLastPayload.myVote || '').trim();
      if (previous === word) return;
      const entries = this._qnlbLastPayload.entries.map((entry) => ({ ...entry }));
      if (previous && previous !== word) {
        const prevEntry = entries.find((entry) => entry.word === previous);
        if (prevEntry) prevEntry.votes = Math.max(0, (Number(prevEntry.votes) || 0) - 1);
      }
      const nextEntry = entries.find((entry) => entry.word === word);
      if (nextEntry && previous !== word) nextEntry.votes = (Number(nextEntry.votes) || 0) + 1;
      this._qnlbLastPayload = {
        ...this._qnlbLastPayload,
        entries: this.sortQuiltNameLeaderboardEntries(entries, 'voting'),
        myVote: word
      };
      const dateKey = this.quiltNameLeaderboardDateKey();
      localStorage.setItem(this.quiltNameLeaderboardVoteStorageKey(dateKey), word);
      this.renderQuiltNameLeaderboard(this._qnlbLastPayload, { animateReorder: true });
      this.setQuiltNameLeaderboardStatus('Sample vote saved. Tap another name to change your mind.', 'success');
    }

    sortQuiltNameLeaderboardEntries(entries, phase) {
      const sorted = Array.isArray(entries) ? [...entries] : [];
      if (phase === 'voting' || phase === 'final') {
        sorted.sort((a, b) => {
          const voteDiff = (Number(b.votes) || 0) - (Number(a.votes) || 0);
          if (voteDiff !== 0) return voteDiff;
          return String(a.word || '').localeCompare(String(b.word || ''));
        });
      }
      return sorted;
    }

    qnlbCloudHashString(value) {
      const str = String(value || '');
      let hash = 5381;
      for (let i = 0; i < str.length; i += 1) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
      }
      return Math.abs(hash);
    }

    qnlbEntryCloudTransform(row) {
      if (!row) return '';
      const x = row.style.getPropertyValue('--tag-nudge-x') || '0';
      const y = row.style.getPropertyValue('--tag-nudge-y') || '0';
      const rot = row.style.getPropertyValue('--cloud-rot') || '0deg';
      return `translate(${x}, ${y}) rotate(${rot})`;
    }

    applyQuiltNameLeaderboardCloudScatter(row, word, index) {
      const styleHash = this.qnlbCloudHashString(`${word}|${this.quiltNameLeaderboardDateKey()}|${index}`);
      const tilt = (styleHash % 13) - 6;
      const nudgeX = ((styleHash % 9) - 4) * 0.38;
      const nudgeY = ((Math.floor(styleHash / 3) % 7) - 3) * 0.3;
      row.style.setProperty('--cloud-rot', `${tilt}deg`);
      row.style.setProperty('--tag-nudge-x', `${nudgeX}px`);
      row.style.setProperty('--tag-nudge-y', `${nudgeY}px`);
      row.style.transform = this.qnlbEntryCloudTransform(row);
    }

    qnlbCloudMaxHeightPx() {
      const viewportH = Math.floor(
        (root.visualViewport && root.visualViewport.height) || root.innerHeight || 0
      );
      if (!viewportH) return 0;
      return Math.floor(viewportH * 0.5);
    }

    fitQuiltNameLeaderboardCloud(list) {
      if (!list) return;
      const computedMax = parseFloat(getComputedStyle(list).maxHeight);
      const maxHeight = Number.isFinite(computedMax) && computedMax > 0
        ? Math.floor(computedMax)
        : this.qnlbCloudMaxHeightPx();
      if (!maxHeight) return;

      const minScale = 0.38;
      const maxScale = 1.2;
      const applyScale = (value) => {
        list.style.setProperty('--qnlb-cloud-base-size', String(value));
        const gapScale = value < 0.72 ? Math.max(0.72, value + 0.08) : 1;
        list.style.setProperty('--qnlb-cloud-gap-scale', String(gapScale));
      };

      const overflows = () => list.scrollHeight > maxHeight + 2;

      const fitsAtScale = (scale) => {
        applyScale(scale);
        void list.offsetHeight;
        return !overflows();
      };

      let lo = minScale;
      let hi = maxScale;
      let bestScale = 1;
      for (let i = 0; i < 24 && hi - lo > 0.01; i += 1) {
        const mid = (lo + hi) / 2;
        if (fitsAtScale(mid)) {
          bestScale = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }

      applyScale(bestScale);
      if (overflows()) {
        let scale = bestScale;
        let guard = 0;
        while (scale > minScale && overflows() && guard < 18) {
          scale = Math.max(minScale, scale * 0.96);
          applyScale(scale);
          guard += 1;
        }
      }
    }

    bindQuiltNameLeaderboardCloudResize() {
      if (this._qnlbCloudResizeBound) return;
      this._qnlbCloudResizeBound = true;
      const refit = () => {
        const list = document.getElementById('qnlbEntryList');
        if (!list?.classList.contains('qnlb-name-cloud')) return;
        this.scheduleFitQuiltNameLeaderboardCloud(list);
      };
      root.addEventListener('resize', refit, { passive: true });
      root.visualViewport?.addEventListener('resize', refit, { passive: true });
    }

    scheduleFitQuiltNameLeaderboardCloud(list) {
      if (!list) return;
      requestAnimationFrame(() => {
        this.fitQuiltNameLeaderboardCloud(list);
        if (document.fonts?.ready) {
          document.fonts.ready.then(() => this.fitQuiltNameLeaderboardCloud(list)).catch(() => {});
        }
      });
    }

    shouldAnimateQuiltNameLeaderboardReorder(options = {}) {
      if (!options.animateReorder) return false;
      if (root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
      return true;
    }

    captureQuiltNameLeaderboardFlipState(list) {
      const map = new Map();
      if (!list) return map;
      list.querySelectorAll('.qnlb-entry[data-qnlb-entry-word]').forEach((item) => {
        map.set(item.dataset.qnlbEntryWord, item.getBoundingClientRect());
      });
      return map;
    }

    runQuiltNameLeaderboardFlip(list, beforeRects) {
      if (!list || !beforeRects?.size) return;
      list.querySelectorAll('.qnlb-entry[data-qnlb-entry-word]').forEach((item) => {
        const key = item.dataset.qnlbEntryWord;
        const before = beforeRects.get(key);
        if (!before) return;
        const after = item.getBoundingClientRect();
        const dy = before.top - after.top;
        const dx = before.left - after.left;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

        item.classList.add('qnlb-entry--moving');
        item.style.transform = `translate(${dx}px, ${dy}px) ${this.qnlbEntryCloudTransform(item)}`;
        item.style.transition = 'transform 0s';

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            item.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)';
            item.style.transform = this.qnlbEntryCloudTransform(item);
          });
        });

        const onEnd = (event) => {
          if (event.propertyName !== 'transform') return;
          item.removeEventListener('transitionend', onEnd);
          item.classList.remove('qnlb-entry--moving');
          item.style.transition = '';
          item.style.transform = this.qnlbEntryCloudTransform(item);
        };
        item.addEventListener('transitionend', onEnd);
      });
    }

    paintQuiltNameLeaderboardStripRow(row, entry, index, viewState) {
      const { phase, myVote, winningVoteCount, showVotes, canVote, demo } = viewState;
      const word = String(entry.word || '').trim();
      const safeWord = this.escapeQuiltNameLeaderboardHtml(word);
      const votes = Number(entry.votes);
      const showVoteCounts = phase === 'voting' || phase === 'final' || demo;
      const isSelected = myVote && word === myVote;
      const isWinning = showVoteCounts && winningVoteCount > 0 && votes === winningVoteCount;

      row.className = [
        'qnlb-entry',
        'qnlb-name-strip',
        isSelected ? 'qnlb-entry--selected' : '',
        isWinning ? 'qnlb-entry--winning' : ''
      ].filter(Boolean).join(' ');
      row.dataset.qnlbEntryWord = this.normalizeLeaderboardEntryKey(word);
      this.applyQuiltNameLeaderboardCloudScatter(row, word, index);

      row.innerHTML = `
        <span class="qnlb-entry__word">${safeWord}</span>
        ${showVoteCounts
    ? `<span class="qnlb-entry__tally" aria-label="${votes} votes">${votes}</span>`
    : ''}
      `;

      if (canVote) {
        row.setAttribute('data-qnlb-vote-word', word);
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        row.setAttribute(
          'aria-label',
          isSelected
            ? `Voted for ${word}. Tap another name to change your vote.`
            : `Vote for ${word}`
        );
      } else {
        row.removeAttribute('data-qnlb-vote-word');
        row.removeAttribute('role');
        row.removeAttribute('tabindex');
        row.removeAttribute('aria-pressed');
        row.removeAttribute('aria-label');
      }
    }

    paintQuiltNameLeaderboardListRow(row, entry, index, viewState) {
      const { myVote, winningVoteCount, showVotes, canVote, demo } = viewState;
      const word = String(entry.word || '').trim();
      const safeWord = this.escapeQuiltNameLeaderboardHtml(word);
      const votes = Number(entry.votes);
      const showVoteCounts = showVotes || demo;
      const isSelected = myVote && word === myVote;
      const isWinning = showVoteCounts && winningVoteCount > 0 && votes === winningVoteCount;
      const position = index + 1;

      row.className = [
        'qnlb-entry',
        'qnlb-entry-card',
        isSelected ? 'qnlb-entry--selected' : '',
        isWinning ? 'qnlb-entry--winning' : ''
      ].filter(Boolean).join(' ');
      row.dataset.qnlbEntryWord = this.normalizeLeaderboardEntryKey(word);
      row.style.removeProperty('--cloud-rot');
      row.style.removeProperty('--tag-nudge-x');
      row.style.removeProperty('--tag-nudge-y');
      row.style.removeProperty('transform');

      row.innerHTML = `
        <span class="qnlb-entry__position" aria-hidden="true">${position}</span>
        <div class="quilt-before-you-go__slab quilt-before-you-go__slab--art qnlb-entry-slab">
          <div class="quilt-before-you-go__slab-body">
            <div class="qnlb-entry-card__inner">
              <span class="qnlb-entry__word">${safeWord}</span>
              ${showVoteCounts || canVote
    ? `<span class="qnlb-entry__vote-group">
              ${showVoteCounts
    ? `<span class="qnlb-entry__tally" aria-label="${votes} votes">${votes}</span>`
    : '<span class="qnlb-entry__tally qnlb-entry__tally--empty" aria-hidden="true"></span>'}
              ${canVote ? '<span class="qnlb-entry__vote" aria-hidden="true"></span>' : ''}
            </span>`
    : ''}
            </div>
          </div>
        </div>
      `;

      if (canVote) {
        row.setAttribute('data-qnlb-vote-word', word);
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        row.setAttribute(
          'aria-label',
          isSelected
            ? `#${position} ${word}. Voted for this name. Tap another to change your vote.`
            : `#${position} ${word}. Vote for this name.`
        );
      } else {
        row.removeAttribute('data-qnlb-vote-word');
        row.removeAttribute('role');
        row.removeAttribute('tabindex');
        row.removeAttribute('aria-pressed');
        row.removeAttribute('aria-label');
      }
    }

    paintQuiltNameLeaderboardEntryRow(row, entry, index, viewState) {
      if (!this.usesQuiltNameLeaderboardCloudLayout(viewState.phase)) {
        this.paintQuiltNameLeaderboardListRow(row, entry, index, viewState);
        return;
      }
      this.paintQuiltNameLeaderboardStripRow(row, entry, index, viewState);
    }

    usesQuiltNameLeaderboardCloudLayout(phase) {
      return String(phase || '') === 'submissions';
    }

    updateQuiltNameLeaderboardList(list, visibleEntries, viewState, options = {}) {
      const animate = this.shouldAnimateQuiltNameLeaderboardReorder(options);
      const beforeRects = animate ? this.captureQuiltNameLeaderboardFlipState(list) : null;

      if (!visibleEntries.length) {
        list.innerHTML = '';
        return;
      }

      const existing = new Map();
      list.querySelectorAll('.qnlb-entry[data-qnlb-entry-word]').forEach((node) => {
        existing.set(node.dataset.qnlbEntryWord, node);
      });

      const nextRows = [];
      visibleEntries.forEach((entry, index) => {
        const key = this.normalizeLeaderboardEntryKey(entry.word);
        let row = existing.get(key);
        if (!row) {
          row = document.createElement('li');
          row.dataset.qnlbEntryWord = key;
        }
        this.paintQuiltNameLeaderboardEntryRow(row, entry, index, viewState);
        nextRows.push(row);
      });

      list.textContent = '';
      nextRows.forEach((row) => list.appendChild(row));

      if (animate && beforeRects?.size) {
        this.runQuiltNameLeaderboardFlip(list, beforeRects);
      }
      if (this.usesQuiltNameLeaderboardCloudLayout(viewState.phase)) {
        this.bindQuiltNameLeaderboardCloudResize();
        this.scheduleFitQuiltNameLeaderboardCloud(list);
        list.style.removeProperty('--qnlb-strip-width');
      } else {
        list.style.removeProperty('--qnlb-cloud-base-size');
        list.style.removeProperty('--qnlb-cloud-gap-scale');
        this.bindQuiltNameLeaderboardStripResize();
        this.scheduleSyncQuiltNameLeaderboardStripWidths(list);
      }
    }

    bindQuiltNameLeaderboardStripResize() {
      if (this._qnlbStripResizeBound) return;
      this._qnlbStripResizeBound = true;
      window.addEventListener('resize', () => {
        const list = document.getElementById('qnlbEntryList');
        if (!list?.classList.contains('qnlb-entry-list--final')) return;
        this.scheduleSyncQuiltNameLeaderboardStripWidths(list);
      });
    }

    scheduleSyncQuiltNameLeaderboardStripWidths(list) {
      const run = () => this.syncQuiltNameLeaderboardStripWidths(list);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(run));
      } else {
        run();
      }
    }

    syncQuiltNameLeaderboardStripWidths(list) {
      if (!list?.classList.contains('qnlb-entry-list--final')) {
        list?.style.removeProperty('--qnlb-strip-width');
        return;
      }

      const slabs = [...list.querySelectorAll('.qnlb-entry-slab')];
      if (!slabs.length) {
        list.style.removeProperty('--qnlb-strip-width');
        return;
      }

      list.style.removeProperty('--qnlb-strip-width');
      let maxWidth = 0;
      for (const slab of slabs) {
        maxWidth = Math.max(maxWidth, Math.ceil(slab.getBoundingClientRect().width));
      }
      if (maxWidth > 0) {
        const scale = Number.parseFloat(getComputedStyle(list).getPropertyValue('--qnlb-strip-width-scale')) || 1;
        list.style.setProperty('--qnlb-strip-width', `${Math.ceil(maxWidth * scale)}px`);
      }
    }

    normalizeLeaderboardEntryKey(word) {
      return String(word || '').trim().toLowerCase();
    }

    isQuiltNameLeaderboardSingleWord(value) {
      const word = String(value || '').trim();
      return /^[A-Za-z]+$/.test(word);
    }

    canQuiltNameLeaderboardSubmit(data = {}) {
      if (String(data.phase || 'submissions') !== 'submissions') return false;
      if (data.demo) return false;
      if (data.canSubmit) return true;
      return !!this.isCurrentUserAdmin?.();
    }

    applyQuiltNameLeaderboardSubmitStyle() {
      const submit = document.getElementById('qnlbSubmitBtn');
      if (!submit) return;
      const label = 'Suggest';
      const markerColor = String(
        this.getBrightQuiltMarkerColor?.() ||
          (typeof CONFIG !== 'undefined' && CONFIG.APP?.defaultColor) ||
          '#ea9b9a'
      ).trim();
      const match = /^#?([0-9a-f]{6})$/i.exec(markerColor);
      if (match) {
        const hex = match[1];
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        submit.style.setProperty('--speaker-guide-marker-rgb', `${r}, ${g}, ${b}`);
        submit.style.setProperty('--speaker-guide-marker-opacity', '0.48');
      }
      const SGM = globalThis.SpeakerGuideMarker;
      if (SGM?.buildSpeakerGuideMarkerHtml) {
        const html = SGM.buildSpeakerGuideMarkerHtml(label, label);
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
      submit.textContent = label;
    }

    setQuiltNameLeaderboardStatus(message, tone = '') {
      const el = document.getElementById('qnlbStatus');
      if (!el) return;
      el.textContent = String(message || '');
      el.dataset.tone = tone;
      el.hidden = !el.textContent;
    }

    formatQuiltNameLeaderboardCountdown(targetIso) {
      const targetMs = Date.parse(targetIso || '');
      if (!Number.isFinite(targetMs)) return '';
      const diffMs = Math.max(0, targetMs - Date.now());
      const totalMinutes = Math.ceil(diffMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }

    escapeQuiltNameLeaderboardHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    }

    renderQuiltNameLeaderboard(data = {}, options = {}) {
      const screen = document.getElementById('screen-quilt-name-leaderboard');
      const phaseBanner = document.getElementById('qnlbPhaseBanner');
      const countdown = document.getElementById('qnlbCountdown');
      const titleCountdown = document.getElementById('qnlbTitleCountdown');
      const form = document.getElementById('qnlbSubmitForm');
      const formControls = document.getElementById('qnlbFormControls');
      const submitThanks = document.getElementById('qnlbSubmitThanks');
      const nameInput = document.getElementById('qnlbNameInput');
      const list = document.getElementById('qnlbEntryList');
      const listKicker = document.getElementById('qnlbListKicker');
      const expandWrap = document.getElementById('qnlbExpandWrap');
      const expandBtn = document.getElementById('qnlbExpandBtn');
      const cloudStage = document.querySelector('#screen-quilt-name-leaderboard .qnlb-name-cloud-stage');
      if (!phaseBanner || !countdown || !form || !list) return;

      const phase = String(data.phase || 'submissions');
      const entries = this.sortQuiltNameLeaderboardEntries(
        Array.isArray(data.entries) ? data.entries : [],
        phase
      );
      const myVote = String(data.myVote || '').trim();
      const expanded = screen?.dataset.qnlbExpanded === '1';
      const collapse = entries.length > 12 && !expanded;
      const visibleEntries = collapse ? entries.slice(0, 8) : entries;
      const showVotes = phase === 'voting' || phase === 'final' || !!data.demo;
      const winningVoteCount = entries.reduce((best, entry) => {
        const votes = Number(entry.votes) || 0;
        return votes > best ? votes : best;
      }, 0);
      const viewState = {
        phase,
        myVote,
        winningVoteCount,
        showVotes,
        canVote: phase === 'voting',
        demo: !!data.demo
      };

      const canSubmit = this.canQuiltNameLeaderboardSubmit(data);
      const showSubmitThanks = phase === 'submissions' && !canSubmit && !data.demo;

      form.hidden = phase !== 'submissions';
      if (formControls) {
        formControls.hidden = !canSubmit;
      }
      if (submitThanks) {
        submitThanks.textContent = 'Thank you !';
        submitThanks.hidden = !showSubmitThanks;
      }
      if (nameInput) {
        nameInput.placeholder = 'NAME THIS QUILT !';
        nameInput.setAttribute('aria-label', 'NAME THIS QUILT !');
      }

      const useCloudLayout = this.usesQuiltNameLeaderboardCloudLayout(phase);
      list.classList.toggle('qnlb-name-cloud', useCloudLayout);
      list.classList.toggle('qnlb-entry-list--final', !useCloudLayout);
      if (cloudStage) {
        cloudStage.classList.toggle('qnlb-name-cloud-stage--final', !useCloudLayout);
      }

      if (phase === 'submissions') {
        phaseBanner.textContent = 'Suggest a name for today\'s quilt.';
        phaseBanner.hidden = true;
        const countdownText = data.submissionsCloseAt
          ? `Voting opens in ${this.formatQuiltNameLeaderboardCountdown(data.submissionsCloseAt)}`
          : '';
        countdown.textContent = countdownText;
        countdown.hidden = !countdownText;
        if (titleCountdown) {
          titleCountdown.textContent = '';
          titleCountdown.hidden = true;
        }
        if (listKicker) listKicker.textContent = '↓ Names submitted so far ↓';
      } else if (phase === 'voting') {
        phaseBanner.textContent = 'The field is set — tap a name to vote. Tap another anytime to change your vote.';
        phaseBanner.hidden = false;
        const countdownText = data.votingEndsAt
          ? `Voting closes in ${this.formatQuiltNameLeaderboardCountdown(data.votingEndsAt)}`
          : '';
        countdown.textContent = '';
        countdown.hidden = true;
        if (titleCountdown) {
          titleCountdown.textContent = countdownText;
          titleCountdown.hidden = !countdownText;
        }
        if (listKicker) listKicker.textContent = 'Pick your favorite';
      } else {
        phaseBanner.textContent = 'Today\'s naming is closed.';
        phaseBanner.hidden = false;
        countdown.textContent = '';
        countdown.hidden = true;
        if (titleCountdown) {
          titleCountdown.textContent = '';
          titleCountdown.hidden = true;
        }
        if (listKicker) listKicker.textContent = 'Final names';
      }

      if (data.demo && listKicker) {
        listKicker.textContent = 'Sample names (preview)';
      }

      if (collapse && expandWrap && expandBtn) {
        expandWrap.hidden = false;
        expandBtn.textContent = `See all ${entries.length} names`;
      } else if (expandWrap) {
        expandWrap.hidden = true;
      }

      if (!entries.length) {
        if (cloudStage) cloudStage.hidden = true;
        if (listKicker) listKicker.hidden = true;
        list.innerHTML = '';
        list.hidden = true;
        if (expandWrap) expandWrap.hidden = true;
        return;
      }

      if (cloudStage) cloudStage.hidden = false;
      if (listKicker) listKicker.hidden = false;
      list.hidden = false;

      this.updateQuiltNameLeaderboardList(list, visibleEntries, viewState, options);
    }

    async refreshQuiltNameLeaderboard(options = {}) {
      const dateKey = this.quiltNameLeaderboardDateKey();
      const clientId = this.quiltNameLeaderboardClientId();
      if (options.renderOnly && this._qnlbLastPayload) {
        this.renderQuiltNameLeaderboard(this._qnlbLastPayload);
        return;
      }
      const baseUrl = this.quiltNameLeaderboardApiBaseUrl();
      if (!baseUrl) {
        this.setQuiltNameLeaderboardStatus('API base URL is not configured.', 'error');
        return;
      }

      if (!options.renderOnly) {
        this.setQuiltNameLeaderboardStatus('Loading…');
      }

      try {
        const params = new URLSearchParams({ dateKey, clientId });
        const res = await fetch(`${baseUrl}/api/quilt-name-leaderboard?${params.toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload.success) {
          throw new Error(payload.error || `HTTP ${res.status}`);
        }

        const storedVote = localStorage.getItem(this.quiltNameLeaderboardVoteStorageKey(dateKey));
        if (!payload.myVote && storedVote) {
          payload.myVote = storedVote;
        } else if (payload.myVote) {
          localStorage.setItem(this.quiltNameLeaderboardVoteStorageKey(dateKey), payload.myVote);
        }

        this._qnlbLastPayload = payload;
        this.renderQuiltNameLeaderboard(payload, options);
        this.setQuiltNameLeaderboardStatus('');
      } catch (error) {
        this.setQuiltNameLeaderboardStatus(error.message || 'Could not load leaderboard', 'error');
      }
    }

    async submitQuiltNameLeaderboardEntry() {
      const input = document.getElementById('qnlbNameInput');
      const submitBtn = document.getElementById('qnlbSubmitBtn');
      const word = String(input?.value || '').trim();
      if (!word) {
        this.setQuiltNameLeaderboardStatus('Please choose just one word.', 'error');
        return;
      }
      if (!this.isQuiltNameLeaderboardSingleWord(word)) {
        this.setQuiltNameLeaderboardStatus('Please choose just one word.', 'error');
        return;
      }

      const baseUrl = this.quiltNameLeaderboardApiBaseUrl();
      if (submitBtn) submitBtn.disabled = true;
      this.setQuiltNameLeaderboardStatus('Submitting…');

      try {
        const headers = {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        };
        if (this.isCurrentUserAdmin?.()) {
          const token = await this.getAdminServerMutationToken?.();
          if (!token) {
            throw new Error('Admin token required to submit more names.');
          }
          headers['x-reset-token'] = token;
        }
        const res = await fetch(`${baseUrl}/api/quilt-name-submit`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            dateKey: this.quiltNameLeaderboardDateKey(),
            clientId: this.quiltNameLeaderboardClientId(),
            word
          })
        });
        const payload = await res.json().catch(() => ({}));
        if (res.status === 401) {
          try {
            localStorage.removeItem('ourDailyResetToken');
          } catch (_) {
            /* ignore */
          }
          throw new Error('Unauthorized — check your RESET_TOKEN');
        }
        if (!res.ok || !payload.success) {
          throw new Error(payload.error || `HTTP ${res.status}`);
        }
        if (input) input.value = '';
        this.setQuiltNameLeaderboardStatus('Name submitted.', 'success');
        await this.refreshQuiltNameLeaderboard();
      } catch (error) {
        this.setQuiltNameLeaderboardStatus(error.message || 'Submit failed', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    async castQuiltNameLeaderboardVote(word) {
      const baseUrl = this.quiltNameLeaderboardApiBaseUrl();
      const dateKey = this.quiltNameLeaderboardDateKey();
      this.setQuiltNameLeaderboardStatus('Saving vote…');

      try {
        const res = await fetch(`${baseUrl}/api/quilt-name-leaderboard-vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            dateKey,
            clientId: this.quiltNameLeaderboardClientId(),
            word
          })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload.success) {
          throw new Error(payload.error || `HTTP ${res.status}`);
        }
        localStorage.setItem(this.quiltNameLeaderboardVoteStorageKey(dateKey), word);
        const doc = payload.doc || {};
        const entries = this.sortQuiltNameLeaderboardEntries(
          (doc.entries || []).map((entry) => ({
            id: entry.id,
            word: entry.word,
            votes: Number(entry.votes) || 0,
            source: entry.source === 'ai' ? 'ai' : 'community',
            isMine: String(entry.submittedByClientId || '') === this.quiltNameLeaderboardClientId()
          })),
          doc.phase || 'voting'
        );
        this._qnlbLastPayload = {
          ...(this._qnlbLastPayload || {}),
          phase: doc.phase || 'voting',
          entries,
          myVote: payload.myVote || word,
          canSubmit: false,
          canVote: (doc.phase || 'voting') === 'voting',
          submissionsCloseAt: doc.submissionsCloseAt || this._qnlbLastPayload?.submissionsCloseAt,
          votingEndsAt: doc.votingEndsAt || this._qnlbLastPayload?.votingEndsAt
        };
        this.renderQuiltNameLeaderboard(this._qnlbLastPayload, { animateReorder: true });
        this.setQuiltNameLeaderboardStatus('Vote saved. Tap another name to change your mind.', 'success');
      } catch (error) {
        this.setQuiltNameLeaderboardStatus(error.message || 'Vote failed', 'error');
      }
    }
  }

  root.SimplifiedQuiltAppV2QuiltNameLeaderboard = SimplifiedQuiltAppV2QuiltNameLeaderboard;
})(typeof window !== 'undefined' ? window : globalThis);
