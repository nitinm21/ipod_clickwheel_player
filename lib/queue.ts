/**
 * Pure queue math — building, shuffling, advancing, and persisting the play
 * queue. No DOM, no storage: everything here is unit-testable.
 */

import { sortByTitle, type Song } from "./manifest";

export type QueueState = {
  /** Song IDs in play order. */
  queue: string[];
  /** Position of the current song in `queue`. */
  index: number;
  shuffle: boolean;
};

export function alphabeticalIds(songs: Song[]): string[] {
  return sortByTitle(songs).map((s) => s.id);
}

/** Fisher–Yates; `headId` (if given) is moved to the front after shuffling. */
export function shuffledIds(
  songs: Song[],
  rng: () => number = Math.random,
  headId?: string
): string[] {
  const ids = songs.map((s) => s.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  if (headId) {
    const k = ids.indexOf(headId);
    if (k > 0) {
      ids.splice(k, 1);
      ids.unshift(headId);
    }
  }
  return ids;
}

/** Build a fresh queue positioned at `startId` (or the first song). */
export function buildQueue(
  songs: Song[],
  shuffle: boolean,
  startId?: string,
  rng: () => number = Math.random
): QueueState {
  if (shuffle) {
    return { queue: shuffledIds(songs, rng, startId), index: 0, shuffle };
  }
  const queue = alphabeticalIds(songs);
  const index = startId ? Math.max(0, queue.indexOf(startId)) : 0;
  return { queue, index, shuffle };
}

export function nextIndex(state: QueueState): number {
  return state.queue.length === 0 ? 0 : (state.index + 1) % state.queue.length;
}

export function prevIndex(state: QueueState): number {
  const len = state.queue.length;
  return len === 0 ? 0 : (state.index - 1 + len) % len;
}

/**
 * §3.7: toggling shuffle keeps the current song playing. On = current song
 * becomes head of a fresh shuffle; Off = back to alphabetical order with the
 * index at the current song's alphabetical position.
 */
export function toggleShuffle(
  state: QueueState,
  songs: Song[],
  rng: () => number = Math.random
): QueueState {
  const currentId = state.queue[state.index];
  return buildQueue(songs, !state.shuffle, currentId, rng);
}

export type PersistedState = QueueState & {
  /** Playback position within the current song, in seconds. */
  position: number;
};

/**
 * Revalidate a persisted queue against the current library: removed songs
 * drop out of the queue; if the current song itself is gone (or nothing
 * useful survives), returns null and the caller starts fresh.
 */
export function restoreQueue(
  persisted: PersistedState | null,
  songs: Song[]
): PersistedState | null {
  if (!persisted || persisted.queue.length === 0) return null;
  const ids = new Set(songs.map((s) => s.id));
  const currentId = persisted.queue[persisted.index];
  if (!currentId || !ids.has(currentId)) return null;
  const queue = persisted.queue.filter((id) => ids.has(id));
  return {
    queue,
    index: queue.indexOf(currentId),
    shuffle: persisted.shuffle,
    position: Math.max(0, persisted.position),
  };
}
