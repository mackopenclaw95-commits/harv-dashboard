import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

const SPOTIFY = "https://api.spotify.com/v1";

async function spotifyGet(url: string, token: string) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { error: res.status };
    return await res.json();
  } catch {
    return { error: 0 };
  }
}

/**
 * GET /api/spotify/stats?sections=recent,top_tracks,top_artists,playlists,liked
 * Returns multiple Spotify stats in one request.
 * Each section that fails (403 = scope missing) is returned as { error: 403 }.
 */
export async function GET(req: NextRequest) {
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

    const supabase = createServiceClient();
    const { data: integration } = await supabase
      .from("user_integrations")
      .select("metadata")
      .eq("user_id", user.id)
      .eq("provider", "spotify")
      .eq("status", "active")
      .single();

    if (!integration?.metadata?.access_token) {
      return NextResponse.json({ error: "not_connected" }, { status: 400 });
    }

    const meta = integration.metadata;
    let token = meta.access_token;

    // Refresh if expired
    if (meta.token_expires_at && new Date(meta.token_expires_at) < new Date()) {
      const refreshRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: meta.refresh_token }),
        signal: AbortSignal.timeout(10000),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        token = data.access_token;
        await supabase.from("user_integrations").update({
          metadata: { ...meta, access_token: token, token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString() },
        }).eq("user_id", user.id).eq("provider", "spotify");
      }
    }

    const sections = (req.nextUrl.searchParams.get("sections") || "recent,top_tracks,top_artists,playlists,liked").split(",");

    // Fetch all sections in parallel
    const fetches: Record<string, Promise<unknown>> = {};

    if (sections.includes("recent")) {
      fetches.recent = spotifyGet(`${SPOTIFY}/me/player/recently-played?limit=20`, token);
    }
    if (sections.includes("top_tracks")) {
      fetches.top_tracks = spotifyGet(`${SPOTIFY}/me/top/tracks?limit=20&time_range=short_term`, token);
    }
    if (sections.includes("top_artists")) {
      fetches.top_artists = spotifyGet(`${SPOTIFY}/me/top/artists?limit=20&time_range=short_term`, token);
    }
    if (sections.includes("playlists")) {
      fetches.playlists = spotifyGet(`${SPOTIFY}/me/playlists?limit=20`, token);
    }
    if (sections.includes("liked")) {
      fetches.liked = spotifyGet(`${SPOTIFY}/me/tracks?limit=20`, token);
    }

    const keys = Object.keys(fetches);
    const values = await Promise.all(Object.values(fetches));
    const raw: Record<string, unknown> = {};
    keys.forEach((k, i) => { raw[k] = values[i]; });

    // Transform into clean format
    const result: Record<string, unknown> = {};

    // Recently Played
    if (raw.recent && !(raw.recent as { error?: number }).error) {
      const data = raw.recent as { items?: Array<{ track: { name: string; artists: Array<{ name: string }>; album: { name: string; images: Array<{ url: string }> }; external_urls: { spotify: string }; duration_ms: number }; played_at: string }> };
      result.recent = (data.items || []).map(item => ({
        track: item.track.name,
        artist: item.track.artists.map(a => a.name).join(", "),
        album: item.track.album.name,
        album_art: item.track.album.images?.[1]?.url || item.track.album.images?.[0]?.url || "",
        played_at: item.played_at,
        url: item.track.external_urls?.spotify || "",
        duration_ms: item.track.duration_ms,
      }));
    } else {
      result.recent = { locked: true, scope: "user-read-recently-played" };
    }

    // Top Tracks
    if (raw.top_tracks && !(raw.top_tracks as { error?: number }).error) {
      const data = raw.top_tracks as { items?: Array<{ name: string; artists: Array<{ name: string }>; album: { name: string; images: Array<{ url: string }> }; external_urls: { spotify: string }; popularity: number }> };
      result.top_tracks = (data.items || []).map((t, i) => ({
        rank: i + 1,
        track: t.name,
        artist: t.artists.map(a => a.name).join(", "),
        album: t.album.name,
        album_art: t.album.images?.[1]?.url || t.album.images?.[0]?.url || "",
        url: t.external_urls?.spotify || "",
        popularity: t.popularity,
      }));
    } else {
      result.top_tracks = { locked: true, scope: "user-top-read" };
    }

    // Top Artists
    if (raw.top_artists && !(raw.top_artists as { error?: number }).error) {
      const data = raw.top_artists as { items?: Array<{ name: string; genres: string[]; images: Array<{ url: string }>; external_urls: { spotify: string }; popularity: number; followers: { total: number } }> };
      result.top_artists = (data.items || []).map((a, i) => ({
        rank: i + 1,
        name: a.name,
        genres: a.genres.slice(0, 3),
        image: a.images?.[1]?.url || a.images?.[0]?.url || "",
        url: a.external_urls?.spotify || "",
        popularity: a.popularity,
        followers: a.followers?.total || 0,
      }));
    } else {
      result.top_artists = { locked: true, scope: "user-top-read" };
    }

    // Playlists
    if (raw.playlists && !(raw.playlists as { error?: number }).error) {
      const data = raw.playlists as { items?: Array<{ name: string; description: string; images: Array<{ url: string }>; tracks: { total: number }; external_urls: { spotify: string }; owner: { display_name: string } }> };
      result.playlists = (data.items || []).map(p => ({
        name: p.name,
        description: p.description || "",
        image: p.images?.[0]?.url || "",
        track_count: p.tracks?.total || 0,
        url: p.external_urls?.spotify || "",
        owner: p.owner?.display_name || "",
      }));
    } else {
      result.playlists = { locked: true, scope: "playlist-read-private" };
    }

    // Liked Songs
    if (raw.liked && !(raw.liked as { error?: number }).error) {
      const data = raw.liked as { total?: number; items?: Array<{ added_at: string; track: { name: string; artists: Array<{ name: string }>; album: { name: string; images: Array<{ url: string }> }; external_urls: { spotify: string } } }> };
      result.liked = {
        total: data.total || 0,
        recent: (data.items || []).map(item => ({
          track: item.track.name,
          artist: item.track.artists.map(a => a.name).join(", "),
          album_art: item.track.album.images?.[2]?.url || item.track.album.images?.[0]?.url || "",
          added_at: item.added_at,
          url: item.track.external_urls?.spotify || "",
        })),
      };
    } else {
      result.liked = { locked: true, scope: "user-library-read" };
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Spotify stats error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "server_error", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
