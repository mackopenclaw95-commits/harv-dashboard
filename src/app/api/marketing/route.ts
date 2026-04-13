import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.HARV_API_URL || "https://api.openclaw-yqar.srv1420157.hstgr.cloud";
const API_KEY = process.env.HARV_API_KEY || "";

async function proxyGet(path: string) {
  const res = await fetch(`${API_BASE}/api/marketing/${path}`, {
    headers: { "X-API-Key": API_KEY },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

async function proxyPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/api/marketing/${path}`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || "stats";

  if (action === "stats") return proxyGet("stats");
  if (action === "recent-posts") return proxyGet(`recent-posts?days=${searchParams.get("days") || 14}&limit=${searchParams.get("limit") || 20}`);

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action;

  if (action === "draft") return proxyPost("draft", { topic: body.topic });
  if (action === "post") return proxyPost("post", { text: body.text });
  if (action === "ideas") return proxyPost("ideas", {});

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
