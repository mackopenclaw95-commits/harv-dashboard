import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

/**
 * GET /api/spotify/now-playing
 * Returns the user's currently playing Spotify track.
 * Requires user-read-playback-state scope (Extended Quota Mode).
 */
export async function GET() {
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
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get Spotify token from Supabase
    const supabase = createServiceClient();
    const { data: integration } = await supabase
      .from("user_integrations")
      .select("metadata")
      .eq("user_id", user.id)
      .eq("provider", "spotify")
      .eq("status", "active")
      .single();

    if (!integration?.metadata?.access_token) {
      return NextResponse.json({ playing: false, error: "not_connected" });
    }

    const meta = integration.metadata;
    let token = meta.access_token;

    // Check if token is expired and refresh if needed
    const expiresAt = meta.token_expires_at;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      const refreshRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: meta.refresh_token,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        token = data.access_token;
        // Update Supabase
        await supabase
          .from("user_integrations")
          .update({
            metadata: {
              ...meta,
              access_token: token,
              token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
            },
          })
          .eq("user_id", user.id)
          .eq("provider", "spotify");
      } else {
        return NextResponse.json({ playing: false, error: "token_refresh_failed" });
      }
    }

    // Call Spotify API
    const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });

    // 204 = nothing playing, 403 = scope not granted
    if (res.status === 204) {
      return NextResponse.json({ playing: false });
    }

    if (res.status === 403) {
      return NextResponse.json({ playing: false, error: "scope_not_granted", scope: "user-read-playback-state" });
    }

    if (!res.ok) {
      return NextResponse.json({ playing: false, error: `spotify_${res.status}` });
    }

    const data = await res.json();

    if (!data.item) {
      return NextResponse.json({ playing: false });
    }

    return NextResponse.json({
      playing: data.is_playing || false,
      track: data.item.name,
      artist: data.item.artists?.map((a: { name: string }) => a.name).join(", ") || "",
      album: data.item.album?.name || "",
      album_art: data.item.album?.images?.[0]?.url || "",
      album_art_small: data.item.album?.images?.[2]?.url || data.item.album?.images?.[0]?.url || "",
      progress_ms: data.progress_ms || 0,
      duration_ms: data.item.duration_ms || 0,
      spotify_url: data.item.external_urls?.spotify || "",
    });
  } catch (err) {
    console.error("Now playing error:", err);
    return NextResponse.json({ playing: false, error: "server_error" });
  }
}
