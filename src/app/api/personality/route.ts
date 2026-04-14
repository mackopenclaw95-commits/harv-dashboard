import { NextRequest } from "next/server";
import { API_BASE, API_KEY } from "@/lib/api-config";

// Try multiple endpoint paths to work around Hostinger blocking /api/settings/*
const PATHS = [
  "/api/personality",
  "/api/config/personality",
  "/api/settings/personality",
];

async function tryFetch(method: string, body?: string): Promise<Response | null> {
  for (const path of PATHS) {
    try {
      const url = method === "GET"
        ? `${API_BASE}${path}?_t=${Date.now()}`
        : `${API_BASE}${path}`;

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        ...(body ? { body } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) return res;
      // If 401/403, try next path
      if (res.status === 401 || res.status === 403) continue;
      return res;
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET() {
  const res = await tryFetch("GET");
  if (!res) {
    return Response.json({ personality: "cars1", note: "Could not reach backend, returning default" });
  }
  try {
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ personality: "cars1" });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await tryFetch("POST", body);
  if (!res) {
    return Response.json({ error: "Could not reach personality endpoint — Hostinger may be blocking the path" }, { status: 502 });
  }
  try {
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ success: true });
  }
}
