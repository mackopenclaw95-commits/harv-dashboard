import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Refresh Google OAuth access token using the refresh token.
 * Keeps client_secret server-side only.
 * Syncs refreshed tokens to Supabase so VPS agents stay up to date.
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
  const newExpiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

  // ─── Sync refreshed token to Supabase for VPS agents ───
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

    if (user) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.SUPABASE_SERVICE_ROLE_KEY || ""
      );
      await supabase
        .from("user_integrations")
        .update({
          metadata: {
            access_token: data.access_token,
            refresh_token: refresh_token,
            expires_at: newExpiresAt.toISOString(),
            scopes: "calendar,gmail,drive,docs,sheets",
          },
        })
        .eq("user_id", user.id)
        .eq("provider", "google");
    }
  } catch (e) {
    console.error("Failed to sync refreshed Google token to Supabase:", e);
  }

  return Response.json({
    access_token: data.access_token,
    expires_in: data.expires_in,
  });
}
