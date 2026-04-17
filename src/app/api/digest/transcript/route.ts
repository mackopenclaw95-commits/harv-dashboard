import { NextResponse } from "next/server";
import { API_BASE, API_KEY } from "@/lib/api-config";

// Fetches a video transcript from the VPS so the dashboard can bake it into the
// Claude Code routine prompt. Claude Code's sandbox can't reach YouTube directly;
// the VPS can (Gemini VLM pipeline + transcript cache).
//
// Fresh video: 30-60s. Cached: <2s.

export const maxDuration = 60;

export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || !url.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_BASE}/transcript`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Transcript fetch failed (${res.status})`, detail: detail.slice(0, 300) },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: `Transcript fetch timed out or errored: ${String(err).slice(0, 200)}` },
      { status: 504 },
    );
  }
}
