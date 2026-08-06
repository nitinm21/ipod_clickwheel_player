# iPod Click-Wheel Player

A nostalgia-first, offline-capable music player PWA with a classic iPod
click-wheel UI. You add songs from your laptop with a small sync tool; your
phone caches everything locally so it keeps playing with no signal.

- Next.js (App Router) + TypeScript, deployed on Vercel
- Audio lives in Vercel Blob, cached on-device in IndexedDB
- Service worker caches the app shell, so it opens offline too
- Sync tool (`npm run sync`) built on yt-dlp

## Prerequisites

You need all of these before anything works:

1. **A Vercel account** (free tier is fine). This project is built around
   Vercel — it uses **Vercel Blob** to store the audio files, so it isn't a
   "just run it locally" app. You have to deploy it and create a Blob store.
2. **Node.js 20+** and npm.
3. **yt-dlp** on your PATH — only needed on the machine you sync from:
   ```bash
   brew install yt-dlp        # macOS
   # or: pipx install yt-dlp  # anywhere else
   ```

## Setup

### 1. Fork or clone

```bash
git clone https://github.com/<your-username>/ipod_clickwheel_player.git
cd ipod_clickwheel_player
npm install
```

(Fork it first on GitHub if you want Vercel to auto-deploy your own pushes.)

### 2. Create the Vercel project

Easiest path — import your fork at [vercel.com/new](https://vercel.com/new).
Vercel detects Next.js and needs no build settings. Or from the terminal:

```bash
npm i -g vercel
vercel link      # creates/links the project
```

### 3. Create a Blob store and connect it

In the Vercel dashboard: **Storage → Create → Blob**, name it whatever you
like, then **connect it to this project**. Connecting is the important part —
it's what sets the `BLOB_READ_WRITE_TOKEN` environment variable on the
project. Make sure it's enabled for all environments (Production, Preview,
Development).

### 4. Pull the token locally

```bash
vercel env pull .env.local
```

You should now have `BLOB_READ_WRITE_TOKEN` in `.env.local`. The sync tool
reads it from there. (`.env.local` is gitignored — never commit it.)

### 5. Deploy

```bash
vercel --prod
```

Or just push to `main` if you imported the repo from GitHub.

### 6. Add some songs

```bash
npm run sync
```

This opens a small local page at `http://localhost:5757`. Paste anything
containing YouTube links — one link, fifty, a whole chat export — and it
finds them all, downloads the audio, and uploads it to your Blob store with
live progress. Remove songs from the same page.

Terminal alternative:

```bash
npm run sync -- "https://youtu.be/VIDEO_ID" "https://youtu.be/OTHER_ID"
npm run sync -- --list
npm run sync -- --remove VIDEO_ID
```

Quote the URLs — zsh chokes on `?` otherwise.

### 7. Install it on your phone

Open your deployed URL in Safari/Chrome on your phone and use **Add to Home
Screen**. It launches full-screen like a real app. Leave it open on Wi-Fi for
a moment — it downloads every song in the background — then it plays with the
phone in airplane mode.

## Using it

Everything is the click wheel:

| Action | What it does |
| --- | --- |
| Drag around the wheel | Scroll the list / scrub the track |
| Center button | Select |
| MENU | Back |
| ▶❚❚ | Play / pause |
| ⏭ ⏮ | Next / previous track |

Menu: **Songs** (your library), **Shuffle** (on/off), **Now Playing** (shows
once something is playing). Song rows show a small glyph — filled means the
song is cached on this device, hollow means it hasn't downloaded yet.

## Local development

```bash
npm run dev      # http://localhost:3000
npm test         # vitest
npm run build
```

Local dev still reads the song library from your Vercel Blob store, so
`.env.local` has to be in place (step 4).

## How it works

- `scripts/sync.ts` — downloads audio with yt-dlp, uploads `audio/<videoId>.m4a`
  to Blob, and writes a manifest to `library/<timestamp>.json`. Each save is a
  new immutable pathname because Blob's CDN serves overwritten paths stale for
  a while; readers list the prefix and take the newest.
- `app/api/songs/route.ts` — read-only endpoint that returns the newest manifest.
- `lib/store.ts` — IndexedDB library + background sync engine (runs on start,
  on reconnect, on tab focus, and on a slow interval).
- `lib/player.ts`, `lib/queue.ts` — playback and queue/shuffle logic.
- `lib/wheel.ts`, `lib/clicker.ts` — wheel gesture math and the click sound.
- `public/sw.js` — service worker caching the app shell for offline launch.

## Notes

- Everything is public: your deployed site and the Blob URLs are unauthenticated.
  Don't put anything private in there.
- Only download content you have the right to download; respect YouTube's terms
  and your local copyright law.
- Storage and bandwidth count against your Vercel Blob usage.
- The LCD font is ChicagoFLF by Robin Casady (public domain).

See [PLAN.md](PLAN.md) for the original design notes.
