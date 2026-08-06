"use client";

/**
 * The device: LCD + click wheel, and the view stack (§3.5).
 * V1 main menu · V2 songs · V3 now playing. Center = select, MENU = back,
 * view swaps are instant — the monochrome iPod had no transitions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ClickWheel from "@/components/ClickWheel";
import MenuList, { VISIBLE_ROWS, type MenuRow } from "@/components/MenuList";
import NowPlaying from "@/components/NowPlaying";
import Screen, { type PlayState } from "@/components/Screen";
import type { Song } from "@/lib/manifest";
import { sortByTitle } from "@/lib/manifest";
import { Player, type PlayerSnapshot } from "@/lib/player";
import {
  downloadWithProgress,
  startSyncEngine,
  type LibraryState,
} from "@/lib/store";
import type { Zone } from "@/lib/wheel";

type ViewName = "menu" | "songs" | "nowplaying";

const SCRUB_COMMIT_MS = 150;
const SCRUB_STEP = 0.02; // ±2% of duration per tick
const FLASH_MS = 260;

function CachedGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-label="on this device">
      <path d="M1 6 L4.5 10 L11 2 L9.5 1 L4.5 7.5 L2.5 5 Z" fill="currentColor" />
    </svg>
  );
}
function DownloadingGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-label="downloading">
      <rect x="5" y="0" width="2" height="7" fill="currentColor" />
      <path d="M2 5 L6 11 L10 5 H8 V5 H4 Z" fill="currentColor" />
    </svg>
  );
}
function NotCachedGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-label="not downloaded">
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export default function Home() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const restored = useRef(false);

  const [lib, setLib] = useState<LibraryState | null>(null);
  const [snap, setSnap] = useState<PlayerSnapshot | null>(null);

  const [stack, setStack] = useState<ViewName[]>(["menu"]);
  const view = stack[stack.length - 1];

  const [menuIndex, setMenuIndex] = useState(0);
  const [songsIndex, setSongsIndex] = useState(0);
  const [songsWindow, setSongsWindow] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);

  const [scrub, setScrub] = useState<number | null>(null);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Song being priority-downloaded after a tap (§3.5 V3 downloading state).
  const [pending, setPending] = useState<{ id: string; progress: number } | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const player = new Player(audioRef.current!);
    playerRef.current = player;
    const unsub = player.subscribe(setSnap);
    const stop = startSyncEngine((state) => {
      setLib(state);
      player.setSongs(state.songs);
      if (!restored.current && state.songs.length > 0) {
        restored.current = true;
        void player.restore();
      }
    });
    return () => {
      stop();
      unsub();
      player.destroy();
    };
  }, []);

  const songs = useMemo(() => sortByTitle(lib?.songs ?? []), [lib?.songs]);
  const currentSong: Song | undefined = songs.find((s) => s.id === snap?.currentId);
  const hasQueue = Boolean(snap?.currentId);

  /* ------------------------------------------------ V1 rows + status line */

  const menuRows: MenuRow[] = useMemo(() => {
    const rows: MenuRow[] = [
      { id: "songs", label: "Songs", right: ">" },
      { id: "shuffle", label: "Shuffle", right: snap?.shuffle ? "On" : "Off" },
    ];
    if (hasQueue) rows.push({ id: "nowplaying", label: "Now Playing", right: ">" });
    return rows;
  }, [snap?.shuffle, hasQueue]);

  const statusLine = (() => {
    if (!lib) return "";
    const { cached, downloading, offline } = lib;
    const total = songs.length;
    if (total === 0) return "";
    if (downloading || pending) return `Syncing… ${cached.size} of ${total} ↓`;
    if (offline && cached.size < total) return `${cached.size} of ${total} on this device`;
    return `${total === cached.size ? `${total} of ${total}` : `${cached.size} of ${total}`} songs offline ${
      cached.size === total ? "✓" : ""
    }`;
  })();

  /* --------------------------------------------------------- navigation */

  const push = (v: ViewName) => setStack((s) => [...s, v]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const moveSelection = (rows: number) => {
    if (view === "menu") {
      setMenuIndex((i) => Math.max(0, Math.min(menuRows.length - 1, i + rows)));
    } else if (view === "songs") {
      setSongsIndex((i) => {
        const next = Math.max(0, Math.min(songs.length - 1, i + rows));
        setSongsWindow((w) => {
          if (next < w) return next;
          if (next > w + VISIBLE_ROWS - 1) return next - VISIBLE_ROWS + 1;
          return w;
        });
        return next;
      });
    }
  };

  const scrubBy = (rows: number) => {
    const player = playerRef.current;
    if (!player || !snap?.currentId) return;
    const duration = snap.duration || currentSong?.duration || 0;
    if (duration <= 0) return;
    const base = scrub ?? snap.position;
    const next = Math.max(0, Math.min(duration, base + rows * SCRUB_STEP * duration));
    setScrub(next);
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      player.seek(next);
      setScrub(null);
    }, SCRUB_COMMIT_MS);
  };

  const onRows = (rows: number) => {
    if (view === "nowplaying") scrubBy(rows);
    else moveSelection(rows);
  };

  const selectSong = async (song: Song) => {
    const player = playerRef.current!;
    if (lib?.cached.has(song.id)) {
      void player.playFrom(song.id);
      push("nowplaying");
      return;
    }
    if (lib?.offline) {
      // Can't play what isn't there (§3.5 V2) — flash the row.
      setFlashId(song.id);
      setTimeout(() => setFlashId(null), FLASH_MS);
      return;
    }
    // Online + uncached: show V3 in downloading state, play once stored.
    setPending({ id: song.id, progress: 0 });
    push("nowplaying");
    const ok = await downloadWithProgress(song, (frac) =>
      setPending((p) => (p && p.id === song.id ? { ...p, progress: frac } : p))
    );
    setPending((p) => (p && p.id === song.id ? null : p));
    if (ok) void player.playFrom(song.id);
  };

  const onCenter = () => {
    const player = playerRef.current!;
    if (view === "menu") {
      const row = menuRows[menuIndex];
      if (!row) return;
      if (row.id === "songs") push("songs");
      else if (row.id === "shuffle") player.setShuffle(!snap?.shuffle);
      else if (row.id === "nowplaying") push("nowplaying");
    } else if (view === "songs") {
      const song = songs[songsIndex];
      if (song) void selectSong(song);
    } else {
      void player.toggle();
    }
  };

  const onZone = useCallback(
    (zone: Zone) => {
      const player = playerRef.current;
      if (!player) return;
      if (zone === "menu") pop();
      else if (zone === "center") onCenter();
      else if (zone === "play") void player.toggle();
      else if (zone === "next") void player.next();
      else if (zone === "prev") void player.prev();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, menuIndex, songsIndex, songs, menuRows, snap, lib, scrub]
  );

  /* ------------------------------------------------------------ render */

  const playState: PlayState = !snap?.currentId
    ? null
    : snap.playing
      ? "playing"
      : "paused";

  const title =
    view === "menu" ? "iPod" : view === "songs" ? "Songs" : "Now Playing";

  const pendingSong = pending ? songs.find((s) => s.id === pending.id) : undefined;
  const npSong = pendingSong ?? currentSong;

  return (
    <main className="device">
      <audio ref={audioRef} data-testid="audio" />
      <Screen
        title={title}
        playState={playState}
        downloading={Boolean(lib?.downloading || pending)}
      >
        {view === "menu" && (
          <>
            <MenuList rows={menuRows} selectedIndex={menuIndex} windowStart={0} />
            <div className="status-line lcd-small" data-testid="status">
              {statusLine}
            </div>
          </>
        )}

        {view === "songs" &&
          (songs.length === 0 ? (
            <div className="empty">
              <div className="lcd-row">No music yet.</div>
              <div className="lcd-small">Add songs from your computer:</div>
              <div className="lcd-small">npm run sync</div>
            </div>
          ) : (
            <MenuList
              rows={songs.map((s) => ({
                id: s.id,
                label: s.title,
                right: lib?.cached.has(s.id) ? (
                  <CachedGlyph />
                ) : lib?.downloading === s.id || pending?.id === s.id ? (
                  <DownloadingGlyph />
                ) : (
                  <NotCachedGlyph />
                ),
              }))}
              selectedIndex={songsIndex}
              windowStart={songsWindow}
              flashId={flashId}
            />
          ))}

        {view === "nowplaying" && npSong && (
          <NowPlaying
            song={npSong}
            position={scrub ?? snap?.position ?? 0}
            duration={snap?.duration ?? 0}
            queuePosition={pending ? songsIndex + 1 : snap?.queuePosition ?? 0}
            queueLength={pending ? songs.length : snap?.queueLength ?? 0}
            shuffle={Boolean(snap?.shuffle)}
            scrubbing={scrub !== null}
            download={pending ? pending.progress : null}
          />
        )}
        {view === "nowplaying" && !npSong && (
          <div className="empty">
            <div className="lcd-row">Nothing playing.</div>
          </div>
        )}
      </Screen>

      <div className="wheel-area">
        <ClickWheel onRows={onRows} onZone={onZone} />
      </div>
    </main>
  );
}
