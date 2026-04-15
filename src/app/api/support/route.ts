import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    const category = String(body.category || "general").trim();

    if (!subject || subject.length > 200) {
      return NextResponse.json({ error: "Subject is required (max 200 chars)" }, { status: 400 });
    }
    if (!message || message.length > 5000) {
      return NextResponse.json({ error: "Message is required (max 5000 chars)" }, { status: 400 });
    }
    if (!["general", "bug", "billing", "feature", "account"].includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const service = createServiceClient();
    const { data, error } = await service
      .from("support_tickets")
      .insert({
        user_id: user.id,
        email: user.email || "",
        category,
        subject,
        message,
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("Support ticket insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ticket: data });
  } catch (err) {
    console.error("Support POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = createServiceClient();
    const { data, error } = await service
      .from("support_tickets")
      .select("id, category, subject, message, status, admin_response, created_at, resolved_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Support ticket list error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tickets: data || [] });
  } catch (err) {
    console.error("Support GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
