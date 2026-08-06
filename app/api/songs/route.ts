import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Returns the song manifest from Vercel Blob. The sync CLI writes each
 * manifest revision to a fresh timestamped pathname under library/ (immutable
 * — avoids Blob CDN overwrite-propagation staleness); the latest one wins.
 * Read-only: writes happen only from the laptop sync CLI. Returns [] when no
 * library exists yet.
 */
export async function GET() {
  try {
    const { blobs } = await list({ prefix: "library/" });
    const latest = blobs
      .sort((a, b) => a.pathname.localeCompare(b.pathname))
      .at(-1);
    if (!latest) {
      return NextResponse.json([]);
    }
    const res = await fetch(latest.url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json([]);
    }
    return NextResponse.json(await res.json());
  } catch {
    // No Blob store connected yet (or transient failure) — empty library.
    return NextResponse.json([]);
  }
}
