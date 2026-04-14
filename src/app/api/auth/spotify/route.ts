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

  // Request all scopes — playlist scopes work in Dev Mode, others activate
  // after Extended Quota Mode approval. The app handles missing scopes gracefully.
  const scopes = [
    "playlist-modify-public",
    "playlist-modify-private",
    "user-read-playback-state",
    "user-read-currently-playing",
    "user-read-recently-played",
    "user-top-read",
    "user-read-private",
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
