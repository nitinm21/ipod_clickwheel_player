import { describe, expect, it } from "vitest";
import {
  extractVideoId,
  extractVideoIdsFromText,
  hasSong,
  removeSong,
  sortByTitle,
  upsertSong,
  type Song,
} from "./manifest";

const song = (id: string, title: string): Song => ({
  id,
  title,
  rawTitle: title,
  url: `https://blob.example/audio/${id}.m4a`,
  size: 1000,
  duration: 200,
  addedAt: "2026-08-06T00:00:00.000Z",
});

describe("manifest ops", () => {
  it("upserts and sorts alphabetically by title", () => {
    let lib: Song[] = [];
    lib = upsertSong(lib, song("aaaaaaaaaaa", "Zebra"));
    lib = upsertSong(lib, song("bbbbbbbbbbb", "apple"));
    expect(lib.map((s) => s.title)).toEqual(["apple", "Zebra"]);
  });

  it("upsert replaces an existing id instead of duplicating", () => {
    let lib = [song("aaaaaaaaaaa", "Old Title")];
    lib = upsertSong(lib, song("aaaaaaaaaaa", "New Title"));
    expect(lib).toHaveLength(1);
    expect(lib[0].title).toBe("New Title");
  });

  it("hasSong / removeSong", () => {
    const lib = [song("aaaaaaaaaaa", "A"), song("bbbbbbbbbbb", "B")];
    expect(hasSong(lib, "aaaaaaaaaaa")).toBe(true);
    const next = removeSong(lib, "aaaaaaaaaaa");
    expect(hasSong(next, "aaaaaaaaaaa")).toBe(false);
    expect(next).toHaveLength(1);
    expect(lib).toHaveLength(2); // pure — original untouched
  });

  it("sort is stable and case-insensitive", () => {
    const lib = [song("ccccccccccc", "beta"), song("aaaaaaaaaaa", "Beta"), song("bbbbbbbbbbb", "Alpha")];
    expect(sortByTitle(lib).map((s) => s.id)).toEqual([
      "bbbbbbbbbbb",
      "aaaaaaaaaaa",
      "ccccccccccc",
    ]);
  });
});

describe("extractVideoId", () => {
  it("parses common URL shapes", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(extractVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("rejects non-YouTube input", () => {
    expect(extractVideoId("https://vimeo.com/12345")).toBeNull();
    expect(extractVideoId("not a link")).toBeNull();
    expect(extractVideoId("https://www.youtube.com/watch?v=short")).toBeNull();
  });
});

describe("extractVideoIdsFromText", () => {
  it("finds links buried in messy pasted text", () => {
    const text = `
      check these out!
      https://youtu.be/x9VXlf0j980?si=4P3-vm2O5zctCp62
      and this one https://www.youtube.com/watch?v=RNGPAfgubW4 is great
      shorts too: youtube.com/shorts/dQw4w9WgXcQ
    `;
    expect(extractVideoIdsFromText(text)).toEqual([
      "x9VXlf0j980",
      "RNGPAfgubW4",
      "dQw4w9WgXcQ",
    ]);
  });

  it("dedupes across URL shapes", () => {
    const text =
      "https://youtu.be/dQw4w9WgXcQ https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(extractVideoIdsFromText(text)).toEqual(["dQw4w9WgXcQ"]);
  });

  it("accepts bare IDs but not ordinary words", () => {
    expect(extractVideoIdsFromText("dQw4w9WgXcQ")).toEqual(["dQw4w9WgXcQ"]);
    expect(extractVideoIdsFromText("informative discussions considered")).toEqual([]);
  });

  it("returns empty for linkless text", () => {
    expect(extractVideoIdsFromText("no links here, sorry")).toEqual([]);
  });
});
