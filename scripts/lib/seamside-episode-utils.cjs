'use strict';

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function artistSlugFromName(name) {
  return (
    String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'artist'
  );
}

function normalizeAuthorForMatch(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function authorsReferToSameSpeaker(expectedAuthor, snapshotAuthor) {
  const a = normalizeAuthorForMatch(expectedAuthor);
  const b = normalizeAuthorForMatch(snapshotAuthor);
  if (!a || !b) return false;
  if (a === b) return true;
  const aLast = a.split(' ').pop() || '';
  const bLast = b.split(' ').pop() || '';
  if (aLast.length > 2 && aLast === bLast) return true;
  return a.includes(b) || b.includes(a);
}

function parseSeamsideRssItems(xml) {
  const source = String(xml || '');
  const parts = source.split('<item>').slice(1);
  return parts.map((part) => {
    const chunk = part.split('</item>')[0] || '';
    const title = decodeXmlEntities((chunk.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
    const itunesTitle = decodeXmlEntities(
      (chunk.match(/<itunes:title>([\s\S]*?)<\/itunes:title>/) || [])[1] || ''
    ).trim();
    const audioUrl = String((chunk.match(/<enclosure url="([^"]+)"/) || [])[1] || '').trim();
    const audioType = String((chunk.match(/<enclosure url="[^"]+"[^>]*type="([^"]+)"/) || [])[1] || '').trim();
    const episodeImageUrl = String((chunk.match(/<itunes:image href="([^"]+)"/) || [])[1] || '').trim();
    const link = decodeXmlEntities((chunk.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim();
    const pubDate = decodeXmlEntities((chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '').trim();
    const episodeTitle = itunesTitle || title;
    return {
      title,
      itunesTitle,
      episodeTitle,
      audioUrl,
      audioType,
      episodeImageUrl,
      link,
      pubDate,
      isExtended: /^\[extended\]/i.test(episodeTitle)
    };
  });
}

function normalizeEpisodeRecord(raw = {}) {
  const artistName = String(raw.artistName ?? raw.artist_name ?? '').trim();
  const episodeTitle = String(raw.episodeTitle ?? raw.episode_title ?? '').trim();
  const audioUrl = String(raw.audioUrl ?? raw.audio_url ?? '').trim();
  const applePodcastsUrl = String(raw.applePodcastsUrl ?? raw.apple_podcasts_url ?? '').trim();
  const episodeImageUrl = String(raw.episodeImageUrl ?? raw.episode_image_url ?? '').trim();
  const active = raw.active !== false;
  if (!artistName) return null;
  const artistSlug = String(raw.artistSlug ?? raw.artist_slug ?? artistSlugFromName(artistName)).trim();
  return {
    artistName,
    artistSlug,
    episodeTitle,
    audioUrl,
    applePodcastsUrl,
    episodeImageUrl,
    active,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? new Date().toISOString()).trim()
  };
}

function isPlayableAudio(item) {
  const url = String(item?.audioUrl || '').trim();
  if (!url) return false;
  const type = String(item?.audioType || '').toLowerCase();
  if (type.startsWith('audio/')) return true;
  return /\.(mp3|m4a)(\?|$)/i.test(url);
}

function guessArtistNameFromEpisodeTitle(title) {
  const t = String(title || '').trim();
  const withMatch = t.match(
    /\bwith(?:\s+(?:textile\s+artist|quilt(?:er)?|painter|performance-quilter|quilt\s+curator|quilt\s+advocate))?\s+(.+)$/i
  );
  if (withMatch) return withMatch[1].replace(/\s+/g, ' ').trim();
  return '';
}

function rssItemMatchesArtist(item, artistName) {
  const episodeTitle = String(item?.episodeTitle || item?.title || '').trim();
  if (!episodeTitle || !artistName) return false;
  const guessed = guessArtistNameFromEpisodeTitle(episodeTitle);
  if (guessed && authorsReferToSameSpeaker(artistName, guessed)) return true;
  const normArtist = normalizeAuthorForMatch(artistName);
  const normTitle = normalizeAuthorForMatch(episodeTitle);
  if (normArtist && normTitle.includes(normArtist)) return true;
  const last = normArtist.split(' ').pop() || '';
  if (last.length > 2 && normTitle.includes(last)) return true;
  return false;
}

function findRssItemForArtist(artistName, rssItems) {
  const items = (Array.isArray(rssItems) ? rssItems : []).filter(
    (item) => isPlayableAudio(item) && !item.isExtended
  );
  return items.find((item) => rssItemMatchesArtist(item, artistName)) || null;
}

function enrichEpisodesFromRss(episodes, rssItems) {
  return (Array.isArray(episodes) ? episodes : []).map((episode) => {
    if (!episode?.artistName) return episode;
    const rss = findRssItemForArtist(episode.artistName, rssItems);
    if (!rss) return episode;
    return normalizeEpisodeRecord({
      ...episode,
      episodeTitle: episode.episodeTitle || rss.episodeTitle || rss.title,
      audioUrl: episode.audioUrl || rss.audioUrl,
      episodeImageUrl: episode.episodeImageUrl || rss.episodeImageUrl
    });
  });
}

function notionDatabaseIdFromUrl(urlOrId) {
  const raw = String(urlOrId || '').trim();
  if (!raw) return '';
  const match = raw.match(/([0-9a-f]{32})/i);
  if (!match) return raw;
  const hex = match[1];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

module.exports = {
  artistSlugFromName,
  authorsReferToSameSpeaker,
  decodeXmlEntities,
  enrichEpisodesFromRss,
  findRssItemForArtist,
  guessArtistNameFromEpisodeTitle,
  isPlayableAudio,
  normalizeAuthorForMatch,
  normalizeEpisodeRecord,
  notionDatabaseIdFromUrl,
  parseSeamsideRssItems,
  rssItemMatchesArtist
};
