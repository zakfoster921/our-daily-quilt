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

module.exports = {
  artistSlugFromName,
  authorsReferToSameSpeaker,
  decodeXmlEntities,
  normalizeAuthorForMatch,
  normalizeEpisodeRecord,
  parseSeamsideRssItems
};
