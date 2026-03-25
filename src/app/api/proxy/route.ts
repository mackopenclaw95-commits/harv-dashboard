import { NextRequest } from "next/server";

const API_BASE =
  process.env.API_URL ||
  "https://api.openclaw-yqar.srv1420157.hstgr.cloud";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return Response.json({ error: "Missing path param" }, { status: 400 });
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  return Response.json(data);
}
