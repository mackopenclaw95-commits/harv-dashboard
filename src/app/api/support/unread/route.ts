import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

async function getUser() {
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
  return user;
}

// GET /api/support/unread → count + list of tickets with an unread admin response
export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = createServiceClient();
    const { data, error } = await service
      .from("support_tickets")
      .select("id, subject, admin_response, updated_at, user_seen_response_at")
      .eq("user_id", user.id)
      .not("admin_response", "is", null)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // A ticket is "unread" if it has an admin_response and either:
    // 1. user_seen_response_at is null, or
    // 2. user_seen_response_at is older than updated_at
    const unread = (data || []).filter((t) => {
      if (!t.admin_response) return false;
      if (!t.user_seen_response_at) return true;
      return new Date(t.user_seen_response_at) < new Date(t.updated_at);
    });

    return NextResponse.json({
      count: unread.length,
      tickets: unread.map((t) => ({
        id: t.id,
        subject: t.subject,
        admin_response: t.admin_response,
        updated_at: t.updated_at,
      })),
    });
  } catch (err) {
    console.error("Support unread GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/support/seen → mark all the user's tickets as seen
export async function POST() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = createServiceClient();
    const { error } = await service
      .from("support_tickets")
      .update({ user_seen_response_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .not("admin_response", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Support seen POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
