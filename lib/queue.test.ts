import { describe, expect, it } from "vitest";
import type { Song } from "./manifest";
import {
  alphabeticalIds,
  buildQueue,
  nextIndex,
  prevIndex,
  restoreQueue,
  shuffledIds,
  toggleShuffle,
} from "./queue";

const song = (id: string, title: string): Song => ({
  id,
  title,
  rawTitle: title,
  url: `https://blob.example/audio/${id}.m4a`,
  size: 1000,
  duration: 200,
  addedAt: "2026-08-06T00:00:00.000Z",
});

const SONGS = [
  song("id-charlie0", "Charlie"),
  song("id-alpha0000", "Alpha"),
  song("id-delta0000", "Delta"),
  song("id-bravo0000", "Bravo"),
];

// Deterministic rng from a fixed sequence.
const seqRng = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("queue building", () => {
  it("alphabetical order by title", () => {
    expect(alphabeticalIds(SONGS)).toEqual([
      "id-alpha0000",
      "id-bravo0000",
      "id-charlie0",
      "id-delta0000",
    ]);
  });

  it("buildQueue positions index at startId", () => {
    const q = buildQueue(SONGS, false, "id-charlie0");
    expect(q.queue[q.index]).toBe("id-charlie0");
    expect(q.index).toBe(2);
  });

  it("shuffled queue contains every song exactly once", () => {
    const ids = shuffledIds(SONGS, Math.random);
    expect([...ids].sort()).toEqual(SONGS.map((s) => s.id).sort());
  });

  it("shuffle with headId puts it first, still a permutation", () => {
    const ids = shuffledIds(SONGS, seqRng([0.1, 0.7, 0.3]), "id-delta0000");
    expect(ids[0]).toBe("id-delta0000");
    expect([...ids].sort()).toEqual(SONGS.map((s) => s.id).sort());
  });

  it("shuffle actually permutes (statistically)", () => {
    let moved = 0;
    for (let i = 0; i < 50; i++) {
      const ids = shuffledIds(SONGS);
      if (ids.join() !== alphabeticalIds(SONGS).join()) moved++;
    }
    expect(moved).toBeGreaterThan(30);
  });
});

describe("advancing", () => {
  it("next wraps at the end", () => {
    const q = { queue: ["a", "b", "c"], index: 2, shuffle: false };
    expect(nextIndex(q)).toBe(0);
  });

  it("prev wraps at the start", () => {
    const q = { queue: ["a", "b", "c"], index: 0, shuffle: false };
    expect(prevIndex(q)).toBe(2);
  });

  it("empty queue never divides by zero", () => {
    const q = { queue: [], index: 0, shuffle: false };
    expect(nextIndex(q)).toBe(0);
    expect(prevIndex(q)).toBe(0);
  });
});

describe("shuffle toggle keeps the current song (§3.7)", () => {
  it("on: current song becomes head of fresh shuffle", () => {
    const q = buildQueue(SONGS, false, "id-charlie0");
    const s = toggleShuffle(q, SONGS, seqRng([0.9, 0.2, 0.6]));
    expect(s.shuffle).toBe(true);
    expect(s.index).toBe(0);
    expect(s.queue[0]).toBe("id-charlie0");
    expect([...s.queue].sort()).toEqual(SONGS.map((x) => x.id).sort());
  });

  it("off: back to alphabetical at current song's position", () => {
    const q = buildQueue(SONGS, true, "id-bravo0000", seqRng([0.5]));
    const s = toggleShuffle(q, SONGS);
    expect(s.shuffle).toBe(false);
    expect(s.queue).toEqual(alphabeticalIds(SONGS));
    expect(s.queue[s.index]).toBe("id-bravo0000");
    expect(s.index).toBe(1);
  });
});

describe("restoreQueue", () => {
  it("restores a valid persisted state", () => {
    const persisted = {
      queue: alphabeticalIds(SONGS),
      index: 2,
      shuffle: false,
      position: 42.5,
    };
    const r = restoreQueue(persisted, SONGS);
    expect(r).not.toBeNull();
    expect(r!.queue[r!.index]).toBe("id-charlie0");
    expect(r!.position).toBe(42.5);
  });

  it("drops songs removed from the library, keeps position of current", () => {
    const persisted = {
      queue: ["id-alpha0000", "gone0000000", "id-charlie0"],
      index: 2,
      shuffle: true,
      position: 10,
    };
    const r = restoreQueue(persisted, SONGS);
    expect(r!.queue).toEqual(["id-alpha0000", "id-charlie0"]);
    expect(r!.queue[r!.index]).toBe("id-charlie0");
  });

  it("returns null when the current song no longer exists", () => {
    const persisted = {
      queue: ["gone0000000"],
      index: 0,
      shuffle: false,
      position: 5,
    };
    expect(restoreQueue(persisted, SONGS)).toBeNull();
  });

  it("returns null for null/empty input", () => {
    expect(restoreQueue(null, SONGS)).toBeNull();
    expect(
      restoreQueue({ queue: [], index: 0, shuffle: false, position: 0 }, SONGS)
    ).toBeNull();
  });
});
