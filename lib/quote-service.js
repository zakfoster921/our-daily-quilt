/**
 * Daily quote loading, calendar keys, and Firestore assignments.
 * Exposes globalThis.QuoteService.
 */
(function (root) {
  'use strict';

class QuoteService {
  constructor(firebaseInstance = null) {
    this.firebase = firebaseInstance;
    console.log('📚 QuoteService constructor - Firebase instance:', !!firebaseInstance);
    // Initialize with default quotes (will be replaced if Firestore load succeeds)
    this.quotes = [
      { text: "Art washes away from the soul the dust of everyday life.", author: "— Pablo Picasso" },
      { text: "Creativity takes courage.", author: "— Henri Matisse" },
      { text: "Every artist was first an amateur.", author: "— Ralph Waldo Emerson" },
      { text: "Color is the keyboard, the eyes are the harmonies, the soul is the piano with many strings.", author: "— Wassily Kandinsky" },
      { text: "Great things are done by a series of small things brought together.", author: "— Vincent Van Gogh" },
      { text: "You can't use up creativity. The more you use, the more you have.", author: "Maya Angelou" },
      { text: "Every time I have had a problem, I have confronted it with the ax of art.", author: "Yayoi Kusama" },
      { text: "I found I could say things with color and shapes that I couldn't say any other way – things I had no words for.", author: "Georgia O'Keeffe" },
      { text: "I love creation more than life, and I must express myself before disappearing.", author: "Sonia Delaunay" },
      { text: "The job of the artist is always to deepen the mystery.", author: "Francis Bacon" },
      { text: "The most important relationship in your life is the relationship you have with yourself.", author: "Diane von Furstenberg" },
      { text: "There is a vitality, a life force, an energy, a quickening that is translated through you into action, and because there is only one of you in all time, this expression is unique.", author: "Martha Graham" },
      { text: "If there is a book that you want to read, but it hasn't been written yet, you must be the one to write it.", author: "Toni Morrison" },
      { text: "Creativity doesn't wait for that perfect moment. It fashions its own perfect moments out of ordinary ones.", author: "Elizabeth Gilbert" },
      { text: "I think, at a child's birth, if a mother could ask a fairy godmother to endow it with the most useful gift, that gift would be curiosity.", author: "Eleanor Roosevelt" },
      { text: "Imagination is more important than knowledge. Knowledge is limited. Imagination encircles the world.", author: "Albert Einstein" },
      { text: "The beauty of a living thing is not the atoms that go into it, but the way those atoms are put together.", author: "Carl Sagan" },
      { text: "Let your curiosity be greater than your fear.", author: "Pema Chödrön" },
      { text: "Study hard what interests you the most in the most undisciplined, irreverent and original manner possible.", author: "Richard Feynman" },
      { text: "Research is formalized curiosity. It is poking and prying with a purpose.", author: "Zora Neale Hurston" },
      { text: "It is always with excitement that I wake up in the morning wondering what my intuition will toss up to me, like gifts from the sea.", author: "Jonas Salk" },
      { text: "The only thing that makes life possible is permanent, intolerable uncertainty; not knowing what comes next.", author: "Ursula K. Le Guin" },
      { text: "Curiosity is the engine of achievement.", author: "Sir Ken Robinson" },
      { text: "Let the beauty of what you love be what you do. There are a thousand ways to kneel and kiss the earth.", author: "Rumi" },

      { text: "I'm very interested in, 'What does it mean for us to cultivate together?' Community that allows for risk, the risk of knowing someone outside your own boundaries, the risk that is love.", author: "bell hooks" },
      { text: "A nation's culture resides in the hearts and in the soul of its people.", author: "Mahatma Gandhi" },
      { text: "Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.", author: "Antoine de Saint-Exupéry" },
      { text: "The butterfly counts not months but moments, and has time enough.", author: "Rabindranath Tagore" },
      { text: "To fly, we have to have resistance.", author: "Maya Lin" },
      { text: "Not everything that is faced can be changed, but nothing can be changed until it is faced.", author: "James Baldwin" },
      { text: "There's nothing new under the sun, but there are new suns.", author: "Octavia Butler" },
      { text: "Never doubt that a small group of thoughtful, committed citizens can change the world; indeed, it's the only thing that ever has.", author: "Margaret Mead" },
      { text: "There is no such thing as a single-issue struggle because we do not live single-issue lives.", author: "Audre Lorde" },
      { text: "Every moment is an organizing opportunity, every person a potential activist, every minute a chance to change the world.", author: "Dolores Huerta" },
      { text: "We don't have to engage in grand, heroic actions to participate in the process of change. Small acts, when multiplied by millions of people, can transform the world.", author: "Howard Zinn" },
      { text: "When the whole world is silent, even one voice becomes powerful.", author: "Malala Yousafzai" },
      { text: "Activism is my rent for living on the planet.", author: "Alice Walker" },
      { text: "We are the leaders we've been waiting for.", author: "Grace Lee Boggs" },
      { text: "Do your little bit of good where you are; it's those little bits of good put together that overwhelm the world.", author: "Desmond Tutu" },
      { text: "What you do makes a difference, and you have to decide what kind of difference you want to make.", author: "Jane Goodall" },
      { text: "You never change things by fighting the existing reality. To change something, build a new model that makes the existing model obsolete.", author: "Buckminster Fuller" },
      { text: "Like what you do, and then you will do your best.", author: "Katherine Johnson" },
      { text: "The present is theirs; the future, for which I really worked, is mine.", author: "Nikola Tesla" },
      { text: "Cities have the capability of providing something for everybody, only because, and only when, they are created by everybody.", author: "Jane Jacobs" },
      { text: "In every outthrust headland, in every curving beach, in every grain of sand there is the story of the earth.", author: "Rachel Carson" },
      { text: "What the people want is very simple - they want an America as good as its promise.", author: "Barbara Jordan" },
      { text: "In nature's economy the currency is not money, it is life.", author: "Vandana Shiva" },
      { text: "When we plant trees, we plant the seeds of peace and seeds of hope.", author: "Wangari Maathai" },
      { text: "No one is born fully-formed: it is through self-experience in the world that we become what we are.", author: "Paulo Freire" },
      { text: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
      { text: "Courage doesn't always roar. Sometimes courage is the quiet voice at the end of the day saying 'I will try again tomorrow.'", author: "Mary Anne Radmacher" },
      { text: "I fight pain, anxiety, and fear every day, and the only method I have found that relieves my illness is to keep creating art.", author: "Yayoi Kusama" },
      { text: "To heal is to touch with love that which we previously touched with fear.", author: "Stephen Levine" },
      { text: "I am better off healed than I ever was unbroken.", author: "Beth Moore" },
      { text: "Everything can be taken from a man but one thing: the last of the human freedoms—to choose one's attitude in any given set of circumstances.", author: "Viktor Frankl" },
      { text: "The purpose of life is not to be happy. It is to be useful, to be honorable, to be compassionate, to have it make some difference that you have lived and lived well.", author: "Ralph Waldo Emerson" },
      { text: "Let yourself be silently drawn by the strange pull of what you really love. It will not lead you astray.", author: "Rumi" },
      { text: "Follow your bliss and the universe will open doors where there were only walls.", author: "Joseph Campbell" },
      { text: "A musician must make music, an artist must paint, a poet must write, if he is to be ultimately happy. What a man can be, he must be.", author: "Abraham Maslow" },
      { text: "At every moment you choose yourself. But do you choose your self? Body and soul contain a thousand possibilities out of which you can build many I's.", author: "Dag Hammarskjöld" },
      { text: "We are the myths we tell ourselves about ourselves.", author: "Jean Houston" },
      { text: "A vocation is not a career that you choose for yourself. A vocation is a calling that you discover by listening to the voice of vocation within you.", author: "Parker Palmer" },
      { text: "Attention is the rarest and purest form of generosity.", author: "Simone Weil" },
      { text: "Waking up this morning, I smile. Twenty-four brand new hours are before me. I vow to live fully in each moment.", author: "Thích Nhất Hạnh" },
      { text: "The privilege of a lifetime is to become who you truly are.", author: "Carl Jung" },
      { text: "I define connection as the energy that exists between people when they feel seen, heard, and valued; when they can give and receive without judgment.", author: "Brené Brown" },
      { text: "Perhaps the secret of living well is not in having all the answers but in pursuing unanswerable questions in good company.", author: "Rachel Naomi Remen" },
      { text: "All real living is meeting.", author: "Martin Buber" },
      { text: "We humans are social beings. We come into the world as the result of others' actions. We survive here in dependence on others.", author: "The Dalai Lama" },
      { text: "Sometimes people try to destroy you, precisely because they recognize your power.", author: "bell hooks" },
      { text: "When you understand that being connected to others is one of life's greatest joys, you realize that life's best comes when you initiate and invest in solid relationships.", author: "John C. Maxwell" },
      { text: "Healing yourself is connected with healing others.", author: "Yoko Ono" },
      { text: "Relationships are all there is. Everything in the universe only exists because it is in relationship to everything else.", author: "Margaret J. Wheatley" },
      { text: "When you take one step to reach out to people, when you meet with others and share their thoughts and sufferings, infinite compassion and wisdom well up within your heart.", author: "Daisaku Ikeda" },
      { text: "We now accept the fact that learning is a lifelong process of keeping abreast of change. And the most pressing task is to teach people how to learn.", author: "Peter Drucker" },
      { text: "The illiterate of the 21st century will not be those who cannot read and write, but those who cannot learn, unlearn, and relearn.", author: "Alvin Toffler" },
      { text: "Those people who develop the ability to continuously acquire new and better forms of knowledge that they can apply to their work and to their lives will be the movers and shakers in our society for the indefinite future.", author: "Brian Tracy" },
      { text: "The purpose of learning is growth, and our minds, unlike our bodies, can continue growing as we continue to live.", author: "Mortimer Adler" },
      { text: "The good thing about science is that it's true whether or not you believe in it. But the great thing about learning is that it makes you more capable of reducing the suffering of others.", author: "Neil deGrasse Tyson" },
      { text: "I have learned that each and every piece of cloth embodies the spirit, skill, and personal history of an individual weaver… It ties together with an endless thread the emotional life of my people.", author: "Nilda Callañaupa Alvarez" },
      { text: "I wanted to tell my story through fabric because it was a medium that was accessible to me as a woman and as an African American.", author: "Faith Ringgold" },
      { text: "Come stitch next to me, and I'll tell you a story.", author: "Sonya Clark" },
      { text: "Fabric is a material that forgives. You can always mend, patch, darn, and transform it into something new.", author: "Louise Bourgeois" },
      { text: "We must learn inner solitude wherever or with whomsoever we may be. We must learn to penetrate things and find God in them.", author: "Anni Albers" },
      { text: "Thread has the potential to unite, to heal, to provide a soft structure in a hard world.", author: "Sheila Hicks" },
      { text: "The loom is the universe in miniature—warp and weft, the essential crossing that creates all structure, all meaning.", author: "Lenore Tawney" },
      { text: "Western art tradition values fine art practices such as painting, mostly done by men and on canvas. Bringing these techniques into the gallery space allows me to question the hierarchy in the Western art world.", author: "Hale Ekinci" },
      { text: "The true measure of our commitment to justice, the character of our society, our commitment to the rule of law, fairness, and equality cannot be measured by how we treat the rich, the powerful, the privileged, and the respected among us.", author: "Bryan Stevenson" },
      { text: "We cannot seek achievement for ourselves and forget about the progress and prosperity for our community.", author: "Dolores Huerta" },
      { text: "If you see something that is not right, not fair, not just, you have a moral obligation to do something about it.", author: "John Lewis" },
      { text: "Trauma happens in relationship, so does healing.", author: "Tarana Burke" },
      { text: "Real change requires real relationships. And real relationships require that we tell the truth about our experiences.", author: "Alicia Garza" },
      { text: "Care is the strategy. Care is what we need more of in this world. Care is revolutionary.", author: "Ai-jen Poo" },
      { text: "We accomplish nothing if we say nothing. We accomplish nothing if we do nothing. And we accomplish nothing if we know nothing.", author: "Stacey Abrams" }
    ];
    this.shuffledIndexes = [2, 4, 0, 5, 3, 1, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 47, 49, 51, 53, 55, 57, 59, 61, 63, 65, 67, 69, 71, 73, 75, 77, 79, 81, 83, 85, 87, 89, 91, 93, 95, 97, 99];
    /** @type {Record<string, object>} dateKey YYYY-MM-DD (UTC, 7:00 UTC day roll) → quote object */
    this._pinnedByDateKey = {};
  }

  static _dayIndexFromCalendarKey(dateKey) {
    const parts = String(dateKey || '').split('-').map((n) => parseInt(n, 10));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return 0;
    const [y, mo, d] = parts;
    return Math.floor(Date.UTC(y, mo - 1, d, 12, 0, 0) / 86400000);
  }

  _embeddedStableKey(quote) {
    const s = `${String(quote?.text || '')}\x00${String(quote?.author || '')}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return `emb_${(h >>> 0).toString(16)}`;
  }

  getQuoteCalendarKeyNow() {
    const now = new Date();
    const adj = new Date(now);
    if (now.getUTCHours() < 7) adj.setUTCDate(adj.getUTCDate() - 1);
    const y = adj.getUTCFullYear();
    const m = String(adj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(adj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getQuoteCalendarKeyUtc7FromAdjustedToday(dayOffset) {
    const now = new Date();
    const adj = new Date(now);
    if (now.getUTCHours() < 7) adj.setUTCDate(adj.getUTCDate() - 1);
    adj.setUTCDate(adj.getUTCDate() + (dayOffset | 0));
    const y = adj.getUTCFullYear();
    const m = String(adj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(adj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  _readLocalAssignment(dateKey) {
    try {
      const raw = localStorage.getItem('ourDailyQuoteAssignments');
      if (!raw) return null;
      const map = JSON.parse(raw);
      return map && typeof map === 'object' ? map[dateKey] || null : null;
    } catch {
      return null;
    }
  }

  _writeLocalAssignment(dateKey, payload) {
    try {
      const raw = localStorage.getItem('ourDailyQuoteAssignments');
      let map = {};
      if (raw) {
        try {
          map = JSON.parse(raw);
        } catch {
          map = {};
        }
      }
      if (!map || typeof map !== 'object') map = {};
      map[dateKey] = payload;
      localStorage.setItem('ourDailyQuoteAssignments', JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  /** Rich offline cache so reflection / Before You Go paint before the full catalog sync. */
  _localAssignmentCachePayload(dateKey, merged, assignData = null) {
    const m = merged || {};
    const a = assignData && typeof assignData === 'object' ? assignData : {};
    return {
      dateKey,
      sourceId: m.sourceId || a.sourceId || null,
      embeddedStableKey: m.sourceId ? null : this._embeddedStableKey(m),
      textSnapshot: String(a.textSnapshot || m.text || '').slice(0, 160),
      authorSnapshot: String(a.authorSnapshot || m.author || '').slice(0, 120),
      communityPromptSnapshot: String(
        a.communityPromptSnapshot || m.communityPrompt || m.community_prompt || ''
      ).slice(0, 500),
      reflectionPromptSnapshot: String(
        a.reflectionPromptSnapshot || m.reflectionPrompt || m.reflection_prompt || ''
      ).slice(0, 500),
      smallActSnapshot: String(a.smallActSnapshot || m.smallAct || m.small_act || '').slice(0, 240),
      watch_for_snapshot: String(
        a.watch_for_snapshot ?? a.watchForSnapshot ?? m.watch_for ?? m.watchFor ?? ''
      ).slice(0, 280),
      goodDaySnapshot: String(a.goodDaySnapshot || m.goodDay || m.good_day || '').slice(0, 240),
      roughDaySnapshot: String(a.roughDaySnapshot || m.roughDay || m.rough_day || '').slice(0, 240),
      artRecsSnapshot: this._artRecsSnapshotValue(m.artRecs ?? m.art_recs).slice(0, 1200),
      artRecsTypeSnapshot: String(m.artRecsType ?? m.art_recs_type ?? a.artRecsTypeSnapshot ?? '').slice(
        0,
        40
      ),
      speakerImageUrlSnapshot: String(m.speakerImageUrl ?? m.speaker_image_url ?? '').slice(0, 500),
      speakerCutoutUrlSnapshot: String(m.speakerCutoutUrl ?? m.speaker_cutout_url ?? '').slice(0, 500),
      first_response: String(
        this._firstResponseFromPayload(a) || this._firstResponseFromPayload(m) || ''
      ).slice(0, 500),
      firstResponseSnapshot: String(
        this._firstResponseFromPayload(a) || this._firstResponseFromPayload(m) || ''
      ).slice(0, 500),
      user_name: String(a.user_name ?? a.userName ?? m.user_name ?? m.userName ?? '').trim().slice(0, 80),
      assignedAt: String(a.assignedAt || new Date().toISOString())
    };
  }

  _clearLocalAssignmentCache(dateKey) {
    try {
      const raw = localStorage.getItem('ourDailyQuoteAssignments');
      if (!raw) return;
      const map = JSON.parse(raw);
      if (!map || typeof map !== 'object' || !map[dateKey]) return;
      delete map[dateKey];
      localStorage.setItem('ourDailyQuoteAssignments', JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  /** True when a Firestore assignment row refers to the same quote as `pin`. */
  _assignmentMatchesPin(assignData, pin) {
    if (!assignData || !pin) return false;
    const sid = String(assignData.sourceId || '').trim();
    const pinSid = String(pin.sourceId || '').trim();
    if (sid && pinSid) return sid === pinSid;
    const snapAuthor = String(assignData.authorSnapshot || assignData.author || '').trim();
    const pinAuthor = String(pin.author || '')
      .replace(/^—\s*/, '')
      .trim();
    if (snapAuthor && pinAuthor && !this._authorsReferToSameSpeaker(pinAuthor, snapAuthor)) {
      return false;
    }
    const snapText = String(assignData.textSnapshot || assignData.text || '').trim();
    const pinText = String(pin.text || '').trim();
    if (snapText && pinText) {
      const a = snapText.slice(0, 48);
      const b = pinText.slice(0, 48);
      return a === b || pinText.startsWith(snapText) || snapText.startsWith(pinText);
    }
    return !!snapAuthor && !!pinAuthor;
  }

  /**
   * Drop a stale in-memory / localStorage pin when Firestore assignment points at a different quote.
   * @returns {boolean} true if the existing pin still matches Firestore (or Firestore is unreachable)
   */
  async reconcilePinWithFirestoreAssignment(dateKey) {
    const dk = String(dateKey || '').trim();
    if (!dk || !this._pinnedByDateKey[dk]) return true;
    if (!window.db || !window.firestore) return true;
    const assignData = await this._readDailyQuoteAssignmentFromServer(dk, 5000);
    if (!assignData) return true;
    if (this._assignmentMatchesPin(assignData, this._pinnedByDateKey[dk])) return true;
    delete this._pinnedByDateKey[dk];
    this._clearLocalAssignmentCache(dk);
    return false;
  }

  _withTimeout(promise, ms, label) {
    let timer = null;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      })
    ]);
  }

  /** True when URL points at an existing transparent cutout in Firebase Storage (not Wikimedia portrait). */
  _isFirebaseSpeakerCutoutUrl(url) {
    const u = String(url || '').trim();
    if (!u) return false;
    return /speaker-cutouts(?:%2F|\/)/i.test(u);
  }

  _normalizeAuthorForSpeakerMatch(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** True when assignment `authorSnapshot` matches the catalog/quote author (avoids stale speaker portraits). */
  _authorsReferToSameSpeaker(expectedAuthor, snapshotAuthor) {
    const a = this._normalizeAuthorForSpeakerMatch(expectedAuthor);
    const b = this._normalizeAuthorForSpeakerMatch(snapshotAuthor);
    if (!a || !b) return true;
    if (a === b) return true;
    const aLast = a.split(' ').pop() || '';
    const bLast = b.split(' ').pop() || '';
    if (aLast.length > 2 && aLast === bLast) return true;
    return a.includes(b) || b.includes(a);
  }

  _assignmentSpeakerSnapshotsTrusted(expectedAuthor, data) {
    if (!data || typeof data !== 'object') return true;
    const snapAuthor = String(data.authorSnapshot ?? data.author ?? '').trim();
    if (!snapAuthor) return true;
    return this._authorsReferToSameSpeaker(expectedAuthor, snapAuthor);
  }

  /** dailyQuoteAssignments row must match the resolved quote author before merging day snapshots. */
  _assignmentSnapshotsMatchQuoteAuthor(quote, assignData) {
    if (!quote || !assignData || typeof assignData !== 'object') return false;
    const quoteAuthor = String(quote.author || '').trim();
    const assignAuthor = String(assignData.authorSnapshot || assignData.author || '').trim();
    if (!assignAuthor) return true;
    if (!quoteAuthor) return false;
    return this._authorsReferToSameSpeaker(quoteAuthor, assignAuthor);
  }

  _normalizeSpeakerAssetUrl(url) {
    return String(url || '')
      .trim()
      .split('?')[0]
      .replace(/%2F/gi, '/');
  }

  _speakerStorageSlug(name) {
    return (
      String(name || 'speaker')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'speaker'
    );
  }

  _assignmentSpeakerAssetsMatchAuthor(data, expectedAuthor) {
    if (!data || typeof data !== 'object') return true;
    const author = String(expectedAuthor || data.authorSnapshot || data.author || '').trim();
    if (!author) return true;
    const urls = [
      data.speakerImageUrlSnapshot,
      data.speaker_image_url_snapshot,
      data.speakerCutoutUrlSnapshot,
      data.speaker_cutout_url_snapshot
    ]
      .map((u) => this._normalizeSpeakerAssetUrl(u).toLowerCase())
      .filter((u) => u && /speaker-cutouts\//i.test(u));
    if (!urls.length) return true;
    return urls.every((u) => this.speakerStorageCutoutUrlMatchesAuthor(u, author));
  }

  /** True when a Firebase Storage cutout path matches the quoted speaker (ignores non-cutout URLs). */
  speakerStorageCutoutUrlMatchesAuthor(url, expectedAuthor) {
    const u = this._normalizeSpeakerAssetUrl(url).toLowerCase();
    if (!u || !/speaker-cutouts\//i.test(u)) return true;
    const author = String(expectedAuthor || '').trim();
    if (!author) return true;
    const slug = this._speakerStorageSlug(author);
    return u.includes(`speaker-cutouts/${slug}-`) || u.includes(`speaker-cutouts/${slug}.`);
  }

  /** Assignment portrait must match catalog when both exist (author can match but image stay stale). */
  _assignmentSpeakerPortraitMatchesQuote(quote, data) {
    if (!quote || !data || typeof data !== 'object') return true;
    const catalogPortrait = this._speakerPortraitFromQuoteAndAssignment(quote, null);
    const assignPortrait = this._speakerPortraitFromQuoteAndAssignment(null, data);
    if (!catalogPortrait || !assignPortrait) return true;
    return this._normalizeSpeakerAssetUrl(catalogPortrait) === this._normalizeSpeakerAssetUrl(assignPortrait);
  }

  _sanitizeAssignmentSpeakerSnapshots(data, expectedAuthor, catalogQuote = null) {
    if (!data || typeof data !== 'object') return data;
    const authorOk = this._assignmentSpeakerSnapshotsTrusted(expectedAuthor, data);
    const portraitOk = !catalogQuote || this._assignmentSpeakerPortraitMatchesQuote(catalogQuote, data);
    const slugOk = this._assignmentSpeakerAssetsMatchAuthor(data, expectedAuthor);
    if (authorOk && portraitOk && slugOk) return data;
    const out = { ...data };
    for (const key of [
      'speakerImageUrlSnapshot',
      'speaker_image_url_snapshot',
      'speakerCutoutUrlSnapshot',
      'speaker_cutout_url_snapshot',
      'speakerCutoutSourceUrlSnapshot',
      'speaker_cutout_source_url_snapshot',
      'speakerDatesSnapshot',
      'speakerBornSnapshot',
      'speakerDiedSnapshot',
      'speakerGuideLineSnapshot',
      'speakerKeywordsSnapshot',
      'imageAttributionSnapshot'
    ]) {
      delete out[key];
    }
    const reason = !authorOk ? 'author mismatch' : !slugOk ? 'cutout slug mismatch' : 'portrait mismatch';
    console.warn(
      'Dropped stale assignment speaker snapshots:',
      reason,
      String(expectedAuthor || '').slice(0, 80),
      'assignment author',
      String(data.authorSnapshot || data.author || '').slice(0, 80)
    );
    return out;
  }

  _isSpeakerPortraitOrCutoutField(key) {
    const k = this._normFieldKeyLoose(key);
    return (
      k.startsWith('speakerimage') ||
      k.startsWith('speakercutout') ||
      k.startsWith('speakercutoutsource') ||
      k.startsWith('speakerdates') ||
      k.startsWith('speakerborn') ||
      k.startsWith('speakerdied') ||
      k.startsWith('speakerguideline') ||
      k.startsWith('speakerkeywords') ||
      k.startsWith('imageattribution')
    );
  }

  _speakerPortraitFromQuoteAndAssignment(quote, data = null) {
    const fromData = data && typeof data === 'object' ? data : {};
    return String(
      fromData.speakerImageUrlSnapshot ||
        fromData.speaker_image_url_snapshot ||
        fromData.speakerImageUrl ||
        fromData.speaker_image_url ||
        quote?.speakerImageUrlSnapshot ||
        quote?.speaker_image_url_snapshot ||
        quote?.speakerImageUrl ||
        quote?.speaker_image_url ||
        quote?.speakerImage ||
        quote?.speaker_image ||
        ''
    ).trim();
  }

  /** Cutout fields on assignment/docs only — never the portrait URL (avoids square Wikimedia in cutout slot). */
  _speakerCutoutFromAssignmentData(data) {
    if (!data || typeof data !== 'object') return '';
    return String(
      data.speakerCutoutUrlSnapshot ||
        data.speaker_cutout_url_snapshot ||
        data.speakerCutoutUrl ||
        data.speaker_cutout_url ||
        ''
    ).trim();
  }

  /**
   * Prefer an existing Storage cutout (catalog or assignment) over portrait mistaken for cutout.
   * Does not call remove.bg — reuse only.
   */
  _resolveSpeakerCutoutForQuote(quote, assignmentData = null) {
    if (!quote || typeof quote !== 'object') return '';
    const portrait = this._speakerPortraitFromQuoteAndAssignment(quote, assignmentData);
    const assignmentCutoutSnap = String(
      (assignmentData && assignmentData.speakerCutoutUrlSnapshot) ||
        (assignmentData && assignmentData.speaker_cutout_url_snapshot) ||
        ''
    ).trim();
    const quoteCutoutSnap = String(
      quote.speakerCutoutUrlSnapshot || quote.speaker_cutout_url_snapshot || ''
    ).trim();
    if (assignmentData && !assignmentCutoutSnap && portrait) {
      return '';
    }
    if (!assignmentData && !quoteCutoutSnap && portrait) {
      const staleCutout = String(quote.speakerCutoutUrl || quote.speaker_cutout_url || '').trim();
      if (staleCutout && this._isFirebaseSpeakerCutoutUrl(staleCutout)) return '';
    }
    const assignmentCutout = this._speakerCutoutFromAssignmentData(assignmentData || {});
    const quoteCutout = String(quote.speakerCutoutUrl || quote.speaker_cutout_url || '').trim();
    const pick = (cutout) => {
      const url = String(cutout || '').trim();
      if (!url) return '';
      if (
        this._isFirebaseSpeakerCutoutUrl(url) &&
        !this._assignmentSpeakerAssetsMatchAuthor({ speakerCutoutUrlSnapshot: url }, quote.author)
      ) {
        return '';
      }
      if (!this._speakerCutoutMatchesPortrait(quote, assignmentData, url, portrait)) return '';
      return url;
    };
    if (assignmentCutout && this._isFirebaseSpeakerCutoutUrl(assignmentCutout)) {
      const resolved = pick(assignmentCutout);
      if (resolved) return resolved;
    }
    if (quoteCutout && this._isFirebaseSpeakerCutoutUrl(quoteCutout)) {
      const resolved = pick(quoteCutout);
      if (resolved) return resolved;
    }
    const skipCatalogCutout = assignmentData && !assignmentCutoutSnap && portrait;
    const catalog = skipCatalogCutout ? null : this._hydrateQuoteFromCatalog(quote);
    const catalogCutout = String(catalog?.speakerCutoutUrl || catalog?.speaker_cutout_url || '').trim();
    if (catalogCutout && this._isFirebaseSpeakerCutoutUrl(catalogCutout)) {
      const resolved = pick(catalogCutout);
      if (resolved) return resolved;
    }
    if (assignmentCutout && assignmentCutout !== portrait) return pick(assignmentCutout);
    if (quoteCutout && quoteCutout !== portrait) return pick(quoteCutout);
    return '';
  }

  _speakerCutoutMatchesPortrait(quote, assignmentData, cutoutUrl, portraitUrl) {
    const cutout = String(cutoutUrl || '').trim();
    const portrait = String(portraitUrl || '').trim();
    if (!cutout || !portrait) return Boolean(cutout);
    if (!this._isFirebaseSpeakerCutoutUrl(cutout)) return true;
    const data = assignmentData && typeof assignmentData === 'object' ? assignmentData : {};
    const source = String(
      data.speakerCutoutSourceUrlSnapshot ||
        data.speaker_cutout_source_url_snapshot ||
        quote?.speakerCutoutSourceUrlSnapshot ||
        quote?.speaker_cutout_source_url_snapshot ||
        quote?.speakerCutoutSourceUrl ||
        quote?.speaker_cutout_source_url ||
        ''
    ).trim();
    if (source && source !== portrait) return false;
    return true;
  }

  _applySpeakerCutoutCatalogPreference(merged, catalog, pinned) {
    if (!merged || !catalog) return merged;
    const catalogCutout = String(catalog.speakerCutoutUrl || catalog.speaker_cutout_url || '').trim();
    if (!catalogCutout || !this._isFirebaseSpeakerCutoutUrl(catalogCutout)) return merged;
    const pinnedCutout = String(merged.speakerCutoutUrl || merged.speaker_cutout_url || '').trim();
    const portrait = this._speakerPortraitFromQuoteAndAssignment(merged, pinned);
    const pinnedData = pinned && typeof pinned === 'object' ? pinned : {};
    const assignmentCutoutSnap = String(
      pinnedData.speakerCutoutUrlSnapshot || pinnedData.speaker_cutout_url_snapshot || ''
    ).trim();
    const assignmentPortraitSnap = String(
      pinnedData.speakerImageUrlSnapshot || pinnedData.speaker_image_url_snapshot || ''
    ).trim();
    if (!assignmentCutoutSnap && assignmentPortraitSnap) {
      return merged;
    }
    if (
      pinnedCutout &&
      pinnedCutout !== portrait &&
      this._isFirebaseSpeakerCutoutUrl(pinnedCutout) &&
      this._speakerCutoutMatchesPortrait(merged, pinnedData, pinnedCutout, portrait || assignmentPortraitSnap)
    ) {
      return merged;
    }
    if (!this._speakerCutoutMatchesPortrait(catalog, pinned, catalogCutout, portrait || assignmentPortraitSnap)) {
      return merged;
    }
    return {
      ...merged,
      speakerCutoutUrl: catalogCutout,
      speaker_cutout_url: catalogCutout,
      speakerCutoutUrlSnapshot: String(
        catalog.speakerCutoutUrlSnapshot || catalog.speaker_cutout_url_snapshot || catalogCutout
      ).trim(),
      speaker_cutout_url_snapshot: String(
        catalog.speaker_cutout_url_snapshot || catalog.speaker_cutout_url_snapshot || catalogCutout
      ).trim()
    };
  }

  _firstResponseFromPayload(payload) {
    return String(payload?.first_response ?? payload?.firstResponse ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _mergeAssignmentSpeakerCutout(quote, data) {
    if (!quote) return quote;
    const assignmentCutoutSnap = String(
      (data && data.speakerCutoutUrlSnapshot) || (data && data.speaker_cutout_url_snapshot) || ''
    ).trim();
    const portrait = this._speakerPortraitFromQuoteAndAssignment(quote, data);
    if (data && !assignmentCutoutSnap && portrait) {
      return {
        ...quote,
        speakerCutoutUrl: '',
        speaker_cutout_url: '',
        speakerCutoutUrlSnapshot: '',
        speaker_cutout_url_snapshot: '',
        speakerImageUrl: portrait,
        speaker_image_url: portrait,
        speakerImageUrlSnapshot: String(
          data.speakerImageUrlSnapshot || data.speaker_image_url_snapshot || portrait
        ).trim(),
        speaker_image_url_snapshot: String(
          data.speakerImageUrlSnapshot || data.speaker_image_url_snapshot || portrait
        ).trim()
      };
    }
    let merged = quote;
    const cutout = this._resolveSpeakerCutoutForQuote(quote, data);
    if (cutout) {
      const sourceSnap = String(
        (data && data.speakerCutoutSourceUrlSnapshot) ||
          (data && data.speaker_cutout_source_url_snapshot) ||
          ''
      ).trim();
      merged = {
        ...merged,
        speakerCutoutUrl: cutout,
        speaker_cutout_url: cutout,
        speakerCutoutUrlSnapshot: cutout,
        speaker_cutout_url_snapshot: cutout,
        ...(sourceSnap
          ? {
              speakerCutoutSourceUrlSnapshot: sourceSnap,
              speaker_cutout_source_url_snapshot: sourceSnap,
              speakerCutoutSourceUrl: sourceSnap,
              speaker_cutout_source_url: sourceSnap
            }
          : {})
      };
    }
    const first_response = this._firstResponseFromPayload(data);
    const user_name = String(data?.user_name ?? data?.userName ?? '').trim();
    if (first_response || user_name) {
      merged = {
        ...merged,
        ...(first_response ? { first_response, user_name: user_name || 'Zak' } : {}),
        ...(user_name && !first_response ? { user_name } : {})
      };
    }
    return merged;
  }

  _mergeAssignmentMoodSnapshotFields(quote, data) {
    if (!quote || !data || typeof data !== 'object') return quote;
    const goodDay = String(
      data.goodDaySnapshot ?? data.goodDay ?? data.good_day ?? ''
    ).trim();
    const roughDay = String(
      data.roughDaySnapshot ?? data.roughDay ?? data.rough_day ?? ''
    ).trim();
    if (!goodDay && !roughDay) return quote;
    return {
      ...quote,
      ...(goodDay ? { goodDay, good_day: goodDay } : {}),
      ...(roughDay ? { roughDay, rough_day: roughDay } : {})
    };
  }

  /** Before You Go: `small_act` / `watch_for` from dailyQuoteAssignments snapshots. */
  _mergeAssignmentBygSnapshotFields(quote, data) {
    if (!quote || !data || typeof data !== 'object') return quote;
    const smallAct = String(
      data.smallActSnapshot ?? data.smallAct ?? data.small_act ?? ''
    ).trim();
    const watchFor = String(
      data.watch_for_snapshot ?? data.watchForSnapshot ?? data.watch_for ?? data.watchFor ?? ''
    ).trim();
    if (!smallAct && !watchFor) return quote;
    return {
      ...quote,
      ...(smallAct ? { smallAct, small_act: smallAct } : {}),
      ...(watchFor ? { watch_for: watchFor } : {})
    };
  }

  /** speaker_guide_line + speaker_keywords from dailyQuoteAssignments snapshots. */
  _mergeAssignmentSpeakerGuideSnapshotFields(quote, data) {
    if (!quote || !data || typeof data !== 'object') return quote;
    const guideLine = String(
      data.speakerGuideLineSnapshot ??
        data.speakerGuideLine ??
        data.speaker_guide_line ??
        ''
    ).trim();
    const speakerKeywords = String(
      data.speakerKeywordsSnapshot ??
        data.speakerKeywords ??
        data.speaker_keywords ??
        ''
    ).trim();
    if (!guideLine && !speakerKeywords) return quote;
    return {
      ...quote,
      ...(guideLine ? { speakerGuideLine: guideLine, speaker_guide_line: guideLine } : {}),
      ...(speakerKeywords
        ? { speakerKeywords, speaker_keywords: speakerKeywords }
        : {})
    };
  }

  _firstLineCountFromQuoteFields(quote) {
    const QNC = globalThis.QuiltNewspaperClipping;
    if (typeof QNC?.firstLineCountFromQuoteFields === 'function') {
      return QNC.firstLineCountFromQuoteFields(quote);
    }
    if (!quote || typeof quote !== 'object') return null;
    let flc = Number(quote.first_line_count ?? quote.firstLineCount);
    if (!Number.isFinite(flc) || flc <= 0) {
      flc = Number(quote.firstLineCountSnapshot ?? quote.first_line_count_snapshot);
    }
    if (!Number.isFinite(flc) || flc <= 0) {
      flc = Number(quote.notionProperties?.first_line_count?.value ?? quote.notionProperties?.firstLineCount?.value);
    }
    return Number.isFinite(flc) && flc > 0 ? Math.round(flc) : null;
  }

  _mergeAssignmentKeywordFields(quote, data) {
    if (!quote || !data || typeof data !== 'object') return quote;
    const keyword = String(data.keyword ?? data.keywordSnapshot ?? '').trim();
    let flc = this._firstLineCountFromQuoteFields(quote);
    if (flc == null) flc = this._firstLineCountFromQuoteFields(data);
    const out = { ...quote };
    if (keyword) {
      out.keyword = keyword;
      out.keywordSnapshot = String(data.keywordSnapshot ?? data.keyword ?? keyword).trim();
    }
    if (flc != null) {
      out.first_line_count = flc;
      out.firstLineCount = flc;
    }
    return out;
  }

  _dailyDuplicateQuoteDocKeys() {
    return new Set([
      'small_act',
      'smallAct',
      'smallActSnapshot',
      'watch_for',
      'watch_for_snapshot',
      'watchForSnapshot',
      'good_day',
      'goodDay',
      'goodDaySnapshot',
      'rough_day',
      'roughDay',
      'roughDaySnapshot',
      'art_recs',
      'artRecs',
      'artRecsSnapshot',
      'art_recs_type',
      'artRecsType',
      'artRecsTypeSnapshot',
      'communityPrompt',
      'community_prompt',
      'reflectionPrompt',
      'reflection_prompt',
      'communityPromptSnapshot',
      'reflectionPromptSnapshot'
    ]);
  }

  /**
   * Merge `quotes/{dateKey}` with `quotes/{sourceId}` like before-you-go hydration.
   * When both exist, prefer the Notion source doc but backfill mood from the date doc if missing.
   */
  _mergeFirestoreQuoteDocsForDay(byDate, bySource, sourceId, dateKey) {
    const dk = String(dateKey || '').trim();
    const sid = String(sourceId || '').trim();
    const notionBacked = sid !== '';
    const strip = notionBacked && sid !== dk && byDate && bySource;
    if (!strip) return { ...(byDate || {}), ...(bySource || {}) };
    const keys = this._dailyDuplicateQuoteDocKeys();
    const dateWatchFor = String(byDate.watch_for ?? byDate.watchFor ?? '').trim();
    const dateSmallAct = String(byDate.small_act ?? byDate.smallAct ?? '').trim();
    const dateFiltered = Object.fromEntries(
      Object.entries(byDate).filter(([k]) => !keys.has(k))
    );
    const data = { ...dateFiltered, ...bySource };
    const srcMood = this._moodLinesFromQuote(bySource);
    const dateMood = this._moodLinesFromQuote(byDate);
    if (!srcMood.goodDay && dateMood.goodDay) {
      data.good_day = dateMood.goodDay;
      data.goodDay = dateMood.goodDay;
    }
    if (!srcMood.roughDay && dateMood.roughDay) {
      data.rough_day = dateMood.roughDay;
      data.roughDay = dateMood.roughDay;
    }
    if (!String(data.watch_for ?? data.watchFor ?? '').trim() && dateWatchFor) {
      data.watch_for = dateWatchFor;
    }
    if (!String(data.small_act ?? data.smallAct ?? '').trim() && dateSmallAct) {
      data.small_act = dateSmallAct;
      data.smallAct = dateSmallAct;
    }
    return data;
  }

  _mergeAssignmentArtRecSnapshotFields(quote, data) {
    if (!quote || !data || typeof data !== 'object') return quote;
    const snapshotArtRecs = this._artRecsSnapshotValue(data.artRecsSnapshot);
    const artRecs =
      snapshotArtRecs ||
      this._artRecsSnapshotValue(data.art_recs) ||
      this._artRecsSnapshotValue(data.artRecs);
    const artRecsType = String(
      data.artRecsTypeSnapshot ?? data.art_recs_type ?? data.artRecsType ?? ''
    )
      .trim()
      .toLowerCase();
    if (!artRecs && !artRecsType) return quote;
    return {
      ...quote,
      ...(artRecs ? { artRecs, art_recs: artRecs } : {}),
      ...(artRecsType ? { artRecsType: artRecsType, art_recs_type: artRecsType } : {})
    };
  }

  /** Build a quote from assignment snapshot fields alone (no catalog required). */
  _quoteFromAssignmentSnapshots(data) {
    if (!data) return null;
    const snapT = String(data.textSnapshot || '').trim();
    const snapA = String(data.authorSnapshot || '').trim();
    if (!snapT) return null;
    if (this.quotes?.length) {
      const byText = this.quotes.find(
        (q) => String(q.text || '').trim().startsWith(snapT) || String(q.text || '').trim() === snapT
      );
      if (byText && (!snapA || String(byText.author || '').includes(snapA))) {
        const safeData = this._sanitizeAssignmentSpeakerSnapshots(data, byText.author, byText);
        return this._mergeAssignmentKeywordFields(
          this._mergePinnedWithCatalogFields(
            byText,
            this._mergeAssignmentBygSnapshotFields(
              this._mergeAssignmentSpeakerGuideSnapshotFields(
                this._mergeAssignmentMoodSnapshotFields(
                  this._mergeAssignmentArtRecSnapshotFields(
                    this._mergeAssignmentSpeakerCutout(byText, safeData),
                    safeData
                  ),
                  safeData
                ),
                safeData
              ),
              safeData
            )
          ),
          safeData
        );
      }
    }
    return this._mergeAssignmentKeywordFields(
      {
        text: snapT,
        author: snapA,
        ...(String(data.sourceId || '').trim()
          ? { sourceId: String(data.sourceId).trim() }
          : {}),
        communityPrompt: String(data.communityPromptSnapshot || '').trim(),
        community_prompt: String(data.communityPromptSnapshot || '').trim(),
        reflectionPrompt: String(data.reflectionPromptSnapshot || '').trim(),
        reflection_prompt: String(data.reflectionPromptSnapshot || '').trim(),
        smallAct: String(data.smallActSnapshot || '').trim(),
        small_act: String(data.smallActSnapshot || '').trim(),
        watch_for: String(data.watch_for_snapshot ?? data.watchForSnapshot ?? '').trim(),
        goodDay: String(data.goodDaySnapshot || '').trim(),
        good_day: String(data.goodDaySnapshot || '').trim(),
        roughDay: String(data.roughDaySnapshot || '').trim(),
        rough_day: String(data.roughDaySnapshot || '').trim(),
        artRecs: String(data.artRecsSnapshot || '').trim(),
        art_recs: String(data.artRecsSnapshot || '').trim(),
        artRecsType: String(data.artRecsTypeSnapshot || '').trim().toLowerCase(),
        art_recs_type: String(data.artRecsTypeSnapshot || '').trim().toLowerCase(),
        igCaption: String(data.igCaptionSnapshot || '').trim(),
        ig_caption: String(data.igCaptionSnapshot || '').trim(),
        blessing: String(data.blessingSnapshot || '').trim(),
        speakerImageUrl: String(data.speakerImageUrlSnapshot || '').trim(),
        speaker_image_url: String(data.speakerImageUrlSnapshot || '').trim(),
        speakerCutoutUrl: String(data.speakerCutoutUrlSnapshot || '').trim(),
        speaker_cutout_url: String(data.speakerCutoutUrlSnapshot || '').trim(),
        speakerDates: String(data.speakerDatesSnapshot || '').trim(),
        speaker_dates: String(data.speakerDatesSnapshot || '').trim(),
        speakerBorn: String(data.speakerBornSnapshot || '').trim(),
        speaker_born: String(data.speakerBornSnapshot || '').trim(),
        speakerDied: String(data.speakerDiedSnapshot || '').trim(),
        speaker_died: String(data.speakerDiedSnapshot || '').trim(),
        speakerGuideLine: String(data.speakerGuideLineSnapshot || '').trim(),
        speaker_guide_line: String(data.speakerGuideLineSnapshot || '').trim(),
        speakerKeywords: String(data.speakerKeywordsSnapshot || '').trim(),
        speaker_keywords: String(data.speakerKeywordsSnapshot || '').trim(),
        imageAttribution: String(data.imageAttributionSnapshot || '').trim(),
        image_attribution: String(data.imageAttributionSnapshot || '').trim(),
        first_response: this._firstResponseFromPayload(data),
        user_name: String(data.user_name ?? data.userName ?? '').trim(),
        ...(() => {
          const sid = String(data.sourceId || '').trim();
          const catalog =
            sid && this.quotes?.length
              ? this.quotes.find((q) => String(q.sourceId || '').trim() === sid)
              : null;
          const flc = this._firstLineCountFromQuoteFields(catalog || data);
          if (flc == null) return {};
          return { first_line_count: flc, firstLineCount: flc };
        })()
      },
      data
    );
  }

  _findQuoteFromAssignmentPayload(data) {
    if (!data) return null;
    const sid = data.sourceId != null && String(data.sourceId).trim() !== '' ? String(data.sourceId).trim() : '';
    const snapT = String(data.textSnapshot || data.text || '').trim();
    const snapA = String(data.authorSnapshot || data.author || '').trim();
    if (sid && this.quotes?.length) {
      const byId = this.quotes.find((q) => String(q.sourceId || '').trim() === sid);
      if (byId) {
        if (snapA && !this._authorsReferToSameSpeaker(byId.author, snapA)) {
          if (snapT && snapA) return this._quoteFromAssignmentSnapshots(data);
        } else {
          const safeData = this._sanitizeAssignmentSpeakerSnapshots(data, byId.author, byId);
          return this._mergeAssignmentKeywordFields(
            this._mergePinnedWithCatalogFields(
              byId,
              this._mergeAssignmentBygSnapshotFields(
                this._mergeAssignmentSpeakerGuideSnapshotFields(
                  this._mergeAssignmentMoodSnapshotFields(
                    this._mergeAssignmentArtRecSnapshotFields(
                      this._mergeAssignmentSpeakerCutout(byId, safeData),
                      safeData
                    ),
                    safeData
                  ),
                  safeData
                ),
                safeData
              )
            ),
            safeData
          );
        }
      }
      // Catalog may lag behind `dailyQuoteAssignments` (stale localStorage catalog). Trust
      // Firestore snapshots when both author and text are present on the assignment row.
      if (snapT && snapA) {
        return this._quoteFromAssignmentSnapshots(data);
      }
      return null;
    }
    const emb = data.embeddedStableKey != null ? String(data.embeddedStableKey).trim() : '';
    if (emb && this.quotes?.length) {
      const byEmb = this.quotes.find((q) => this._embeddedStableKey(q) === emb);
      if (byEmb) {
        if (snapA && !this._authorsReferToSameSpeaker(byEmb.author, snapA)) {
          if (snapT && snapA) return this._quoteFromAssignmentSnapshots(data);
        } else {
          const safeData = this._sanitizeAssignmentSpeakerSnapshots(data, byEmb.author, byEmb);
          return this._mergeAssignmentKeywordFields(
            this._mergePinnedWithCatalogFields(
              byEmb,
              this._mergeAssignmentBygSnapshotFields(
                this._mergeAssignmentSpeakerGuideSnapshotFields(
                  this._mergeAssignmentMoodSnapshotFields(
                    this._mergeAssignmentArtRecSnapshotFields(
                      this._mergeAssignmentSpeakerCutout(byEmb, safeData),
                      safeData
                    ),
                    safeData
                  ),
                  safeData
                ),
                safeData
              )
            ),
            safeData
          );
        }
      }
    }
    return this._quoteFromAssignmentSnapshots(data);
  }

  _mergeCatalogQuoteWithAssignment(baseQuote, assignData) {
    if (!baseQuote || !assignData) return baseQuote;
    const safeData = this._sanitizeAssignmentSpeakerSnapshots(assignData, baseQuote.author, baseQuote);
    return this._mergeAssignmentKeywordFields(
      this._mergePinnedWithCatalogFields(
        baseQuote,
        this._mergeAssignmentBygSnapshotFields(
          this._mergeAssignmentSpeakerGuideSnapshotFields(
            this._mergeAssignmentMoodSnapshotFields(
              this._mergeAssignmentArtRecSnapshotFields(
                this._mergeAssignmentSpeakerCutout(baseQuote, safeData),
                safeData
              ),
              safeData
            ),
            safeData
          ),
          safeData
        )
      ),
      safeData
    );
  }

  async _readFirestoreQuoteDocFromServer(docId, timeoutMs = 8000) {
    const id = String(docId || '').trim();
    if (!id || !window.db || !window.firestore) return null;
    try {
      const readDoc = window.firestore.getDocFromServer || window.firestore.getDoc;
      const snap = await this._withTimeout(
        readDoc(window.firestore.doc(window.db, 'quotes', id)),
        timeoutMs,
        `quotes/${id} server read`
      );
      return snap.exists() ? snap.data() || {} : null;
    } catch (e) {
      console.warn(`⚠️ quotes/${id} server read failed:`, e?.message || e);
      return null;
    }
  }

  /**
   * Resolve a calendar assignment: quotes/{sourceId} from server first, then snapshots.
   * Never uses stale quotes/{YYYY-MM-DD} date-shaped docs.
   */
  async _resolveQuoteFromDailyAssignmentServer(assignData, dateKey) {
    if (!assignData) return null;
    const dk = String(dateKey || '').trim();
    const snapAuthor = String(assignData.authorSnapshot || assignData.author || '').trim();
    const snapText = String(assignData.textSnapshot || assignData.text || '').trim();
    const sid = String(assignData.sourceId || '').trim();

    if (sid) {
      let fromServer = null;
      const serverData = await this._readFirestoreQuoteDocFromServer(sid);
      if (serverData) {
        fromServer = this._buildQuoteFromCanonicalDocData({ ...serverData, sourceId: sid });
        if (fromServer) {
          if (!snapAuthor || this._authorsReferToSameSpeaker(fromServer.author, snapAuthor)) {
            return this._mergeCatalogQuoteWithAssignment(fromServer, assignData);
          }
          console.warn(
            `dailyQuoteAssignments/${dk}: quotes/${sid} author "${fromServer.author}" != assignment "${snapAuthor}"; using snapshots`
          );
        }
      }

      if (snapText && snapAuthor) {
        const fromSnapshots = this._quoteFromAssignmentSnapshots(assignData);
        if (fromSnapshots && fromServer) {
          const flc = this._firstLineCountFromQuoteFields(fromServer);
          if (flc != null) {
            fromSnapshots.first_line_count = flc;
            fromSnapshots.firstLineCount = flc;
          }
        }
        return fromSnapshots;
      }
    }

    if (snapText && snapAuthor) {
      return this._quoteFromAssignmentSnapshots(assignData);
    }

    const fromLocal = this._findQuoteFromAssignmentPayload(assignData);
    if (fromLocal) {
      const localAuthor = String(fromLocal.author || '').trim();
      if (snapAuthor && localAuthor && !this._authorsReferToSameSpeaker(localAuthor, snapAuthor)) {
        return null;
      }
      return fromLocal;
    }

    return null;
  }

  /** Re-attach a pinned quote object to the current catalog (blessing / fields sync from Notion). */
  _hydrateQuoteFromCatalog(quote) {
    if (!quote || !this.quotes?.length) return null;
    const sid = String(quote.sourceId || '').trim();
    if (sid) {
      const byId = this.quotes.find((q) => String(q.sourceId || '').trim() === sid);
      if (byId) return byId;
    }
    const emb = this._embeddedStableKey(quote);
    const byEmb = this.quotes.find((q) => this._embeddedStableKey(q) === emb);
    return byEmb || null;
  }

  _assignmentFieldIsMeaningful(val) {
    if (val == null) return false;
    if (typeof val === 'string') return !!val.trim();
    if (typeof val === 'boolean') return true;
    if (typeof val === 'number') return Number.isFinite(val);
    if (typeof val === 'object') {
      if (Array.isArray(val)) return val.length > 0;
      return Object.keys(val).length > 0;
    }
    return true;
  }

  /** Overlay pin/assignment fields without empty snapshots wiping Notion catalog copy. */
  _mergePinnedWithCatalogFields(catalog, pinned) {
    if (!catalog || !pinned) return pinned || catalog;
    const merged = { ...catalog };
    const expectedAuthor = String(catalog.author || '').trim();
    const trustSpeakerFields = this._authorsReferToSameSpeaker(
      expectedAuthor,
      pinned.author || pinned.authorSnapshot
    );
    for (const key of Object.keys(pinned)) {
      const val = pinned[key];
      if (!this._assignmentFieldIsMeaningful(val)) continue;
      if (!trustSpeakerFields && this._isSpeakerPortraitOrCutoutField(key)) continue;
      merged[key] = val;
    }
    const safePinned = trustSpeakerFields
      ? pinned
      : this._sanitizeAssignmentSpeakerSnapshots(pinned, expectedAuthor);
    return this._applySpeakerCutoutCatalogPreference(merged, catalog, safePinned);
  }

  _moodLinesFromQuote(quote) {
    if (!quote || typeof quote !== 'object') return { goodDay: '', roughDay: '' };
    let goodDay = String(quote.goodDay ?? quote.good_day ?? '').replace(/\s+/g, ' ').trim();
    let roughDay = String(quote.roughDay ?? quote.rough_day ?? '').replace(/\s+/g, ' ').trim();
    if (goodDay && roughDay) return { goodDay, roughDay };
    for (const [key, val] of Object.entries(quote)) {
      const nk = this._normFieldKeyLoose(key);
      const t = String(val ?? '').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (nk === 'goodday' && !goodDay) goodDay = t;
      if (nk === 'roughday' && !roughDay) roughDay = t;
    }
    return { goodDay, roughDay };
  }

  async _readFirestoreQuoteDoc(docId) {
    const id = String(docId || '').trim();
    if (!id || !window.db || !window.firestore) return null;
    try {
      const snap = await (window.firestore.getDocFromServer || window.firestore.getDoc)(
        window.firestore.doc(window.db, 'quotes', id)
      );
      return snap.exists() ? snap.data() || {} : null;
    } catch (e) {
      console.warn(`⚠️ quotes/${id} read failed:`, e?.message || e);
      return null;
    }
  }

  _assignmentSpeakerSnapshotKeys() {
    return [
      'speakerImageUrlSnapshot',
      'speaker_image_url_snapshot',
      'speakerCutoutUrlSnapshot',
      'speaker_cutout_url_snapshot',
      'speakerCutoutSourceUrlSnapshot',
      'speaker_cutout_source_url_snapshot',
      'speakerDatesSnapshot',
      'speakerBornSnapshot',
      'speakerDiedSnapshot',
      'speakerGuideLineSnapshot',
      'speakerKeywordsSnapshot',
      'imageAttributionSnapshot'
    ];
  }

  async _readDailyQuoteAssignmentData(dateKey) {
    const dk = String(dateKey || '').trim();
    if (!dk) return null;
    const cached = this._readLocalAssignment(dk);
    if (!window.db || !window.firestore) return cached;
    try {
      const readDoc = window.firestore.getDocFromServer || window.firestore.getDoc;
      const snap = await readDoc(window.firestore.doc(window.db, 'dailyQuoteAssignments', dk));
      if (snap.exists()) {
        const server = snap.data() || {};
        const merged = { ...(cached || {}), ...server };
        // Device cache can retain yesterday's speaker snapshots when the server row omits them.
        for (const key of this._assignmentSpeakerSnapshotKeys()) {
          if (cached?.[key] && !Object.prototype.hasOwnProperty.call(server, key)) {
            delete merged[key];
          }
        }
        return merged;
      }
    } catch (e) {
      console.warn(`⚠️ dailyQuoteAssignments/${dk} read failed:`, e?.message || e);
    }
    return cached;
  }

  /**
   * Mood lines often live only on `quotes/{notionPageId}`; assignment snapshots can be blank.
   * Mirrors before-you-go / reflection server hydration.
   */
  async hydrateMoodFieldsForCalendarKey(dateKey, baseQuote = null) {
    const dk = String(dateKey || this.getQuoteCalendarKeyNow()).trim();
    const base = baseQuote || this._pinnedByDateKey[dk] || null;
    if (!dk || !base) return base;

    let { goodDay, roughDay } = this._moodLinesFromQuote(base);
    const fresh = this._hydrateQuoteFromCatalog(base);
    if (fresh) {
      const fromCatalog = this._moodLinesFromQuote(fresh);
      if (!goodDay && fromCatalog.goodDay) goodDay = fromCatalog.goodDay;
      if (!roughDay && fromCatalog.roughDay) roughDay = fromCatalog.roughDay;
    }

    const assignData = await this._readDailyQuoteAssignmentData(dk);
    if (assignData && this._assignmentSnapshotsMatchQuoteAuthor(base, assignData)) {
      const fromAssign = this._moodLinesFromQuote(assignData);
      if (!goodDay && fromAssign.goodDay) goodDay = fromAssign.goodDay;
      if (!roughDay && fromAssign.roughDay) roughDay = fromAssign.roughDay;
    }

    if ((!goodDay || !roughDay) && window.db && window.firestore) {
      let sourceId = String(base.sourceId || '').trim();
      if (!sourceId && fresh?.sourceId) sourceId = String(fresh.sourceId).trim();
      if (!sourceId && base.text && this.quotes?.length) {
        const snapT = String(base.text || '').trim();
        const match = this.quotes.find((q) => String(q.text || '').trim() === snapT);
        if (match?.sourceId) sourceId = String(match.sourceId).trim();
      }
      const byDate = await this._readFirestoreQuoteDoc(dk);
      const bySource = sourceId && sourceId !== dk ? await this._readFirestoreQuoteDoc(sourceId) : null;
      const mergedDocs = this._mergeFirestoreQuoteDocsForDay(byDate, bySource, sourceId, dk);
      const fromDocs = this._moodLinesFromQuote(mergedDocs);
      if (!goodDay && fromDocs.goodDay) goodDay = fromDocs.goodDay;
      if (!roughDay && fromDocs.roughDay) roughDay = fromDocs.roughDay;
    }

    if (!goodDay && !roughDay) return base;

    const merged = {
      ...base,
      ...(goodDay ? { goodDay, good_day: goodDay } : {}),
      ...(roughDay ? { roughDay, rough_day: roughDay } : {})
    };
    const hydrated = fresh ? this._mergePinnedWithCatalogFields(fresh, merged) : merged;
    this._pinnedByDateKey[dk] = hydrated;
    return hydrated;
  }

  /** Re-merge speaker cutout from `dailyQuoteAssignments` (e.g. after GitHub cutout job). */
  async hydrateSpeakerCutoutFieldsForCalendarKey(dateKey, baseQuote = null) {
    const dk = String(dateKey || this.getQuoteCalendarKeyNow()).trim();
    let merged = baseQuote || this._pinnedByDateKey[dk] || null;
    if (!dk || !merged) return merged;

    const assignData = await this._readDailyQuoteAssignmentData(dk);
    if (assignData) {
      const safeAssign = this._sanitizeAssignmentSpeakerSnapshots(assignData, merged.author, merged);
      merged = this._mergeAssignmentSpeakerCutout(merged, safeAssign);
    }

    this._pinnedByDateKey[dk] = merged;
    return merged;
  }

  async hydrateSpeakerGuideFieldsForCalendarKey(dateKey, baseQuote = null) {
    const dk = String(dateKey || this.getQuoteCalendarKeyNow()).trim();
    let merged = baseQuote || this._pinnedByDateKey[dk] || null;
    if (!dk || !merged) return merged;

    const fresh = this._hydrateQuoteFromCatalog(merged);
    if (fresh) merged = this._mergePinnedWithCatalogFields(fresh, merged);

    const assignData = await this._readDailyQuoteAssignmentData(dk);
    if (assignData) {
      const safeAssign = this._sanitizeAssignmentSpeakerSnapshots(assignData, merged.author, merged);
      merged = this._mergeAssignmentSpeakerGuideSnapshotFields(merged, safeAssign);
    }

    let guideLine = String(merged.speakerGuideLine ?? merged.speaker_guide_line ?? '').trim();
    let speakerKeywords = String(merged.speakerKeywords ?? merged.speaker_keywords ?? '').trim();

    if ((!guideLine || !speakerKeywords) && window.db && window.firestore) {
      const sourceId = String(merged.sourceId || fresh?.sourceId || '').trim();
      if (sourceId && sourceId !== dk) {
        const doc = await this._readFirestoreQuoteDoc(sourceId);
        if (doc) {
          if (!guideLine) {
            guideLine = String(doc.speaker_guide_line ?? doc.speakerGuideLine ?? '').trim();
          }
          if (!speakerKeywords) {
            speakerKeywords = String(doc.speaker_keywords ?? doc.speakerKeywords ?? '').trim();
          }
        }
      }
    }

    if (!guideLine && !speakerKeywords) return merged;

    merged = {
      ...merged,
      ...(guideLine ? { speakerGuideLine: guideLine, speaker_guide_line: guideLine } : {}),
      ...(speakerKeywords ? { speakerKeywords, speaker_keywords: speakerKeywords } : {})
    };
    this._pinnedByDateKey[dk] = merged;
    return merged;
  }

  async _mergeSpeakerFieldsFromFirestoreSource(dateKey, baseQuote) {
    if (!baseQuote) return null;
    let merged = { ...baseQuote };
    const fresh = this._hydrateQuoteFromCatalog(merged);
    if (fresh) merged = this._mergePinnedWithCatalogFields(fresh, merged);

    const dk = String(dateKey || '').trim();
    const sourceId = String(merged.sourceId || fresh?.sourceId || '').trim();
    if (sourceId && sourceId !== dk) {
      const doc = await this._readFirestoreQuoteDoc(sourceId);
      if (doc) {
        const built = this._buildQuoteFromCanonicalDocData({ ...doc, sourceId });
        if (built) merged = this._mergePinnedWithCatalogFields(built, merged);
      }
    }
    return merged;
  }

  async _pinAndHydrateQuote(dateKey, quote) {
    if (!quote) return null;
    let merged = await this._mergeSpeakerFieldsFromFirestoreSource(dateKey, quote);
    merged = (await this._mergeBlessingFromDailyFirestoreDocs(dateKey, merged)) || merged;
    merged = (await this.hydrateMoodFieldsForCalendarKey(dateKey, merged)) || merged;
    merged = (await this.hydrateSpeakerCutoutFieldsForCalendarKey(dateKey, merged)) || merged;
    merged = (await this.hydrateSpeakerGuideFieldsForCalendarKey(dateKey, merged)) || merged;
    const assignData = await this._readDailyQuoteAssignmentData(dateKey);
    if (assignData) {
      if (this._assignmentSnapshotsMatchQuoteAuthor(merged, assignData)) {
        merged = this._mergeAssignmentBygSnapshotFields(merged, assignData);
        merged = this._mergeAssignmentArtRecSnapshotFields(merged, assignData);
        merged = this._mergeAssignmentKeywordFields(merged, assignData);
        const first_response = this._firstResponseFromPayload(assignData);
        if (first_response) merged = { ...merged, first_response };
        this._writeLocalAssignment(
          dateKey,
          this._localAssignmentCachePayload(dateKey, merged, assignData)
        );
      } else {
        console.warn(
          `Skipped dailyQuoteAssignments/${dateKey} snapshots:`,
          `quote author "${String(merged.author || '').slice(0, 80)}"`,
          '!= assignment author',
          `"${String(assignData.authorSnapshot || assignData.author || '').slice(0, 80)}"`
        );
      }
    }
    this._pinnedByDateKey[dateKey] = merged;
    return merged;
  }

  _normFieldKeyLoose(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\s_-]/g, '');
  }

  _scalarTextField(val) {
    if (val == null) return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number' && Number.isFinite(val)) return String(val);
    if (Array.isArray(val)) {
      return val
        .map((x) =>
          x && typeof x === 'object' && typeof x.plain_text === 'string'
            ? x.plain_text
            : String(x ?? '')
        )
        .join('')
        .trim();
    }
    if (typeof val === 'object') {
      if (typeof val.plain_text === 'string') return val.plain_text.trim();
      if (Array.isArray(val.rich_text)) {
        return val.rich_text.map((x) => x?.plain_text || '').join('').trim();
      }
    }
    return '';
  }

  _artRecsSnapshotValue(val) {
    if (val == null) return '';
    if (typeof val === 'string') return val.trim();
    try {
      return JSON.stringify(val);
    } catch (_) {
      return '';
    }
  }

  quoteSubmitterName(q) {
    if (!q || typeof q !== 'object') return '';
    const directKeys = [
      'submittedBy',
      'submitted_by',
      'submitterName',
      'submittedByName',
      'submitted_by_name',
      'recommendedBy',
      'recommended_by'
    ];
    for (const key of directKeys) {
      const name = this._scalarTextField(q[key]).trim();
      if (name) return name;
    }
    return '';
  }

  formatSubmitterThanksLine(q) {
    const name = this.quoteSubmitterName(q);
    return name ? `Today’s quote shared by ${name} ♡` : '';
  }

  /** Blessing text from a plain object (Firestore doc or quote row); any key whose name contains "blessing". */
  _blessingScalarFromPlainObject(data) {
    if (!data || typeof data !== 'object') return '';
    for (const k of ['blessing', 'Blessing', 'BLESSING']) {
      const s = this._scalarTextField(data[k]);
      if (s) return s;
    }
    for (const k of Object.keys(data)) {
      if (!this._normFieldKeyLoose(k).includes('blessing')) continue;
      const s = this._scalarTextField(data[k]);
      if (s) return s;
    }
    return '';
  }

  /**
   * Per-day docs can carry blessing even when the Notion-synced catalog row was empty
   * or keys differed — merge for quilt display.
   */
  async _mergeBlessingFromDailyFirestoreDocs(dateKey, quote) {
    if (!quote || !dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return quote;
    if (this._blessingScalarFromPlainObject(quote).trim()) return quote;
    if (!window.db || !window.firestore) return quote;

    const readBlessing = async (collectionId) => {
      try {
        const snap = await this._withTimeout(
          window.firestore.getDoc(window.firestore.doc(window.db, collectionId, dateKey)),
          700,
          `blessing merge ${collectionId}/${dateKey}`
        );
        if (!snap.exists()) return '';
        return this._blessingScalarFromPlainObject(snap.data() || {});
      } catch (e) {
        console.warn(`⚠️ blessing merge read ${collectionId}/${dateKey}:`, e?.message || e);
        return '';
      }
    };

    let extra = (await readBlessing('dailyQuoteAssignments')).trim();
    if (!extra) extra = (await readBlessing('quotes')).trim();
    if (!extra) extra = (await readBlessing('dailyQuoteUsage')).trim();
    if (!extra) return quote;
    return { ...quote, blessing: extra };
  }

  /** Re-fetch daily-doc blessing for pinned days (e.g. when opening quilt after Firestore updated). */
  async hydratePinnedBlessingsForDateKeys(dateKeys) {
    if (!dateKeys?.length) return;
    await Promise.all(
      dateKeys.map(async (dk) => {
        const q = this._pinnedByDateKey[dk];
        if (!q) return;
        const merged = await this._mergeBlessingFromDailyFirestoreDocs(dk, q);
        this._pinnedByDateKey[dk] = merged;
      })
    );
  }

  async saveDayAssignment(dateKey, quote) {
    const sourceId = quote?.sourceId != null && String(quote.sourceId).trim() !== '' ? String(quote.sourceId).trim() : '';
    const communityPromptSnapshot = String(quote?.communityPrompt ?? quote?.community_prompt ?? '').trim();
    const smallActSnapshot = String(quote?.smallAct ?? quote?.small_act ?? '').trim();
    const watchForSnapshot = String(quote?.watch_for ?? '').trim();
    const goodDaySnapshot = String(quote?.goodDay ?? quote?.good_day ?? '').trim();
    const roughDaySnapshot = String(quote?.roughDay ?? quote?.rough_day ?? '').trim();
    const artRecsSnapshot = this._artRecsSnapshotValue(quote?.artRecs ?? quote?.art_recs);
    const artRecsTypeSnapshot = String(quote?.artRecsType ?? quote?.art_recs_type ?? '').trim().toLowerCase();
    const speakerImageUrlSnapshot = String(quote?.speakerImageUrl ?? quote?.speaker_image_url ?? '').trim();
    const speakerCutoutUrlSnapshot = String(quote?.speakerCutoutUrl ?? quote?.speaker_cutout_url ?? '').trim();
    const speakerDatesSnapshot = String(quote?.speakerDates ?? quote?.speaker_dates ?? '').trim();
    const speakerBornSnapshot = String(quote?.speakerBorn ?? quote?.speaker_born ?? '').trim();
    const speakerDiedSnapshot = String(quote?.speakerDied ?? quote?.speaker_died ?? '').trim();
    const speakerGuideLineSnapshot = String(quote?.speakerGuideLine ?? quote?.speaker_guide_line ?? '').trim();
    const speakerKeywordsSnapshot = String(quote?.speakerKeywords ?? quote?.speaker_keywords ?? '').trim();
    const imageAttributionSnapshot = String(quote?.imageAttribution ?? quote?.image_attribution ?? '').trim();
    const payload = {
      dateKey,
      sourceId: sourceId || null,
      embeddedStableKey: sourceId ? null : this._embeddedStableKey(quote),
      textSnapshot: String(quote?.text || '').slice(0, 160),
      authorSnapshot: String(quote?.author || '').slice(0, 120),
      communityPromptSnapshot: communityPromptSnapshot.slice(0, 500),
      smallActSnapshot: smallActSnapshot.slice(0, 240),
      watch_for_snapshot: watchForSnapshot.slice(0, 280),
      goodDaySnapshot: goodDaySnapshot.slice(0, 240),
      roughDaySnapshot: roughDaySnapshot.slice(0, 240),
      artRecsSnapshot: artRecsSnapshot.slice(0, 1200),
      artRecsTypeSnapshot: artRecsTypeSnapshot.slice(0, 40),
      speakerImageUrlSnapshot: speakerImageUrlSnapshot.slice(0, 500),
      speakerCutoutUrlSnapshot: speakerCutoutUrlSnapshot.slice(0, 500),
      speakerDatesSnapshot: speakerDatesSnapshot.slice(0, 120),
      speakerBornSnapshot: speakerBornSnapshot.slice(0, 80),
      speakerDiedSnapshot: speakerDiedSnapshot.slice(0, 80),
      speakerGuideLineSnapshot: speakerGuideLineSnapshot.slice(0, 260),
      speakerKeywordsSnapshot: speakerKeywordsSnapshot.slice(0, 200),
      imageAttributionSnapshot: imageAttributionSnapshot.slice(0, 260),
      assignedAt: new Date().toISOString(),
    };
    this._writeLocalAssignment(dateKey, payload);
  }

  invalidatePinnedAssignments() {
    this._pinnedByDateKey = {};
  }

  /** True when today's calendar key already has a pinned quote object. */
  hasTodayQuotePinned() {
    const todayKey = this.getQuoteCalendarKeyNow();
    return !!todayKey && !!this._pinnedByDateKey[todayKey];
  }

  /**
   * Synchronously pin today from `ourDailyQuoteAssignments` localStorage (offline / fast launch).
   * Does not replace Firestore `resolveAndPinCalendarKey`; use before first quilt paint.
   */
  primeTodayQuoteFromLocalAssignment() {
    const dateKey = this.getQuoteCalendarKeyNow();
    if (!dateKey) return false;
    if (this._pinnedByDateKey[dateKey]) return true;
    const data = this._readLocalAssignment(dateKey);
    const quote = data ? this._findQuoteFromAssignmentPayload(data) : null;
    if (!quote) return false;
    this._pinnedByDateKey[dateKey] = quote;
    return true;
  }

  async _readDailyQuoteAssignmentFromServer(dateKey, timeoutMs = 8000) {
    const dk = String(dateKey || '').trim();
    if (!dk || !window.db || !window.firestore) return null;
    try {
      const readDoc = window.firestore.getDocFromServer || window.firestore.getDoc;
      const snap = await this._withTimeout(
        readDoc(window.firestore.doc(window.db, 'dailyQuoteAssignments', dk)),
        timeoutMs,
        `daily quote assignment launch ${dk}`
      );
      return snap.exists() ? snap.data() || {} : null;
    } catch (e) {
      console.warn(`⚠️ launch assignment read failed for ${dk}:`, e?.message || e);
      return null;
    }
  }

  _buildQuoteFromCanonicalDocData(quoteData) {
    const text = String(quoteData?.text || '').trim();
    const author = String(quoteData?.author || '').trim();
    if (!text) return null;
    const blessing = this._blessingScalarFromPlainObject(quoteData).trim();
    const communityPrompt = String(quoteData.communityPrompt || quoteData.community_prompt || '').trim();
    const reflectionPrompt = String(quoteData.reflectionPrompt || quoteData.reflection_prompt || '').trim();
    const artRecsRaw = quoteData.art_recs ?? quoteData.artRecs;
    const artRecsUseful =
      artRecsRaw != null &&
      (typeof artRecsRaw === 'string' ? String(artRecsRaw).trim() : typeof artRecsRaw === 'object');
    const artRecsType = String(quoteData.art_recs_type ?? quoteData.artRecsType ?? '')
      .trim()
      .toLowerCase();
    const smallAct = String(quoteData.smallAct ?? quoteData.small_act ?? '').trim();
    const watchFor = String(
      quoteData.watch_for ??
        quoteData.watchFor ??
        quoteData.watch_for_snapshot ??
        quoteData.watchForSnapshot ??
        ''
    ).trim();
    const goodDay = String(quoteData.goodDay ?? quoteData.good_day ?? '').trim();
    const roughDay = String(quoteData.roughDay ?? quoteData.rough_day ?? '').trim();
    const igCaption = String(quoteData.igCaption ?? quoteData.ig_caption ?? '').trim();
    const fortune = String(quoteData.fortune ?? quoteData.Fortune ?? '').trim();
    const keyword = String(quoteData.keyword ?? quoteData.keywordSnapshot ?? '').trim();
    let firstLineCount = Number(quoteData.first_line_count ?? quoteData.firstLineCount);
    if (!Number.isFinite(firstLineCount) || firstLineCount <= 0) {
      firstLineCount = Number(quoteData.notionProperties?.first_line_count?.value);
    }
    const notificationText = String(quoteData.notificationText ?? quoteData.notification_text ?? '').trim();
    const speakerImageUrl = String(quoteData.speakerImageUrl ?? quoteData.speaker_image_url ?? '').trim();
    const speakerCutoutUrl = String(quoteData.speakerCutoutUrl ?? quoteData.speaker_cutout_url ?? '').trim();
    const speakerDates = String(quoteData.speakerDates ?? quoteData.speaker_dates ?? '').trim();
    const speakerBorn = String(quoteData.speakerBorn ?? quoteData.speaker_born ?? '').trim();
    const speakerDied = String(quoteData.speakerDied ?? quoteData.speaker_died ?? '').trim();
    const speakerGuideLine = String(quoteData.speakerGuideLine ?? quoteData.speaker_guide_line ?? '').trim();
    const speakerKeywords = String(quoteData.speakerKeywords ?? quoteData.speaker_keywords ?? '').trim();
    const imageAttribution = String(quoteData.imageAttribution ?? quoteData.image_attribution ?? '').trim();
    const canonical = {
      text,
      author,
      ...(blessing ? { blessing } : {}),
      ...(communityPrompt ? { communityPrompt, community_prompt: communityPrompt } : {}),
      ...(reflectionPrompt ? { reflectionPrompt, reflection_prompt: reflectionPrompt } : {}),
      ...(artRecsUseful ? { art_recs: artRecsRaw, artRecs: artRecsRaw } : {}),
      ...(artRecsType ? { art_recs_type: artRecsType, artRecsType } : {}),
      ...(smallAct ? { smallAct, small_act: smallAct } : {}),
      ...(watchFor ? { watch_for: watchFor } : {}),
      ...(goodDay ? { goodDay, good_day: goodDay } : {}),
      ...(roughDay ? { roughDay, rough_day: roughDay } : {}),
      ...(igCaption ? { igCaption, ig_caption: igCaption } : {}),
      ...(fortune ? { fortune } : {}),
      ...(keyword
        ? { keyword, keywordSnapshot: String(quoteData.keywordSnapshot ?? keyword).trim() }
        : {}),
      ...(Number.isFinite(firstLineCount) && firstLineCount > 0
        ? {
            first_line_count: Math.round(firstLineCount),
            firstLineCount: Math.round(firstLineCount)
          }
        : {}),
      ...(notificationText ? { notificationText, notification_text: notificationText } : {}),
      ...(speakerImageUrl ? { speakerImageUrl, speaker_image_url: speakerImageUrl } : {}),
      ...(speakerCutoutUrl ? { speakerCutoutUrl, speaker_cutout_url: speakerCutoutUrl } : {}),
      ...(speakerDates ? { speakerDates, speaker_dates: speakerDates } : {}),
      ...(speakerBorn ? { speakerBorn, speaker_born: speakerBorn } : {}),
      ...(speakerDied ? { speakerDied, speaker_died: speakerDied } : {}),
      ...(speakerGuideLine ? { speakerGuideLine, speaker_guide_line: speakerGuideLine } : {}),
      ...(speakerKeywords ? { speakerKeywords, speaker_keywords: speakerKeywords } : {}),
      ...(imageAttribution ? { imageAttribution, image_attribution: imageAttribution } : {}),
      ...(quoteData.sourceId ? { sourceId: quoteData.sourceId } : {}),
      _canonicalDailyDoc: true
    };
    const hydrated = this._hydrateQuoteFromCatalog(canonical);
    return hydrated ? { ...hydrated, ...canonical } : canonical;
  }

  async _readCanonicalQuoteFromServerForLaunch(dateKey, timeoutMs = 8000) {
    const dk = String(dateKey || '').trim();
    if (!dk || !window.db || !window.firestore) return null;
    const readQuoteDoc = window.firestore.getDocFromServer;
    if (typeof readQuoteDoc !== 'function') return null;
    try {
      const quoteSnap = await this._withTimeout(
        readQuoteDoc(window.firestore.doc(window.db, 'quotes', dk)),
        timeoutMs,
        `canonical quote launch ${dk}`
      );
      if (!quoteSnap.exists()) return null;
      const byDate = quoteSnap.data() || {};
      const sourceId = String(byDate.sourceId || '').trim();
      let mergedData = byDate;
      if (sourceId && sourceId !== dk) {
        try {
          const srcSnap = await this._withTimeout(
            readQuoteDoc(window.firestore.doc(window.db, 'quotes', sourceId)),
            timeoutMs,
            `canonical quote launch source ${sourceId}`
          );
          if (srcSnap.exists()) {
            mergedData = this._mergeFirestoreQuoteDocsForDay(byDate, srcSnap.data() || {}, sourceId, dk);
          }
        } catch (srcErr) {
          console.warn(`⚠️ launch canonical source read failed for ${sourceId}:`, srcErr?.message || srcErr);
        }
      }
      return this._buildQuoteFromCanonicalDocData(mergedData);
    } catch (e) {
      console.warn(`⚠️ launch canonical quote read failed for ${dk}:`, e?.message || e);
      return null;
    }
  }

  /**
   * Fast launch path: assignment snapshots or quotes/{dateKey} only — no full catalog read.
   * Full catalog sync runs in background after splash dismisses.
   */
  async resolveTodayQuoteForLaunch() {
    const dateKey = this.getQuoteCalendarKeyNow();
    if (!dateKey) return false;
    if (this._pinnedByDateKey[dateKey]) {
      const stillValid = await this.reconcilePinWithFirestoreAssignment(dateKey);
      if (stillValid && this._pinnedByDateKey[dateKey]) return true;
    }
    if (!window.db || !window.firestore) return false;

    const assignData = await this._readDailyQuoteAssignmentFromServer(dateKey);
    let quote = assignData ? this._findQuoteFromAssignmentPayload(assignData) : null;
    if (!quote) {
      quote = await this._readCanonicalQuoteFromServerForLaunch(dateKey);
    }
    if (!quote) return false;
    if (assignData) {
      quote = this._mergeAssignmentArtRecSnapshotFields(
        this._mergeAssignmentBygSnapshotFields(quote, assignData),
        assignData
      );
    }

    this._pinnedByDateKey[dateKey] = quote;
    this._writeLocalAssignment(dateKey, this._localAssignmentCachePayload(dateKey, quote, assignData));
    return true;
  }

  /** Notion `date_scheduled` on catalog docs wins over stale assignment snapshots. */
  async _resolveQuotePreferringNotionSchedule(dateKey, options = {}) {
    const dk = String(dateKey || '').trim();
    if (!dk) return null;
    const requireServer = options.requireServer === true;
    let quote = this._findQuoteInLoadedCatalogByScheduledDate(dk);
    if (!quote && requireServer) {
      quote = await this._findQuoteCatalogByScheduledDateFromServer(dk);
    }
    if (!quote) return null;

    if (options.fetchAssignment === false) return quote;

    let assignData = options.assignData;
    if (assignData === undefined) {
      assignData = requireServer
        ? await this._readDailyQuoteAssignmentFromServer(dk, options.assignTimeoutMs || 8000)
        : await this._readDailyQuoteAssignmentData(dk);
    }
    if (!assignData) return quote;

    const assignAuthor = String(assignData.authorSnapshot || assignData.author || '').trim();
    if (!assignAuthor || this._authorsReferToSameSpeaker(quote.author, assignAuthor)) {
      return this._mergeCatalogQuoteWithAssignment(quote, assignData);
    }
    console.warn(
      `dailyQuoteAssignments/${dk} author "${assignAuthor}" != Notion date_scheduled "${quote.author}"; using catalog quote`
    );
    return quote;
  }

  async resolveAndPinCalendarKey(dateKey, options = {}) {
    const requireLive = options.requireLive === true;
    if (!dateKey) return null;
    if (!this.quotes?.length) return null;

    const existingPin = this._pinnedByDateKey[dateKey];
    const pinResolution = String(existingPin?._pinResolution || '').trim();
    if (
      existingPin &&
      String(existingPin.text ?? existingPin.body ?? '').trim() &&
      (pinResolution === 'notion_live' ||
        pinResolution === 'notion_schedule' ||
        pinResolution === 'backend_catalog')
    ) {
      return this._pinAndHydrateQuote(dateKey, existingPin);
    }

    const notionScheduled = await this._resolveQuotePreferringNotionSchedule(dateKey, {
      requireServer: requireLive
    });
    if (notionScheduled) {
      return this._pinAndHydrateQuote(dateKey, notionScheduled);
    }

    const isCurrentAppDate = dateKey === this.getQuoteCalendarKeyNow();
    if (this._pinnedByDateKey[dateKey] && (requireLive || isCurrentAppDate)) {
      await this.reconcilePinWithFirestoreAssignment(dateKey);
    }

    const existing = this._pinnedByDateKey[dateKey];
    if (existing) {
      if (existing._canonicalDailyDoc === true) {
        return this._pinAndHydrateQuote(dateKey, existing);
      }
      const refreshed = this._hydrateQuoteFromCatalog(existing);
      if (refreshed) {
        let merged = this._mergePinnedWithCatalogFields(refreshed, existing);
        if (requireLive || isCurrentAppDate) {
          const assignData = await this._readDailyQuoteAssignmentData(dateKey);
          if (assignData) {
            if (!this._assignmentMatchesPin(assignData, merged)) {
              const fromAssign = this._findQuoteFromAssignmentPayload(assignData);
              if (fromAssign) return this._pinAndHydrateQuote(dateKey, fromAssign);
            }
            const safeAssign = this._sanitizeAssignmentSpeakerSnapshots(assignData, merged.author, merged);
            merged = this._mergeAssignmentSpeakerCutout(merged, safeAssign);
          }
        }
        return this._pinAndHydrateQuote(dateKey, merged);
      }
      delete this._pinnedByDateKey[dateKey];
    }

    const cachedAssignment = this._readLocalAssignment(dateKey);
    // The assignment doc is canonical. For today's quote, use the cache only if Firestore
    // fails fast; that avoids showing a random fallback during transient offline mode.
    let data = requireLive || isCurrentAppDate ? null : cachedAssignment;
    if (window.db && window.firestore) {
      try {
        const readDoc = window.firestore.getDocFromServer || window.firestore.getDoc;
        const snap = await this._withTimeout(
          readDoc(window.firestore.doc(window.db, 'dailyQuoteAssignments', dateKey)),
          requireLive ? 8000 : isCurrentAppDate ? 1500 : 2200,
          `daily quote assignment ${dateKey}`
        );
        if (snap.exists()) data = { ...(data || {}), ...(snap.data() || {}) };
      } catch (e) {
        console.warn('⚠️ resolveAndPinCalendarKey assignment read failed:', e);
        if (!requireLive && isCurrentAppDate && cachedAssignment) data = cachedAssignment;
      }
    } else if (!requireLive && isCurrentAppDate && cachedAssignment) {
      data = cachedAssignment;
    }

    let quote = data ? await this._resolveQuoteFromDailyAssignmentServer(data, dateKey) : null;
    if (quote) {
      return this._pinAndHydrateQuote(dateKey, quote);
    }

    const hadAssignmentRow =
      !!data &&
      !!(data.sourceId || data.textSnapshot || data.authorSnapshot || data.text || data.author);

    // Legacy date-shaped quote docs are fallback only; stale clients have overwritten them before.
    if (!hadAssignmentRow && window.db && window.firestore) {
      try {
        const readQuoteDoc = requireLive
          ? window.firestore.getDocFromServer
          : window.firestore.getDocFromServer || window.firestore.getDoc;
        if (requireLive && typeof readQuoteDoc !== 'function') {
          return null;
        }
        const quoteSnap = await readQuoteDoc(window.firestore.doc(window.db, 'quotes', dateKey));
        if (quoteSnap.exists()) {
          const quoteData = quoteSnap.data() || {};
          const text = String(quoteData.text || '').trim();
          const author = String(quoteData.author || '').trim();
          if (text) {
            const blessing = this._blessingScalarFromPlainObject(quoteData).trim();
            const communityPrompt = String(quoteData.communityPrompt || quoteData.community_prompt || '').trim();
            const reflectionPrompt = String(quoteData.reflectionPrompt || quoteData.reflection_prompt || '').trim();
            const artRecsRaw = quoteData.art_recs ?? quoteData.artRecs;
            const artRecsUseful =
              artRecsRaw != null &&
              (typeof artRecsRaw === 'string'
                ? String(artRecsRaw).trim()
                : typeof artRecsRaw === 'object');
            const artRecsType = String(
              quoteData.art_recs_type ?? quoteData.artRecsType ?? ''
            ).trim().toLowerCase();
            const smallAct = String(quoteData.smallAct ?? quoteData.small_act ?? '').trim();
            const watchFor = String(
              quoteData.watch_for ??
                quoteData.watchFor ??
                quoteData.watch_for_snapshot ??
                quoteData.watchForSnapshot ??
                ''
            ).trim();
            const goodDay = String(quoteData.goodDay ?? quoteData.good_day ?? '').trim();
            const roughDay = String(quoteData.roughDay ?? quoteData.rough_day ?? '').trim();
            const igCaption = String(quoteData.igCaption ?? quoteData.ig_caption ?? '').trim();
            const fortune = String(quoteData.fortune ?? quoteData.Fortune ?? '').trim();
            const keyword = String(quoteData.keyword ?? quoteData.keywordSnapshot ?? '').trim();
            let firstLineCount = Number(quoteData.first_line_count ?? quoteData.firstLineCount);
            if (!Number.isFinite(firstLineCount) || firstLineCount <= 0) {
              firstLineCount = Number(quoteData.notionProperties?.first_line_count?.value);
            }
            const notificationText = String(
              quoteData.notificationText ?? quoteData.notification_text ?? ''
            ).trim();
            const speakerImageUrl = String(quoteData.speakerImageUrl ?? quoteData.speaker_image_url ?? '').trim();
            const speakerCutoutUrl = String(quoteData.speakerCutoutUrl ?? quoteData.speaker_cutout_url ?? '').trim();
            const speakerDates = String(quoteData.speakerDates ?? quoteData.speaker_dates ?? '').trim();
            const speakerBorn = String(quoteData.speakerBorn ?? quoteData.speaker_born ?? '').trim();
            const speakerDied = String(quoteData.speakerDied ?? quoteData.speaker_died ?? '').trim();
            const speakerGuideLine = String(quoteData.speakerGuideLine ?? quoteData.speaker_guide_line ?? '').trim();
            const speakerKeywords = String(quoteData.speakerKeywords ?? quoteData.speaker_keywords ?? '').trim();
            const imageAttribution = String(quoteData.imageAttribution ?? quoteData.image_attribution ?? '').trim();
            const canonical = {
              text,
              author,
              ...(blessing ? { blessing } : {}),
              ...(communityPrompt ? { communityPrompt, community_prompt: communityPrompt } : {}),
              ...(reflectionPrompt ? { reflectionPrompt, reflection_prompt: reflectionPrompt } : {}),
              ...(artRecsUseful ? { art_recs: artRecsRaw, artRecs: artRecsRaw } : {}),
              ...(artRecsType ? { art_recs_type: artRecsType, artRecsType } : {}),
              ...(smallAct ? { smallAct, small_act: smallAct } : {}),
              ...(watchFor ? { watch_for: watchFor } : {}),
              ...(goodDay ? { goodDay, good_day: goodDay } : {}),
              ...(roughDay ? { roughDay, rough_day: roughDay } : {}),
              ...(igCaption ? { igCaption, ig_caption: igCaption } : {}),
              ...(fortune ? { fortune } : {}),
              ...(keyword
                ? { keyword, keywordSnapshot: String(quoteData.keywordSnapshot ?? keyword).trim() }
                : {}),
              ...(Number.isFinite(firstLineCount) && firstLineCount > 0
                ? {
                    first_line_count: Math.round(firstLineCount),
                    firstLineCount: Math.round(firstLineCount)
                  }
                : {}),
              ...(notificationText
                ? { notificationText, notification_text: notificationText }
                : {}),
              ...(speakerImageUrl ? { speakerImageUrl, speaker_image_url: speakerImageUrl } : {}),
              ...(speakerCutoutUrl ? { speakerCutoutUrl, speaker_cutout_url: speakerCutoutUrl } : {}),
              ...(speakerDates ? { speakerDates, speaker_dates: speakerDates } : {}),
              ...(speakerBorn ? { speakerBorn, speaker_born: speakerBorn } : {}),
              ...(speakerDied ? { speakerDied, speaker_died: speakerDied } : {}),
              ...(speakerGuideLine ? { speakerGuideLine, speaker_guide_line: speakerGuideLine } : {}),
              ...(speakerKeywords ? { speakerKeywords, speaker_keywords: speakerKeywords } : {}),
              ...(imageAttribution ? { imageAttribution, image_attribution: imageAttribution } : {}),
              ...(quoteData.sourceId ? { sourceId: quoteData.sourceId } : {}),
              _canonicalDailyDoc: true
            };
            const hydrated = this._hydrateQuoteFromCatalog(canonical);
            const canonicalWithCatalogFields = hydrated ? { ...hydrated, ...canonical } : canonical;
            const merged = await this._pinAndHydrateQuote(dateKey, {
              ...canonicalWithCatalogFields,
              _canonicalDailyDoc: true
            });
            this._writeLocalAssignment(dateKey, {
              dateKey,
              sourceId: merged.sourceId || null,
              embeddedStableKey: merged.sourceId ? null : this._embeddedStableKey(merged),
              textSnapshot: String(merged.text || '').slice(0, 160),
              authorSnapshot: String(merged.author || '').slice(0, 120),
              communityPromptSnapshot: String(merged.communityPrompt ?? merged.community_prompt ?? '').slice(0, 500),
              smallActSnapshot: String(merged.smallAct ?? merged.small_act ?? '').slice(0, 240),
              watch_for_snapshot: String(merged.watch_for ?? '').slice(0, 280),
              goodDaySnapshot: String(merged.goodDay ?? merged.good_day ?? '').slice(0, 240),
              roughDaySnapshot: String(merged.roughDay ?? merged.rough_day ?? '').slice(0, 240),
              artRecsSnapshot: this._artRecsSnapshotValue(merged.artRecs ?? merged.art_recs).slice(0, 1200),
              artRecsTypeSnapshot: String(merged.artRecsType ?? merged.art_recs_type ?? '').slice(0, 40),
              speakerImageUrlSnapshot: String(merged.speakerImageUrl ?? merged.speaker_image_url ?? '').slice(0, 500),
              speakerCutoutUrlSnapshot: String(merged.speakerCutoutUrl ?? merged.speaker_cutout_url ?? '').slice(0, 500),
              speakerDatesSnapshot: String(merged.speakerDates ?? merged.speaker_dates ?? '').slice(0, 120),
              speakerBornSnapshot: String(merged.speakerBorn ?? merged.speaker_born ?? '').slice(0, 80),
              speakerDiedSnapshot: String(merged.speakerDied ?? merged.speaker_died ?? '').slice(0, 80),
              speakerGuideLineSnapshot: String(merged.speakerGuideLine ?? merged.speaker_guide_line ?? '').slice(0, 260),
              speakerKeywordsSnapshot: String(merged.speakerKeywords ?? merged.speaker_keywords ?? '').slice(0, 200),
              imageAttributionSnapshot: String(merged.imageAttribution ?? merged.image_attribution ?? '').slice(0, 260),
              assignedAt: new Date().toISOString(),
            });
            console.log(`📌 Using fallback quotes/${dateKey}: "${String(merged.text || '').slice(0, 50)}..."`);
            return merged;
          }
        }
      } catch (e) {
        console.warn('⚠️ resolveAndPinCalendarKey canonical quote read failed:', e);
      }
    }

    if (!quote && !requireLive) {
      const dayIndex = QuoteService._dayIndexFromCalendarKey(dateKey);
      const qi = this.shuffledIndexes[dayIndex % this.shuffledIndexes.length];
      quote = this.quotes[qi >= 0 && qi < this.quotes.length ? qi : 0];
      if (quote) await this.saveDayAssignment(dateKey, quote);
    }
    if (quote) {
      return this._pinAndHydrateQuote(dateKey, quote);
    }
    return quote;
  }

  /**
   * Quote for a specific quilt / instagram-storage day (YYYY-MM-DD): same resolution as
   * `dailyQuoteAssignments/{dateKey}` and `/api/generate-instagram` caption priority.
   * Do not use `getTodayQuote()` for Zapier assets when `dateKey` is explicit — it keys off “now”, not that day.
   */
  async getQuoteResolvedForInstagramDateKey(dateKey, options = {}) {
    const dk = String(dateKey || '').trim();
    const app = typeof window !== 'undefined' ? window.app : null;
    if (app?.isAdminTomorrowPreviewActive?.() && app?.getEffectiveAppDateKey?.() === dk) {
      const previewQuote = app.getEffectiveQuiltQuote?.();
      if (previewQuote?.text) return previewQuote;
    }
    if (!dk || !/^\d{4}-\d{2}-\d{2}$/.test(dk)) {
      return this.getTodayQuote();
    }
    if (!this.quotes?.length) {
      return this.getTodayQuote();
    }
    const requireLive = options?.requireLive === true;
    const isToday = dk === this.getQuoteCalendarKeyNow();
    const cached = this._pinnedByDateKey[dk];
    if (cached && String(cached.text ?? cached.body ?? '').trim()) {
      if (requireLive && isToday) {
        await this.reconcilePinWithFirestoreAssignment(dk);
        if (this._pinnedByDateKey[dk]) return this._pinnedByDateKey[dk];
      } else {
        return cached;
      }
    }
    if (!isToday || requireLive) {
      try {
        const fresh = await this.resolveQuoteForCalendarKeyFresh(dk);
        if (fresh?.quote?.text) return fresh.quote;
      } catch (e) {
        console.warn('getQuoteResolvedForInstagramDateKey fresh:', e?.message || e);
      }
    }
    try {
      const pinned = await this.resolveAndPinCalendarKey(dk, { requireLive });
      if (pinned) return pinned;
    } catch (e) {
      console.warn('getQuoteResolvedForInstagramDateKey:', e?.message || e);
    }
    const fallback = this.getQuoteForDate(dk);
    if (fallback) return fallback;
    return isToday ? this.getTodayQuote() : null;
  }

  _isApprovedNotionCatalogData(data) {
    if (!data || data.source !== 'notion') return false;
    const text = String(data.text || '').trim();
    const author = String(data.author || '').trim();
    if (!text || !author) return false;
    const approved =
      typeof data.approved === 'boolean'
        ? data.approved
        : typeof data.active === 'boolean'
          ? data.active
          : String(data.approved ?? data.active ?? '').trim().toLowerCase() !== 'false';
    return approved;
  }

  _normalizeScheduleDateKey(val) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(val || '').trim());
    return m ? m[1] : '';
  }

  /** Community/user submission vs editorial catalog row (submitted_via, submitted_by, submitted_at). */
  _scheduleEntryIsCommunitySubmission(entry) {
    const via = String(
      entry?.submittedVia ??
        entry?.submitted_via ??
        entry?.notionProperties?.submitted_via ??
        entry?.notionProperties?.submittedVia ??
        ''
    )
      .trim()
      .toLowerCase();
    if (via === 'app') return true;
    const by = String(
      entry?.submittedBy ??
        entry?.submitted_by ??
        entry?.notionProperties?.submitted_by ??
        entry?.notionProperties?.submittedBy ??
        ''
    ).trim();
    if (by) return true;
    const at = String(
      entry?.submittedAt ??
        entry?.submitted_at ??
        entry?.notionProperties?.submitted_at ??
        entry?.notionProperties?.submittedAt ??
        ''
    ).trim();
    return !!at;
  }

  /** When multiple catalog rows claim the same `date_scheduled`, editorial schedule beats community submissions. */
  _pickScheduleWinner(a, b) {
    if (!a) return b;
    if (!b) return a;
    const aCommunity = this._scheduleEntryIsCommunitySubmission(a);
    const bCommunity = this._scheduleEntryIsCommunitySubmission(b);
    if (aCommunity !== bCommunity) return aCommunity ? b : a;
    const aT = String(
      a.notionLastEditedTime || a.notionProperties?.notionLastEditedTime || ''
    ).trim();
    const bT = String(
      b.notionLastEditedTime || b.notionProperties?.notionLastEditedTime || ''
    ).trim();
    if (aT && bT && aT !== bT) return aT > bT ? a : b;
    if (aT && !bT) return a;
    if (bT && !aT) return b;
    const aId = String(a.sourceId || a.id || '').trim();
    const bId = String(b.sourceId || b.id || '').trim();
    return aId.localeCompare(bId) <= 0 ? a : b;
  }

  /** Scan in-memory catalog (after Firestore load) for Notion date_scheduled. */
  _findQuoteInLoadedCatalogByScheduledDate(dateKey) {
    const dk = String(dateKey || '').trim();
    if (!dk || !this.quotes?.length) return null;
    let winner = null;
    for (const q of this.quotes) {
      const ds = this._normalizeScheduleDateKey(q.date_scheduled || q.dateScheduled);
      if (ds !== dk) continue;
      const fresh = this._hydrateQuoteFromCatalog(q) || q;
      const candidate = {
        ...fresh,
        sourceId: String(fresh.sourceId || q.sourceId || '').trim() || undefined,
        notionLastEditedTime: String(q.notionLastEditedTime || '').trim() || undefined,
        submittedVia: String(q.submitted_via || q.submittedVia || '').trim() || undefined,
        submitted_via: String(q.submitted_via || q.submittedVia || '').trim() || undefined,
        submittedBy: String(q.submitted_by || q.submittedBy || '').trim() || undefined,
        submitted_by: String(q.submitted_by || q.submittedBy || '').trim() || undefined,
        submittedAt: String(q.submitted_at || q.submittedAt || '').trim() || undefined,
        submitted_at: String(q.submitted_at || q.submittedAt || '').trim() || undefined
      };
      winner = winner ? this._pickScheduleWinner(winner, candidate) : candidate;
    }
    return winner;
  }

  /** Notion `date_scheduled` on quotes/{notionPageId} — authoritative when assignment row is stale. */
  async _findQuoteCatalogByScheduledDateFromServer(dateKey) {
    const dk = String(dateKey || '').trim();
    if (!dk) return null;

    const local = this._findQuoteInLoadedCatalogByScheduledDate(dk);
    if (local) return local;

    if (!window.db || !window.firestore) return null;
    const whereFn = window.firestore.where;
    if (typeof whereFn !== 'function') {
      console.warn('⚠️ Firestore where() unavailable — reload app after deploy; trying catalog scan only');
      return null;
    }
    const readDocs = window.firestore.getDocsFromServer || window.firestore.getDocs;
    const col = window.firestore.collection(window.db, 'quotes');
    for (const field of ['date_scheduled', 'dateScheduled']) {
      try {
        const q = window.firestore.query(col, whereFn(field, '==', dk));
        const snap = await this._withTimeout(
          readDocs(q),
          8000,
          `quotes where ${field}=${dk}`
        );
        let chosen = null;
        let chosenEdited = '';
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          if (!this._isApprovedNotionCatalogData(data)) return;
          const built = this._buildQuoteFromCanonicalDocData({
            ...data,
            sourceId: String(data.sourceId || docSnap.id).trim()
          });
          if (!built) return;
          const edited = String(data.notionLastEditedTime || '').trim();
          if (!chosen) {
            chosen = {
              ...built,
              notionLastEditedTime: edited || undefined,
              submittedVia: String(data.submittedVia || data.submitted_via || '').trim() || undefined,
              submitted_via: String(data.submitted_via || data.submittedVia || '').trim() || undefined,
              submittedBy: String(data.submittedBy || data.submitted_by || '').trim() || undefined,
              submitted_by: String(data.submitted_by || data.submittedBy || '').trim() || undefined,
              submittedAt: String(data.submittedAt || data.submitted_at || '').trim() || undefined,
              submitted_at: String(data.submitted_at || data.submittedAt || '').trim() || undefined
            };
            chosenEdited = edited;
            return;
          }
          const winner = this._pickScheduleWinner(
            {
              ...chosen,
              notionLastEditedTime: chosenEdited || chosen.notionLastEditedTime,
              id: String(chosen.sourceId || '').trim()
            },
            {
              ...built,
              notionLastEditedTime: edited || undefined,
              submittedVia: String(data.submittedVia || data.submitted_via || '').trim() || undefined,
              submitted_via: String(data.submitted_via || data.submittedVia || '').trim() || undefined,
              submittedBy: String(data.submittedBy || data.submitted_by || '').trim() || undefined,
              submitted_by: String(data.submitted_by || data.submittedBy || '').trim() || undefined,
              submittedAt: String(data.submittedAt || data.submitted_at || '').trim() || undefined,
              submitted_at: String(data.submitted_at || data.submittedAt || '').trim() || undefined,
              id: String(built.sourceId || '').trim()
            }
          );
          chosen = winner;
          chosenEdited = String(winner?.notionLastEditedTime || edited || chosenEdited).trim();
        });
        if (chosen) return chosen;
      } catch (e) {
        console.warn(`⚠️ scheduled quote query (${field}=${dk}) failed:`, e?.message || e);
      }
    }
    try {
      const readDocs = window.firestore.getDocsFromServer || window.firestore.getDocs;
      const snap = await this._withTimeout(
        readDocs(col),
        10000,
        `quotes catalog scan for ${dk}`
      );
      let chosen = null;
      let chosenEdited = '';
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (!this._isApprovedNotionCatalogData(data)) return;
        const ds = this._normalizeScheduleDateKey(data.date_scheduled || data.dateScheduled);
        if (ds !== dk) return;
        const built = this._buildQuoteFromCanonicalDocData({
          ...data,
          sourceId: String(data.sourceId || docSnap.id).trim()
        });
        if (!built) return;
        const edited = String(data.notionLastEditedTime || '').trim();
        if (!chosen) {
          chosen = {
            ...built,
            notionLastEditedTime: edited || undefined,
            submittedVia: String(data.submittedVia || data.submitted_via || '').trim() || undefined,
            submitted_via: String(data.submitted_via || data.submittedVia || '').trim() || undefined,
            submittedBy: String(data.submittedBy || data.submitted_by || '').trim() || undefined,
            submitted_by: String(data.submitted_by || data.submittedBy || '').trim() || undefined,
            submittedAt: String(data.submittedAt || data.submitted_at || '').trim() || undefined,
            submitted_at: String(data.submitted_at || data.submittedAt || '').trim() || undefined
          };
          chosenEdited = edited;
          return;
        }
        const winner = this._pickScheduleWinner(
          {
            ...chosen,
            notionLastEditedTime: chosenEdited || chosen.notionLastEditedTime,
            id: String(chosen.sourceId || '').trim()
          },
          {
            ...built,
            notionLastEditedTime: edited || undefined,
            submittedVia: String(data.submittedVia || data.submitted_via || '').trim() || undefined,
            submitted_via: String(data.submitted_via || data.submittedVia || '').trim() || undefined,
            submittedBy: String(data.submittedBy || data.submitted_by || '').trim() || undefined,
            submitted_by: String(data.submitted_by || data.submittedBy || '').trim() || undefined,
            submittedAt: String(data.submittedAt || data.submitted_at || '').trim() || undefined,
            submitted_at: String(data.submitted_at || data.submittedAt || '').trim() || undefined,
            id: String(built.sourceId || '').trim()
          }
        );
        chosen = winner;
        chosenEdited = String(winner?.notionLastEditedTime || edited || chosenEdited).trim();
      });
      if (chosen) return chosen;
    } catch (e) {
      console.warn(`⚠️ scheduled quote catalog scan (${dk}) failed:`, e?.message || e);
    }
    return null;
  }

  /**
   * Admin preview: bypass stale pins/local cache and read Firestore assignment first.
   * @returns {Promise<{ quote: object|null, source: 'firestore'|'fallback', resolution: string }>}
   */
  async resolveQuoteForCalendarKeyFresh(dateKey) {
    const dk = String(dateKey || '').trim();
    if (!dk || !/^\d{4}-\d{2}-\d{2}$/.test(dk)) {
      return { quote: null, source: 'fallback', resolution: 'invalid-date' };
    }
    delete this._pinnedByDateKey[dk];
    this._clearLocalAssignmentCache(dk);

    let source = 'fallback';
    let resolution = 'fallback';
    let quote = null;

    if (typeof this.fetchPreviewQuoteForDateFromBackend === 'function') {
      const backend = await this.fetchPreviewQuoteForDateFromBackend(dk);
      if (backend?.quote?.text) {
        quote = backend.quote;
        source = 'firestore';
        resolution = backend.resolution || 'backend_catalog';
      }
    }

    if (!quote) {
      quote = await this._resolveQuotePreferringNotionSchedule(dk, {
        requireServer: true,
        assignTimeoutMs: 8000
      });
      if (quote) {
        source = 'firestore';
        resolution = 'notion_schedule';
      }
    }

    const assignData = quote
      ? null
      : await this._readDailyQuoteAssignmentFromServer(dk, 8000);
    if (!quote && assignData) {
      quote = await this._resolveQuoteFromDailyAssignmentServer(assignData, dk);
      if (
        quote &&
        (assignData.sourceId ||
          assignData.textSnapshot ||
          assignData.authorSnapshot ||
          assignData.text ||
          assignData.author)
      ) {
        source = 'firestore';
        resolution = 'assignment';
      }
    }
    if (!quote) {
      quote = await this.resolveAndPinCalendarKey(dk, { requireLive: true });
      if (quote) {
        source = 'firestore';
        resolution = 'assignment_resolve';
      }
    }
    let scheduleConfirmedEmpty = false;
    if (!quote && typeof this.fetchPreviewQuoteForDateFromBackend === 'function') {
      const backend = await this.fetchPreviewQuoteForDateFromBackend(dk);
      if (backend?.quote) {
        quote = backend.quote;
        source = 'firestore';
        resolution = backend.resolution || 'backend_catalog';
      } else if (backend?.resolution === 'not_found') {
        scheduleConfirmedEmpty = true;
      }
    }
    if (!quote && this.quotes?.length) {
      const dayIndex = QuoteService._dayIndexFromCalendarKey(dk);
      const qi = this.shuffledIndexes[dayIndex % this.shuffledIndexes.length];
      quote = this.quotes[qi >= 0 && qi < this.quotes.length ? qi : 0] || null;
      resolution = scheduleConfirmedEmpty ? 'no_schedule' : 'shuffled_index';
    }
    if (quote) {
      quote = (await this.hydrateMoodFieldsForCalendarKey(dk, quote)) || quote;
      quote = (await this._pinAndHydrateQuote(dk, quote)) || quote;
      if (quote && resolution) quote._pinResolution = resolution;
    }
    return { quote, source, resolution };
  }

  /** Admin preview: server-side catalog scan when client queries miss (ISO dates, stale indexes). */
  async fetchPreviewQuoteForDateFromBackend(dateKey) {
    const dk = String(dateKey || '').trim();
    const base = String(
      (typeof CONFIG !== 'undefined' && CONFIG.BACKEND?.baseUrl) ||
        (typeof window !== 'undefined' && window.location?.origin) ||
        ''
    )
      .trim()
      .replace(/\/$/, '');
    if (!dk || !base) return null;
    try {
      const res = await fetch(`${base}/api/preview-quote-for-date/${encodeURIComponent(dk)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.quote?.text) {
        return data && typeof data === 'object' ? data : null;
      }
      const q = data.quote;
      return {
        quote: {
          ...q,
          sourceId: String(q.sourceId || '').trim() || undefined
        },
        resolution: String(data.resolution || 'backend_catalog'),
        assignmentExists: data.assignmentExists === true
      };
    } catch (e) {
      console.warn('fetchPreviewQuoteForDateFromBackend failed:', e?.message || e);
      return null;
    }
  }

  async primeQuoteAssignmentsNearTerm() {
    if (!this.quotes?.length) return;
    const keys = [];
    for (let i = -1; i <= 7; i++) keys.push(this.getQuoteCalendarKeyUtc7FromAdjustedToday(i));
    await Promise.all(keys.map((k) => this.resolveAndPinCalendarKey(k)));
  }

  async setPinnedQuoteForCalendarKey(dateKey, quote) {
    if (!dateKey || !quote) return;
    const merged = await this._mergeBlessingFromDailyFirestoreDocs(dateKey, quote);
    this._pinnedByDateKey[dateKey] = merged;
    await this.saveDayAssignment(dateKey, merged);
  }

  getTodayQuote() {
    if (typeof window !== 'undefined' && window.app && window.app._liveDailyDataConfirmed !== true) {
      return null;
    }
    // Local layout-B tests only: 'short' | 'long' | null. Set null before commit (default).
    const FORCE_QUOTE_FOR_LAYOUT_TEST = null;
    if (FORCE_QUOTE_FOR_LAYOUT_TEST === 'short') {
      return { text: 'Creativity takes courage.', author: 'Henri Matisse' };
    }
    if (FORCE_QUOTE_FOR_LAYOUT_TEST === 'long') {
      return {
        text:
          'The true measure of our commitment to justice, the character of our society, our commitment to the rule of law, fairness, and equality cannot be measured by how we treat the rich, the powerful, the privileged, and the respected among us.',
        author: 'Bryan Stevenson',
      };
    }

    const todayKey = this.getQuoteCalendarKeyNow();
    const pinnedToday = this._pinnedByDateKey[todayKey];
    if (pinnedToday) {
      const fresh = this._hydrateQuoteFromCatalog(pinnedToday);
      if (fresh) {
        const merged = this._mergePinnedWithCatalogFields(fresh, pinnedToday);
        this._pinnedByDateKey[todayKey] = merged;
        return merged;
      }
      const orphanSid = String(pinnedToday.sourceId || '').trim();
      if (orphanSid && this.quotes?.length) {
        const stillInCatalog = this.quotes.some(
          (q) => String(q.sourceId || '').trim() === orphanSid
        );
        if (!stillInCatalog) {
          delete this._pinnedByDateKey[todayKey];
          this._clearLocalAssignmentCache(todayKey);
          console.warn(
            'getTodayQuote: dropped stale pin for removed catalog quote',
            orphanSid
          );
          return null;
        }
      }
      return pinnedToday;
    }

    console.debug('getTodayQuote: live daily confirmed but today is not pinned yet');
    return null;
  }

  getQuoteForDate(dateString) {
    // dateString format: "2025-08-18" (YYYY-MM-DD)
    if (dateString && this._pinnedByDateKey[dateString]) {
      const pinned = this._pinnedByDateKey[dateString];
      const fresh = this._hydrateQuoteFromCatalog(pinned);
      if (fresh) {
        const merged = this._mergePinnedWithCatalogFields(fresh, pinned);
        this._pinnedByDateKey[dateString] = merged;
        return merged;
      }
      return pinned;
    }

    // dateString format: "2025-08-18" - assumes UTC date
    const date = new Date(dateString);
    const dayIndex = Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
    const quoteIndex = this.shuffledIndexes[dayIndex % this.shuffledIndexes.length];
    
    // Safety check: ensure quoteIndex is valid
    if (quoteIndex >= this.quotes.length || quoteIndex < 0) {
      console.warn(`⚠️ Invalid quoteIndex ${quoteIndex} for ${this.quotes.length} quotes. Using fallback index.`);
      // Use modulo fallback instead of regenerating (which is async)
      const fallbackIndex = quoteIndex % this.quotes.length;
      console.log(`🔍 getQuoteForDate: ${dateString} (UTC) → dayIndex: ${dayIndex} → quoteIndex: ${fallbackIndex} (fallback) → quote: "${this.quotes[fallbackIndex].text.substring(0, 50)}..."`);
      return this.quotes[fallbackIndex];
    }
    
    console.log(`🔍 getQuoteForDate: ${dateString} (UTC) → dayIndex: ${dayIndex} → quoteIndex: ${quoteIndex} → quote: "${this.quotes[quoteIndex].text.substring(0, 50)}..."`);
    
    return this.quotes[quoteIndex];
  }

  offsetQuoteCalendarKey(dateKey, dayOffset) {
    const dk = String(dateKey || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return dk;
    const parts = dk.split('-').map((n) => parseInt(n, 10));
    const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    dt.setUTCDate(dt.getUTCDate() + (dayOffset | 0));
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getAdjacentQuotesForClipping() {
    const yKey = this.getQuoteCalendarKeyUtc7FromAdjustedToday(-1);
    const tKey = this.getQuoteCalendarKeyUtc7FromAdjustedToday(1);
    return {
      yesterday: this.getQuoteForDate(yKey),
      tomorrow: this.getQuoteForDate(tKey),
    };
  }

  async getAdjacentQuotesForClippingDateKey(centerKey) {
    const ck = String(centerKey || this.getQuoteCalendarKeyNow() || '').trim();
    const yKey = this.offsetQuoteCalendarKey(ck, -1);
    const tKey = this.offsetQuoteCalendarKey(ck, 1);
    const [yesterday, today, tomorrow] = await Promise.all([
      this.getQuoteResolvedForInstagramDateKey(yKey),
      this.getQuoteResolvedForInstagramDateKey(ck),
      this.getQuoteResolvedForInstagramDateKey(tKey),
    ]);
    return { yesterday, today, tomorrow };
  }

  /** Clamp / extend shuffled day→quote indexes when catalog size changes. */
  _normalizeShuffledIndexesForCatalog(indexes) {
    const len = this.quotes.length;
    if (!len) return [];
    const seed = Array.isArray(indexes) && indexes.length ? indexes : this.shuffledIndexes;
    let normalized = seed
      .map((i) => Number(i))
      .filter((i) => Number.isFinite(i))
      .map((i) => ((i % len) + len) % len);
    if (!normalized.length) {
      normalized = Array.from({ length: len }, (_, i) => i);
      for (let i = normalized.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [normalized[i], normalized[j]] = [normalized[j], normalized[i]];
      }
    }
    const minIndexes = Math.max(100, len * 2);
    while (normalized.length < minIndexes) {
      normalized.push(Math.floor(Math.random() * len));
    }
    return normalized;
  }

  async regenerateShuffledIndexes(options = {}) {
    const requireServer = options.requireServer === true;
    let serverReachable = false;
    // Try to load existing shuffled indexes from Firestore first
    try {
      if (window.firebaseApp) {
        const { getFirestore, doc, getDoc, getDocFromServer } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const db = getFirestore(window.firebaseApp);
        const quoteAssignmentsRef = doc(db, 'quoteAssignments', 'dailyQuotes');
        const readDoc = requireServer && typeof getDocFromServer === 'function' ? getDocFromServer : getDoc;
        const docSnap = await this._withTimeout(
          readDoc(quoteAssignmentsRef),
          requireServer ? 8000 : 1500,
          'Firestore shuffled quote indexes read'
        );
        serverReachable = true;

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (Array.isArray(data.shuffledIndexes) && data.shuffledIndexes.length) {
            if (data.quotesLength === this.quotes.length) {
              this.shuffledIndexes = data.shuffledIndexes;
              console.log(`📁 Loaded shuffled indexes from Firestore: ${this.shuffledIndexes.length} indexes for ${this.quotes.length} quotes`);
              return requireServer ? true : undefined;
            }
            console.warn(
              `⚠️ Shuffled indexes stale (server quotesLength ${data.quotesLength} != catalog ${this.quotes.length}); remapping and saving…`
            );
            this.shuffledIndexes = this._normalizeShuffledIndexesForCatalog(data.shuffledIndexes);
            await this.saveShuffledIndexes();
            console.log(`🔄 Remapped shuffled indexes: ${this.shuffledIndexes.length} indexes for ${this.quotes.length} quotes`);
            return requireServer ? true : undefined;
          }
          console.warn('⚠️ quoteAssignments/dailyQuotes exists but has no shuffledIndexes; regenerating…');
        } else {
          console.warn('⚠️ quoteAssignments/dailyQuotes missing; regenerating…');
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to load shuffled indexes from Firestore:', error);
      if (requireServer) return false;
    }

    if (requireServer && !serverReachable) {
      console.warn('⚠️ Shuffled quote indexes unavailable from server; refusing client-side regeneration');
      return false;
    }

    if (!requireServer) {
      const savedIndexes = localStorage.getItem('quiltShuffledIndexes');
      const savedQuotesLength = localStorage.getItem('quiltQuotesLength');
      if (savedIndexes && savedQuotesLength && parseInt(savedQuotesLength) === this.quotes.length) {
        try {
          this.shuffledIndexes = JSON.parse(savedIndexes);
          console.log(`📁 Loaded shuffled indexes from localStorage (fallback): ${this.shuffledIndexes.length} indexes for ${this.quotes.length} quotes`);
          return;
        } catch (e) {
          console.warn('⚠️ Failed to parse saved shuffled indexes, regenerating...');
        }
      }
    } else {
      console.warn('⚠️ Repairing shuffled indexes on server…');
    }
    
    // Create a new shuffled array of indexes based on the current quotes array length
    const indexes = Array.from({ length: this.quotes.length }, (_, i) => i);
    
    // Shuffle the indexes using Fisher-Yates algorithm
    for (let i = indexes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
    }
    
    // Extend the shuffled array to ensure we have enough indexes for future dates
    // Use a dynamic minimum based on quotes array size to ensure scalability
    const minIndexes = Math.max(100, this.quotes.length * 2); // At least 100, or 2x quotes array size
    const targetLength = Math.max(minIndexes, indexes.length * 2);
    while (indexes.length < targetLength) {
      const randomIndex = Math.floor(Math.random() * this.quotes.length);
      indexes.push(randomIndex);
    }
    
    // Ensure all indexes are valid (less than quotes.length)
    this.shuffledIndexes = indexes.map(index => index % this.quotes.length);
    
    // Save to Firestore (and localStorage as fallback)
    await this.saveShuffledIndexes();
    
    console.log(`🔄 Regenerated shuffled indexes: ${this.shuffledIndexes.length} indexes for ${this.quotes.length} quotes`);
    return requireServer ? true : undefined;
  }

  async saveShuffledIndexes() {
    // Save to Firestore (primary) and localStorage (fallback)
    try {
      if (window.firebaseApp) {
        const { getFirestore, doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const db = getFirestore(window.firebaseApp);
        const quoteAssignmentsRef = doc(db, 'quoteAssignments', 'dailyQuotes');
        
        await setDoc(quoteAssignmentsRef, {
          shuffledIndexes: this.shuffledIndexes,
          quotesLength: this.quotes.length,
          lastUpdated: new Date().toISOString()
        });
        
        console.log(`💾 Saved shuffled indexes to Firestore: ${this.shuffledIndexes.length} indexes for ${this.quotes.length} quotes`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to save to Firestore, using localStorage fallback:', error);
    }
    
    // Always save to localStorage as fallback
    localStorage.setItem('quiltShuffledIndexes', JSON.stringify(this.shuffledIndexes));
    localStorage.setItem('quiltQuotesLength', this.quotes.length.toString());
    console.log(`💾 Saved shuffled indexes to localStorage (fallback): ${this.shuffledIndexes.length} indexes for ${this.quotes.length} quotes`);
  }

  /** Same quote/author as the quote screen uses (today’s pinned / shuffled quote). */
  getQuoteScreenPreviewContent() {
    const previewQuote =
      typeof window !== 'undefined' && window.app?.isAdminTomorrowPreviewActive?.()
        ? window.app.getEffectiveQuiltQuote?.()
        : null;
    if (previewQuote?.text) {
      return {
        activeQuote: previewQuote,
        text: String(previewQuote.text ?? previewQuote.body ?? '').trim(),
        author: String(previewQuote.author ?? '').trim()
      };
    }
    let activeQuote = null;
    if (typeof window !== 'undefined' && window.app && window.app._liveDailyDataConfirmed === true) {
      activeQuote = this.getTodayQuote();
    } else {
      this.primeTodayQuoteFromLocalAssignment();
      const todayKey = this.getQuoteCalendarKeyNow();
      const pinned = todayKey ? this._pinnedByDateKey[todayKey] : null;
      activeQuote = pinned ? this._hydrateQuoteFromCatalog(pinned) : null;
    }
    return {
      activeQuote,
      text: String(activeQuote?.text ?? activeQuote?.body ?? '').trim(),
      author: String(activeQuote?.author ?? '').trim()
    };
  }

  /**
   * Coalesce quote-screen clipping paints so rapid displayQuote calls don't flash plain text then remount.
   */
  _revealQuoteLayoutBStage() {
    const clipping = document.querySelector('#screen-quote .quote-screen-clipping');
    if (clipping?.classList.contains('quote-screen-clipping--ready')) {
      void clipping.offsetHeight;
    }
  }

  _markQuoteLayoutBPortalSettlePending() {
    this._quoteLayoutBPortalSettlePending = true;
  }

  _scheduleQuoteLayoutBSettleRecenter(source = 'scheduled') {
    this._quoteLayoutBSettleSource = source;
    if (this._quoteLayoutBSettleRaf) return;
    this._quoteLayoutBSettleRaf = requestAnimationFrame(() => {
      this._quoteLayoutBSettleRaf = 0;
      requestAnimationFrame(() => {
        const src = this._quoteLayoutBSettleSource || source;
        this._quoteLayoutBSettleSource = '';
        this._recenterQuoteScreenLayoutBStage(src);
      });
    });
  }

  _recenterQuoteScreenLayoutBStage(source = 'manual') {
    const quoteCard = document.querySelector('#screen-quote .quote-card');
    const stage = quoteCard?.querySelector(':scope > .quote-layoutb-stage');
    if (!quoteCard || !stage) return null;
    void stage.offsetHeight;
    void quoteCard.offsetHeight;
    const cardRect = quoteCard.getBoundingClientRect();
    let minScreen = Infinity;
    let maxScreen = -Infinity;
    stage.querySelectorAll('.quote-layoutb-strip').forEach((el) => {
      const r = el.getBoundingClientRect();
      minScreen = Math.min(minScreen, r.left);
      maxScreen = Math.max(maxScreen, r.right);
    });
    if (!Number.isFinite(minScreen)) return null;
    const clusterCenter = (minScreen + maxScreen) / 2;
    const cardCenter = cardRect.left + cardRect.width / 2;
    let nudgeX = cardCenter - clusterCenter;
    const maxW = Math.max(1, cardRect.width - 4);
    const clusterW = maxScreen - minScreen;
    const clipRightPx = maxScreen - cardRect.right;
    const clipLeftPx = cardRect.left - minScreen;
    let scaleExtra = clusterW > maxW + 8 || clipRightPx > 2 || clipLeftPx > 2 ? maxW / clusterW : 1;
    if (maxScreen + nudgeX > cardRect.right - 2) nudgeX = cardRect.right - 2 - maxScreen;
    if (minScreen + nudgeX < cardRect.left + 2) nudgeX = cardRect.left + 2 - minScreen;
    let nextTransform = '';
    if (scaleExtra < 0.985) {
      const parts = [];
      if (Math.abs(nudgeX) >= 2) parts.push(`translateX(${nudgeX.toFixed(2)}px)`);
      parts.push(`scale(${scaleExtra.toFixed(4)})`);
      nextTransform = parts.join(' ');
    } else if (Math.abs(nudgeX) >= 2) {
      nextTransform = `translateX(${nudgeX.toFixed(2)}px)`;
    }
    const prevTransform = stage.style.transform || '';
    if (prevTransform !== nextTransform) {
      if (nextTransform && scaleExtra < 0.985) {
        stage.style.transformOrigin = '50% 50%';
        stage.style.transform = nextTransform;
      } else {
        stage.style.transformOrigin = '';
        stage.style.transform = nextTransform;
      }
    }
    return { nudgeX, scaleExtra, clusterCenter, cardCenter, clusterW };
  }

  _ensureQuoteLayoutBFontRecenterHook() {
    if (this._quoteLayoutBFontRecenterHook) return;
    this._quoteLayoutBFontRecenterHook = true;
    const run = () => {
      if (!document.getElementById('screen-quote')?.classList.contains('active')) return;
      if (this._quoteLayoutBPortalSettlePending) return;
      this._scheduleQuoteLayoutBSettleRecenter('fonts-ready');
    };
    if (document.fonts?.ready) {
      document.fonts.ready.then(run).catch(() => {});
    }
    document.fonts?.addEventListener?.('loadingdone', run, { once: true });
  }

  _queueQuoteScreenLayoutBPaint(text, author) {
    this._pendingQuoteScreenLayoutB = {
      text: String(text || '').trim(),
      author: String(author || '').trim()
    };
    if (this._quoteScreenLayoutBPaintRaf) {
      cancelAnimationFrame(this._quoteScreenLayoutBPaintRaf);
    }
    this._quoteScreenLayoutBPaintRaf = requestAnimationFrame(() => {
      this._quoteScreenLayoutBPaintRaf = 0;
      this._flushQuoteScreenLayoutBPaint(0);
    });
  }

  _flushQuoteScreenLayoutBPaint(retry = 0) {
    const pending = this._pendingQuoteScreenLayoutB;
    if (!pending) return;
    const screenEl = document.getElementById('screen-quote');
    const card = document.querySelector('#screen-quote .quote-card');
    const active = !!screenEl?.classList.contains('active');
    const cardW = card?.clientWidth || 0;
    if (!active || !card) {
      if (retry < 30) {
        this._quoteScreenLayoutBPaintRaf = requestAnimationFrame(() => {
          this._quoteScreenLayoutBPaintRaf = 0;
          this._flushQuoteScreenLayoutBPaint(retry + 1);
        });
      } else {
        this._quoteScreenLayoutBPaintNeedsActiveFlush = true;
      }
      return;
    }
    this._quoteScreenLayoutBPaintNeedsActiveFlush = false;

    if (cardW < 80 && retry < 20) {
      this._quoteScreenLayoutBPaintRaf = requestAnimationFrame(() => {
        this._quoteScreenLayoutBPaintRaf = 0;
        this._flushQuoteScreenLayoutBPaint(retry + 1);
      });
      return;
    }

    const clippingReady = this._quoteScreenClippingReady(card);
    this._pendingQuoteScreenLayoutB = null;
    if (this._shouldSkipQuoteScreenLayoutBRebuild(pending.text, pending.author, clippingReady)) {
      this._revealQuoteLayoutBStage();
      window.app?.notifyQuoteScreenLayoutBPainted?.();
      return;
    }

    void this._rebuildLayoutBQuoteCardStage(pending.text, pending.author);
  }

  _flushDeferredQuoteScreenLayoutBPaintIfNeeded() {
    if (!this._quoteScreenLayoutBPaintNeedsActiveFlush || !this._pendingQuoteScreenLayoutB) return;
    if (!document.getElementById('screen-quote')?.classList.contains('active')) return;
    this._flushQuoteScreenLayoutBPaint(0);
  }

  /**
   * Rebuild quote clipping using current wrapper width. Call after #screen-quote is visible —
   * displayQuote() runs at init while the screen is display:none, so clientWidth was wrong until now.
   */
  scheduleQuoteLayoutBPreviewLayoutRefresh(force = false) {
    if (force) {
      this.forceRefreshQuoteScreenLayoutBFromTuneSave();
      return;
    }
    const { text, author } = this.getQuoteScreenPreviewContent();
    this._queueQuoteScreenLayoutBPaint(text, author);
  }

  forceRefreshQuoteScreenLayoutBFromTuneSave() {
    this.invalidateQuoteScreenLayoutBTunePaint();
    const { text, author } = this.getQuoteScreenPreviewContent();
    const trimmedText = String(text || '').trim();
    const trimmedAuthor = String(author || '').trim();
    if (!trimmedText) return;
    const quoteScreenActive = document.getElementById('screen-quote')?.classList.contains('active');
    const cardW = document.querySelector('#screen-quote .quote-card')?.clientWidth || 0;
    if (quoteScreenActive && cardW >= 80) {
      void this._rebuildLayoutBQuoteCardStage(trimmedText, trimmedAuthor, { forceTuneRebuild: true });
      return;
    }
    this._pendingQuoteScreenLayoutB = { text: trimmedText, author: trimmedAuthor };
    this._quoteScreenLayoutBPaintNeedsActiveFlush = true;
    this._flushDeferredQuoteScreenLayoutBPaintIfNeeded();
  }

  _readPortalGreetingBasePx() {
    const portal = document.getElementById('screen-portal');
    if (!portal) return 25;
    const raw = getComputedStyle(portal).getPropertyValue('--portal-greeting-base-size').trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : 25;
  }

  /**
   * Mount Layout B paper strips into a host `.quote-card` (quote screen or reflection).
   * Same plan + scaling rules as the daily quote screen.
   */
  async _mountLayoutBQuoteStrips(quoteCard, text, author, options = {}) {
    if (!quoteCard || typeof getLayoutBStoryQuotePlan !== 'function') return;

    const stage = document.createElement('div');
    stage.className = 'quote-layoutb-stage';
    stage.style.transform = '';
    const planW = 1080;
    const planH = 1920;
    let strips;
    if (options.portalGreeting) {
      // Keep returning portal greeting on one strip/line.
      const greetingText = String(text || '').trim().replace(/\s+/g, ' ');
      const measureCanvas = document.createElement('canvas');
      const measureCtx = measureCanvas.getContext('2d');
      const portalGreetingScale = 1.1;
      const portalGreetingMinPx = this._readPortalGreetingBasePx();
      const greetingFontPx = Math.round(74 * portalGreetingScale);
      const greetingLh = Math.round(greetingFontPx * 1.2);
      measureCtx.font = `400 ${greetingFontPx}px Georgia, "Times New Roman", Times, serif`;
      const greetingCardCS = window.getComputedStyle(quoteCard);
      const greetingCardPadX =
        (parseFloat(greetingCardCS.paddingLeft) || 0) + (parseFloat(greetingCardCS.paddingRight) || 0);
      const greetingStageW = Math.max(220, (quoteCard.clientWidth || 0) - greetingCardPadX);
      const maxSingleLinePx = Math.max(150, greetingStageW - 24);
      let greetingLines = [greetingText];
      const measured = Math.ceil(measureCtx.measureText(greetingText || ' ').width);
      if (measured > maxSingleLinePx) {
        const words = greetingText.split(/\s+/).filter(Boolean);
        // Prefer moving only the name to line 2 when possible.
        const commaIdx = greetingText.lastIndexOf(',');
        const trySetSplit = (left, right) => {
          const l = String(left || '').trim();
          const r = String(right || '').trim();
          if (!l || !r) return false;
          const wLeft = measureCtx.measureText(l).width;
          const wRight = measureCtx.measureText(r).width;
          if (wLeft <= maxSingleLinePx && wRight <= maxSingleLinePx) {
            greetingLines = [l, r];
            return true;
          }
          return false;
        };

        let didSplit = false;
        if (commaIdx > 0 && commaIdx < greetingText.length - 1) {
          const lead = greetingText.slice(0, commaIdx).trim();
          const tail = greetingText.slice(commaIdx + 1).trim();
          // Prefer name-on-second-line split whenever a comma form exists.
          greetingLines = [lead, tail];
          didSplit = true;
        }

        // Fallback: move only final token (likely name) to line 2.
        if (!didSplit && words.length > 1) {
          const lead = words.slice(0, -1).join(' ');
          const tail = words[words.length - 1];
          greetingLines = [lead, tail];
          didSplit = true;
        }

        // For 3+ words, also prefer [all-but-last-two] / [last-two] before broader balancing.
        if (!didSplit && words.length >= 3) {
          const lead = words.slice(0, -2).join(' ');
          const tail = words.slice(-2).join(' ');
          didSplit = trySetSplit(lead, tail);
        }

        // Final fallback: balanced two-line split.
        if (!didSplit && words.length > 1) {
          let best = null;
          for (let i = 1; i < words.length; i++) {
            const left = words.slice(0, i).join(' ');
            const right = words.slice(i).join(' ');
            const wLeft = measureCtx.measureText(left).width;
            const wRight = measureCtx.measureText(right).width;
            const widest = Math.max(wLeft, wRight);
            const balance = Math.abs(wLeft - wRight);
            const overflowPenalty = Math.max(0, widest - maxSingleLinePx) * 8;
            const score = balance + overflowPenalty;
            if (!best || score < best.score) {
              best = { left, right, score };
            }
          }
          if (best) greetingLines = [best.left, best.right];
        }
      }
      /* Returning portal: split "Salutation, Name" onto two strips when both fit so the name can use its own typography. */
      if (greetingLines.length === 1) {
        const commaPortal = greetingText.lastIndexOf(',');
        if (commaPortal > 0 && commaPortal < greetingText.length - 1) {
          const leadPortal = greetingText.slice(0, commaPortal).trim();
          const tailPortal = greetingText.slice(commaPortal + 1).trim();
          if (leadPortal && tailPortal) {
            const wLeadPortal = measureCtx.measureText(leadPortal).width;
            const wTailPortal = measureCtx.measureText(tailPortal).width;
            if (wLeadPortal <= maxSingleLinePx && wTailPortal <= maxSingleLinePx) {
              greetingLines = [leadPortal, tailPortal];
            }
          }
        }
      }
      const lineWidths = greetingLines.map((ln) =>
        Math.ceil(measureCtx.measureText(ln || ' ').width)
      );
      const stripFont = `400 ${greetingFontPx}px Georgia, "Times New Roman", Times, serif`;
      const stripH = Math.max(94, Math.round((greetingLh + 34) * portalGreetingScale));
      const lineGap = Math.round(12 * portalGreetingScale);
      const clusterH =
        greetingLines.length * stripH + Math.max(0, greetingLines.length - 1) * lineGap;
      const clusterTopY = planH / 2 - clusterH / 2;
      strips = greetingLines.map((line, idx) => ({
        lines: [line],
        role: 'quote',
        font: stripFont,
        lh: greetingLh,
        w: Math.min(980, Math.max(260, Math.round((lineWidths[idx] + 78) * portalGreetingScale))),
        h: stripH,
        x: planW / 2,
        y: Math.round(clusterTopY + idx * (stripH + lineGap) + stripH / 2),
        angle: idx % 2 === 0 ? -0.015 : 0.01,
        isPortalGreetingLead: greetingLines.length > 1 && idx === 0,
        isPortalNameLine: greetingLines.length > 1 && idx === greetingLines.length - 1
      }));
    } else {
      const dateKey =
        options.dateKey ||
        (typeof window !== 'undefined' && window.app?.quoteService?.getQuoteCalendarKeyNow
          ? window.app.quoteService.getQuoteCalendarKeyNow()
          : Utils.getTodayKey());
      let keywordEmphasis;
      if (Object.prototype.hasOwnProperty.call(options, 'keywordEmphasis')) {
        keywordEmphasis = options.keywordEmphasis;
      } else if (options.skipAsyncLayoutBFetches) {
        keywordEmphasis = odqGetCachedLayoutBKeywordEmphasis(dateKey) || null;
      } else {
        keywordEmphasis = await odqReadLayoutBKeywordEmphasis(dateKey).catch(() => null);
      }
      let stripLayoutSeed = options.stripLayoutSeed;
      if (stripLayoutSeed == null) {
        if (options.skipAsyncLayoutBFetches) {
          stripLayoutSeed = odqGetCachedLayoutBStripLayoutSeed(dateKey) ?? 0;
        } else {
          stripLayoutSeed =
            odqGetCachedLayoutBStripLayoutSeed(dateKey) ??
            (await odqReadLayoutBStripLayoutSeed(dateKey).catch(() => 0));
        }
      }
      strips = getLayoutBStoryQuotePlan(document.createElement('canvas').getContext('2d'), {
        quoteText: String(text || '').trim(),
        quoteAuthor: String(author || '').trim(),
        layoutW: planW,
        layoutH: planH,
        dateKey,
        usePostQuoteLayout: true,
        keywordEmphasis,
        stripLayoutSeed: odqNormalizeStripLayoutSeed(stripLayoutSeed),
        skipKeywordEmphasis: !!options.portalGreeting
      });
    }
    if (options.portalGreeting && options.portalGreetingAsName && strips.length === 1) {
      strips[0].isPortalNameLine = true;
    }
    if (!options.portalGreeting && strips.length) {
      const measureCtx = document.createElement('canvas').getContext('2d');
      strips = refitLayoutBStripPlanToText(strips, measureCtx, 980, ODQ_CANVAS_SERIF_FONT);
    }
    const padX = 10;
    const padY = 10;
    const minLeft = Math.min(...strips.map((s) => Number(s.x || 0) - Number(s.w || 0) / 2));
    const maxRight = Math.max(...strips.map((s) => Number(s.x || 0) + Number(s.w || 0) / 2));
    const minTop = Math.min(...strips.map((s) => Number(s.y || 0) - Number(s.h || 0) / 2));
    const maxBottom = Math.max(...strips.map((s) => Number(s.y || 0) + Number(s.h || 0) / 2));
    const contentW = Math.max(220, (maxRight - minLeft) + padX * 2);
    const contentH = Math.max(170, (maxBottom - minTop) + padY * 2);
    const cardCS = window.getComputedStyle(quoteCard);
    const cardPadX =
      (parseFloat(cardCS.paddingLeft) || 0) + (parseFloat(cardCS.paddingRight) || 0);
    const cardBoxW = quoteCard.clientWidth || 0;
    const stageW = Math.max(220, cardBoxW - cardPadX);
    const preferFullWidth =
      ((options.preferFullWidthScale == null
        ? (
        quoteCard.id === 'reflection-quote-layoutb-card' ||
          quoteCard.id === 'portal-greeting-layoutb-card'
        )
        : options.preferFullWidthScale === true)) &&
      !options.portalGreeting;
    const maxStageH = preferFullWidth
      ? Math.max(560, window.innerHeight * 0.92)
      : Math.max(240, window.innerHeight * 0.72);
    let yScale = Math.min(stageW / contentW, maxStageH / Math.max(1, contentH));
    let xScale = stageW / contentW;
    if (Number.isFinite(options.scaleMultiplier) && options.scaleMultiplier > 0) {
      yScale *= options.scaleMultiplier;
      xScale *= options.scaleMultiplier;
    }
    if (!options.portalGreeting && options.capNormalQuoteScale !== false) {
      let maxBaseQuoteFont = 0;
      for (const s of strips) {
        if (s.role !== 'quote' || s.isKeywordEmphasis) continue;
        const fontPxMatch = /(\d+)px/.exec(String(s.font || ''));
        const base = fontPxMatch ? parseInt(fontPxMatch[1], 10) : 16;
        maxBaseQuoteFont = Math.max(maxBaseQuoteFont, base);
      }
      const maxNormalQuoteFontPx = 22;
      if (maxBaseQuoteFont * yScale > maxNormalQuoteFontPx) {
        const shrink = maxNormalQuoteFontPx / (maxBaseQuoteFont * yScale);
        yScale *= shrink;
        xScale *= shrink;
      }
    }
    if (options.portalGreeting) {
      const portalGreetingMinPx = this._readPortalGreetingBasePx();
      const targetMaxFont = portalGreetingMinPx;
      let maxStripFont = 0;
      for (const s of strips) {
        const fontPxMatch = /(\d+)px/.exec(String(s.font || ''));
        const base = fontPxMatch ? parseInt(fontPxMatch[1], 10) : 16;
        maxStripFont = Math.max(maxStripFont, base * yScale);
      }
      if (maxStripFont > targetMaxFont && maxStripFont > 0) {
        const shrink = targetMaxFont / maxStripFont;
        yScale *= shrink;
        xScale *= shrink;
      }
    }
    const scale = Math.min(xScale, yScale);
    const stageH = contentH * scale;
    stage.style.width = `${stageW}px`;
    stage.style.height = `${stageH}px`;
    quoteCard.style.height = '';
    quoteCard.style.minHeight = '';
    const cx = (minLeft + maxRight) / 2;
    const cy = (minTop + maxBottom) / 2;
    const LBKE = globalThis.LayoutBKeywordEmphasis;
    let visualMinL = Infinity;
    let visualMaxR = -Infinity;
    for (const s of strips) {
      const el = document.createElement('div');
      const lines = Array.isArray(s.lines) && s.lines.length ? s.lines : [String(s.text || '').trim()];
      const escStrip = (t) => String(t || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      let portalInlineNameClass = '';
      let innerHtml =
        LBKE && typeof LBKE.renderLayoutBStripInnerHtml === 'function' && !options.portalGreeting
          ? LBKE.renderLayoutBStripInnerHtml(s)
          : lines.map((ln) => escStrip(ln)).join('<br>');
      if (options.portalGreeting && lines.length === 1) {
        const one = lines[0];
        const ci = one.lastIndexOf(',');
        if (ci > 0 && ci < one.length - 1) {
          const lead = one.slice(0, ci).trim();
          const tail = one.slice(ci + 1).trim();
          if (lead && tail) {
            innerHtml = `<span class="portal-greeting-lead">${escStrip(lead)},</span> <span class="portal-greeting-name">${escStrip(tail)}</span>`;
            portalInlineNameClass = ' quote-layoutb-strip--portal-greeting-inline-name';
          }
        }
      }
      el.className = `quote-layoutb-strip${s.role === 'author' ? ' quote-layoutb-strip--author' : ''}${
        options.speakerAuthorInvert && s.role === 'author' ? ' quote-layoutb-strip--author-inverted' : ''
      }${
        s.isKeywordEmphasis ? ' quote-layoutb-strip--keyword-emphasis' : ''
      }${s.isPortalGreetingLead ? ' quote-layoutb-strip--portal-greeting-lead' : ''}${
        s.isPortalNameLine ? ' quote-layoutb-strip--portal-name' : ''
      }${portalInlineNameClass}`;
      el.innerHTML = innerHtml;
      const localX = (stageW / 2) + ((Number(s.x || 0) - cx) * scale);
      const localY = (stageH / 2) + ((Number(s.y || 0) - cy) * scale);
      let wPx = Math.max(20, Number(s.w || 20) * scale);
      let hPx = Math.max(20, Number(s.h || 20) * scale);
      let lhPx = Math.max(1, Number(s.lh || 0) * scale);
      const fontPxMatch = /(\d+)px/.exec(String(s.font || ''));
      const minStripFontPx = options.portalGreeting ? this._readPortalGreetingBasePx() : 10;
      let fontPx = fontPxMatch
        ? Math.max(minStripFontPx, parseInt(fontPxMatch[1], 10) * scale)
        : Math.max(minStripFontPx, 16 * scale);
      fontPx = Math.max(minStripFontPx, Math.round(fontPx));
      if (options.portalGreeting && s.isPortalNameLine) {
        fontPx = Math.max(minStripFontPx, Math.round(fontPx * 2));
        lhPx = Math.max(1, Math.round(lhPx * 2));
        hPx = Math.max(hPx, Math.round(hPx * 1.85));
        wPx = Math.max(wPx, Math.round(wPx * 1.15));
      } else if (options.portalGreeting && s.isPortalGreetingLead) {
        /* Salutation: 75% of name size (name uses 2× base). */
        fontPx = Math.max(minStripFontPx, Math.round(fontPx * 1.5));
        lhPx = Math.max(1, Math.round(lhPx * 1.5));
        hPx = Math.max(hPx, Math.round(hPx * 1.28));
        wPx = Math.max(20, Math.round(wPx * 1.04));
      }
      const rotDeg = (Number(s.angle || 0) * 180) / Math.PI;
      const rotRad = (rotDeg * Math.PI) / 180;
      const rotHalfW =
        Math.abs(Math.cos(rotRad)) * (wPx / 2) + Math.abs(Math.sin(rotRad)) * (hPx / 2);
      visualMinL = Math.min(visualMinL, localX - rotHalfW);
      visualMaxR = Math.max(visualMaxR, localX + rotHalfW);
      el.style.width = `${wPx}px`;
      el.style.height = `${hPx}px`;
      el.style.lineHeight = `${lhPx}px`;
      el.style.fontSize = `${fontPx}px`;
      if (options.portalGreeting && (s.isPortalNameLine || s.isPortalGreetingLead)) {
        el.style.fontWeight = '900';
      } else if (s.role === 'author') {
        el.style.fontStyle = 'italic';
      }
      el.style.left = `${localX}px`;
      el.style.top = `${localY}px`;
      let stripTransform = `translate(-50%, -50%) rotate(${rotDeg.toFixed(3)}deg)`;
      if (options.portalGreeting && s.isPortalNameLine) {
        const portalNameNudgeY = Math.round(stageH * 0.1);
        const portalNameTiltDeg = rotDeg + 2.75;
        stripTransform = `translate(-50%, calc(-50% + ${portalNameNudgeY}px)) rotate(${portalNameTiltDeg.toFixed(3)}deg)`;
      }
      el.style.transform = stripTransform;
      stage.appendChild(el);
    }
    quoteCard.appendChild(stage);
    quoteCard.querySelectorAll(':scope > .quote-layoutb-stage').forEach((n) => {
      if (n !== stage) n.remove();
    });
    stage.style.width = `${stageW}px`;
    const onQuoteScreen = quoteCard.closest('#screen-quote');
    if (onQuoteScreen) {
      if (!this._quoteLayoutBPortalSettlePending) {
        this._scheduleQuoteLayoutBSettleRecenter('after-mount');
        this._ensureQuoteLayoutBFontRecenterHook();
      }
      stage.classList.add('quote-layoutb-stage--revealed');
    } else {
      requestAnimationFrame(() => {
        stage.classList.add('quote-layoutb-stage--revealed');
      });
    }
  }

  _layoutBSpeakerAuthorInvertSync(quoteObj) {
    try {
      const arch =
        typeof window !== 'undefined' && window.app && window.app.archiveService
          ? window.app.archiveService
          : null;
      if (!arch || typeof arch._resolveLayoutBSpeakerImageUrl !== 'function') return false;
      const q = quoteObj || this.getQuoteScreenPreviewContent().activeQuote;
      return !!String(arch._resolveLayoutBSpeakerImageUrl(q) || '').trim();
    } catch (_) {
      return false;
    }
  }

  async _layoutBSpeakerAuthorInvertForQuote(quoteObj) {
    try {
      const arch =
        typeof window !== 'undefined' && window.app && window.app.archiveService
          ? window.app.archiveService
          : null;
      if (!arch || typeof arch._resolveLayoutBSpeakerImageUrl !== 'function') return false;
      const dk = Utils.getTodayKey();
      let q = quoteObj;
      if (typeof arch._quoteForLayoutBSpeakerImage === 'function') {
        q = await arch._quoteForLayoutBSpeakerImage(quoteObj, dk);
      }
      return !!String(arch._resolveLayoutBSpeakerImageUrl(q) || '').trim();
    } catch (_) {
      return false;
    }
  }

  _layoutBQuoteTuneOptsSnapshot(dateKey, speakerAuthorInvert = false) {
    const dk = String(dateKey || this.getQuoteCalendarKeyNow() || '').trim();
    return {
      kw: odqGetCachedLayoutBKeywordEmphasis(dk, 'story') || null,
      speaker: !!speakerAuthorInvert,
      stripSeed: odqGetCachedLayoutBStripLayoutSeed(dk, 'story') ?? 0
    };
  }

  _layoutBQuotePaintOptsEqual(a, b) {
    if (!a || !b) return false;
    if (!!a.speaker !== !!b.speaker) return false;
    if ((a.stripSeed ?? 0) !== (b.stripSeed ?? 0)) return false;
    const kwFingerprint = (kw) => {
      if (!kw) return '';
      return JSON.stringify({
        keywords: [...(kw.keywords || [])],
        styles: [...(kw.styles || [])].slice().sort()
      });
    };
    return kwFingerprint(a.kw) === kwFingerprint(b.kw);
  }

  _quoteScreenClippingReady(quoteCard = null) {
    const card = quoteCard || document.querySelector('#screen-quote .quote-card');
    const clipping = card?.querySelector(':scope > .quote-screen-clipping');
    if (!clipping?.classList.contains('quote-screen-clipping--ready')) return false;
    if (clipping.classList.contains('quote-screen-clipping--has-png')) {
      const img = clipping.querySelector('.quote-screen-clipping__image');
      return !!(img && img.naturalWidth > 0);
    }
    return !!String(clipping.querySelector('.quote-screen-clipping__text')?.textContent || '').trim();
  }

  _shouldSkipQuoteScreenLayoutBRebuild(text, author, clippingReady) {
    if (!clippingReady) return false;
    const paintSig = `${String(text || '').trim()}\u0001${String(author || '').trim()}`;
    return this._quoteScreenLayoutBPaintSig === paintSig;
  }

  invalidateQuoteScreenLayoutBTunePaint() {
    this._quoteScreenLayoutBAppliedOpts = null;
    this._quoteScreenLayoutBPaintSig = '';
    this._quoteScreenLayoutBTuneRevision = (this._quoteScreenLayoutBTuneRevision || 0) + 1;
  }

  /**
   * After the fast local-cache paint, pull story-aspect tune fields from Firestore and repaint if needed.
   * (Tune modal preview uses live form state; quote screen was cache-only and skipped strip-seed refresh.)
   */
  async _rebuildLayoutBQuoteCardStage(text, author, options = {}) {
    const quoteCard = document.querySelector('#screen-quote .quote-card');
    if (!quoteCard) return;
    const paintSig = `${String(text || '').trim()}\u0001${String(author || '').trim()}`;
    const forceTuneRebuild = options.forceTuneRebuild === true;
    if (
      !forceTuneRebuild &&
      this._shouldSkipQuoteScreenLayoutBRebuild(text, author, this._quoteScreenClippingReady(quoteCard))
    ) {
      this._revealQuoteLayoutBStage();
      if (document.getElementById('screen-quote')?.classList.contains('active')) {
        window.app?.notifyQuoteScreenLayoutBPainted?.();
      }
      return;
    }
    if (!forceTuneRebuild && this._quoteScreenLayoutBPaintInflight === paintSig) return;
    if (forceTuneRebuild) this._quoteScreenLayoutBPaintInflight = null;
    this._quoteScreenLayoutBPaintInflight = paintSig;
    const rebuildGen = (this._quoteLayoutBRebuildGen = (this._quoteLayoutBRebuildGen || 0) + 1);
    try {
      quoteCard.classList.add('layoutb-preview-card');
      quoteCard.querySelectorAll(':scope > .quote-layoutb-stage').forEach((n) => n.remove());
      const { activeQuote } = this.getQuoteScreenPreviewContent();
      await window.app?.applyQuoteScreenClipping?.({ quote: activeQuote, forceRefresh: forceTuneRebuild });
      if (rebuildGen !== this._quoteLayoutBRebuildGen) return;
      this._quoteScreenLayoutBPaintSig = paintSig;
      this._pendingQuoteScreenLayoutB = null;
      this._quoteScreenLayoutBPaintNeedsActiveFlush = false;
      window.app?.finalizeQuoteColorScrollLayout?.();
      this._revealQuoteLayoutBStage();
      if (document.getElementById('screen-quote')?.classList.contains('active')) {
        window.app?.notifyQuoteScreenLayoutBPainted?.();
      }
    } finally {
      if (this._quoteScreenLayoutBPaintInflight === paintSig) {
        this._quoteScreenLayoutBPaintInflight = null;
      }
    }
  }

  async _rebuildReflectionLayoutBQuoteCard(text, author) {
    const card = document.getElementById('reflection-quote-layoutb-card');
    if (!card || typeof getLayoutBStoryQuotePlan !== 'function') return;
    card.classList.add('layoutb-preview-card');
    let keywordEmphasis = null;
    try {
      keywordEmphasis = await odqReadLayoutBKeywordEmphasis(Utils.getTodayKey());
    } catch (_) {
      /* optional */
    }
    await this._mountLayoutBQuoteStrips(card, text, author, {
      preferFullWidthScale: false,
      keywordEmphasis
    });
  }

  scheduleReflectionLayoutBPreviewLayoutRefresh() {
    const run = () => {
      try {
        const screenEl = document.getElementById('screen-reflection');
        if (!screenEl?.classList.contains('active')) return;
        const card = document.getElementById('reflection-quote-layoutb-card');
        if (card && card.clientWidth < 80) {
          requestAnimationFrame(run);
          return;
        }
        const todayQuote = this.getTodayQuote();
        if (!this.reflectionPromptCardHasQuoteBody(todayQuote)) return;
        const t = String(todayQuote?.text || '').trim();
        const a = String(todayQuote?.author || '').trim();
        void this._rebuildReflectionLayoutBQuoteCard(t, a);
      } catch (e) {
        /* ignore */
      }
    };
    requestAnimationFrame(run);
  }

  async mountPortalGreetingStrips(greetingLine) {
    const portal = document.getElementById('screen-portal');
    const card = document.getElementById('portal-greeting-layoutb-card');
    if (!card || !portal || typeof getLayoutBStoryQuotePlan !== 'function') return;
    const t = String(greetingLine || '').trim();
    if (portal.classList.contains('portal-mode--first-visit')) {
      if (t !== Utils.getPortalFirstVisitGreetingLine()) {
        card.querySelectorAll(':scope > .quote-layoutb-stage').forEach((n) => n.remove());
        this._portalGreetingRenderKey = '';
        Utils.setPortalGreetingReady(true);
        return;
      }
    }
    if (!t) {
      card.querySelectorAll(':scope > .quote-layoutb-stage').forEach((n) => n.remove());
      this._portalGreetingRenderKey = '';
      Utils.setPortalGreetingReady(true);
      return;
    }
    Utils.setPortalGreetingReady(false);
    card.classList.add('layoutb-preview-card');
    const mountOpts = {
      portalGreeting: true,
      preferFullWidthScale: false,
      portalGreetingAsName: portal.classList.contains('portal-mode--first-visit')
    };
    for (let attempt = 0; attempt < 90; attempt++) {
      const portalEl = document.getElementById('screen-portal');
      const returning = portalEl?.classList.contains('portal-mode--returning');
      const firstVisit = portalEl?.classList.contains('portal-mode--first-visit');
      if (!returning && !firstVisit) {
        Utils.setPortalGreetingReady(true);
        return;
      }
      const cardW = Math.round(card.clientWidth || 0);
      if (cardW > 80) {
        const renderKey = `${t}__${cardW}`;
        if (this._portalGreetingRenderKey !== renderKey) {
          await this._mountLayoutBQuoteStrips(card, t, '', mountOpts);
          this._portalGreetingRenderKey = renderKey;
        }
        Utils.setPortalGreetingReady(true);
        return;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    Utils.setPortalGreetingReady(true);
  }

  schedulePortalGreetingLayoutRefresh() {
    const run = () => {
      try {
        const portal = document.getElementById('screen-portal');
        if (!portal?.classList.contains('portal-mode--returning')) {
          return;
        }
        const card = document.getElementById('portal-greeting-layoutb-card');
        if (!card) return;
        if (card.clientWidth < 80) {
          requestAnimationFrame(run);
          return;
        }
        const line = portal.classList.contains('portal-mode--first-visit')
          ? Utils.getPortalFirstVisitGreetingLine()
          : Utils.getPortalGreetingDisplayLine();
        if (!line) {
          card.querySelectorAll(':scope > .quote-layoutb-stage').forEach((n) => n.remove());
          this._portalGreetingRenderKey = '';
          return;
        }
        const cardW = Math.round(card.clientWidth || 0);
        const renderKey = `${line}__${cardW}`;
        if (this._portalGreetingRenderKey === renderKey) return;
        void this._mountLayoutBQuoteStrips(card, line, '', {
          portalGreeting: true,
          preferFullWidthScale: false,
          portalGreetingAsName: portal.classList.contains('portal-mode--first-visit')
        });
        this._portalGreetingRenderKey = renderKey;
        Utils.setPortalGreetingReady(true);
      } catch (e) {
        /* ignore */
      }
    };
    requestAnimationFrame(run);
  }

  displayQuote() {
    const canShowOnQuoteScreen =
      (typeof window !== 'undefined' && window.app && window.app._liveDailyDataConfirmed === true) ||
      this.hasTodayQuotePinned() ||
      this.primeTodayQuoteFromLocalAssignment();
    if (!canShowOnQuoteScreen) {
      return;
    }
    try {
      const { text, author, activeQuote } = this.getQuoteScreenPreviewContent();
      const quoteLine = document.querySelector('.quote-line');
      const quoteAuthor = document.querySelector('.quote-author');
      const quoteInner = document.querySelector('#screen-quote .quote-inner');
      const quoteCard = document.querySelector('#screen-quote .quote-card');
      const quoteSubmitterThanks = document.getElementById('quoteSubmitterThanks');
      
      // Reset fade-in elements to hidden state when quote is displayed
      const fadeElements = document.querySelectorAll('.quote-screen-fade-in');
      fadeElements.forEach(el => el.classList.remove('visible'));
      
      const useQuoteClippingPreview = true;
      const isQuoteClippingPreviewActive = Boolean(useQuoteClippingPreview && quoteCard);
      if (isQuoteClippingPreviewActive) {
        quoteCard.classList.add('layoutb-preview-card');
        quoteCard.querySelectorAll(':scope > .quote-layoutb-stage').forEach((n) => n.remove());
        void window.app?.applyQuoteScreenClipping?.({ quote: activeQuote });
        const quoteScreenActive = document.getElementById('screen-quote')?.classList.contains('active');
        if (!quoteScreenActive) {
          this._pendingQuoteScreenLayoutB = {
            text: String(text || '').trim(),
            author: String(author || '').trim()
          };
          this._quoteScreenLayoutBPaintNeedsActiveFlush = true;
        } else if (
          this._shouldSkipQuoteScreenLayoutBRebuild(
            text,
            author,
            this._quoteScreenClippingReady(quoteCard)
          )
        ) {
          this._pendingQuoteScreenLayoutB = null;
          this._quoteScreenLayoutBPaintNeedsActiveFlush = false;
          this._revealQuoteLayoutBStage();
          if (quoteScreenActive) {
            window.app?.notifyQuoteScreenLayoutBPainted?.();
          }
        } else if (quoteScreenActive && (quoteCard.clientWidth || 0) >= 80) {
          void this._rebuildLayoutBQuoteCardStage(text, author);
        } else {
          this._queueQuoteScreenLayoutBPaint(text, author);
        }
      } else {
        if (quoteInner) {
          quoteInner.classList.remove('layoutb-preview');
          quoteInner.style.display = '';
          quoteInner.style.minHeight = '';
        }
        if (quoteCard) {
          quoteCard.classList.remove('layoutb-preview-card');
          quoteCard.style.minHeight = '';
        }
        quoteCard?.querySelectorAll(':scope > .quote-layoutb-stage').forEach((n) => n.remove());
        const clipping = quoteCard?.querySelector(':scope > .quote-screen-clipping');
        if (clipping) {
          clipping.classList.remove(
            'quote-screen-clipping--ready',
            'quote-screen-clipping--has-png'
          );
        }
      }

      if (quoteLine && !isQuoteClippingPreviewActive) {
        delete quoteLine.dataset.lengthChecked;
        delete quoteLine.dataset.retryCount;
        quoteLine.innerHTML = this.formatQuoteLineForDisplay(text);
        
        // IMMEDIATE check: If text is longer than ~100 characters, apply long-quote class immediately
        if (text.length > 100) {
          quoteLine.classList.add('long-quote');
          console.log('Applied long-quote class immediately based on text length:', text.length);
        } else {
          // For shorter text, check height-based measurement unless preview mode hides quote text nodes.
          this.checkQuoteLength(quoteLine);
        }
      }
      if (quoteAuthor && !isQuoteClippingPreviewActive) {
        quoteAuthor.textContent = author;
        // Apply same long-quote class to author if quote is long
        if (quoteLine && quoteLine.classList.contains('long-quote')) {
          quoteAuthor.classList.add('long-quote');
        } else {
          quoteAuthor.classList.remove('long-quote');
        }
      }

      if (quoteSubmitterThanks) {
        const thanksLine = this.formatSubmitterThanksLine(activeQuote);
        quoteSubmitterThanks.textContent = thanksLine;
        quoteSubmitterThanks.hidden = !thanksLine;
      }
      
      const previewActive = window.app?.isAdminTomorrowPreviewActive?.();
      if (!previewActive) {
        // Also populate the quote display on the quilt screen
        const quiltQuoteText = document.querySelector('.quilt-quote-text');
        const quiltQuoteAuthor = document.querySelector('.quilt-quote-author');
        const quiltQuoteDisplay = document.querySelector('.quilt-quote-display');
        const todayQ = activeQuote;

        if (quiltQuoteText) {
          quiltQuoteText.innerHTML = this.formatQuiltQuoteWithAuthor(todayQ?.text, todayQ?.author, todayQ);
        }
        if (quiltQuoteAuthor) quiltQuoteAuthor.textContent = '';

        if (
          quiltQuoteDisplay &&
          this.quiltScreenHasBodyContent(todayQ) &&
          !window.app?._moodSpreadOwnsQuoteUi?.()
        ) {
          quiltQuoteDisplay.classList.add('has-content');
        }
        if (!window.app?._quiltMoodSpreadEnabled?.()) {
          void window.app?.applyQuiltNewspaperClipping?.({ quote: todayQ });
        }
        window.app?.renderQuiltContributorList?.();

        this.populateReflectionPromptCard();
        window.app?.refreshQuoteSpeakerWidget?.(activeQuote);
        window.app?.refreshQuiltMoodWidget?.(activeQuote);
        window.app?.refreshQuiltReflectionScrapWidget?.(activeQuote);
        window.app?.refreshQuiltFortuneReveal?.(activeQuote);
      }

    } catch (error) {
      console.error('Error displaying quote:', error);
    }
  }

  formatReflectionPromptForCard(promptText) {
    return String(promptText || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  reflectionPromptCardHasQuoteBody(q) {
    if (!q) return false;
    return !!String(q.text || '').trim();
  }

  getQuiltReflectionPromptText(quote) {
    const prompt = [
      quote?.communityPrompt,
      quote?.community_prompt,
      quote?.reflectionPrompt,
      quote?.reflection_prompt
    ]
      .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim())
      .find(Boolean) || '';
    return prompt || '[Reflection prompt coming soon for this quote.]';
  }

  /** Before You Go prompt line: Firestore `small_act` / `smallAct` (not reflection_prompt). */
  getFreeWritePromptText(quote) {
    const t = String(quote?.small_act ?? quote?.smallAct ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return t || 'Small practice for this quote is coming soon.';
  }

  /** Before You Go watch line: `watch_for` body only (kicker supplies prefix; hidden when empty). */
  getWatchForText(quote) {
    let fragment = String(
      quote?.watch_for ??
        quote?.watchFor ??
        quote?.watch_for_snapshot ??
        quote?.watchForSnapshot ??
        ''
    )
      .replace(/\s+/g, ' ')
      .trim();
    if (!fragment) return '';
    const watchForPrefixRe = /^["']?\s*watch\s+for\s+(?:the\s+moment\s+today\s+when\s*[,:.]?\s*)+/i;
    while (watchForPrefixRe.test(fragment)) {
      fragment = fragment.replace(watchForPrefixRe, '').trim();
    }
    if (!fragment) return '';
    fragment = fragment.charAt(0).toUpperCase() + fragment.slice(1);
    return fragment;
  }

  _formatArtRecTitleWho(title, who) {
    if (!title) return who || '';
    if (!who) return title;
    return `${title} by ${who}`;
  }

  /** "Work — Artist — blurb" (em/en dash) → title line + optional blurb. */
  _parseArtRecString(s) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (!t) return { titleLine: '', blurb: '' };
    const parts = t.split(/\s*[—–]\s*/);
    if (parts.length >= 2) {
      const title = parts[0].trim();
      const who = parts[1].trim();
      const blurb = parts.slice(2).join(' ').trim();
      return { titleLine: this._formatArtRecTitleWho(title, who), blurb };
    }
    return { titleLine: t, blurb: '' };
  }

  /** Art pick from Firestore `art_recs` / `artRecs` (string, object, or array). */
  formatArtRecExploreLine(quote) {
    const raw = quote?.art_recs ?? quote?.artRecs;
    if (raw == null) return 'Art recommendation for this quote is coming soon.';
    if (typeof raw === 'string') {
      const { titleLine } = this._parseArtRecString(raw);
      return titleLine || 'Art recommendation for this quote is coming soon.';
    }
    if (Array.isArray(raw) && raw.length) {
      return this.formatArtRecExploreLine({ art_recs: raw[0] });
    }
    if (typeof raw === 'object') {
      const title = String(raw.title || raw.work || raw.name || '').replace(/\s+/g, ' ').trim();
      const who = String(
        raw.artist || raw.author || raw.director || raw.creator || raw.by || ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      if (title && who) return this._formatArtRecTitleWho(title, who);
      if (title) return title;
      if (who) return who;
    }
    return 'Art recommendation for this quote is coming soon.';
  }

  /** Normalize a Notion select value into one of: book/music/art/movie/other (or ''). */
  _normalizeArtRecType(quote) {
    const raw =
      quote?.art_recs_type ??
      quote?.artRecsType ??
      (quote?.art_recs && typeof quote.art_recs === 'object' ? quote.art_recs.type : null) ??
      (quote?.artRecs && typeof quote.artRecs === 'object' ? quote.artRecs.type : null);
    const v = String(raw || '').trim().toLowerCase();
    if (!v) return '';
    if (['book', 'books', 'reading'].includes(v)) return 'book';
    if (['music', 'song', 'album', 'audio'].includes(v)) return 'music';
    if (['art', 'visual', 'painting', 'photography'].includes(v)) return 'art';
    if (['movie', 'film', 'tv', 'video'].includes(v)) return 'movie';
    if (['other', 'misc', 'mixed'].includes(v)) return 'other';
    return 'other';
  }

  /** Material Symbols ligature for a normalized art_recs_type. '' = render nothing. */
  _artRecIconName(type) {
    switch (type) {
      case 'book': return 'book';
      case 'music': return 'headphones';
      case 'art': return 'palette';
      case 'movie': return 'movie';
      case 'other': return 'comedy_mask';
      default: return '';
    }
  }

  /**
   * Title + optional blurb for Before You Go companion block (object may include description, blurb, note).
   * Type/icon are resolved at the END so the "...coming soon." placeholder
   * never renders an icon, while older rows that have art_recs but no
   * art_recs_type still get an icon (default 'other').
   */
  getArtRecBeforeYouGoParts(quote) {
    const fallbackTitle = 'Art recommendation for this quote is coming soon.';
    const explicitType = this._normalizeArtRecType(quote);
    const raw = quote?.art_recs ?? quote?.artRecs;

    const finalize = (titleLine, blurb) => {
      const hasRealContent = titleLine !== fallbackTitle;
      const type = hasRealContent ? (explicitType || 'other') : '';
      const iconName = this._artRecIconName(type);
      return { titleLine, blurb, type, iconName };
    };

    if (raw == null) return finalize(fallbackTitle, '');
    if (typeof raw === 'string') {
      const { titleLine, blurb } = this._parseArtRecString(raw);
      return finalize(titleLine || fallbackTitle, blurb);
    }
    if (Array.isArray(raw) && raw.length) {
      // Synthesize inner quote so the array element is parsed as an
      // art_recs payload; carry explicit type through so the recursive
      // call resolves to the same icon.
      return this.getArtRecBeforeYouGoParts({ art_recs: raw[0], art_recs_type: explicitType });
    }
    if (typeof raw === 'object') {
      const title = String(raw.title || raw.work || raw.name || '').replace(/\s+/g, ' ').trim();
      const who = String(
        raw.artist || raw.author || raw.director || raw.creator || raw.by || ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      const blurb = String(
        raw.description ||
          raw.blurb ||
          raw.note ||
          raw.caption ||
          raw.summary ||
          ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      let titleLine = '';
      if (title && who) titleLine = this._formatArtRecTitleWho(title, who);
      else if (title) titleLine = title;
      else if (who) titleLine = who;
      else titleLine = fallbackTitle;
      return finalize(titleLine, blurb);
    }
    return finalize(fallbackTitle, '');
  }

  populateReflectionPromptCard() {
    const quoteStack = document.querySelector('.reflection-quote-stack');
    const layoutCard = document.getElementById('reflection-quote-layoutb-card');
    const reflectionBody = document.querySelector('.reflection-body');
    if (!reflectionBody || !layoutCard) return;

    const todayQuote = this.getTodayQuote();
    const dateKey = this.getQuoteCalendarKeyNow();
    const reflectionPrompt = this.getQuiltReflectionPromptText(todayQuote);
    reflectionBody.innerHTML = this.formatReflectionPromptForCard(reflectionPrompt);
    console.log('📓 Reflection prompt initial render:', {
      dateKey,
      hasDb: !!window.db,
      hasFirestore: !!window.firestore,
      quoteText: String(todayQuote?.text || '').slice(0, 48),
      hasReflectionPrompt: !!String(
        todayQuote?.communityPrompt ||
        todayQuote?.community_prompt ||
        todayQuote?.reflectionPrompt ||
        todayQuote?.reflection_prompt ||
        ''
      ).trim()
    });

    const hydrateReflectionPromptFromServer = (attempt = 0) => {
      if (!window.db || !window.firestore) {
        if (attempt < 6) {
          setTimeout(() => hydrateReflectionPromptFromServer(attempt + 1), 250);
        } else {
          console.warn(`⚠️ Reflection prompt server read skipped for ${dateKey}: Firestore unavailable`);
        }
        return;
      }
      void (async () => {
        try {
          const snap = await (window.firestore.getDocFromServer || window.firestore.getDoc)(
            window.firestore.doc(window.db, 'quotes', dateKey)
          );
          if (!snap.exists()) {
            console.warn(`⚠️ Reflection prompt server doc missing: quotes/${dateKey}`);
            return;
          }
          const data = snap.data() || {};
          const base = this._pinnedByDateKey[dateKey] || todayQuote || {};
          // `quotes/{dateKey}` is a legacy per-day copy; Notion sync only updates `quotes/{notionPageId}`.
          // Spreading the daily doc here overwrote fresh catalog `communityPrompt` / `reflectionPrompt`
          // with stale duplicates after sync — even when Notion had the right text.
          const notionBacked = String(base?.sourceId || '').trim() !== '';
          const dailyPromptKeys = new Set([
            'communityPrompt',
            'community_prompt',
            'reflectionPrompt',
            'reflection_prompt',
            'communityPromptSnapshot',
            'reflectionPromptSnapshot'
          ]);
          const dataForMerge = notionBacked
            ? Object.fromEntries(Object.entries(data).filter(([k]) => !dailyPromptKeys.has(k)))
            : data;
          const merged = { ...base, ...dataForMerge };
          const prompt = this.getQuiltReflectionPromptText(merged);
          console.log(`📓 Reflection prompt server read quotes/${dateKey}:`, {
            text: String(data.text || '').slice(0, 48),
            hasPrompt: prompt !== '[Reflection prompt coming soon for this quote.]',
            skippedDailyPromptFields: notionBacked
          });
          if (!prompt || prompt === '[Reflection prompt coming soon for this quote.]') return;
          this._pinnedByDateKey[dateKey] = merged;
          const applyPrompt = () => {
            reflectionBody.innerHTML = this.formatReflectionPromptForCard(prompt);
            window.app?.refreshQuiltMoodWidget?.(this._pinnedByDateKey[dateKey]);
            window.app?.refreshQuiltReflectionScrapWidget?.(this._pinnedByDateKey[dateKey]);
          };
          const scrapAnchor = document.getElementById('quiltReflectionScrapWidget');
          if (typeof window.app?._preserveQuiltScrollThroughLayout === 'function' && scrapAnchor) {
            window.app._preserveQuiltScrollThroughLayout(applyPrompt, scrapAnchor);
          } else {
            applyPrompt();
          }
          console.log(`📓 Loaded reflection prompt from quotes/${dateKey}`);
        } catch (e) {
          console.warn('⚠️ Reflection prompt fallback read failed:', e);
        }
      })();
    };
    hydrateReflectionPromptFromServer();

    if (!this.reflectionPromptCardHasQuoteBody(todayQuote)) {
      layoutCard.querySelectorAll(':scope > .quote-layoutb-stage').forEach((n) => n.remove());
      if (quoteStack) quoteStack.classList.add('reflection-quote-stack--hidden');
      return;
    }

    if (quoteStack) quoteStack.classList.remove('reflection-quote-stack--hidden');

    const t = String(todayQuote?.text || '').trim();
    const a = String(todayQuote?.author || '').trim();
    const paintReflectionLayoutB = () => {
      const screenRefl = document.getElementById('screen-reflection');
      if (!screenRefl?.classList.contains('active')) {
        layoutCard.querySelectorAll(':scope > .quote-layoutb-stage').forEach((n) => n.remove());
        this.scheduleReflectionLayoutBPreviewLayoutRefresh();
        return;
      }
      if ((layoutCard.clientWidth || 0) <= 80) {
        this.scheduleReflectionLayoutBPreviewLayoutRefresh();
        return;
      }
      void this._rebuildReflectionLayoutBQuoteCard(t, a);
    };
    requestAnimationFrame(paintReflectionLayoutB);
  }

  /** Escape quote text and insert spacing between sentences (main + quilt quote UI). */
  formatQuoteLineForDisplay(quoteText) {
    const raw = String(quoteText || '').trim();
    if (!raw) return '';
    const escaped = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const withManualBreaks = escaped
      .replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>');
    // (?<!\d) avoids splitting decimals like "3.14" when a space follows (rare in quotes).
    let html = withManualBreaks.replace(/(?<!\d)([.!?])\s+(?=[A-Z0-9“"'])/g, '$1<br><br>');
    // Trailing breaks stack with author spacing; strip so gap to author is always the same.
    html = html.replace(/(?:<br\s*\/?>(?:\s|&nbsp;)*)+$/gi, '');
    return html.trimEnd();
  }

  /** Escape quote text for quilt screen; wrap at spaces (and slashes), never mid-word. */
  formatQuoteLineForQuiltDisplay(quoteText) {
    const raw = String(quoteText || '').trim();
    if (!raw) return '';
    const escaped = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const oneLine = escaped.replace(/\s*\r?\n+\s*/g, ' ').replace(/\s{2,}/g, ' ');
    /* Space around slashes so lines break between words, never inside "wrong" etc. */
    return oneLine.replace(/\s*\/\s*/g, ' / ');
  }

  /** Quilt attribution line: escaped name only (leading em dash via CSS ::before). */
  formatQuiltAuthorForDisplay(quoteAuthor) {
    const withoutLeadDash = String(quoteAuthor || '')
      .trim()
      .replace(/^[—–\-]\s*/, '');
    return this.formatQuoteLineForQuiltDisplay(withoutLeadDash);
  }

  /** Quilt-only compact format: quote and author on one line. */
  formatQuiltQuoteWithAuthor(quoteText, quoteAuthor, q = null, { emDash = true } = {}) {
    const quote = this.formatQuiltLineWithKeywordEmphasis(
      quoteText,
      q && typeof q === 'object' ? q : { text: quoteText }
    ).replace(/\s*[—–\-]\s*$/g, '');
    const authorRaw = String(quoteAuthor || '')
      .trim()
      .replace(/^[—–\-]\s*/, '');
    const author = this.formatQuoteLineForQuiltDisplay(authorRaw);
    if (!quote) return '';
    if (!author) return quote;
    return emDash ? `${quote} \u2014 ${author}` : `${quote} ${author}`;
  }

  /** Blessing string from a quote object (Firestore / Notion may use different casings / keys). */
  quoteBlessingText(q) {
    return (this._blessingScalarFromPlainObject(q) || '').trim();
  }

  /** Quilt screen body: quote only. Author lives in its own attribution line. */
  formatQuiltScreenPrimaryHtml(q) {
    if (!q) return '';
    return this.formatQuiltLineWithKeywordEmphasis(q.text, q);
  }

  /** Notion `keyword` (+ optional tuned styles) — never heuristic word picking. */
  _keywordEmphasisPayloadForQuilt(q) {
    const text = String((q && q.text) || '').trim();
    if (!text) return null;
    const QKE = globalThis.QuoteKeywordEmphasis;
    const LBKE = globalThis.LayoutBKeywordEmphasis;
    if (!QKE || !LBKE) return null;

    const keywordRaw = String(q?.keyword ?? q?.keywordSnapshot ?? '').trim();
    if (!keywordRaw) return null;

    const keywords = QKE.parseEmphasisWordsInput
      ? QKE.parseEmphasisWordsInput(keywordRaw, text)
      : keywordRaw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!keywords.length) return null;

    const dk =
      String(q?.dateKey || '').trim() ||
      (this.quoteService?.getQuoteCalendarKeyNow?.() || '');
    const styles =
      globalThis.QuiltNewspaperClipping?.clippingKeywordStylesForDateKey?.(dk) || ['bold'];

    return LBKE.normalizeLayoutBKeywordEmphasisPayload({ keywords, styles });
  }

  formatQuiltLineWithKeywordEmphasis(quoteText, q) {
    const rawText = String(quoteText || '')
      .replace(/\s*\r?\n+\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*\/\s*/g, ' / ')
      .trim();
    if (!rawText) return '';

    const payload = this._keywordEmphasisPayloadForQuilt(
      q && typeof q === 'object' ? { ...q, text: rawText } : { text: rawText }
    );
    const LBKE = globalThis.LayoutBKeywordEmphasis;
    if (!payload?.keywords?.length || !LBKE?.buildTextRunsForLine) {
      return this.formatQuoteLineForQuiltDisplay(rawText);
    }

    const runs = LBKE.buildTextRunsForLine(rawText, payload.keywords, payload.styles);
    if (!LBKE.lineHasEmphasisRuns?.(runs)) {
      return this.formatQuoteLineForQuiltDisplay(rawText);
    }
    return LBKE.renderLayoutBStripInnerHtml({ textRuns: runs });
  }

  quiltScreenHasBodyContent(q) {
    if (!q) return false;
    return !!(String(q.text || '').trim() && String(q.author || '').trim());
  }

  /** Side columns: quote, speaker, then duplicate quote to fill column (no em dash). */
  formatQuiltNewspaperNeighborHtml(q) {
    if (!q) return '';
    const quotePart = this.formatQuiltLineWithKeywordEmphasis(q.text, q).replace(
      /\s*[—–\-]\s*$/g,
      ''
    );
    if (!quotePart) return '';
    const authorRaw = String(q?.author || '')
      .trim()
      .replace(/^[—–\-]\s*/, '');
    const author = this.formatQuoteLineForQuiltDisplay(authorRaw);
    if (!author) return `${quotePart}. ${quotePart}`;
    return `${quotePart} ${author}. ${quotePart}`;
  }

  /** @deprecated use formatQuiltScreenPrimaryHtml — spread columns show full quote text. */
  formatNewspaperPeekHtml(quote) {
    return this.formatQuiltScreenPrimaryHtml(quote);
  }

  // Check if quote is longer than 2 lines and apply appropriate styling
  checkQuoteLength(quoteElement) {
    // Prevent multiple calls on the same element
    if (quoteElement.dataset.lengthChecked === 'true') {
      return;
    }
    
    // Track retry attempts to prevent infinite loops
    const retryCount = parseInt(quoteElement.dataset.retryCount || '0');
    if (retryCount >= 3) {
      console.log('Quote element still not visible after 3 retries, giving up');
      return;
    }
    
    // Mark as checked to prevent re-runs
    quoteElement.dataset.lengthChecked = 'true';
    
    // Use setTimeout to ensure the text is fully rendered before measuring
    setTimeout(() => {
      // Check if element is visible
      if (quoteElement.offsetHeight === 0) {
        console.log('Quote element not visible yet, retrying...');
        // Reset the flag and retry after a longer delay
        delete quoteElement.dataset.lengthChecked;
        quoteElement.dataset.retryCount = (retryCount + 1).toString();
        setTimeout(() => this.checkQuoteLength(quoteElement), 500);
        return;
      }
      
      // Get the computed line height
      const computedStyle = window.getComputedStyle(quoteElement);
      const lineHeight = parseFloat(computedStyle.lineHeight);
      const elementHeight = quoteElement.offsetHeight;
      
      console.log('Quote height:', elementHeight, 'Line height:', lineHeight, 'Ratio:', elementHeight / lineHeight);
      
      // If the element height is more than 2.2 times the line height, consider it long (lowered threshold)
      if (elementHeight > lineHeight * 2.2) {
        quoteElement.classList.add('long-quote');
        console.log('Applied long-quote class');
      }
    }, 200);
  }

  // Load quotes from Firestore
  async loadQuotesFromFirestore(options = {}) {
    const requireServer = options.requireServer === true;
    const loadLocalQuotes = () => {
      try {
        const savedQuotes = localStorage.getItem('ourDailyQuotes');
        if (savedQuotes) {
          const parsed = JSON.parse(savedQuotes);
          if (Array.isArray(parsed) && parsed.length) {
            this.quotes = parsed;
            this.invalidatePinnedAssignments();
            console.log('📚 Loaded quotes from localStorage fallback:', this.quotes.length, 'quotes');
            return true;
          }
        }
      } catch (localError) {
        console.error('Error loading from localStorage:', localError);
      }
      return false;
    };
    try {
      console.log('📚 Loading quotes from Firestore...');

      if (!window.db || !window.firestore) {
        console.log('📚 Firestore not available, trying local quotes');
        if (requireServer) return false;
        if (loadLocalQuotes()) return true;
        return false;
      }

      const quotesCollection = window.firestore.collection(window.db, 'quotes');
      const readCatalog =
        requireServer && typeof window.firestore.getDocsFromServer === 'function'
          ? window.firestore.getDocsFromServer
          : window.firestore.getDocs;
      const snapshot = await this._withTimeout(
        readCatalog(quotesCollection),
        requireServer ? 12000 : 2200,
        'Firestore quotes catalog read'
      );
      if (snapshot.empty) {
        console.log('📚 Firestore quotes collection is empty, using defaults');
        return false;
      }

      const firestoreQuotes = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        // Ignore date snapshot docs; use Notion-synced canonical quote rows.
        if (data.source !== 'notion') return;

        const text = String(data.text || '').trim();
        const author = String(data.author || '').trim();
        if (!text || !author) return;

        const approved =
          typeof data.approved === 'boolean'
            ? data.approved
            : typeof data.active === 'boolean'
              ? data.active
              : String(data.approved ?? data.active ?? '').trim().toLowerCase() !== 'false';
        if (!approved) return;

        const blessingStr = this._blessingScalarFromPlainObject(data);

        const artRaw = data.art_recs ?? data.artRecs;
        const artRecsFields =
          artRaw == null
            ? {}
            : typeof artRaw === 'string'
              ? (() => {
                  const t = String(artRaw).trim();
                  return t ? { art_recs: t, artRecs: t } : {};
                })()
              : typeof artRaw === 'object'
                ? { art_recs: artRaw, artRecs: artRaw }
                : {};
        const artRecsType = String(data.art_recs_type ?? data.artRecsType ?? '')
          .trim()
          .toLowerCase();

        firestoreQuotes.push({
          text,
          author,
          communityPrompt: String(data.communityPrompt ?? data.community_prompt ?? '').trim(),
          reflectionPrompt: String(data.reflectionPrompt || data.reflection_prompt || '').trim(),
          smallAct: String(data.smallAct ?? data.small_act ?? '').trim(),
          small_act: String(data.smallAct ?? data.small_act ?? '').trim(),
          watch_for: String(data.watch_for ?? '').trim(),
          goodDay: String(data.goodDay ?? data.good_day ?? '').trim(),
          good_day: String(data.goodDay ?? data.good_day ?? '').trim(),
          roughDay: String(data.roughDay ?? data.rough_day ?? '').trim(),
          rough_day: String(data.roughDay ?? data.rough_day ?? '').trim(),
          fortune: String(data.fortune ?? data.Fortune ?? '').trim(),
          keyword: String(data.keyword ?? data.keywordSnapshot ?? '').trim(),
          keywordSnapshot: String(data.keywordSnapshot ?? data.keyword ?? '').trim(),
          ...(() => {
            let flc = Number(data.first_line_count ?? data.firstLineCount);
            if (!Number.isFinite(flc) || flc <= 0) {
              flc = Number(data.firstLineCountSnapshot ?? data.first_line_count_snapshot);
            }
            if (!Number.isFinite(flc) || flc <= 0) {
              const snap = data.notionProperties?.first_line_count?.value;
              flc = Number(snap);
            }
            if (!Number.isFinite(flc) || flc <= 0) return {};
            const n = Math.round(flc);
            return { first_line_count: n, firstLineCount: n };
          })(),
          blessing: blessingStr,
          notificationText: String(data.notificationText ?? data.notification_text ?? '').trim(),
          notification_text: String(data.notificationText ?? data.notification_text ?? '').trim(),
          speakerImageUrl: String(data.speakerImageUrl ?? data.speaker_image_url ?? '').trim(),
          speaker_image_url: String(data.speakerImageUrl ?? data.speaker_image_url ?? '').trim(),
          speakerCutoutUrl: String(data.speakerCutoutUrl ?? data.speaker_cutout_url ?? '').trim(),
          speaker_cutout_url: String(data.speakerCutoutUrl ?? data.speaker_cutout_url ?? '').trim(),
          speakerDates: String(data.speakerDates ?? data.speaker_dates ?? '').trim(),
          speaker_dates: String(data.speakerDates ?? data.speaker_dates ?? '').trim(),
          speakerBorn: String(data.speakerBorn ?? data.speaker_born ?? '').trim(),
          speaker_born: String(data.speakerBorn ?? data.speaker_born ?? '').trim(),
          speakerDied: String(data.speakerDied ?? data.speaker_died ?? '').trim(),
          speaker_died: String(data.speakerDied ?? data.speaker_died ?? '').trim(),
          speakerGuideLine: String(data.speakerGuideLine ?? data.speaker_guide_line ?? '').trim(),
          speaker_guide_line: String(data.speakerGuideLine ?? data.speaker_guide_line ?? '').trim(),
          speakerKeywords: String(data.speakerKeywords ?? data.speaker_keywords ?? '').trim(),
          speaker_keywords: String(data.speakerKeywords ?? data.speaker_keywords ?? '').trim(),
          imageAttribution: String(data.imageAttribution ?? data.image_attribution ?? '').trim(),
          image_attribution: String(data.imageAttribution ?? data.image_attribution ?? '').trim(),
          submittedBy: this._scalarTextField(
            data.submittedBy ??
              data.submitted_by ??
              data.submitterName ??
              data.submittedByName ??
              data.submitted_by_name
          ),
          first_response: this._firstResponseFromPayload(data),
          user_name: String(data.user_name ?? data.userName ?? '').trim(),
          ...artRecsFields,
          ...(artRecsType ? { art_recs_type: artRecsType, artRecsType } : {}),
          sourceId: String(data.sourceId || docSnap.id),
          ...(data.notionProperties ? { notionProperties: data.notionProperties } : {}),
          notionLastEditedTime: String(data.notionLastEditedTime || '').trim(),
          date_scheduled: String(data.date_scheduled ?? data.dateScheduled ?? '').trim(),
          dateScheduled: String(data.dateScheduled ?? data.date_scheduled ?? '').trim(),
          sortOrder:
            typeof data.sortOrder === 'number' && Number.isFinite(data.sortOrder)
              ? data.sortOrder
              : Number.MAX_SAFE_INTEGER
        });
      });

      if (!firestoreQuotes.length) {
        console.log('📚 No active Notion-synced Firestore quotes found, using defaults');
        return false;
      }

      firestoreQuotes.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.text.localeCompare(b.text);
      });

      this.quotes = firestoreQuotes.map(({ sortOrder, ...rest }) => rest);
      this.invalidatePinnedAssignments();
      try {
        localStorage.setItem('ourDailyQuotes', JSON.stringify(this.quotes));
      } catch (_) {
        /* ignore */
      }
      console.log('✅ Loaded quotes from Firestore:', this.quotes.length, 'quotes');

      return true;
      
    } catch (error) {
      console.error('❌ Error loading quotes from Firestore:', error);
      
      if (requireServer) return false;
      if (loadLocalQuotes()) return true;
      
      return false;
    }
  }
}

// ===== ENHANCED RENDERER =====

  root.QuoteService = QuoteService;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
