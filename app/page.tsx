"use client";

/**
 * TEMPORARY Phase-3 UI — an unstyled functional list to drive the offline
 * engine and player. Replaced wholesale by the iPod UI in Phase 4.
 */

import { useEffect, useRef, useState } from "react";
import { Player, type PlayerSnapshot } from "@/lib/player";
import { startSyncEngine, type LibraryState } from "@/lib/store";

function fmt(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function Home() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const restored = useRef(false);
  const [lib, setLib] = useState<LibraryState | null>(null);
  const [snap, setSnap] = useState<PlayerSnapshot | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

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

  const statusLine = (() => {
    if (!lib) return "Loading…";
    const { songs, cached, downloading, offline } = lib;
    if (songs.length === 0) return "No music yet — add songs from your computer.";
    if (downloading) return `Syncing… ${cached.size} of ${songs.length} ↓`;
    if (offline && cached.size < songs.length)
      return `${cached.size} of ${songs.length} on this device`;
    return `${cached.size} of ${songs.length} songs offline ✓`;
  })();

  async function tapSong(id: string) {
    const isCached = lib?.cached.has(id);
    if (!isCached) {
      setBlocked(id);
      setTimeout(() => setBlocked(null), 500);
      return;
    }
    await playerRef.current?.playFrom(id);
  }

  return (
    <main style={{ padding: 16, maxWidth: 480, margin: "0 auto", fontFamily: "monospace" }}>
      <audio ref={audioRef} data-testid="audio" />
      <h1 style={{ fontSize: 16 }}>iPod (phase 3 test rig)</h1>
      <p data-testid="status">{statusLine}</p>

      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <button data-testid="btn-prev" onClick={() => playerRef.current?.prev()}>⏮</button>
        <button data-testid="btn-toggle" onClick={() => playerRef.current?.toggle()}>⏯</button>
        <button data-testid="btn-next" onClick={() => playerRef.current?.next()}>⏭</button>
        <button
          data-testid="btn-shuffle"
          onClick={() => playerRef.current?.setShuffle(!snap?.shuffle)}
        >
          shuffle: {snap?.shuffle ? "On" : "Off"}
        </button>
      </div>

      <p data-testid="now-playing">
        {snap?.currentId
          ? `${snap.playing ? "▶" : "⏸"} ${
              lib?.songs.find((s) => s.id === snap.currentId)?.title ?? snap.currentId
            } · ${fmt(snap.position)} / ${fmt(snap.duration)} · ${snap.queuePosition} of ${snap.queueLength}`
          : "nothing playing"}
      </p>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {lib?.songs.map((s) => (
          <li key={s.id} style={{ borderBottom: "1px solid #ccc" }}>
            <button
              data-testid={`song-${s.id}`}
              onClick={() => tapSong(s.id)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 4px",
                background: blocked === s.id ? "#000" : "transparent",
                color: blocked === s.id ? "#fff" : "inherit",
                border: 0,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {lib.cached.has(s.id) ? "✓" : lib.downloading === s.id ? "↓" : "○"}{" "}
              {s.title} · {fmt(s.duration)}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
