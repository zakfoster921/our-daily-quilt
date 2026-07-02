/**
 * SimplifiedQuiltAppV2 feature feedback slice.
 * Hidden launch only: ?featureFeedback=1 or window.openFeatureFeedback().
 */
(function (root) {
  'use strict';

  class SimplifiedQuiltAppV2FeatureFeedback {
    getFeatureFeedbackDefinitions() {
      return [
        { id: 'color-card', label: 'Color Card' },
        { id: 'name-ballot', label: 'Name the Quilt Ballot' },
        { id: 'quote-duos', label: 'Quote Clipping / Scratch-Off Duos' },
        { id: 'speaker-section', label: 'Speaker Section' },
        { id: 'reflection-section', label: 'Reflection Section' },
        { id: 'ig-story-share', label: 'IG Story Share' },
        { id: 'before-you-go-watch-for', label: 'Before You Go: Watch For' },
        { id: 'before-you-go-companion', label: 'Before You Go: Companion Piece' },
        { id: 'reminders-screen', label: 'Reminders Screen' },
        { id: 'studio-floor', label: 'Studio Floor' }
      ];
    }

    featureFeedbackStorageKey() {
      return 'ourDailyFeatureFeedbackState_v1';
    }

    readFeatureFeedbackState() {
      try {
        const raw = localStorage.getItem(this.featureFeedbackStorageKey());
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== 'object') return { selectedFeatureIds: [], note: '', submittedAtIso: '' };
        return {
          selectedFeatureIds: Array.isArray(parsed.selectedFeatureIds)
            ? parsed.selectedFeatureIds.map(String).filter(Boolean)
            : [],
          note: String(parsed.note || ''),
          submittedAtIso: String(parsed.submittedAtIso || '')
        };
      } catch (_) {
        return { selectedFeatureIds: [], note: '', submittedAtIso: '' };
      }
    }

    writeFeatureFeedbackState(patch = {}) {
      const current = this.readFeatureFeedbackState();
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(this.featureFeedbackStorageKey(), JSON.stringify(next));
      } catch (_) {
        /* ignore storage failures */
      }
      return next;
    }

    setupFeatureFeedbackFeed() {
      const screen = document.getElementById('screen-feature-feedback');
      const feed = document.getElementById('featureFeedbackFeed');
      const form = document.getElementById('featureFeedbackForm');
      if (!screen || !feed || !form || screen.dataset.featureFeedbackBound === '1') return;
      screen.dataset.featureFeedbackBound = '1';

      feed.addEventListener('click', (event) => {
        const btn = event.target?.closest?.('[data-feature-heart]');
        if (!btn) return;
        event.preventDefault();
        const card = btn.closest('[data-feature-id]');
        const featureId = String(card?.getAttribute('data-feature-id') || '').trim();
        if (!featureId) return;
        const nextPressed = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', nextPressed ? 'true' : 'false');
        btn.textContent = nextPressed ? '♥' : '♡';
        this.persistFeatureFeedbackDraft();
      });

      const note = document.getElementById('featureFeedbackNote');
      note?.addEventListener('input', () => this.persistFeatureFeedbackDraft());

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await this.submitFeatureFeedback();
      });

      root.openFeatureFeedback = () => this.openFeatureFeedbackFeed();

      const params = new URLSearchParams(root.location?.search || '');
      const hash = String(root.location?.hash || '').toLowerCase();
      if (params.get('featureFeedback') === '1' || params.get('feedback') === 'features' || hash === '#feature-feedback') {
        this._featureFeedbackLaunchRequested = true;
        document.addEventListener('screenChange', () => this._scheduleHiddenFeatureFeedbackOpen(350));
        this._scheduleHiddenFeatureFeedbackOpen(6000);
      }
    }

    _scheduleHiddenFeatureFeedbackOpen(delayMs = 2200) {
      if (this._featureFeedbackOpenTimer) {
        window.clearTimeout(this._featureFeedbackOpenTimer);
      }
      this._featureFeedbackOpenTimer = window.setTimeout(() => {
        this._featureFeedbackOpenTimer = null;
        if (!this._featureFeedbackLaunchRequested || this._featureFeedbackOpenedFromLaunch) return;
        this._featureFeedbackOpenedFromLaunch = true;
        this.openFeatureFeedbackFeed();
      }, Math.max(0, Number(delayMs) || 0));
    }

    openFeatureFeedbackFeed() {
      const screen = document.getElementById('screen-feature-feedback');
      if (screen) {
        screen.hidden = false;
        screen.removeAttribute('hidden');
        screen.setAttribute('aria-hidden', 'false');
      }
      this.prepareFeatureFeedbackScreen();
      this.uiService?.showScreen?.('screen-feature-feedback');
      if (screen) screen.scrollTop = 0;
      if (typeof root.odqTrack === 'function') {
        root.odqTrack('feature_feedback_open', { source: 'hidden' });
      }
    }

    prepareFeatureFeedbackScreen() {
      const state = this.readFeatureFeedbackState();
      const selected = new Set(state.selectedFeatureIds || []);
      document.querySelectorAll('#featureFeedbackFeed [data-feature-id]').forEach((card) => {
        const featureId = String(card.getAttribute('data-feature-id') || '').trim();
        const pressed = selected.has(featureId);
        const btn = card.querySelector('[data-feature-heart]');
        if (btn) {
          btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
          btn.textContent = pressed ? '♥' : '♡';
        }
      });
      const note = document.getElementById('featureFeedbackNote');
      if (note) note.value = state.note || '';
      const submit = document.getElementById('featureFeedbackSubmit');
      if (submit) submit.textContent = state.submittedAtIso ? 'Update' : 'Done';
      this.setFeatureFeedbackStatus(
        state.submittedAtIso ? 'Thanks. You can update your hearts and submit again.' : ''
      );
    }

    getSelectedFeatureFeedbackIds() {
      return Array.from(document.querySelectorAll('#featureFeedbackFeed [data-feature-heart][aria-pressed="true"]'))
        .map((btn) => String(btn.closest('[data-feature-id]')?.getAttribute('data-feature-id') || '').trim())
        .filter(Boolean);
    }

    persistFeatureFeedbackDraft() {
      const note = String(document.getElementById('featureFeedbackNote')?.value || '');
      this.writeFeatureFeedbackState({
        selectedFeatureIds: this.getSelectedFeatureFeedbackIds(),
        note
      });
    }

    setFeatureFeedbackStatus(message, kind = '') {
      const status = document.getElementById('featureFeedbackStatus');
      if (!status) return;
      status.textContent = message || '';
      status.classList.toggle('is-error', kind === 'error');
    }

    featureFeedbackDocId(clientId, dateKey) {
      const base = `${clientId || 'unknown'}_${dateKey || 'unknown'}`;
      return base.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);
    }

    async submitFeatureFeedback() {
      const submit = document.getElementById('featureFeedbackSubmit');
      const note = String(document.getElementById('featureFeedbackNote')?.value || '').trim().slice(0, 600);
      const selectedFeatureIds = this.getSelectedFeatureFeedbackIds();
      const definitions = this.getFeatureFeedbackDefinitions();
      const selectedFeatureLabels = selectedFeatureIds
        .map((id) => definitions.find((item) => item.id === id)?.label || id)
        .filter(Boolean);
      if (!selectedFeatureIds.length && !note) {
        this.setFeatureFeedbackStatus('Heart at least one card or leave a note first.', 'error');
        return false;
      }
      if (!root.db || !root.firestore?.setDoc || !root.firestore?.doc) {
        this.setFeatureFeedbackStatus('Could not save yet. Check your connection and try again.', 'error');
        return false;
      }

      const nowIso = new Date().toISOString();
      const clientId =
        String(this.quiltEngine?.deviceId || this.currentUserId || '').trim() ||
        (typeof root.Utils?.getOrCreateUserId === 'function' ? root.Utils.getOrCreateUserId() : '');
      const dateKey =
        (typeof this.getEffectiveAppDateKey === 'function' && this.getEffectiveAppDateKey()) ||
        (typeof root.Utils?.getTodayKey === 'function' ? root.Utils.getTodayKey() : '') ||
        nowIso.slice(0, 10);
      const firebaseUid = String(root.firebaseAuth?.currentUser?.uid || root.odqFirebaseAuthUser?.uid || '').trim();
      const docId = this.featureFeedbackDocId(clientId || firebaseUid || 'anonymous', dateKey);

      const payload = {
        source: 'hidden_visual_feed',
        appDateKey: dateKey,
        selectedFeatureIds,
        selectedFeatureLabels,
        note,
        clientId,
        firebaseUid,
        appVersion: root.CONFIG?.APP?.version || '',
        buildId: root.CONFIG?.APP?.buildId || '',
        userAgent: navigator.userAgent || '',
        submittedAtIso: nowIso,
        updatedAtIso: nowIso,
        featureCount: definitions.length
      };

      submit?.setAttribute('disabled', 'disabled');
      this.setFeatureFeedbackStatus('Saving…');
      try {
        await root.firestore.setDoc(
          root.firestore.doc(root.db, 'featureFeedbackResponses', docId),
          payload,
          { merge: true }
        );
        this.writeFeatureFeedbackState({ selectedFeatureIds, note, submittedAtIso: nowIso });
        this.setFeatureFeedbackStatus('Thank you. This helps us know what to keep.');
        if (submit) submit.textContent = 'Update';
        if (typeof root.odqTrack === 'function') {
          root.odqTrack('feature_feedback_submit', {
            selected_count: selectedFeatureIds.length,
            has_note: note ? 1 : 0
          });
        }
        return true;
      } catch (error) {
        this.logger?.warn?.('Feature feedback save failed:', error);
        this.setFeatureFeedbackStatus('Could not save yet. Check your connection and try again.', 'error');
        return false;
      } finally {
        submit?.removeAttribute('disabled');
      }
    }
  }

  root.SimplifiedQuiltAppV2FeatureFeedback = SimplifiedQuiltAppV2FeatureFeedback;
})(globalThis);
