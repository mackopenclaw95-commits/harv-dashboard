import { NextRequest, NextResponse } from "next/server";

import { API_BASE, API_KEY } from "@/lib/api-config";

// Reddit draft LLM calls take ~10-15s. Vercel hobby tier caps at 10s;
// pro tier defaults to 15s unless we raise it. 60s is plenty of headroom.
export const maxDuration = 60;

async function proxyGet(path: string) {
  const res = await fetch(`${API_BASE}/api/marketing/${path}`, {
    headers: { "X-API-Key": API_KEY },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
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
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return NextResponse.json(data, { status: res.status });
  } catch {
    // Non-JSON response (Flask HTML error page, proxy timeout, etc.)
    console.error(`[marketing proxyPost] ${path} returned non-JSON (${res.status}):`, text.slice(0, 300));
    return NextResponse.json(
      {
        error: `VPS returned non-JSON (status ${res.status})`,
        status: res.status,
        body_preview: text.slice(0, 300),
      },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || "stats";

  // Twitter
  if (action === "stats") return proxyGet("stats");
  if (action === "recent-posts") {
    return proxyGet(
      `recent-posts?days=${searchParams.get("days") || 14}&limit=${searchParams.get("limit") || 20}`,
    );
  }

  // Reddit
  if (action === "reddit-verify") return proxyGet("reddit/verify");
  if (action === "reddit-subreddit") {
    const name = searchParams.get("name") || "";
    return proxyGet(`reddit/subreddit?name=${encodeURIComponent(name)}`);
  }
  if (action === "reddit-recent") {
    return proxyGet(`reddit/recent?limit=${searchParams.get("limit") || 20}`);
  }

  // Queue
  if (action === "queue") {
    const status = searchParams.get("status") || "";
    return proxyGet(`queue${status ? `?status=${status}` : ""}`);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action;

  // Twitter
  if (action === "draft") return proxyPost("draft", { topic: body.topic });
  if (action === "post") return proxyPost("post", { text: body.text });
  if (action === "ideas") return proxyPost("ideas", {});

  // Reddit
  if (action === "reddit-draft") {
    return proxyPost("reddit/draft", {
      topic: body.topic,
      subreddit: body.subreddit,
      rules: body.rules || [],
    });
  }
  if (action === "reddit-post") {
    return proxyPost("reddit/post", {
      subreddit: body.subreddit,
      title: body.title,
      body: body.body,
    });
  }
  if (action === "reddit-monitor") {
    return proxyPost("reddit/monitor", {
      query: body.query,
      subreddit: body.subreddit,
      limit: body.limit,
    });
  }

  // Queue
  if (action === "queue-add") {
    return proxyPost("queue/add", {
      platform: body.platform,
      content: body.content,
      title: body.title,
      subreddit: body.subreddit,
      scheduled_for: body.scheduled_for,
    });
  }
  if (action === "queue-approve") return proxyPost("queue/approve", { id: body.id });
  if (action === "queue-reject") return proxyPost("queue/reject", { id: body.id });

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
