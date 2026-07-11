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
        await this.castQuiltNameLeaderboardVote(word);
      });

      const expandBtn = document.getElementById('qnlbExpandBtn');
      expandBtn?.addEventListener('click', () => {
        screen.dataset.qnlbExpanded = '1';
        void this.refreshQuiltNameLeaderboard({ renderOnly: true });
      });

      const refreshBtn = document.getElementById('qnlbRefreshBtn');
      refreshBtn?.addEventListener('click', () => {
        void this.refreshQuiltNameLeaderboard();
      });
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

    renderQuiltNameLeaderboard(data = {}) {
      const screen = document.getElementById('screen-quilt-name-leaderboard');
      const phaseBanner = document.getElementById('qnlbPhaseBanner');
      const countdown = document.getElementById('qnlbCountdown');
      const form = document.getElementById('qnlbSubmitForm');
      const list = document.getElementById('qnlbEntryList');
      const expandWrap = document.getElementById('qnlbExpandWrap');
      const expandBtn = document.getElementById('qnlbExpandBtn');
      const winnerEl = document.getElementById('qnlbWinner');
      if (!phaseBanner || !countdown || !form || !list) return;

      const phase = String(data.phase || 'submissions');
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const myVote = String(data.myVote || '').trim();
      const expanded = screen?.dataset.qnlbExpanded === '1';
      const collapse = entries.length > 12 && !expanded;
      const visibleEntries = collapse ? entries.slice(0, 8) : entries;
      const winningVoteCount = entries.reduce((best, entry) => {
        const votes = Number(entry.votes) || 0;
        return votes > best ? votes : best;
      }, 0);

      if (phase === 'submissions') {
        phaseBanner.textContent = 'Suggest a name for today\'s quilt.';
        countdown.textContent = data.submissionsCloseAt
          ? `Voting opens in ${this.formatQuiltNameLeaderboardCountdown(data.submissionsCloseAt)}`
          : '';
        form.hidden = !data.canSubmit;
      } else if (phase === 'voting') {
        phaseBanner.textContent = 'The field is set — tap one name to vote.';
        countdown.textContent = data.votingEndsAt
          ? `Voting closes in ${this.formatQuiltNameLeaderboardCountdown(data.votingEndsAt)}`
          : '';
        form.hidden = true;
      } else {
        phaseBanner.textContent = 'Today\'s naming is closed.';
        countdown.textContent = '';
        form.hidden = true;
      }

      if (winnerEl) {
        const winner = String(data.winningQuiltName || '').trim();
        winnerEl.textContent = winner ? `Current leader: ${winner}` : '';
        winnerEl.hidden = !winner || phase === 'submissions';
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

      list.innerHTML = visibleEntries.map((entry, index) => {
        const word = this.escapeQuiltNameLeaderboardHtml(entry.word);
        const votes = Number(entry.votes);
        const showVotes = Number.isFinite(votes);
        const isSelected = myVote && entry.word === myVote;
        const isWinning = showVotes && winningVoteCount > 0 && votes === winningVoteCount;
        const rank = phase === 'voting' || phase === 'final' ? `${index + 1}.` : '';
        const tally = showVotes
          ? `<span class="qnlb-entry__tally" aria-label="${votes} votes">${votes}</span>`
          : '';
        const mine = entry.isMine ? '<span class="qnlb-entry__mine">yours</span>' : '';
        const aiTag = entry.source === 'ai' ? '<span class="qnlb-entry__ai">suggested</span>' : '';
        const canVote = phase === 'voting';
        const rowClass = [
          'qnlb-entry',
          isSelected ? 'qnlb-entry--selected' : '',
          isWinning ? 'qnlb-entry--winning' : ''
        ].filter(Boolean).join(' ');
        const voteBtn = canVote
          ? `<button type="button" class="qnlb-entry__vote" data-qnlb-vote-word="${word}" aria-pressed="${isSelected ? 'true' : 'false'}">${isSelected ? 'Voted' : 'Vote'}</button>`
          : '';
        return `<li class="${rowClass}">
          <span class="qnlb-entry__rank" aria-hidden="true">${rank}</span>
          <span class="qnlb-entry__word">${word}</span>
          ${mine}
          ${aiTag}
          ${tally}
          ${voteBtn}
        </li>`;
      }).join('');
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
        this.renderQuiltNameLeaderboard(payload);
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
        this.setQuiltNameLeaderboardStatus('Vote saved. Tap another name to change your mind.', 'success');
        await this.refreshQuiltNameLeaderboard();
      } catch (error) {
        this.setQuiltNameLeaderboardStatus(error.message || 'Vote failed', 'error');
      }
    }
  }

  root.SimplifiedQuiltAppV2QuiltNameLeaderboard = SimplifiedQuiltAppV2QuiltNameLeaderboard;
})(typeof window !== 'undefined' ? window : globalThis);
