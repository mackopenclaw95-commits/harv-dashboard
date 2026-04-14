import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

/**
 * POST /api/spotify/player
 * Control Spotify playback: play, pause, next, previous.
 * Body: { action: "play" | "pause" | "next" | "previous" }
 * Requires user-modify-playback-state scope.
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
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { action } = await req.json();
    if (!["play", "pause", "next", "previous"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Get Spotify token
    const supabase = createServiceClient();
    const { data: integration } = await supabase
      .from("user_integrations")
      .select("metadata")
      .eq("user_id", user.id)
      .eq("provider", "spotify")
      .eq("status", "active")
      .single();

    if (!integration?.metadata?.access_token) {
      return NextResponse.json({ error: "Spotify not connected" }, { status: 400 });
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
        await supabase
          .from("user_integrations")
          .update({ metadata: { ...meta, access_token: token, token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString() } })
          .eq("user_id", user.id)
          .eq("provider", "spotify");
      }
    }

    // Map action to Spotify API
    const endpoints: Record<string, { url: string; method: string }> = {
      play: { url: "https://api.spotify.com/v1/me/player/play", method: "PUT" },
      pause: { url: "https://api.spotify.com/v1/me/player/pause", method: "PUT" },
      next: { url: "https://api.spotify.com/v1/me/player/next", method: "POST" },
      previous: { url: "https://api.spotify.com/v1/me/player/previous", method: "POST" },
    };

    const endpoint = endpoints[action];
    const res = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 403) {
      return NextResponse.json({ error: "scope_not_granted", scope: "user-modify-playback-state" }, { status: 403 });
    }

    if (res.status === 404) {
      return NextResponse.json({ error: "No active device found. Open Spotify on a device first." }, { status: 404 });
    }

    // 204 = success for player endpoints
    return NextResponse.json({ success: true, action });
  } catch (err) {
    console.error("Player control error:", err);
    return NextResponse.json({ error: "Failed to control playback" }, { status: 500 });
  }
}
