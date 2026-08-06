import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Returns the song manifest (library.json) from Vercel Blob.
 * Read-only: writes happen only from the laptop sync CLI, which holds
 * the BLOB_READ_WRITE_TOKEN. Returns [] when no library exists yet.
 */
export async function GET() {
  try {
    const { blobs } = await list({ prefix: "library.json", limit: 1 });
    const library = blobs.find((b) => b.pathname === "library.json");
    if (!library) {
      return NextResponse.json([]);
    }
    const res = await fetch(`${library.url}?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json([]);
    }
    return NextResponse.json(await res.json());
  } catch {
    // No Blob store connected yet (or transient failure) — empty library.
    return NextResponse.json([]);
  }
}
