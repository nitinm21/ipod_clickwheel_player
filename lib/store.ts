/**
 * On-device storage and the phone sync engine.
 *
 * Audio lives in IndexedDB as Blobs (played via object URLs — deliberately
 * not the service worker: SW-cached audio breaks on Safari Range requests).
 * The manifest is mirrored in IndexedDB so the app can boot offline.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Song } from "./manifest";

const DB_NAME = "ipod";
const AUDIO = "audio";
const KV = "kv";
const MIRROR_KEY = "library";

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore(AUDIO);
        d.createObjectStore(KV);
      },
    });
  }
  return dbPromise;
}

export async function getAudio(id: string): Promise<Blob | undefined> {
  return (await db()).get(AUDIO, id);
}

export async function putAudio(id: string, blob: Blob): Promise<void> {
  await (await db()).put(AUDIO, blob, id);
}

export async function deleteAudio(id: string): Promise<void> {
  await (await db()).delete(AUDIO, id);
}

export async function cachedIds(): Promise<Set<string>> {
  const keys = await (await db()).getAllKeys(AUDIO);
  return new Set(keys as string[]);
}

async function getMirror(): Promise<Song[] | null> {
  return (await (await db()).get(KV, MIRROR_KEY)) ?? null;
}

async function setMirror(songs: Song[]): Promise<void> {
  await (await db()).put(KV, songs, MIRROR_KEY);
}

async function fetchManifest(): Promise<Song[] | null> {
  try {
    const res = await fetch("/api/songs", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Song[];
  } catch {
    return null; // offline
  }
}

export type LibraryState = {
  songs: Song[];
  /** IDs with audio stored on this device. */
  cached: Set<string>;
  /** ID currently being downloaded, if any. */
  downloading: string | null;
  /** True when the manifest couldn't be fetched (device offline). */
  offline: boolean;
};

/**
 * The phone sync engine. On start and whenever the network comes back:
 * fetch manifest → diff → delete removed → download missing sequentially.
 * Emits state after every step so the UI can render per-song indicators.
 * Returns a stop function.
 */
export function startSyncEngine(
  emit: (state: LibraryState) => void
): () => void {
  let stopped = false;
  let running = false;

  async function run() {
    if (running || stopped) return;
    running = true;
    try {
      const manifest = await fetchManifest();
      const offline = manifest === null;
      if (manifest) await setMirror(manifest);
      const songs = manifest ?? (await getMirror()) ?? [];
      const wanted = new Set(songs.map((s) => s.id));

      let cached = await cachedIds();
      for (const id of cached) {
        if (!wanted.has(id)) await deleteAudio(id);
      }
      cached = await cachedIds();
      emit({ songs, cached, downloading: null, offline });
      if (offline) return;

      for (const song of songs) {
        if (stopped) return;
        if (cached.has(song.id)) continue;
        emit({ songs, cached, downloading: song.id, offline: false });
        try {
          const res = await fetch(song.url);
          if (!res.ok) continue; // skip this song, try the rest
          const blob = await res.blob();
          await putAudio(song.id, blob);
          cached = new Set(cached).add(song.id);
        } catch {
          // Network died mid-download — the 'online' listener will resume.
          emit({ songs, cached, downloading: null, offline: true });
          return;
        }
      }
      emit({ songs, cached, downloading: null, offline: false });
    } finally {
      running = false;
    }
  }

  const onOnline = () => void run();
  window.addEventListener("online", onOnline);
  void run();
  return () => {
    stopped = true;
    window.removeEventListener("online", onOnline);
  };
}
