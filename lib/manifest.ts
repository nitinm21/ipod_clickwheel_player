/**
 * The song manifest (library.json) — shared types and pure operations,
 * used by the sync CLI and the app.
 */

export type Song = {
  /** YouTube video ID — the canonical key. */
  id: string;
  /** Cleaned display title (lib/titles.ts). */
  title: string;
  /** Original YouTube title, kept for re-cleaning later. */
  rawTitle: string;
  /** Public Blob URL of the m4a. */
  url: string;
  /** File size in bytes. */
  size: number;
  /** Duration in seconds. */
  duration: number;
  /** ISO timestamp of when the song was added. */
  addedAt: string;
};

export function hasSong(library: Song[], id: string): boolean {
  return library.some((s) => s.id === id);
}

/** Add or replace by id; returns a new array sorted alphabetically by title. */
export function upsertSong(library: Song[], song: Song): Song[] {
  const next = library.filter((s) => s.id !== song.id);
  next.push(song);
  return sortByTitle(next);
}

export function removeSong(library: Song[], id: string): Song[] {
  return library.filter((s) => s.id !== id);
}

/** Alphabetical by cleaned title (iPod-authentic), stable for equal titles. */
export function sortByTitle(library: Song[]): Song[] {
  return [...library].sort(
    (a, b) =>
      a.title.localeCompare(b.title, "en", { sensitivity: "base" }) ||
      a.id.localeCompare(b.id)
  );
}

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract the 11-char video ID from any common YouTube URL shape
 * (watch, youtu.be, shorts, embed, music.youtube.com) or a bare ID.
 */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (ID_PATTERN.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/")[1] ?? "";
    return ID_PATTERN.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && ID_PATTERN.test(v)) return v;
    const parts = url.pathname.split("/");
    if (["shorts", "embed", "v", "live"].includes(parts[1] ?? "")) {
      const id = parts[2] ?? "";
      return ID_PATTERN.test(id) ? id : null;
    }
  }
  return null;
}
