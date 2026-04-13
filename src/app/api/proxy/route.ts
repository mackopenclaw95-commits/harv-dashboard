import { NextRequest } from "next/server";

const API_BASE =
  process.env.API_URL ||
  "https://api.openclaw-yqar.srv1420157.hstgr.cloud";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return Response.json({ error: "Missing path param" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store",
  };
  if (process.env.HARV_API_KEY) {
    headers["X-API-Key"] = process.env.HARV_API_KEY;
  }

  const bustCache = `${path.includes("?") ? "&" : "?"}_t=${Date.now()}`;
  const res = await fetch(`${API_BASE}${path}${bustCache}`, {
    headers,
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json(
      { error: text || `Backend returned ${res.status}` },
      { status: res.status }
    );
  }

  try {
    const data = await res.json();
    return Response.json(data);
  } catch {
    const text = await res.text().catch(() => "");
    return Response.json({ error: "Invalid JSON from backend", raw: text.slice(0, 200) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return Response.json({ error: "Missing path param" }, { status: 400 });
  }

  const body = await req.json();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store",
  };
  if (process.env.HARV_API_KEY) {
    headers["X-API-Key"] = process.env.HARV_API_KEY;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json(
      { error: text || `Backend returned ${res.status}` },
      { status: res.status }
    );
  }

  try {
    const data = await res.json();
    return Response.json(data);
  } catch {
    const text = await res.text().catch(() => "");
    return Response.json({ error: "Invalid JSON from backend", raw: text.slice(0, 200) }, { status: 502 });
  }
}
