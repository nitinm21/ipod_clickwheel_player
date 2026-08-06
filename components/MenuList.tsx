"use client";

/**
 * List views (§3.5): 28px rows, hard inverted selection, marquee only on the
 * selected overflowing row, proportional scrollbar when more than 6 rows.
 */

import type { ReactNode } from "react";
import Marquee from "./Marquee";

export const VISIBLE_ROWS = 6;
const ROW_H = 28;

export type MenuRow = {
  id: string;
  label: string;
  /** Right-aligned column: a glyph, "Off"/"On", ">" etc. */
  right?: ReactNode;
};

export default function MenuList({
  rows,
  selectedIndex,
  windowStart,
  flashId,
}: {
  rows: MenuRow[];
  selectedIndex: number;
  windowStart: number;
  /** Row to flash (offline-blocked feedback). */
  flashId?: string | null;
}) {
  const scrollable = rows.length > VISIBLE_ROWS;
  const visible = rows.slice(windowStart, windowStart + VISIBLE_ROWS);

  const trackH = VISIBLE_ROWS * ROW_H;
  const thumbH = scrollable
    ? Math.max(10, Math.round((VISIBLE_ROWS / rows.length) * trackH))
    : 0;
  const maxStart = rows.length - VISIBLE_ROWS;
  const thumbTop = scrollable
    ? Math.round((windowStart / maxStart) * (trackH - thumbH - 2))
    : 0;

  return (
    <div className="rows" style={{ height: trackH }}>
      {visible.map((row, i) => {
        const idx = windowStart + i;
        const selected = idx === selectedIndex;
        return (
          <div
            key={row.id}
            className={`row lcd-row${selected ? " selected" : ""}${
              flashId === row.id ? " flash" : ""
            }`}
            style={scrollable ? { width: "calc(100% - 9px)" } : undefined}
            aria-current={selected || undefined}
          >
            <Marquee text={row.label} active={selected} className="row-label" />
            {row.right != null && <span className="row-right">{row.right}</span>}
          </div>
        );
      })}
      {scrollable && (
        <div className="scrollbar" aria-hidden>
          <div className="scrollbar-thumb" style={{ height: thumbH, top: thumbTop + 1 }} />
        </div>
      )}
    </div>
  );
}
