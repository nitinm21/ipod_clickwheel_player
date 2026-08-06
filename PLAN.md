# Offline iPod — Implementation Plan (v3)

A nostalgia-first, offline-capable music player PWA with a classic iPod click-wheel UI.
Source on GitHub (shareable — anyone can run their own), deployed to Vercel via the
GitHub integration (`git push` = deploy). Songs are added **the iTunes way**: a sync
script on your laptop takes a batch of YouTube links, extracts the audio, and uploads it
to Vercel Blob; the phone auto-caches everything the next time it's online.

> **v3 changes:** (1) full UI design specification — unambiguous enough for an agent to
> build without guessing; (2) plan restructured into **phases with a hard pause after
> each one**: automated verification runs first (CLI, Playwright MCP, Chrome DevTools
> MCP), then a short manual checklist for you, and building does not continue until you
> say so.

---

## 1. Product summary

| Decision | Choice (confirmed) |
|---|---|
| Ingestion | Batch of YouTube links → local sync CLI (yt-dlp on the laptop) → Vercel Blob |
| Offline strategy | Phone auto-caches every song when online; per-song "offline ready" indicator |
| Access control | None needed — deployed app is read-only; writes require the Blob token (laptop only) |
| Library size | 100–200 songs (~0.5–1 GB at 128 kbps AAC) |
| Platform | Mobile-first PWA; portrait only; no desktop optimization |
| Display | Song title only — no album art, no folders |
| Controls | Click wheel: scroll, select, prev/next, play/pause, shuffle |
| Sharing | Public GitHub repo; README "Run your own" flow; no audio in git |

Out of scope: album art, playlists/folders, adding songs from the phone, accounts, MP3
upload, desktop layout, dark mode (see §5 — the device *is* the theme).

---

## 2. Architecture

```
┌────────── Laptop ("iTunes") ─────────────┐
│  npm run sync -- <link> <link> ...        │
│  yt-dlp (residential IP = reliable)       │
│  → clean title → upload to Vercel Blob    │
│  → update library.json                    │
└────────────────────┬──────────────────────┘
                     ▼
┌─────────────── Vercel ────────────────────┐
│  Static Next.js app + GET /api/songs      │
│  Blob: audio/<videoId>.m4a + library.json │
└────────────────────┬──────────────────────┘
                     │ (only when online)
┌────────── Phone (PWA, offline) ───────────┐
│  iPod UI · SW precaches app shell         │
│  IndexedDB: audio Blobs + metadata mirror │
│  <audio> on blob: URLs + Media Session    │
└───────────────────────────────────────────┘
```

### Stack & key decisions (carried from v2, condensed)

- **Next.js (App Router) + TypeScript.** Effectively static; the only route is
  `GET /api/songs` (reads `library.json` from Blob, cache-busted).
- **Sync CLI** `scripts/sync.ts`: requires `yt-dlp` (`brew install yt-dlp`) and
  `BLOB_READ_WRITE_TOKEN` in `.env.local` (`vercel env pull`). Downloads
  `bestaudio[ext=m4a]` (YouTube's 128 kbps AAC, format 140 — **no ffmpeg needed**, and
  m4a plays natively everywhere; Opus/WebM doesn't on iOS). Dedupe by video ID;
  `--remove <id>`, `--list`; one bad link never aborts a batch; per-link ✓/↷/✗ summary.
- **Audio in IndexedDB as Blobs**, played via `URL.createObjectURL`. This deliberately
  bypasses the service worker for playback: SW-cached audio breaks on Safari's `Range`
  requests; blob URLs seek natively everywhere. SW precaches **only the app shell**.
- **Phone sync engine:** on load/regain-network, fetch manifest → diff → download
  missing sequentially → delete removed; mirror manifest in IndexedDB for offline boot.
- **Media Session API** for lock-screen/Bluetooth controls (the driving use case).
- **GitHub is the hub:** all commits land in
  **https://github.com/nitinm21/ipod_clickwheel_player** (`origin`, branch `main`) —
  the repo already exists; Vercel connects to it via the Git integration, so push to
  `main` = production deploy, branches = preview URLs. Simple clear commit messages;
  `.env.local` and downloads gitignored; **no audio ever touches git** (repo stays
  tiny, nobody's library leaks).
- **Vercel CLI is installed and authenticated on this machine** — use it directly for
  project setup (`vercel link`, `vercel git connect`), env management
  (`vercel env pull`), Blob store wiring, and inspecting deployments
  (`vercel inspect`/`vercel ls`). Deploys themselves still flow through GitHub pushes,
  not `vercel deploy`.
- **Sharing:** README "Run your own": fork or Deploy-with-Vercel button → add Blob store
  → `vercel env pull` → `brew install yt-dlp` → `npm run sync -- <links>`. Nothing in
  the code is instance-specific.
- Title cleaning in `lib/titles.ts` (shared CLI/app, unit-tested): strip
  `(Official Video)`, `[Lyrics]`, `| ...`, `HD/4K`, feat-noise; collapse whitespace;
  store `title` (cleaned) + `rawTitle`.
- Storage quotas: ~1 GB is realistic on modern phones **when installed to home screen**
  (one-time hint in app); `navigator.storage.persist()`; sync engine self-heals from
  eviction. YouTube ToS caveat acknowledged: private personal tool.

---

## 3. UI DESIGN SPECIFICATION

### 3.1 Design direction

**Subject:** a 2004 4th-generation iPod (the monochrome click-wheel one) reborn as a
phone-sized web app. The audience is one nostalgic person on a long drive; the page's
single job is *play the songs you already chose, nothing else*.

**Thesis / signature element:** the **monochrome LCD** — pale green-grey backlit
screen, hard black pixels, Chicago-style bitmap type, inverted highlight bar, and a
marquee that only scrolls on the selected row. Everything else (the white acrylic face,
the grey wheel) stays quiet so the LCD is the one memorable thing.

**The deliberate risk:** full pixel-grid fidelity. No anti-aliased "modern take", no
drop shadows on text, no smooth 60fps marquee — text steps in whole pixels, the
highlight bar is a hard rectangle, view changes are instant (the real monochrome iPod
had no transition animations). Restraint *is* the aesthetic.

**No dark mode.** The device is physical: a white iPod doesn't turn black at night.
Ignore `prefers-color-scheme` entirely.

### 3.2 Design tokens

```css
/* Device body */
--face:        #F2F1EC;  /* white acrylic front */
--face-edge:   #D9D8D2;  /* subtle vignette at viewport edges */
--wheel:       #DCDDD8;  /* click wheel ring */
--wheel-label: #9FA29E;  /* MENU / ⏮ ⏭ ⏯ printed labels */
--wheel-line:  #C4C5C0;  /* 1px ring borders */
--button:      #F2F1EC;  /* center button (concave) */

/* The LCD (signature) */
--lcd:         #C9D5C4;  /* backlit green-grey */
--lcd-glow:    #D6E2D0;  /* top 20% subtle backlight gradient */
--pixel:       #1B211C;  /* every dark pixel on screen */
--lcd-bezel:   #3A3C38;  /* 2px screen bezel */
```

No other colors exist in the app. Status/errors/indicators are all drawn in `--pixel`
on `--lcd`. (These tokens are the starting palette; final values may be nudged ±5%
during Phase 4 visual QA against screenshots — nudges only, no new colors.)

### 3.3 Typography

- **LCD face:** a free Chicago-style bitmap font, self-hosted as woff2 (required for
  offline anyway). First candidate **ChicagoFLF** (long-standing freeware Chicago
  clone); license verified at build time, fallback candidate Sysfont, final fallback
  stack `"Chicago", "Charcoal", system-ui` with `font-weight: 700`.
- **Rendering:** `-webkit-font-smoothing: none` where honored; never letter-space the
  bitmap face; sizes only from the scale below (pixel-grid sizes, no in-betweens):

| Role | Size/line | Usage |
|---|---|---|
| `lcd-title` | 16/22px | header bar title |
| `lcd-row` | 16/28px | menu & song rows, Now Playing title at rest |
| `lcd-big` | 20/26px | Now Playing title (it's the hero of that view) |
| `lcd-small` | 12/16px | index "14 of 172", times, status line, hints |

- **Device-body text** (only "MENU" on the wheel): 13px, 0.12em letter-spacing,
  `--wheel-label`, system-ui bold — it's silkscreen print, not LCD.

### 3.4 Layout geometry (reference viewport 390×844; all values fluid via clamp)

The whole viewport is the iPod's front face (`--face`, radial vignette to
`--face-edge`). Portrait locked via manifest; safe areas respected with
`env(safe-area-inset-*)`.

```
┌──────────────────────────────┐  viewport = device face
│   ┌───[ LCD SCREEN ]─────┐   │  screen: width min(88vw, 360px), aspect 5:4,
│   │ ┌──────────────────┐ │   │  centered, top = safe-top + 20px;
│   │ │ header (26px)    │ │   │  bezel: 2px --lcd-bezel, radius 6px,
│   │ ├──────────────────┤ │   │  inset box-shadow (recessed look)
│   │ │ content          │ │   │
│   │ │ (6 rows visible) │ │   │
│   │ └──────────────────┘ │   │
│   └──────────────────────┘   │
│                              │
│         M E N U              │  wheel: diameter min(78vw, 320px),
│      ┌──────────┐            │  horizontally centered, vertically centered
│  ⏮  │  center  │  ⏭        │  in the space below the screen;
│      │  button  │            │  center button diameter = 38% of wheel
│      └──────────┘            │
│           ⏯                  │
└──────────────────────────────┘
```

- **Screen chrome:** the LCD sits behind a bezel; inside, a 1px `--pixel` outline. A
  `--lcd-glow` gradient covers the top ~20% at 40% opacity (the backlight).
- **Header bar (26px):** bottom-bordered 1px `--pixel`. Left 24px: play state glyph
  (▶ playing / ⏸ paused / blank idle). Center: view title (`lcd-title`). Right 30px:
  battery glyph (19×10px, 1px outline + 2px terminal nub; fill segments from the
  Battery API when available, static-full otherwise; a 7×9px ↓ replaces it while the
  background sync engine is downloading).
- **Content area:** exactly **6 rows** of 28px (list views), 8px side padding.
- **Wheel:** ring drawn with two 1px `--wheel-line` circles + very subtle radial
  gradient; center button concave (inset shadow, top-lit). Labels at 12 o'clock
  ("MENU"), 9 (⏮), 3 (⏭), 6 (⏯) in `--wheel-label`, glyphs 16px. Pressing a zone
  darkens that label to `--pixel` for 120ms (the only "button feedback" — the physical
  wheel didn't move, and neither does this one).

### 3.5 Views (all states specified)

**Navigation model:** a stack. Center button = select/push. MENU zone = pop/back.
View swaps are **instant** (no slide animation — monochrome-authentic).

#### V1 · Main Menu — header title "iPod"
Rows, in order:
1. `Songs                    >`
2. `Shuffle              Off` — selecting toggles Off/On in place (no navigation)
3. `Now Playing              >` — **only rendered when a queue exists** (something is
   playing or paused)
Bottom of content area, pinned: status line (`lcd-small`, centered):
`172 of 172 songs offline ✓` · while syncing: `Syncing… 41 of 172 ↓` · offline with
gaps: `164 of 172 on this device`.

#### V2 · Songs — header title "Songs"
- All songs, **alphabetical by cleaned title** (iPod-authentic).
- Row anatomy (28px): title left at 8px; right-aligned 16px indicator column:
  `✓` cached · `↓` currently downloading (this song) · `○` not cached. Glyphs drawn as
  12×12 inline SVGs on the pixel grid, `--pixel`.
- Selected row: hard inverted rectangle — `--pixel` fill, `--lcd` text, full row width.
- **Marquee:** only the selected row, only if the title overflows: after 1s pause,
  steps left 1 character every 120ms to the end, 1s pause, snaps back, repeats.
  Non-selected overflow = hard clip (no ellipsis — LCDs didn't have them).
  `prefers-reduced-motion`: marquee disabled, clip only.
- **Scrollbar** (only when >6 songs): right edge, 7px wide, 1px `--pixel` outline,
  proportional solid thumb; content rows shorten to avoid it (authentic).
- Selecting a song: builds the queue (alphabetical or shuffled order), starts playback,
  pushes V3.
- If the song is `○` and we're **online**: push V3 immediately, show download state
  (below), auto-play once stored. If `○` and **offline**: row flashes (inverts twice,
  240ms total) and nothing happens — can't play what isn't there.
- **Empty library:** centered on LCD — `lcd-row` "No music yet." + `lcd-small`
  "Add songs from your computer:" + `npm run sync` on its own line. An empty screen is
  an instruction, not a mood.

#### V3 · Now Playing — header title "Now Playing"
Layout top→bottom in the content area (8px padding):
1. Row (`lcd-small`): left `14 of 172`; right `⇄` glyph only when shuffle is on.
2. Song title (`lcd-big`), left-aligned, vertically centered in remaining upper space;
   marquee rules as V2 (it is always the "selected" element here).
3. Progress bar, pinned to bottom third: full width, 10px tall, 1px `--pixel` outline,
   solid `--pixel` fill for elapsed portion (hard edge, no radius).
4. Times row (`lcd-small`): elapsed left (`1:23`), remaining right (`-2:41`).
- **Downloading state** (selected an uncached song online): title shows, progress bar
  renders the *download* instead, times row reads `Downloading… 62%`; auto-plays when
  done.
- **Wheel rotation in this view scrubs**: each 12° tick = ±2% of duration; scrubbing
  pauses the marquee and shows the seek position live; release commits (audio
  `currentTime` set on last tick, debounced 150ms).
- Center button here: toggles play/pause (same as ⏯ zone).

#### V4 · one-time hint overlay (first visit, online, not installed)
Full-LCD message in LCD style: "Add me to your Home Screen for offline drives." +
platform-appropriate one-liner (iOS: "Share → Add to Home Screen"). Any wheel/center
press dismisses forever (`localStorage` flag). Never shown when running installed.

### 3.6 Click wheel interaction spec

Pointer-events based, single-pointer; the entire wheel is one touch surface.

- **Geometry:** ring = between 38% (center button edge) and 100% of wheel radius.
- **Gesture classification:** on `pointerdown` record angle θ₀ (atan2 from wheel
  center) and position. If cumulative |Δθ| > 10° → it's a **rotation** (locks in; no
  tap can fire). If `pointerup` within 250ms and movement < 8px → it's a **tap** on
  whichever zone (MENU / ⏮ / ⏭ / ⏯ / center) contains the point; zones are the four
  45°–135° quadrant arcs + the center circle.
- **Rotation:** every **12° = 1 tick**. Tick = move selection ±1 row (V1/V2) or scrub
  ±2% (V3). Clockwise = down/forward. Crossing the ±180° wrap is handled (shortest
  angular delta). **Acceleration:** if angular velocity > 240°/s, each tick moves 2
  rows. No momentum after `pointerup` — the wheel stops when your thumb does.
- **Clicker:** every tick plays the iPod "click" — synthesized in Web Audio (≈3ms
  2kHz-ish filtered noise burst, gain 0.15, pooled/re-triggerable) — **no audio
  assets**; plus `navigator.vibrate(3)` where supported (Android; iOS has no vibration
  API — sound only). Clicker also fires on zone taps.
- **Buttons:** MENU = pop view (on V1: nothing). ⏮ = restart current song if elapsed
  > 3s, else previous in queue. ⏭ = next in queue (wraps). ⏯ = toggle play/pause.
  Center = select (V1/V2) / play-pause (V3).
- **Autoplay policy:** first playback always originates from a tap — inherently
  satisfied by the UI.

### 3.7 Playback & shuffle behavior

- One `<audio>` element. Queue = song IDs in alphabetical order, or Fisher–Yates
  shuffled when Shuffle is On. `ended` → next (wraps to start).
- Toggling shuffle mid-play keeps the current song playing: On = current song becomes
  head of a fresh shuffle; Off = queue returns to alphabetical, position = current
  song's alphabetical index. Shuffle state persists (localStorage).
- Media Session: title metadata + play/pause/next/prev handlers (lock screen &
  Bluetooth steering-wheel controls).
- Persist last state (song ID, position, every 5s) — reopening the app restores the
  queue paused at that spot.

### 3.8 Quality floor (built in, not announced)

Works from 320px-wide viewports; all wheel functions also keyboard-operable
(arrows = ticks, Enter = center, Escape = MENU, Space = ⏯ — makes Playwright
verification honest too); visible focus outline on the wheel when keyboard-focused;
`prefers-reduced-motion` respected (marquee off); WCAG-checked contrast for
`--pixel`-on-`--lcd` (≈12:1); screen-reader labels on the five wheel zones.

---

## 4. Repository structure

```
offline_music/
├── PLAN.md / README.md
├── scripts/sync.ts              # the "iTunes" CLI
├── app/
│   ├── layout.tsx / page.tsx    # device face: Screen + ClickWheel
│   ├── manifest.ts              # PWA manifest (standalone, portrait)
│   └── api/songs/route.ts       # GET library.json (read-only)
├── components/
│   ├── ClickWheel.tsx           # §3.6 gesture math, zones, clicker
│   ├── Screen.tsx               # bezel/LCD chrome + header bar
│   ├── MenuList.tsx             # rows, highlight, marquee, scrollbar
│   └── NowPlaying.tsx           # §3.5 V3
├── lib/
│   ├── player.ts                # queue, shuffle, audio, Media Session
│   ├── store.ts                 # IndexedDB (idb) + phone sync engine
│   ├── wheel.ts                 # pure gesture math (angle→ticks) — unit-testable
│   └── titles.ts                # title cleaning (shared with CLI)
├── public/sw.js                 # app-shell precache
└── public/fonts/                # self-hosted LCD font (woff2)
```

Env: `BLOB_READ_WRITE_TOKEN` (Vercel + laptop `.env.local` only).

---

## 5. PHASED BUILD — with a hard pause after every phase

Rules of engagement, every phase:
1. I build the phase, committing/pushing as I go (each push auto-deploys a preview or
   production build via the GitHub integration).
2. I run the **automated verification** listed for the phase — unit tests via the CLI,
   plus browser checks through **Playwright MCP / Chrome DevTools MCP** at a 390×844
   mobile viewport (touch emulation), including screenshots that I visually critique
   against §3.
3. I report results (including screenshots' findings and the deployed URL) and **stop**.
4. You run the **manual checklist** on your real phone and reply "continue" (or with
   corrections). I do not start the next phase without that.

---

### Phase 1 — Skeleton: repo, GitHub, Vercel, deploy pipeline
**Build:** Next.js scaffold (TS, App Router), PWA manifest, empty LCD-placeholder page,
`.gitignore`, git init with `origin` set to the existing repo
**github.com/nitinm21/ipod_clickwheel_player**, first push to `main`; Vercel project
created from that GitHub repo (Vercel CLI: `vercel link` + `vercel git connect`) with
Blob store linked and `vercel env pull` working.
**Automated:** push to `main` → poll deployment → `curl` production URL returns 200
with the placeholder; `GET /api/songs` returns `[]`; DevTools MCP loads the URL at
mobile viewport, console is error-free.
**Manual (you):** open the production URL on your phone — it loads; confirm the GitHub
repo looks right under your account. **⏸ PAUSE**

### Phase 2 — Sync CLI (the "iTunes" side)
**Build:** `scripts/sync.ts` per §2, `lib/titles.ts`, unit tests (vitest) for title
cleaning + manifest ops.
**Automated:** vitest green; live run `npm run sync` with 2–3 real YouTube links →
assert Blob contains the m4a files + `library.json` matches; re-run same links →
all skipped (dedupe); `--remove` deletes from both; `GET /api/songs` on the deployed
app returns the manifest; downloaded m4a spot-checked (file size sane, plays via
`afplay` locally).
**Manual (you):** run `npm run sync -- <a couple of YOUR links>` yourself on the
laptop; check the summary table feels right and your songs appear at `/api/songs`.
**⏸ PAUSE**

### Phase 3 — Playback + offline engine (placeholder UI)
**Build:** `lib/store.ts` (IndexedDB + phone sync engine), `lib/player.ts` (queue,
shuffle, Media Session, persistence), `public/sw.js` (app-shell precache), temporary
unstyled list UI to drive it.
**Automated:** vitest for queue/shuffle/persistence logic; Playwright MCP: load
deployed app → wait until all songs report cached → **emulate offline** → reload → app
boots, list renders, tap a song → assert `audio.currentTime` advances, next/prev/wrap
behave, uncached-offline is blocked; storage persisted across reload.
**Manual (you):** on your phone: open app on WiFi, wait for "all offline", enable
airplane mode, kill and reopen the app, play through a few songs; check lock-screen
title + controls work (the car test, at home). **⏸ PAUSE**

### Phase 4 — The iPod UI (the big one; built to §3 exactly)
**Build:** design tokens, LCD font, Screen/MenuList/NowPlaying/ClickWheel per §3.2–3.8,
`lib/wheel.ts` gesture math, clicker sound, all view states incl. empty/downloading/
offline-blocked, keyboard parity, reduced-motion.
**Automated:** vitest on `wheel.ts` (angle deltas, wrap-around, tick counting,
acceleration threshold, tap-vs-rotate classification); Playwright MCP at 390×844:
synthetic pointer arcs on the wheel move the selection the exact expected rows (incl.
2×-acceleration case), quadrant taps fire the right actions, keyboard parity, marquee
starts on overflow rows, scrollbar proportions, V1↔V2↔V3 navigation, downloading
state; screenshots of every view/state at 390×844 and 320×568 — I critique them
against §3 (geometry, 6 rows, inverted highlight, glyphs on pixel grid) and iterate
before handing to you; console clean; Lighthouse a11y pass via DevTools MCP.
**Manual (you):** the feel test on a real thumb — wheel precision and acceleration,
clicker sound level, tap-zone sizes, marquee speed, overall "is this an iPod?"
Nostalgia is the acceptance criterion and only you hold it. **⏸ PAUSE**

### Phase 5 — Polish + ship + shareability
**Build:** install hint (V4), `storage.persist()`, README ("Run your own" +
Deploy-with-Vercel button + sync usage + the pre-drive ritual), repo description/topics,
final sweep of console warnings.
**Automated:** Lighthouse PWA/installability + a11y audits; clean-checkout dry run of
the README instructions (fresh clone → install → build); full Playwright regression of
Phases 3–4 checks against production.
**Manual (you):** install to Home Screen; the full ritual: sync a fresh song from the
laptop → open app on WiFi → airplane mode → drive-simulate with shuffle on; optionally
share the repo link with a friend to fork. **⏸ PAUSE → done**

---

## 6. Risks & open eyes

| Risk | Likelihood | Mitigation |
|---|---|---|
| yt-dlp breaks after a YouTube change | Occasional | Residential IP avoids the hard failure mode; `brew upgrade yt-dlp` fixes the rest; per-link failure reporting. |
| LCD font licensing | Low | Verified in Phase 4 before bundling; two fallback candidates + system stack (§3.3). |
| iOS storage eviction of ~1 GB | Low (installed) | Install hint, `storage.persist()`, sync engine re-downloads evicted files. |
| Locked-screen playback quirks on iOS | Medium | Media Session + audio element is the supported path; explicitly on Phase 3's manual checklist. |
| Wheel feel is subjective | Certain | Tick angle (12°), acceleration threshold, and clicker gain are named constants — tunable in minutes after your Phase 4 feel test. |
| Video has no m4a stream | Rare | Reported per-link; batch continues. |
| YouTube ToS | — | Personal-use tool, laptop-only ingestion, private library. Your call, made informed. |

---

*Reviewed and ready? Say the word and Phase 1 begins.*
