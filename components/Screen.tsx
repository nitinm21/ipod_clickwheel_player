"use client";

/**
 * The LCD: bezel, backlight glow, header bar (§3.4). All glyphs are inline
 * SVGs on the pixel grid, drawn in --pixel.
 */

import { useEffect, useState, type ReactNode } from "react";

export type PlayState = "playing" | "paused" | null;

function PlayGlyph({ state }: { state: PlayState }) {
  if (state === "playing") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-label="playing">
        <path d="M2 1 L11 6 L2 11 Z" fill="currentColor" />
      </svg>
    );
  }
  if (state === "paused") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-label="paused">
        <rect x="2" y="1" width="3" height="10" fill="currentColor" />
        <rect x="7" y="1" width="3" height="10" fill="currentColor" />
      </svg>
    );
  }
  return null;
}

function DownloadGlyph() {
  return (
    <svg width="7" height="9" viewBox="0 0 7 9" aria-label="syncing">
      <rect x="3" y="0" width="1" height="5" fill="currentColor" />
      <path d="M0 4 L3.5 8 L7 4 H5 V4 H2 Z" fill="currentColor" />
    </svg>
  );
}

/** 19×10 battery: 1px outline, 2px terminal nub, segment fill. */
function Battery() {
  const [level, setLevel] = useState(1);

  useEffect(() => {
    type BatteryManager = {
      level: number;
      addEventListener: (ev: string, fn: () => void) => void;
      removeEventListener: (ev: string, fn: () => void) => void;
    };
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManager>;
    };
    if (!nav.getBattery) return; // no Battery API (iOS) — stay static-full
    let battery: BatteryManager | null = null;
    const update = () => battery && setLevel(battery.level);
    nav.getBattery().then((b) => {
      battery = b;
      update();
      b.addEventListener("levelchange", update);
    });
    return () => battery?.removeEventListener("levelchange", update);
  }, []);

  const segments = Math.max(0, Math.min(4, Math.round(level * 4)));
  return (
    <svg width="19" height="10" viewBox="0 0 19 10" aria-label="battery">
      <rect x="0.5" y="0.5" width="16" height="9" fill="none" stroke="currentColor" />
      <rect x="17" y="3" width="2" height="4" fill="currentColor" />
      {Array.from({ length: segments }, (_, i) => (
        <rect key={i} x={2 + i * 3.5} y="2" width="2.5" height="6" fill="currentColor" />
      ))}
    </svg>
  );
}

export default function Screen({
  title,
  playState,
  downloading,
  children,
}: {
  title: string;
  playState: PlayState;
  downloading: boolean;
  children: ReactNode;
}) {
  return (
    <div className="screen">
      <div className="lcd">
        <div className="lcd-glow" />
        <header className="lcd-header">
          <span className="hdr-left">
            <PlayGlyph state={playState} />
          </span>
          <span className="hdr-title lcd-title">{title}</span>
          <span className="hdr-right">{downloading ? <DownloadGlyph /> : <Battery />}</span>
        </header>
        <div className="lcd-content">{children}</div>
      </div>
    </div>
  );
}
