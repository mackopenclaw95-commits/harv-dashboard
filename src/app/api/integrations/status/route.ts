import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

/**
 * GET /api/integrations/status
 * Get all integrations for the current user.
 * Also supports ?provider=telegram to check a single provider.
 *
 * POST /api/integrations/status — called by VPS bots to check if an external_id is linked
 * Auth: X-API-Key header
 * Body: { provider, external_id }
 * Returns: { linked: true, user_id } or { linked: false }
 */
export async function GET(req: NextRequest) {
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

    const provider = req.nextUrl.searchParams.get("provider");
    const serviceClient = createServiceClient();

    let query = serviceClient
      .from("user_integrations")
      .select("*")
      .eq("user_id", user.id);

    if (provider) {
      query = query.eq("provider", provider);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ integrations: data || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * POST — VPS bot lookup: is this external_id linked?
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = process.env.HARV_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider, external_id } = await req.json();
    if (!provider || !external_id) {
      return NextResponse.json({ error: "Missing provider or external_id" }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("user_integrations")
      .select("user_id, status, connected_at")
      .eq("provider", provider)
      .eq("external_id", external_id)
      .eq("status", "active")
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data && data.length > 0) {
      return NextResponse.json({ linked: true, user_id: data[0].user_id });
    }

    return NextResponse.json({ linked: false });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
