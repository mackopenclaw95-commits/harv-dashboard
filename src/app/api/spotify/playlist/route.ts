import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

const SPOTIFY = "https://api.spotify.com/v1";

async function getSpotifyToken(userId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("user_integrations")
    .select("metadata")
    .eq("user_id", userId)
    .eq("provider", "spotify")
    .eq("status", "active")
    .single();

  if (!data?.metadata?.access_token) return null;

  const meta = data.metadata;
  let token = meta.access_token;

  // Refresh if expired
  if (meta.token_expires_at && new Date(meta.token_expires_at) < new Date()) {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: meta.refresh_token }),
    });
    if (res.ok) {
      const d = await res.json();
      token = d.access_token;
      await supabase.from("user_integrations").update({
        metadata: { ...meta, access_token: token, token_expires_at: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString() },
      }).eq("user_id", userId).eq("provider", "spotify");
    }
  }
  return token;
}

/**
 * POST /api/spotify/playlist
 * Actions: add_tracks, search_and_add
 *
 * add_tracks: { action: "add_tracks", playlist_id: "...", track_uris: ["spotify:track:xxx", ...] }
 * search_and_add: { action: "search_and_add", playlist_id: "...", songs: ["Song - Artist", ...] }
 * find_playlist: { action: "find_playlist", name: "..." }
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(c) { c.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options); } catch {} }); },
        },
      }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const token = await getSpotifyToken(user.id);
    if (!token) return NextResponse.json({ error: "Spotify not connected" }, { status: 400 });

    const body = await req.json();
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // Find playlist by name
    if (body.action === "find_playlist") {
      const res = await fetch(`${SPOTIFY}/me/playlists?limit=50`, { headers });
      if (!res.ok) return NextResponse.json({ error: "Failed to fetch playlists" }, { status: 500 });
      const data = await res.json();
      const playlist = (data.items || []).find((p: { name: string }) =>
        p.name.toLowerCase() === body.name.toLowerCase()
      );
      if (!playlist) return NextResponse.json({ error: "Playlist not found", name: body.name }, { status: 404 });
      return NextResponse.json({ id: playlist.id, name: playlist.name, tracks: playlist.tracks?.total || 0 });
    }

    // Search for songs and add to playlist
    if (body.action === "search_and_add") {
      const { playlist_id, songs } = body;
      if (!playlist_id || !songs?.length) {
        return NextResponse.json({ error: "Missing playlist_id or songs" }, { status: 400 });
      }

      // Search each song and collect URIs
      const uris: string[] = [];
      const results: { song: string; found: boolean; uri?: string }[] = [];

      for (const song of songs) {
        try {
          const q = encodeURIComponent(song);
          const res = await fetch(`${SPOTIFY}/search?q=${q}&type=track&limit=1`, { headers });
          if (res.ok) {
            const data = await res.json();
            const track = data.tracks?.items?.[0];
            if (track) {
              uris.push(track.uri);
              results.push({ song, found: true, uri: track.uri });
            } else {
              results.push({ song, found: false });
            }
          } else {
            results.push({ song, found: false });
          }
        } catch {
          results.push({ song, found: false });
        }
      }

      // Add all found tracks to playlist in one batch
      if (uris.length > 0) {
        const addRes = await fetch(`${SPOTIFY}/playlists/${playlist_id}/tracks`, {
          method: "POST",
          headers,
          body: JSON.stringify({ uris }),
        });

        if (!addRes.ok) {
          const err = await addRes.text();
          return NextResponse.json({ error: "Failed to add tracks", detail: err }, { status: 500 });
        }
      }

      return NextResponse.json({
        added: uris.length,
        not_found: results.filter(r => !r.found).length,
        results,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Playlist API error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
