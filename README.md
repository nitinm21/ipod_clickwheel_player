# iPod Click-Wheel Player

A nostalgia-first, offline-capable music player PWA with a classic iPod
click-wheel UI. Add songs from your laptop with a sync CLI; your phone caches
everything for offline drives.

> Work in progress — see [PLAN.md](PLAN.md) for the full design and build plan.

## Stack

- Next.js (App Router) + TypeScript, deployed on Vercel
- Audio stored in Vercel Blob, cached on-device in IndexedDB
- Sync CLI (`npm run sync`) built on yt-dlp

A full "Run your own" guide lands here at the end of the build.
