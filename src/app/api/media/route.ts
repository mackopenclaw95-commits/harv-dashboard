import { NextRequest } from "next/server";

/**
 * Proxy images from the VPS media directory.
 * Usage: /api/media?path=/root/harv/media/generated/image.png
 */
export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) {
    return new Response("Missing path param", { status: 400 });
  }

  // Only allow paths under /root/harv/media/
  if (!filePath.startsWith("/root/harv/media/")) {
    return new Response("Invalid path", { status: 403 });
  }

  const API_BASE =
    process.env.API_URL ||
    "https://api.openclaw-yqar.srv1420157.hstgr.cloud";
  const API_KEY = process.env.HARV_API_KEY || "";

  // Fetch via /api/agents/media/ (passes through Hostinger's proxy)
  const relativePath = filePath.replace("/root/harv/media/", "");
  const url = `${API_BASE}/api/agents/media/${relativePath}`;

  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": API_KEY },
    });

    if (!res.ok) {
      return new Response("Image not found", { status: 404 });
    }

    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Failed to fetch image", { status: 502 });
  }
}
