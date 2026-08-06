import { describe, expect, it } from "vitest";
import { cleanTitle } from "./titles";

describe("cleanTitle", () => {
  it("strips (Official Video) and friends", () => {
    expect(cleanTitle("Daft Punk - One More Time (Official Video)")).toBe(
      "Daft Punk - One More Time"
    );
    expect(cleanTitle("Tame Impala - The Less I Know The Better (Official Audio)")).toBe(
      "Tame Impala - The Less I Know The Better"
    );
    expect(cleanTitle("Song Name (Official Music Video)")).toBe("Song Name");
    expect(cleanTitle("Song Name [Official HD Video]")).toBe("Song Name");
    expect(cleanTitle("Song Name (Official Visualizer)")).toBe("Song Name");
  });

  it("strips lyric noise", () => {
    expect(cleanTitle("Artist - Song [Lyrics]")).toBe("Artist - Song");
    expect(cleanTitle("Artist - Song (Lyric Video)")).toBe("Artist - Song");
    expect(cleanTitle("Artist - Song (Lyrical Video)")).toBe("Artist - Song");
  });

  it("drops everything after a pipe", () => {
    expect(cleanTitle("Kabira Full Song | Yeh Jawaani Hai Deewani | Pritam")).toBe(
      "Kabira Full Song"
    );
    expect(cleanTitle("Song Name | Official Video | 4K")).toBe("Song Name");
  });

  it("strips quality tokens", () => {
    expect(cleanTitle("Artist - Song HD")).toBe("Artist - Song");
    expect(cleanTitle("Artist - Song (4K)")).toBe("Artist - Song");
    expect(cleanTitle("Artist - Song [HQ]")).toBe("Artist - Song");
  });

  it("strips trailing M/V", () => {
    expect(cleanTitle("PSY - GANGNAM STYLE(강남스타일) M/V")).toBe(
      "PSY - GANGNAM STYLE(강남스타일)"
    );
  });

  it("strips feat-noise", () => {
    expect(cleanTitle("Artist - Song (feat. Somebody)")).toBe("Artist - Song");
    expect(cleanTitle("Artist - Song ft. Somebody & Friend")).toBe("Artist - Song");
  });

  it("collapses whitespace and dangling separators", () => {
    expect(cleanTitle("  Artist   -  Song  (Official Video)  ")).toBe("Artist - Song");
    expect(cleanTitle("Artist - Song - (Official Video)")).toBe("Artist - Song");
  });

  it("keeps meaningful brackets", () => {
    expect(cleanTitle("Artist - Song (Acoustic)")).toBe("Artist - Song (Acoustic)");
    expect(cleanTitle("Artist - Song (2011 Remaster)")).toBe("Artist - Song (2011 Remaster)");
  });

  it("never returns an empty string", () => {
    expect(cleanTitle("(Official Video)")).toBe("(Official Video)");
  });
});
