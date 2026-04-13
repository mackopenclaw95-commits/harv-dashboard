import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Google OAuth callback — exchanges auth code for tokens.
 * Saves tokens to Supabase user_integrations (so VPS agents can read them).
 * Also passes tokens to client via URL param for localStorage caching.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const stateRaw = req.nextUrl.searchParams.get("state") || "";

  // Parse state — may be JSON { returnTo, userId } or legacy string
  let returnTo = "/calendar";
  let userId = "";
  try {
    const parsed = JSON.parse(stateRaw);
    returnTo = parsed.returnTo || "/calendar";
    userId = parsed.userId || "";
  } catch {
    // Legacy: plain string state like "from_integrations"
    if (stateRaw === "from_integrations") returnTo = "/integrations";
  }

  if (error) {
    return Response.redirect(
      new URL(`${returnTo}?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return Response.redirect(
      new URL(`${returnTo}?error=no_code`, req.url)
    );
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("Token exchange failed:", text);
      return Response.redirect(
        new URL(`${returnTo}?error=token_exchange_failed`, req.url)
      );
    }

    const tokens = await tokenRes.json();
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    // ─── Save tokens to Supabase for VPS agent access ───
    if (userId) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || "",
          process.env.SUPABASE_SERVICE_ROLE_KEY || ""
        );

        const integrationData = {
          user_id: userId,
          provider: "google",
          external_id: "",
          status: "active",
          connected_at: new Date().toISOString(),
          metadata: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || "",
            expires_at: expiresAt.toISOString(),
            scopes: "calendar,gmail,drive,docs,sheets",
          },
        };

        // Upsert — update existing or insert new
        const { data: existing } = await supabase
          .from("user_integrations")
          .select("id")
          .eq("user_id", userId)
          .eq("provider", "google")
          .single();

        if (existing) {
          await supabase
            .from("user_integrations")
            .update(integrationData)
            .eq("id", existing.id);
        } else {
          await supabase.from("user_integrations").insert(integrationData);
        }
      } catch (e) {
        console.error("Failed to save Google tokens to Supabase:", e);
        // Continue — localStorage will still work for dashboard
      }
    }

    // Also pass tokens to client for localStorage caching
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || "",
      expires_at: expiresAt.getTime(),
    };

    const encoded = encodeURIComponent(JSON.stringify(tokenData));
    return Response.redirect(
      new URL(`${returnTo}?tokens=${encoded}`, req.url)
    );
  } catch (e) {
    console.error("OAuth callback error:", e);
    return Response.redirect(
      new URL(`${returnTo}?error=server_error`, req.url)
    );
  }
}
