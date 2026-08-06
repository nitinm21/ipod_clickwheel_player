/**
 * The iPod click (§3.6): ~3ms of 2kHz-ish band-passed noise, gain 0.15,
 * synthesized in Web Audio — no audio assets. Plus a 3ms vibration where
 * the platform has it (Android; iOS has no vibration API).
 */

let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;

export function click(): void {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (!buffer) {
      const len = Math.max(8, Math.round(ctx.sampleRate * 0.003));
      buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len); // decaying noise burst
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2000;
    bp.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.value = 0.15;
    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  } catch {
    /* no audio context (rare) — clicks are flavor, never fatal */
  }
  try {
    navigator.vibrate?.(3);
  } catch {
    /* ignore */
  }
}
