import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

/**
 * POST /api/integrations/link
 * Generate a 6-digit link code for Telegram/WhatsApp account linking.
 * Body: { provider: "telegram" | "whatsapp" }
 * Returns: { code, expires_in }
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(c) { c.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options); } catch {} }); },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { provider } = await req.json();
    if (!["telegram", "whatsapp", "discord"].includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    const serviceClient = createServiceClient();

    // Upsert: if user already has a pending/active link for this provider, update it
    const { error } = await serviceClient
      .from("user_integrations")
      .upsert(
        {
          user_id: user.id,
          provider,
          external_id: "",
          status: "pending",
          link_code: code,
          link_code_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" }
      );

    if (error) {
      console.error("Link code insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ code, expires_in: 600 });
  } catch (err) {
    console.error("Link error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
