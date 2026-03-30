import { NextRequest } from "next/server";

/**
 * Refresh Google OAuth access token using the refresh token.
 * Keeps client_secret server-side only.
 */
export async function POST(req: NextRequest) {
  const { refresh_token } = await req.json();

  if (!refresh_token) {
    return Response.json({ error: "refresh_token required" }, { status: 400 });
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return Response.json(
      { error: "refresh_failed", details: text },
      { status: 401 }
    );
  }

  const data = await tokenRes.json();
  return Response.json({
    access_token: data.access_token,
    expires_in: data.expires_in,
  });
}
