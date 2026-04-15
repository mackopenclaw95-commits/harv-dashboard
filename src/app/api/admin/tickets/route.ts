import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

async function requireAdmin() {
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
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return { error: "Forbidden", status: 403 as const };
  }
  return { user, supabase };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase } = auth;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const countOnly = searchParams.get("count") === "1";

    if (countOnly) {
      const { count } = await supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      return NextResponse.json({ open_count: count || 0 });
    }

    let query = supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (status && ["open", "in_progress", "resolved", "closed"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data: tickets, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with user names from profiles
    const userIds = Array.from(new Set((tickets || []).map((t) => t.user_id).filter(Boolean)));
    const userMap: Record<string, { name: string | null; email: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);
      for (const p of profiles || []) {
        userMap[p.id] = { name: p.name, email: p.email };
      }
    }

    const enriched = (tickets || []).map((t) => ({
      ...t,
      user_name: userMap[t.user_id]?.name || null,
    }));

    return NextResponse.json({ tickets: enriched });
  } catch (err) {
    console.error("Admin tickets GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase } = auth;

    const body = await req.json();
    const { id, status, admin_response } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Ticket id required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) {
      if (!["open", "in_progress", "resolved", "closed"].includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = status;
      if (status === "resolved" || status === "closed") {
        updates.resolved_at = new Date().toISOString();
      }
    }
    if (typeof admin_response === "string") {
      updates.admin_response = admin_response;
    }

    const { data, error } = await supabase
      .from("support_tickets")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ticket: data });
  } catch (err) {
    console.error("Admin tickets PATCH error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
