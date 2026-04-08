import { NextRequest } from "next/server";

/**
 * Google OAuth callback — exchanges auth code for tokens.
 * Called by Google after user consents. Redirects to /calendar with tokens in hash.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const returnTo = state === "from_integrations" ? "/integrations" : "/calendar";

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

    // Redirect to calendar page with tokens in URL hash (client-side only, not sent to server)
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || "",
      expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
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
