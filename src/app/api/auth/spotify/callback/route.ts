import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Spotify OAuth callback — exchanges auth code for tokens and stores them.
 * Uses the existing user_integrations table schema:
 *   id, user_id, provider, external_id, status, metadata, connected_at
 * Tokens stored in metadata JSON field.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state"); // contains user_id

  if (error) {
    return Response.redirect(
      new URL(`/integrations?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return Response.redirect(
      new URL("/integrations?error=no_code", req.url)
    );
  }

  const clientId = (process.env.SPOTIFY_CLIENT_ID || "").trim();
  const clientSecret = (process.env.SPOTIFY_CLIENT_SECRET || "").trim();
  const redirectUri = `${req.nextUrl.origin}/api/auth/spotify/callback`;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("Spotify token exchange failed:", tokenRes.status, text);
      return Response.redirect(
        new URL(`/integrations?error=token_exchange_failed&details=${encodeURIComponent(text.slice(0, 100))}`, req.url)
      );
    }

    const tokens = await tokenRes.json();

    // Get Spotify user profile
    const profileRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : null;

    // Store in user_integrations using the CORRECT schema
    if (state) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.SUPABASE_SERVICE_ROLE_KEY || ""
      );

      const integrationData = {
        user_id: state,
        provider: "spotify",
        external_id: profile?.id || "",
        status: "active",
        connected_at: new Date().toISOString(),
        metadata: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || "",
          token_expires_at: new Date(
            Date.now() + (tokens.expires_in || 3600) * 1000
          ).toISOString(),
          display_name: profile?.display_name || "",
          email: profile?.email || "",
          product: profile?.product || "",
          country: profile?.country || "",
          scopes: tokens.scope || "",
        },
      };

      // Upsert — update if already linked
      const { data: existing } = await supabase
        .from("user_integrations")
        .select("id")
        .eq("user_id", state)
        .eq("provider", "spotify")
        .single();

      if (existing) {
        await supabase
          .from("user_integrations")
          .update(integrationData)
          .eq("id", existing.id);
      } else {
        await supabase.from("user_integrations").insert(integrationData);
      }
    }

    return Response.redirect(
      new URL("/integrations?spotify=connected", req.url)
    );
  } catch (e) {
    console.error("Spotify OAuth error:", e);
    return Response.redirect(
      new URL("/integrations?error=server_error", req.url)
    );
  }
}
