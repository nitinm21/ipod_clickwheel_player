/**
 * The "iTunes" side: sync YouTube links into the Vercel Blob library.
 *
 *   npm run sync -- <link> <link> ...   add songs (dedupes by video ID)
 *   npm run sync -- --list              show the current library
 *   npm run sync -- --remove <id> ...   remove songs by video ID
 *
 * Needs: yt-dlp on PATH (brew install yt-dlp) and BLOB_READ_WRITE_TOKEN
 * in .env.local (vercel env pull .env.local).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { del, list, put } from "@vercel/blob";
import { cleanTitle } from "../lib/titles";
import {
  extractVideoId,
  hasSong,
  removeSong,
  sortByTitle,
  upsertSong,
  type Song,
} from "../lib/manifest";

const ROOT = path.join(__dirname, "..");
const DOWNLOADS = path.join(ROOT, "downloads");
const LIBRARY_PREFIX = "library/";
const MIN_SANE_BYTES = 100 * 1024; // a real song is never under 100 KB

function loadEnv() {
  const envFile = path.join(ROOT, ".env.local");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "✗ BLOB_READ_WRITE_TOKEN not found. Run: vercel env pull .env.local"
    );
    process.exit(1);
  }
}

// The manifest is written to a fresh timestamped pathname on every save and
// discovered via list() — Blob's CDN caches overwritten pathnames for up to a
// minute, but a never-before-seen pathname is always served fresh.
async function fetchLibrary(): Promise<Song[]> {
  const { blobs } = await list({ prefix: LIBRARY_PREFIX });
  const latest = blobs.sort((a, b) => a.pathname.localeCompare(b.pathname)).at(-1);
  if (!latest) return [];
  const res = await fetch(latest.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${latest.pathname} fetch failed: ${res.status}`);
  return (await res.json()) as Song[];
}

async function saveLibrary(library: Song[]) {
  const pathname = `${LIBRARY_PREFIX}${Date.now()}.json`;
  await put(pathname, JSON.stringify(sortByTitle(library), null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  // Best-effort cleanup of superseded manifests.
  const { blobs } = await list({ prefix: LIBRARY_PREFIX });
  const stale = blobs.filter((b) => b.pathname !== pathname).map((b) => b.url);
  if (stale.length > 0) await del(stale);
}

type YtInfo = { id: string; title: string; duration: number };

/** Download best m4a audio; returns metadata. Throws with a readable reason. */
function downloadAudio(link: string): YtInfo {
  const result = spawnSync(
    "yt-dlp",
    [
      "-f",
      "bestaudio[ext=m4a]/140",
      "--no-playlist",
      "-o",
      path.join(DOWNLOADS, "%(id)s.m4a"),
      "-j",
      "--no-simulate",
      "--no-progress",
      link,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  if (result.error) throw new Error(`yt-dlp not runnable: ${result.error.message}`);
  if (result.status !== 0) {
    const line =
      result.stderr.split("\n").find((l) => l.startsWith("ERROR")) ??
      result.stderr.trim().split("\n").pop() ??
      "unknown yt-dlp error";
    throw new Error(line.replace(/^ERROR:?\s*/i, ""));
  }
  const info = JSON.parse(result.stdout);
  return { id: info.id, title: info.title, duration: Math.round(info.duration ?? 0) };
}

type Outcome = { link: string; status: "added" | "skipped" | "failed"; detail: string };

async function addLinks(links: string[]) {
  let library = await fetchLibrary();
  const outcomes: Outcome[] = [];
  mkdirSync(DOWNLOADS, { recursive: true });

  for (const link of links) {
    try {
      const knownId = extractVideoId(link);
      if (knownId && hasSong(library, knownId)) {
        outcomes.push({ link, status: "skipped", detail: `already in library (${knownId})` });
        continue;
      }

      const info = downloadAudio(link);
      if (hasSong(library, info.id)) {
        outcomes.push({ link, status: "skipped", detail: `already in library (${info.id})` });
        continue;
      }

      const file = path.join(DOWNLOADS, `${info.id}.m4a`);
      const audio = readFileSync(file);
      if (audio.byteLength < MIN_SANE_BYTES) {
        throw new Error(`downloaded file suspiciously small (${audio.byteLength} bytes)`);
      }

      const blob = await put(`audio/${info.id}.m4a`, audio, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "audio/mp4",
      });

      const song: Song = {
        id: info.id,
        title: cleanTitle(info.title),
        rawTitle: info.title,
        url: blob.url,
        size: audio.byteLength,
        duration: info.duration,
        addedAt: new Date().toISOString(),
      };
      library = upsertSong(library, song);
      await saveLibrary(library); // save as we go — a later failure loses nothing
      rmSync(file, { force: true });
      outcomes.push({ link, status: "added", detail: `${song.title} (${info.duration}s)` });
    } catch (err) {
      outcomes.push({ link, status: "failed", detail: (err as Error).message });
    }
  }

  const glyph = { added: "✓", skipped: "↷", failed: "✗" } as const;
  console.log("");
  for (const o of outcomes) {
    console.log(`  ${glyph[o.status]} ${o.link}`);
    console.log(`     ${o.detail}`);
  }
  const counts = outcomes.reduce(
    (acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }),
    {} as Record<string, number>
  );
  console.log(
    `\n  ${counts.added ?? 0} added · ${counts.skipped ?? 0} skipped · ` +
      `${counts.failed ?? 0} failed · library now ${library.length} songs`
  );
  if ((counts.failed ?? 0) > 0) process.exitCode = 1;
}

async function removeIds(ids: string[]) {
  let library = await fetchLibrary();
  for (const id of ids) {
    // del is idempotent — always clear the audio blob, even if the manifest
    // somehow lost the entry (keeps the store free of orphans).
    await del(`audio/${id}.m4a`);
    if (hasSong(library, id)) {
      library = removeSong(library, id);
      console.log(`  ✓ removed ${id}`);
    } else {
      console.log(`  ↷ ${id} — not in library (audio blob cleared anyway)`);
    }
  }
  await saveLibrary(library);
  console.log(`\n  library now ${library.length} songs`);
}

async function listLibrary() {
  const library = await fetchLibrary();
  if (library.length === 0) {
    console.log("  (empty library — add songs with: npm run sync -- <link>)");
    return;
  }
  for (const s of sortByTitle(library)) {
    const mm = Math.floor(s.duration / 60);
    const ss = String(s.duration % 60).padStart(2, "0");
    console.log(`  ${s.id}  ${mm}:${ss}  ${s.title}`);
  }
  console.log(`\n  ${library.length} songs`);
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  if (args[0] === "--list") return listLibrary();
  if (args[0] === "--remove") {
    const ids = args.slice(1);
    if (ids.length === 0) {
      console.error("usage: npm run sync -- --remove <videoId> ...");
      process.exit(1);
    }
    return removeIds(ids);
  }
  if (args.length === 0) {
    console.error("usage: npm run sync -- <youtube-link> ...  |  --list  |  --remove <id> ...");
    process.exit(1);
  }
  return addLinks(args);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
