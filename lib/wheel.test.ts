import { describe, expect, it } from "vitest";
import {
  angleAt,
  angularDelta,
  beginGesture,
  endGesture,
  moveGesture,
  zoneAt,
  type Gesture,
} from "./wheel";

const CX = 200;
const CY = 200;
const R = 150;

/** Point at `deg` (0 = 12 o'clock, clockwise) and radius r from center. */
const pt = (deg: number, r: number) => ({
  x: CX + r * Math.sin((deg * Math.PI) / 180),
  y: CY - r * Math.cos((deg * Math.PI) / 180),
});

/** Drag along an arc in `step`° increments; returns total rows and final gesture. */
function arc(
  fromDeg: number,
  toDeg: number,
  stepDeg: number,
  msPerStep: number
): { rows: number; gesture: Gesture } {
  const p0 = pt(fromDeg, 100);
  let g = beginGesture(CX, CY, p0.x, p0.y, 1000);
  let t = 1000;
  let rows = 0;
  const dir = toDeg > fromDeg ? 1 : -1;
  for (let d = fromDeg + dir * stepDeg; dir * d <= dir * toDeg; d += dir * stepDeg) {
    t += msPerStep;
    const p = pt(d, 100);
    const r = moveGesture(g, CX, CY, p.x, p.y, t);
    g = r.gesture;
    rows += r.rows;
  }
  return { rows, gesture: g };
}

describe("angleAt / angularDelta", () => {
  it("puts 0° at 12 o'clock, clockwise", () => {
    expect(angleAt(CX, CY, CX, CY - 100)).toBeCloseTo(0);
    expect(angleAt(CX, CY, CX + 100, CY)).toBeCloseTo(90);
    expect(angleAt(CX, CY, CX, CY + 100)).toBeCloseTo(180);
    expect(angleAt(CX, CY, CX - 100, CY)).toBeCloseTo(270);
  });

  it("takes the shortest path across the 0/360 wrap", () => {
    expect(angularDelta(350, 10)).toBeCloseTo(20);
    expect(angularDelta(10, 350)).toBeCloseTo(-20);
    expect(angularDelta(0, 180)).toBeCloseTo(180);
    expect(angularDelta(90, 90)).toBe(0);
  });
});

describe("zones", () => {
  it("maps the four arcs and center", () => {
    const at = (deg: number, r: number) => {
      const p = pt(deg, r);
      return zoneAt(CX, CY, p.x, p.y, R);
    };
    expect(at(0, 100)).toBe("menu");
    expect(at(90, 100)).toBe("next");
    expect(at(180, 100)).toBe("play");
    expect(at(270, 100)).toBe("prev");
    expect(at(44, 100)).toBe("menu");
    expect(at(46, 100)).toBe("next");
    expect(at(0, 20)).toBe("center"); // inside 38% of 150 = 57
    expect(at(0, 160)).toBeNull(); // outside the wheel
  });
});

describe("rotation ticks", () => {
  it("slow 120° arc = 10 ticks of 12°", () => {
    // 2°/step at 50ms/step = 40°/s — well under acceleration
    const { rows } = arc(0, 120, 2, 50);
    expect(rows).toBe(10);
  });

  it("counter-clockwise gives negative rows", () => {
    const { rows } = arc(120, 0, 2, 50);
    expect(rows).toBe(-10);
  });

  it("crossing the ±180 wrap keeps counting correctly", () => {
    // 300° → 420° (=60°) crosses 360
    const { rows } = arc(300, 420, 2, 50);
    expect(rows).toBe(10);
  });

  it("first 10° don't tick (rotation lock threshold)", () => {
    const { rows } = arc(0, 9, 3, 50);
    expect(rows).toBe(0);
  });

  it("acceleration: >240°/s doubles each tick's rows", () => {
    // 12°/step at 20ms/step = 600°/s — every tick counts double
    const { rows } = arc(0, 120, 12, 20);
    const slow = arc(0, 120, 12, 200).rows; // 60°/s
    expect(slow).toBe(10);
    expect(rows).toBe(20);
  });

  it("remainder carries across moves (two 8° moves = one tick)", () => {
    // after lock: 8+8 = 16° → 1 tick + 4° remainder
    const p0 = pt(0, 100);
    let g = beginGesture(CX, CY, p0.x, p0.y, 0);
    // burn the lock with a 12° move (locks, ticks once: 12-lock…)
    let r = moveGesture(g, CX, CY, pt(12, 100).x, pt(12, 100).y, 100);
    g = r.gesture;
    const afterLock = r.rows;
    r = moveGesture(g, CX, CY, pt(20, 100).x, pt(20, 100).y, 200);
    g = r.gesture;
    const a = r.rows;
    r = moveGesture(g, CX, CY, pt(28, 100).x, pt(28, 100).y, 300);
    const b = r.rows;
    expect(afterLock + a + b).toBe(2); // 28° total = 2 ticks + 4° left
  });
});

describe("tap vs rotate", () => {
  it("quick touch in a quadrant = tap on that zone", () => {
    const p = pt(90, 100); // 3 o'clock
    const g = beginGesture(CX, CY, p.x, p.y, 0);
    expect(endGesture(g, CX, CY, 200, R)).toBe("next");
  });

  it("center tap", () => {
    const g = beginGesture(CX, CY, CX + 10, CY, 0);
    expect(endGesture(g, CX, CY, 100, R)).toBe("center");
  });

  it("too slow = no tap", () => {
    const p = pt(0, 100);
    const g = beginGesture(CX, CY, p.x, p.y, 0);
    expect(endGesture(g, CX, CY, 400, R)).toBeNull();
  });

  it("a locked rotation can never end as a tap", () => {
    const { gesture } = arc(0, 40, 2, 10); // fast little scrub
    expect(endGesture(gesture, CX, CY, gesture.lastTime, R)).toBeNull();
  });

  it("drifting ≥8px kills the tap even if brief", () => {
    const p = pt(0, 100);
    let g = beginGesture(CX, CY, p.x, p.y, 0);
    // move 9px along the arc (barely any angle at r=100 → stays unlocked)
    const r = moveGesture(g, CX, CY, p.x + 9, p.y, 50);
    expect(endGesture(r.gesture, CX, CY, 100, R)).toBeNull();
  });

  it("no momentum: rows only come from moves, never from endGesture", () => {
    const { gesture } = arc(0, 120, 2, 10);
    const tap = endGesture(gesture, CX, CY, gesture.lastTime + 1, R);
    expect(tap).toBeNull(); // and endGesture returns no rows at all
  });
});
