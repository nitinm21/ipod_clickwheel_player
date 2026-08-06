"use client";

/**
 * §3.5 marquee: after a 1s pause, steps left one character-width every
 * 120ms to the end, pauses 1s, snaps back, repeats. Hard steps, no easing.
 * Inactive or reduced-motion → hard clip at rest.
 */

import { useEffect, useRef, useState } from "react";

const START_PAUSE_MS = 1000;
const END_PAUSE_MS = 1000;
const STEP_MS = 120;

export default function Marquee({
  text,
  active,
  className,
}: {
  text: string;
  active: boolean;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(0);
    const box = boxRef.current;
    if (!active || !box) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const overflow = box.scrollWidth - box.clientWidth;
    if (overflow <= 0) return;
    const charW = box.scrollWidth / Math.max(1, text.length);

    let timer: ReturnType<typeof setTimeout>;
    let off = 0;

    const step = () => {
      off = Math.min(off + charW, overflow);
      setOffset(off);
      if (off < overflow) {
        timer = setTimeout(step, STEP_MS);
      } else {
        timer = setTimeout(() => {
          off = 0;
          setOffset(0); // snap back
          timer = setTimeout(step, START_PAUSE_MS);
        }, END_PAUSE_MS);
      }
    };
    timer = setTimeout(step, START_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, active]);

  return (
    <div ref={boxRef} className={`marquee ${className ?? ""}`}>
      <span style={{ transform: `translateX(${-offset}px)` }}>{text}</span>
    </div>
  );
}
