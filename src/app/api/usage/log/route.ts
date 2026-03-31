import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    // Get the user from the session
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

    const { agent_name, tokens_used, estimated_cost } = await req.json();

    // Use service client to bypass RLS for the insert
    const serviceClient = createServiceClient();
    const { error } = await serviceClient.from("usage_logs").insert({
      user_id: user.id,
      agent_name: agent_name || "Harv",
      tokens_used: tokens_used || 0,
      estimated_cost: estimated_cost || 0,
    });

    if (error) {
      console.error("Usage log insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logged: true, tokens_used: tokens_used || 0 });
  } catch (err) {
    console.error("Usage log error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
