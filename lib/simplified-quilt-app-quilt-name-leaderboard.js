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

      const list = document.getElementById('qnlbEntryList');
      list?.addEventListener('click', async (event) => {
        const btn = event.target?.closest?.('[data-qnlb-vote-word]');
        if (!btn || btn.disabled) return;
        const word = String(btn.getAttribute('data-qnlb-vote-word') || '').trim();
        if (!word) return;
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
        winningQuiltName: 'EMBER 42',
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
        myVote: word,
        winningQuiltName: this.formatQuiltNameLeaderboardWinner(entries)
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

    normalizeLeaderboardEntryKey(word) {
      return String(word || '').trim().toLowerCase();
    }

    formatQuiltNameLeaderboardWinner(entries) {
      const leader = this.sortQuiltNameLeaderboardEntries(entries, 'voting')
        .find((entry) => (Number(entry.votes) || 0) > 0);
      if (!leader?.word) return '';
      return `${String(leader.word).trim().toUpperCase()} 42`;
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
        item.style.transform = `translate(${dx}px, ${dy}px)`;
        item.style.transition = 'transform 0s';

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            item.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)';
            item.style.transform = '';
          });
        });

        const onEnd = (event) => {
          if (event.propertyName !== 'transform') return;
          item.removeEventListener('transitionend', onEnd);
          item.classList.remove('qnlb-entry--moving');
          item.style.transition = '';
          item.style.transform = '';
        };
        item.addEventListener('transitionend', onEnd);
      });
    }

    paintQuiltNameLeaderboardEntryRow(row, entry, index, viewState) {
      const { phase, myVote, winningVoteCount, showVotes, canVote, demo } = viewState;
      const word = String(entry.word || '').trim();
      const safeWord = this.escapeQuiltNameLeaderboardHtml(word);
      const votes = Number(entry.votes);
      const showVoteCounts = showVotes && (Number.isFinite(votes) || demo);
      const isSelected = myVote && word === myVote;
      const isWinning = showVoteCounts && winningVoteCount > 0 && votes === winningVoteCount;
      const rank = phase === 'voting' || phase === 'final' ? `${index + 1}.` : '';

      row.className = [
        'qnlb-entry',
        isSelected ? 'qnlb-entry--selected' : '',
        isWinning ? 'qnlb-entry--winning' : ''
      ].filter(Boolean).join(' ');
      row.dataset.qnlbEntryWord = this.normalizeLeaderboardEntryKey(word);

      row.innerHTML = `
        <span class="qnlb-entry__rank" aria-hidden="true">${rank}</span>
        <span class="qnlb-entry__word">${safeWord}</span>
        ${entry.isMine ? '<span class="qnlb-entry__mine">yours</span>' : ''}
        ${entry.source === 'ai' ? '<span class="qnlb-entry__ai">suggested</span>' : ''}
        ${showVoteCounts ? `<span class="qnlb-entry__tally" aria-label="${votes} votes">${votes}</span>` : ''}
        ${canVote ? `<button type="button" class="qnlb-entry__vote" data-qnlb-vote-word="${safeWord}" aria-pressed="${isSelected ? 'true' : 'false'}" aria-label="${isSelected ? `Voted for ${safeWord}` : `Vote for ${safeWord}`}"></button>` : ''}
      `;
    }

    updateQuiltNameLeaderboardList(list, visibleEntries, viewState, options = {}) {
      const animate = this.shouldAnimateQuiltNameLeaderboardReorder(options);
      const beforeRects = animate ? this.captureQuiltNameLeaderboardFlipState(list) : null;

      if (!visibleEntries.length) {
        list.innerHTML = '<li class="qnlb-empty">No names yet.</li>';
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
      const form = document.getElementById('qnlbSubmitForm');
      const list = document.getElementById('qnlbEntryList');
      const listKicker = document.getElementById('qnlbListKicker');
      const expandWrap = document.getElementById('qnlbExpandWrap');
      const expandBtn = document.getElementById('qnlbExpandBtn');
      const winnerEl = document.getElementById('qnlbWinner');
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
      const showVotes = !!myVote || !!data.demo;
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

      if (phase === 'submissions') {
        phaseBanner.textContent = 'Suggest a name for today\'s quilt.';
        countdown.textContent = data.submissionsCloseAt
          ? `Voting opens in ${this.formatQuiltNameLeaderboardCountdown(data.submissionsCloseAt)}`
          : '';
        form.hidden = !data.canSubmit;
        if (listKicker) listKicker.textContent = 'Names so far';
      } else if (phase === 'voting') {
        phaseBanner.textContent = 'The field is set — tap one name to vote.';
        countdown.textContent = data.votingEndsAt
          ? `Voting closes in ${this.formatQuiltNameLeaderboardCountdown(data.votingEndsAt)}`
          : '';
        form.hidden = true;
        if (listKicker) listKicker.textContent = 'Pick your favorite';
      } else {
        phaseBanner.textContent = 'Today\'s naming is closed.';
        countdown.textContent = '';
        form.hidden = true;
        if (listKicker) listKicker.textContent = 'Final names';
      }

      if (winnerEl) {
        const winner = String(data.winningQuiltName || '').trim();
        winnerEl.textContent = winner ? `Current leader: ${winner}` : '';
        winnerEl.hidden = !winner || phase === 'submissions';
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
        list.innerHTML = '<li class="qnlb-empty">No names yet.</li>';
        return;
      }

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
        this.setQuiltNameLeaderboardStatus('Enter a single word.', 'error');
        return;
      }

      const baseUrl = this.quiltNameLeaderboardApiBaseUrl();
      if (submitBtn) submitBtn.disabled = true;
      this.setQuiltNameLeaderboardStatus('Submitting…');

      try {
        const res = await fetch(`${baseUrl}/api/quilt-name-submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            dateKey: this.quiltNameLeaderboardDateKey(),
            clientId: this.quiltNameLeaderboardClientId(),
            word
          })
        });
        const payload = await res.json().catch(() => ({}));
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
          winningQuiltName: doc.winningQuiltName || this.formatQuiltNameLeaderboardWinner(entries),
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
