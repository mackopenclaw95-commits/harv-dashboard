import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * POST /api/integrations/verify
 * Called by VPS bots (Telegram/WhatsApp) to verify a link code.
 * Auth: X-API-Key header (HARV_API_KEY)
 * Body: { provider, external_id, code }
 * Returns: { user_id, status: "linked" } or { error }
 */
export async function POST(req: NextRequest) {
  try {
    // Auth via API key (same as VPS proxy pattern)
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = process.env.HARV_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider, external_id, code } = await req.json();
    if (!provider || !external_id || !code) {
      return NextResponse.json({ error: "Missing provider, external_id, or code" }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // Find pending link with matching provider + code + not expired
    const { data: links, error: findError } = await serviceClient
      .from("user_integrations")
      .select("*")
      .eq("provider", provider)
      .eq("link_code", code)
      .eq("status", "pending")
      .gte("link_code_expires_at", new Date().toISOString())
      .limit(1);

    if (findError) {
      console.error("Verify lookup error:", findError);
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }

    if (!links || links.length === 0) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 404 });
    }

    const link = links[0];

    // Activate the link
    const { error: updateError } = await serviceClient
      .from("user_integrations")
      .update({
        external_id,
        status: "active",
        link_code: null,
        link_code_expires_at: null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", link.id);

    if (updateError) {
      console.error("Verify update error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ user_id: link.user_id, status: "linked" });
  } catch (err) {
    console.error("Verify error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
