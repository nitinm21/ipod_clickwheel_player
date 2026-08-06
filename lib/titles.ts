/**
 * Title cleaning shared by the sync CLI and the app.
 * Strips YouTube noise — "(Official Video)", "[Lyrics]", "| Movie Name",
 * trailing HD/4K, feat-clauses — and collapses whitespace. The goal is the
 * title as it would appear on an iPod screen: "Artist - Song".
 */

const BRACKET_NOISE = new RegExp(
  "[(\\[]\\s*(?:" +
    [
      "official\\s+(?:music\\s+|lyric\\s+|hd\\s+|4k\\s+)?(?:video|audio|visuali[sz]er|version)",
      "official",
      "(?:full\\s+)?(?:audio|song)",
      "lyrics?(?:\\s+video)?",
      "(?:with\\s+)?lyrics?",
      "lyrical(?:\\s+video)?",
      "visuali[sz]er",
      "music\\s+video",
      "video\\s+oficial",
      "audio\\s+oficial",
      "hd|hq|4k|8k|1080p|720p",
      "m/?v",
      "out\\s+now",
      "new\\s+song\\s+\\d{4}",
      "video",
      "fe?a?t\\.?\\s+[^)\\]]*",
      "featuring\\s+[^)\\]]*",
    ].join("|") +
    ")\\s*[)\\]]",
  "gi"
);

const TRAILING_FEAT = /\s+(?:feat|ft)\.?\s+.+$/i;
const STANDALONE_QUALITY = /(?:^|\s)(?:HD|HQ|4K|8K|1080p|720p)(?=\s|$)/gi;
const TRAILING_MV = /\s+M\/?V\s*$/i;
// Bare trailing phrases (no brackets): "… Full Video Song", "… Lyric Video",
// "… Official Video", "… Full Song" — endemic on Indian music uploads.
const TRAILING_PHRASE =
  /\s+(?:full\s+)?(?:official\s+)?(?:video|audio|lyric(?:al)?s?|music)\s+(?:video|song|audio)\s*$|\s+full\s+(?:video|song|audio)\s*$|\s+official\s+(?:video|audio)\s*$/i;

export function cleanTitle(raw: string): string {
  let t = raw;

  // Everything after the first pipe is channel/movie/promo noise.
  const pipe = t.indexOf("|");
  if (pipe > 0) t = t.slice(0, pipe);

  t = t.replace(BRACKET_NOISE, " ");
  t = t.replace(TRAILING_FEAT, " ");
  t = t.replace(STANDALONE_QUALITY, " ");
  t = t.replace(TRAILING_MV, " ");
  t = t.replace(TRAILING_PHRASE, " ");

  // Leftover empty brackets and dangling separators.
  t = t.replace(/[(\[]\s*[)\]]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/[\s\-–—:,]+$/g, "").trim();

  // If cleaning nuked everything, the raw title is better than nothing.
  return t.length > 0 ? t : raw.replace(/\s+/g, " ").trim();
}
