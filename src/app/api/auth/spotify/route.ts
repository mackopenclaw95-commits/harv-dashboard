import { NextRequest, NextResponse } from "next/server";

/**
 * Initiates Spotify OAuth flow — redirects user to Spotify authorization page.
 * Pass user_id as query param so we can store tokens after callback.
 *
 * Only playlist scopes work in Development Mode (Feb 2026 changes).
 * user-read-private and user-read-email are blocked.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id") || "";
  const clientId = (process.env.SPOTIFY_CLIENT_ID || "").trim();
  const redirectUri = `${req.nextUrl.origin}/api/auth/spotify/callback`;

  // Only playlist scopes work in Spotify Development Mode (Feb 2026 restrictions)
  // user-top-read, user-library-read, user-read-recently-played are all blocked
  const scopes = [
    "playlist-modify-public",
    "playlist-modify-private",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes,
    state: userId,
    show_dialog: "true",
  });

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  );
}
