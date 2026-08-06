/**
 * The "iTunes" side: sync YouTube links into the Vercel Blob library.
 *
 *   npm run sync                        open the local sync page (paste links
 *                                       in bulk, live progress) — the easy way
 *   npm run sync -- "<link>" ...        add songs from the terminal (quote
 *                                       URLs — zsh chokes on ? otherwise)
 *   npm run sync -- --list              show the current library
 *   npm run sync -- --remove <id> ...   remove songs by video ID
 *
 * Needs: yt-dlp on PATH (brew install yt-dlp) and BLOB_READ_WRITE_TOKEN
 * in .env.local (vercel env pull .env.local).
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { del, list, put } from "@vercel/blob";
import { cleanTitle } from "../lib/titles";
import {
  extractVideoId,
  extractVideoIdsFromText,
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
const PORT = 5757;

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

/** Download best m4a audio; resolves with metadata, rejects with a readable reason. */
function downloadAudio(link: string): Promise<YtInfo> {
  return new Promise((resolve, reject) => {
    const p = spawn("yt-dlp", [
      "-f",
      "bestaudio[ext=m4a]/140",
      "--no-playlist",
      "-o",
      path.join(DOWNLOADS, "%(id)s.m4a"),
      "-j",
      "--no-simulate",
      "--no-progress",
      link,
    ]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => reject(new Error(`yt-dlp not runnable: ${e.message}`)));
    p.on("close", (code) => {
      if (code !== 0) {
        const line =
          err.split("\n").find((l) => l.startsWith("ERROR")) ??
          err.trim().split("\n").pop() ??
          "unknown yt-dlp error";
        reject(new Error(line.replace(/^ERROR:?\s*/i, "")));
        return;
      }
      try {
        const info = JSON.parse(out);
        resolve({
          id: info.id,
          title: info.title,
          duration: Math.round(info.duration ?? 0),
        });
      } catch {
        reject(new Error("could not parse yt-dlp output"));
      }
    });
  });
}

type AddResult = {
  status: "added" | "skipped" | "failed";
  detail: string;
  library: Song[];
};

/** Add one link/ID to the library. Never throws — failures come back as status. */
async function addOne(input: string, library: Song[]): Promise<AddResult> {
  try {
    const knownId = extractVideoId(input);
    if (knownId && hasSong(library, knownId)) {
      return { status: "skipped", detail: `already in library (${knownId})`, library };
    }

    mkdirSync(DOWNLOADS, { recursive: true });
    const info = await downloadAudio(input);
    if (hasSong(library, info.id)) {
      return { status: "skipped", detail: `already in library (${info.id})`, library };
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
    const next = upsertSong(library, song);
    await saveLibrary(next); // save as we go — a later failure loses nothing
    rmSync(file, { force: true });
    return { status: "added", detail: song.title, library: next };
  } catch (err) {
    return { status: "failed", detail: (err as Error).message, library };
  }
}

async function removeOne(id: string, library: Song[]): Promise<Song[]> {
  // del is idempotent — always clear the audio blob, even if the manifest
  // somehow lost the entry (keeps the store free of orphans).
  await del(`audio/${id}.m4a`);
  const next = removeSong(library, id);
  await saveLibrary(next);
  return next;
}

/* ---------------------------------------------------------------- CLI mode */

async function cliAdd(links: string[]) {
  let library = await fetchLibrary();
  const glyph = { added: "✓", skipped: "↷", failed: "✗" } as const;
  const counts = { added: 0, skipped: 0, failed: 0 };
  console.log("");
  for (const link of links) {
    const r = await addOne(link, library);
    library = r.library;
    counts[r.status]++;
    console.log(`  ${glyph[r.status]} ${link}`);
    console.log(`     ${r.detail}`);
  }
  console.log(
    `\n  ${counts.added} added · ${counts.skipped} skipped · ` +
      `${counts.failed} failed · library now ${library.length} songs`
  );
  if (counts.failed > 0) process.exitCode = 1;
}

async function cliRemove(ids: string[]) {
  let library = await fetchLibrary();
  for (const id of ids) {
    const had = hasSong(library, id);
    library = await removeOne(id, library);
    console.log(had ? `  ✓ removed ${id}` : `  ↷ ${id} — not in library (audio blob cleared anyway)`);
  }
  console.log(`\n  library now ${library.length} songs`);
}

async function cliList() {
  const library = await fetchLibrary();
  if (library.length === 0) {
    console.log("  (empty library — run `npm run sync` and paste some links)");
    return;
  }
  for (const s of sortByTitle(library)) {
    const mm = Math.floor(s.duration / 60);
    const ss = String(s.duration % 60).padStart(2, "0");
    console.log(`  ${s.id}  ${mm}:${ss}  ${s.title}`);
  }
  console.log(`\n  ${library.length} songs`);
}

/* ----------------------------------------------------------------- UI mode */

type JobItem = {
  id: string;
  status: "pending" | "working" | "added" | "skipped" | "failed";
  detail: string;
};

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>iPod Sync</title>
<style>
  :root { --face:#F2F1EC; --lcd:#C9D5C4; --pixel:#1B211C; --bezel:#3A3C38; --line:#AEBBA9; }
  * { box-sizing:border-box; }
  body { background:var(--face); color:var(--pixel); font-family:ui-monospace,Menlo,Consolas,monospace;
         max-width:680px; margin:40px auto; padding:0 16px; font-size:14px; }
  h1 { font-size:16px; letter-spacing:.14em; }
  .panel { background:var(--lcd); border:2px solid var(--bezel); border-radius:6px; padding:14px; margin:14px 0;
           box-shadow: inset 0 2px 5px rgba(0,0,0,.18); }
  textarea { width:100%; height:110px; background:transparent; border:1px solid var(--pixel); border-radius:3px;
             padding:8px; font:inherit; color:var(--pixel); resize:vertical; }
  textarea:focus { outline:2px solid var(--pixel); }
  button { background:var(--pixel); color:var(--lcd); border:0; border-radius:3px; padding:8px 18px;
           font:inherit; cursor:pointer; }
  button:disabled { opacity:.35; cursor:default; }
  .rowbtn { background:transparent; color:var(--pixel); border:1px solid var(--pixel); padding:1px 8px; font-size:12px; }
  ul { list-style:none; padding:0; margin:10px 0 0; }
  li { padding:5px 2px; border-bottom:1px solid var(--line); display:flex; gap:10px; align-items:baseline; }
  li:last-child { border-bottom:0; }
  .muted { opacity:.6; font-size:12px; }
  .spacer { flex:1; }
  .failed { text-decoration:underline wavy; text-underline-offset:3px; }
</style>
<h1>iPod · SYNC</h1>
<div class="panel">
  <div class="muted">Paste anything containing YouTube links — one, fifty, a whole chat export. Links are found automatically.</div>
  <p><textarea id="in" placeholder="https://youtu.be/…&#10;https://www.youtube.com/watch?v=…"></textarea></p>
  <button id="add">Add to library</button> <span id="found" class="muted"></span>
  <ul id="job"></ul>
</div>
<div class="panel">
  <b id="count">…</b>
  <ul id="lib"></ul>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  const glyphs = { pending: "·", working: "↓", added: "✓", skipped: "↷", failed: "✗" };
  const esc = (s) => { const d = document.createElement("span"); d.textContent = s; return d.innerHTML; };
  const fmt = (d) => Math.floor(d / 60) + ":" + String(d % 60).padStart(2, "0");
  let busy = false;

  async function refresh() {
    const s = await (await fetch("/state")).json();
    busy = s.job.running;
    $("add").disabled = busy || false;
    $("job").innerHTML = s.job.items.map((i) =>
      '<li class="' + i.status + '"><span>' + glyphs[i.status] + "</span><span>" +
      esc(i.detail || i.id) + "</span></li>").join("");
    $("count").textContent = s.library.length + " song" + (s.library.length === 1 ? "" : "s") + " in library";
    $("lib").innerHTML = s.library.map((t) =>
      "<li><span>" + esc(t.title) + '</span><span class="muted">' + fmt(t.duration) +
      '</span><span class="spacer"></span><button class="rowbtn" data-id="' + t.id +
      '"' + (busy ? " disabled" : "") + ">remove</button></li>").join("");
  }

  $("in").addEventListener("input", async () => {
    const r = await (await fetch("/scan", { method: "POST", body: $("in").value })).json();
    $("found").textContent = r.count ? r.count + " link" + (r.count === 1 ? "" : "s") + " found" : "";
  });

  $("add").onclick = async () => {
    const res = await fetch("/add", { method: "POST", body: $("in").value });
    if (res.ok) $("in").value = "", $("found").textContent = "";
    else alert(await res.text());
    refresh();
  };

  $("lib").addEventListener("click", async (e) => {
    const id = e.target.dataset && e.target.dataset.id;
    if (!id || busy) return;
    if (!confirm("Remove this song?")) return;
    await fetch("/remove", { method: "POST", body: id });
    refresh();
  });

  setInterval(refresh, 800);
  refresh();
</script>
</html>`;

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => resolve(body));
  });
}

async function serve() {
  let library = await fetchLibrary();
  let job: { running: boolean; items: JobItem[] } = { running: false, items: [] };

  async function runJob(ids: string[]) {
    job = {
      running: true,
      items: ids.map((id) => ({ id, status: "pending", detail: "" })),
    };
    for (const item of job.items) {
      item.status = "working";
      const r = await addOne(`https://www.youtube.com/watch?v=${item.id}`, library);
      library = r.library;
      item.status = r.status;
      item.detail = r.status === "failed" ? `${item.id}: ${r.detail}` : r.detail;
    }
    job.running = false;
  }

  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    try {
      if (req.method === "GET" && url === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(PAGE);
      } else if (req.method === "GET" && url === "/state") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ job, library: sortByTitle(library) }));
      } else if (req.method === "POST" && url === "/scan") {
        const ids = extractVideoIdsFromText(await readBody(req));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ count: ids.length }));
      } else if (req.method === "POST" && url === "/add") {
        const ids = extractVideoIdsFromText(await readBody(req));
        if (job.running) {
          res.writeHead(409).end("a sync is already running — wait for it to finish");
        } else if (ids.length === 0) {
          res.writeHead(400).end("no YouTube links found in the pasted text");
        } else {
          void runJob(ids);
          res.writeHead(202).end("started");
        }
      } else if (req.method === "POST" && url === "/remove") {
        if (job.running) {
          res.writeHead(409).end("busy");
        } else {
          const id = (await readBody(req)).trim();
          library = await removeOne(id, library);
          res.writeHead(200).end("ok");
        }
      } else {
        res.writeHead(404).end("not found");
      }
    } catch (err) {
      res.writeHead(500).end((err as Error).message);
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n  iPod sync running at ${url}`);
    console.log("  paste your links there — Ctrl-C here when done\n");
    if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    }
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`✗ port ${PORT} is busy — is another sync page already open?`);
      process.exit(1);
    }
    throw err;
  });
}

/* ------------------------------------------------------------------- main */

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  if (args.length === 0) return serve();
  if (args[0] === "--list") return cliList();
  if (args[0] === "--remove") {
    const ids = args.slice(1);
    if (ids.length === 0) {
      console.error("usage: npm run sync -- --remove <videoId> ...");
      process.exit(1);
    }
    return cliRemove(ids);
  }
  return cliAdd(args);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
