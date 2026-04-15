import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for Reddit's public JSON endpoints.
 *
 * Reddit.com doesn't set CORS headers, so browsers can't fetch its
 * .json endpoints directly. Our VPS IP gets rate-limited by Reddit
 * for unauthenticated requests. Vercel's serverless IPs are
 * distributed enough to work for low-volume reads.
 *
 * Usage:
 *   GET /api/reddit?path=/r/SaaS/about.json
 *   GET /api/reddit?path=/r/SaaS/about/rules.json
 *   GET /api/reddit?path=/search.json&q=harv%20ai&limit=15
 */

const USER_AGENT = "HarvMarketing/1.0 (+https://harv-dashboard.vercel.app)";
const REDDIT_BASE = "https://www.reddit.com";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");

  if (!path || !path.startsWith("/")) {
    return NextResponse.json({ error: "path is required and must start with /" }, { status: 400 });
  }

  // Forward any additional query params (q, limit, sort, etc.)
  const extraParams = new URLSearchParams();
  searchParams.forEach((value, key) => {
    if (key !== "path") extraParams.set(key, value);
  });
  const suffix = extraParams.toString();
  const url = `${REDDIT_BASE}${path}${suffix ? (path.includes("?") ? "&" : "?") + suffix : ""}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      // Cache briefly to reduce load on Reddit + Vercel invocations
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Reddit returned ${res.status}`, status: res.status },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
