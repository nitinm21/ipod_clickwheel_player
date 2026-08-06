/**
 * The player: one <audio> element, a queue, shuffle, Media Session, and
 * position persistence. Audio comes out of IndexedDB as object URLs.
 */

import type { Song } from "./manifest";
import {
  buildQueue,
  nextIndex,
  prevIndex,
  restoreQueue,
  toggleShuffle,
  type PersistedState,
  type QueueState,
} from "./queue";
import { getAudio } from "./store";

const STATE_KEY = "ipod-player-v1";
const SHUFFLE_KEY = "ipod-shuffle-v1";
const SAVE_INTERVAL_MS = 5000;
const RESTART_THRESHOLD_S = 3;

export type PlayerSnapshot = {
  currentId: string | null;
  playing: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  /** 1-based position in queue, for "14 of 172". */
  queuePosition: number;
  queueLength: number;
};

export class Player {
  private audio: HTMLAudioElement;
  private songs = new Map<string, Song>();
  private q: QueueState;
  private objectUrl: string | null = null;
  private listeners = new Set<(s: PlayerSnapshot) => void>();
  private saveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(audio: HTMLAudioElement) {
    this.audio = audio;
    this.q = { queue: [], index: 0, shuffle: readShuffle() };

    audio.addEventListener("ended", () => void this.next(true));
    audio.addEventListener("play", () => this.emit());
    audio.addEventListener("pause", () => {
      this.save();
      this.emit();
    });
    audio.addEventListener("timeupdate", () => this.emit());
    audio.addEventListener("durationchange", () => this.emit());

    this.saveTimer = setInterval(() => this.save(), SAVE_INTERVAL_MS);
    this.setupMediaSession();
  }

  destroy() {
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.revoke();
    this.listeners.clear();
  }

  subscribe(fn: (s: PlayerSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): PlayerSnapshot {
    return {
      currentId: this.currentId,
      playing: !this.audio.paused && this.currentId !== null,
      position: this.audio.currentTime || 0,
      duration: this.audio.duration || 0,
      shuffle: this.q.shuffle,
      queuePosition: this.q.queue.length ? this.q.index + 1 : 0,
      queueLength: this.q.queue.length,
    };
  }

  get currentId(): string | null {
    return this.q.queue[this.q.index] ?? null;
  }

  get shuffle(): boolean {
    return this.q.shuffle;
  }

  /** Keep the song map current as the library syncs. */
  setSongs(songs: Song[]) {
    this.songs = new Map(songs.map((s) => [s.id, s]));
  }

  /** Start playback from a tapped song — builds a fresh queue (§3.5 V2). */
  async playFrom(songId: string): Promise<boolean> {
    const songs = [...this.songs.values()];
    this.q = buildQueue(songs, this.q.shuffle, songId);
    return this.load(songId, { autoplay: true });
  }

  /** Restore the last session's queue, paused at the saved spot (§3.7). */
  async restore(): Promise<boolean> {
    const persisted = readPersisted();
    const r = restoreQueue(persisted, [...this.songs.values()]);
    if (!r) return false;
    this.q = { queue: r.queue, index: r.index, shuffle: r.shuffle };
    return this.load(r.queue[r.index], { autoplay: false, position: r.position });
  }

  async toggle(): Promise<void> {
    if (!this.currentId) return;
    if (this.audio.paused) await this.audio.play().catch(() => {});
    else this.audio.pause();
  }

  async next(auto = false): Promise<void> {
    if (this.q.queue.length === 0) return;
    this.q.index = nextIndex(this.q);
    await this.load(this.currentId!, { autoplay: auto || !this.audio.paused });
  }

  async prev(): Promise<void> {
    if (this.q.queue.length === 0) return;
    // ⏮ restarts the current song when >3s in, else goes to the previous.
    if (this.audio.currentTime > RESTART_THRESHOLD_S) {
      this.audio.currentTime = 0;
      this.emit();
      return;
    }
    const wasPlaying = !this.audio.paused;
    this.q.index = prevIndex(this.q);
    await this.load(this.currentId!, { autoplay: wasPlaying });
  }

  seek(position: number) {
    if (!this.currentId) return;
    const d = this.audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    this.audio.currentTime = Math.min(Math.max(0, position), d - 0.05);
    this.emit();
  }

  /** §3.7 — keeps the current song playing; persists the choice. */
  setShuffle(on: boolean) {
    if (on === this.q.shuffle) return;
    const songs = [...this.songs.values()];
    if (this.currentId) {
      this.q = toggleShuffle(this.q, songs);
    } else {
      this.q = { ...this.q, shuffle: on };
    }
    writeShuffle(this.q.shuffle);
    this.save();
    this.emit();
  }

  private async load(
    id: string,
    opts: { autoplay: boolean; position?: number }
  ): Promise<boolean> {
    const blob = await getAudio(id);
    if (!blob) return false; // not cached — caller decides what to show
    this.revoke();
    this.objectUrl = URL.createObjectURL(blob);
    this.audio.src = this.objectUrl;
    if (opts.position) this.audio.currentTime = opts.position;
    if (opts.autoplay) await this.audio.play().catch(() => {});
    this.updateMediaSession();
    this.save();
    this.emit();
    return true;
  }

  private revoke() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private emit() {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  private save() {
    if (typeof localStorage === "undefined" || this.q.queue.length === 0) return;
    const state: PersistedState = {
      ...this.q,
      position: this.audio.currentTime || 0,
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  private setupMediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => void this.toggle());
    navigator.mediaSession.setActionHandler("pause", () => void this.toggle());
    navigator.mediaSession.setActionHandler("nexttrack", () => void this.next());
    navigator.mediaSession.setActionHandler("previoustrack", () => void this.prev());
  }

  private updateMediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const song = this.currentId ? this.songs.get(this.currentId) : undefined;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song?.title ?? "iPod",
      artist: "",
      album: "iPod",
    });
  }
}

function readPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

function readShuffle(): boolean {
  try {
    return localStorage.getItem(SHUFFLE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeShuffle(on: boolean) {
  try {
    localStorage.setItem(SHUFFLE_KEY, on ? "1" : "0");
  } catch {
    /* private mode etc. */
  }
}
