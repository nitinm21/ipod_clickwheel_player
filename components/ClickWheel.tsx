"use client";

/**
 * The click wheel (§3.6). One pointer surface; gesture math lives in
 * lib/wheel.ts. Zone labels double as screen-reader buttons (keyboard/AT
 * activation only — pointer events all belong to the wheel surface).
 * Keyboard parity (§3.8): arrows = ticks, Enter = center, Escape = MENU,
 * Space = ⏯.
 */

import { useRef, useState } from "react";
import { click } from "@/lib/clicker";
import {
  beginGesture,
  endGesture,
  moveGesture,
  type Gesture,
  type Zone,
} from "@/lib/wheel";

const FLASH_MS = 120;

export default function ClickWheel({
  onRows,
  onZone,
}: {
  /** Signed rows to move (+ = clockwise = down/forward), acceleration applied. */
  onRows: (rows: number) => void;
  onZone: (zone: Zone) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const geo = useRef({ cx: 0, cy: 0, r: 0 });
  const [pressed, setPressed] = useState<Zone | null>(null);

  const flash = (zone: Zone) => {
    setPressed(zone);
    setTimeout(() => setPressed(null), FLASH_MS);
  };

  const fireZone = (zone: Zone) => {
    click();
    flash(zone);
    onZone(zone);
  };

  const measure = () => {
    const el = ref.current!;
    const b = el.getBoundingClientRect();
    geo.current = { cx: b.left + b.width / 2, cy: b.top + b.height / 2, r: b.width / 2 };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (gesture.current) return; // single-pointer
    measure();
    const { cx, cy, r } = geo.current;
    if (Math.hypot(e.clientX - cx, e.clientY - cy) > r) return;
    ref.current!.setPointerCapture(e.pointerId);
    gesture.current = beginGesture(cx, cy, e.clientX, e.clientY, e.timeStamp);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!gesture.current) return;
    const { cx, cy } = geo.current;
    const { gesture: g, rows } = moveGesture(
      gesture.current, cx, cy, e.clientX, e.clientY, e.timeStamp
    );
    gesture.current = g;
    if (rows !== 0) {
      // one click per tick — a 2-row accelerated tick is still one click
      click();
      onRows(rows);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!gesture.current) return;
    const { cx, cy, r } = geo.current;
    const zone = endGesture(gesture.current, cx, cy, e.timeStamp, r);
    gesture.current = null;
    if (zone) fireZone(zone);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key;
    if (key === "ArrowDown" || key === "ArrowRight") {
      click();
      onRows(1);
    } else if (key === "ArrowUp" || key === "ArrowLeft") {
      click();
      onRows(-1);
    } else if (key === "Enter") {
      fireZone("center");
    } else if (key === "Escape") {
      fireZone("menu");
    } else if (key === " ") {
      fireZone("play");
    } else {
      return;
    }
    e.preventDefault();
  };

  const label = (zone: Zone, text: string, aria: string, extra = "") => (
    <button
      type="button"
      className={`wheel-label ${zone} ${extra}${pressed === zone ? " pressed" : ""}`}
      aria-label={aria}
      tabIndex={-1}
      onClick={(e) => {
        // Pointer taps are handled by the wheel surface (labels are
        // pointer-events:none) — this fires only for keyboard/AT activation.
        if (e.detail === 0) fireZone(zone);
      }}
    >
      {text}
    </button>
  );

  return (
    <div
      ref={ref}
      className="wheel"
      role="group"
      aria-label="Click wheel — arrow keys scroll, Enter selects, Escape for menu, Space plays or pauses"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      data-testid="wheel"
    >
      {label("menu", "MENU", "Menu — go back")}
      {label("prev", "⏮", "Previous song")}
      {label("next", "⏭", "Next song")}
      {label("play", "⏯", "Play or pause")}
      <div className="wheel-center" aria-hidden />
    </div>
  );
}
