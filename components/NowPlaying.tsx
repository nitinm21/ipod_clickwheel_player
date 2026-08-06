"use client";

/**
 * V3 · Now Playing (§3.5): index row, hero title (marquee), progress bar,
 * times. The downloading state reuses the progress bar for the download.
 */

import type { Song } from "@/lib/manifest";
import Marquee from "./Marquee";

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function ShuffleGlyph() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-label="shuffle on">
      <path
        d="M0 2 H3 L9 10 H11 V8 L14 10.5 L11 13 V11 H8 L2 3 H0 Z M0 10 H3 L4.5 8 L5.7 9.6 L4 12 H0 Z M8 1 L9.7 3.4 L11 1.5 V4 H14 L11 6.5 V4 H9 L7 1 Z"
        fill="currentColor"
        transform="scale(0.9)"
      />
    </svg>
  );
}

export default function NowPlaying({
  song,
  position,
  duration,
  queuePosition,
  queueLength,
  shuffle,
  scrubbing,
  download,
}: {
  song: Song;
  position: number;
  duration: number;
  queuePosition: number;
  queueLength: number;
  shuffle: boolean;
  /** True while the wheel is scrubbing — pauses the marquee (§3.5). */
  scrubbing: boolean;
  /** 0..1 when the song is still downloading, null when playable. */
  download: number | null;
}) {
  const dur = duration > 0 ? duration : song.duration;
  const frac =
    download !== null ? download : dur > 0 ? Math.min(1, position / dur) : 0;

  return (
    <div className="np">
      <div className="np-meta lcd-small">
        <span>
          {queuePosition} of {queueLength}
        </span>
        {shuffle && <ShuffleGlyph />}
      </div>

      <div className="np-title">
        <Marquee text={song.title} active={!scrubbing} className="lcd-big" />
      </div>

      <div className="np-progress" role="progressbar" aria-valuenow={Math.round(frac * 100)}>
        <div className="np-progress-fill" style={{ width: `${frac * 100}%` }} />
      </div>

      <div className="np-times lcd-small">
        {download !== null ? (
          <span style={{ margin: "0 auto" }}>
            Downloading… {Math.round(download * 100)}%
          </span>
        ) : (
          <>
            <span>{fmt(position)}</span>
            <span>-{fmt(Math.max(0, dur - position))}</span>
          </>
        )}
      </div>
    </div>
  );
}
