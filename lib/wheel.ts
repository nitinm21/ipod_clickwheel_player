/**
 * Click-wheel gesture math (§3.6) — pure functions, no DOM.
 *
 * Angle convention: degrees, 0° at 12 o'clock, increasing clockwise.
 * A gesture starts on pointerdown; every move may produce row-ticks; on
 * pointerup it either was a rotation or resolves to a zone tap.
 */

export const TICK_DEG = 12; // one tick per 12° of rotation
export const ROTATE_LOCK_DEG = 10; // cumulative |Δθ| beyond this = rotation
export const TAP_MAX_MS = 250;
export const TAP_MAX_PX = 8;
export const ACCEL_DEG_PER_S = 240; // above this, a tick moves 2 rows
export const CENTER_RATIO = 0.38; // center button diameter / wheel diameter

export type Zone = "menu" | "prev" | "next" | "play" | "center";

/** Angle of (x,y) around center (cx,cy): 0° = up, clockwise positive, [0,360). */
export function angleAt(cx: number, cy: number, x: number, y: number): number {
  const deg = (Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Shortest signed angular delta from `from` to `to`, in (-180, 180]. */
export function angularDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Which zone contains the point, or null when outside the wheel.
 * Center circle = `center`; the ring is split into four 90° arcs centered
 * on 12 (menu), 3 (next), 6 (play) and 9 (prev) o'clock.
 */
export function zoneAt(
  cx: number,
  cy: number,
  x: number,
  y: number,
  radius: number,
  centerRatio: number = CENTER_RATIO
): Zone | null {
  const dist = Math.hypot(x - cx, y - cy);
  if (dist > radius) return null;
  if (dist <= radius * centerRatio) return "center";
  const a = angleAt(cx, cy, x, y);
  if (a >= 315 || a < 45) return "menu";
  if (a < 135) return "next";
  if (a < 225) return "play";
  return "prev";
}

export type Gesture = {
  startX: number;
  startY: number;
  startTime: number;
  lastAngle: number;
  lastTime: number;
  /** Cumulative |Δθ| — once past ROTATE_LOCK_DEG the gesture is a rotation. */
  travel: number;
  /** Signed Δθ accumulated before the rotation locks (credited on lock). */
  pending: number;
  rotating: boolean;
  /** Degrees accumulated toward the next tick (signed). */
  remainder: number;
  /** Max pointer distance from the start point, for tap rejection. */
  maxDrift: number;
};

export function beginGesture(
  cx: number,
  cy: number,
  x: number,
  y: number,
  t: number
): Gesture {
  return {
    startX: x,
    startY: y,
    startTime: t,
    lastAngle: angleAt(cx, cy, x, y),
    lastTime: t,
    travel: 0,
    pending: 0,
    rotating: false,
    remainder: 0,
    maxDrift: 0,
  };
}

/**
 * Feed a pointer move; returns the rows to step (signed, + = clockwise =
 * down/forward), already ×2 when the angular velocity exceeds the
 * acceleration threshold. Mutates nothing — returns the next gesture state.
 */
export function moveGesture(
  g: Gesture,
  cx: number,
  cy: number,
  x: number,
  y: number,
  t: number
): { gesture: Gesture; rows: number } {
  const angle = angleAt(cx, cy, x, y);
  const delta = angularDelta(g.lastAngle, angle);
  const dt = Math.max(1, t - g.lastTime); // ms; clamp avoids ÷0
  const velocity = (Math.abs(delta) / dt) * 1000; // °/s

  const travel = g.travel + Math.abs(delta);
  const rotating = g.rotating || travel > ROTATE_LOCK_DEG;
  const maxDrift = Math.max(g.maxDrift, Math.hypot(x - g.startX, y - g.startY));

  let remainder = g.remainder;
  let pending = g.pending;
  let ticks = 0;
  if (rotating) {
    // On the move that locks the rotation, credit everything swept so far —
    // a 120° sweep is 10 ticks, not 10 minus the lock threshold.
    remainder += g.rotating ? delta : pending + delta;
    pending = 0;
    ticks = Math.trunc(remainder / TICK_DEG);
    remainder -= ticks * TICK_DEG;
  } else {
    pending += delta;
  }

  const rows = ticks * (velocity > ACCEL_DEG_PER_S ? 2 : 1);
  return {
    gesture: { ...g, lastAngle: angle, lastTime: t, travel, pending, rotating, remainder, maxDrift },
    rows,
  };
}

/**
 * Resolve pointerup: a tap (returning its zone) only if the gesture never
 * locked into rotation, was short, and barely moved. Otherwise null —
 * rotations end with no momentum (the wheel stops when the thumb does).
 */
export function endGesture(
  g: Gesture,
  cx: number,
  cy: number,
  t: number,
  radius: number,
  centerRatio: number = CENTER_RATIO
): Zone | null {
  if (g.rotating) return null;
  if (t - g.startTime > TAP_MAX_MS) return null;
  if (g.maxDrift >= TAP_MAX_PX) return null;
  return zoneAt(cx, cy, g.startX, g.startY, radius, centerRatio);
}
