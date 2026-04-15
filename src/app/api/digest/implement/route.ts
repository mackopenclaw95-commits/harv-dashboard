import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

// Fires the "Harv Digest Implement" Claude Code routine with the implementation
// guide produced by the Video Digest agent as the initial message. Anthropic
// spins up a Claude Code session on their cloud, which opens a PR against
// harv-dashboard on a feature branch. Admin-only.
//
// Docs: https://platform.claude.com/docs/en/api/claude-code/routines-fire

const MAX_TEXT_LEN = 65_536;

export async function POST(req: Request) {
  try {
    // --- Auth: owner / admin only ---
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
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const supabase = createServiceClient();
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!callerProfile || !["owner", "admin"].includes(callerProfile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Config ---
    const fireUrl = process.env.CLAUDE_ROUTINE_FIRE_URL;
    const token = process.env.CLAUDE_ROUTINE_TOKEN;
    if (!fireUrl || !token) {
      return NextResponse.json(
        { error: "Claude routine not configured (CLAUDE_ROUTINE_FIRE_URL / CLAUDE_ROUTINE_TOKEN missing)" },
        { status: 500 }
      );
    }

    // --- Body ---
    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = (body.text || "").trim();
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LEN) {
      return NextResponse.json(
        { error: `text exceeds ${MAX_TEXT_LEN} character limit (got ${text.length})` },
        { status: 400 }
      );
    }

    // --- Fire ---
    const r = await fetch(fireUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      cache: "no-store",
    });

    const raw = await r.text();
    if (!r.ok) {
      return NextResponse.json(
        { error: `Routine fire failed (${r.status})`, detail: raw.slice(0, 500) },
        { status: r.status === 429 ? 429 : 502 }
      );
    }

    let data: { claude_code_session_id?: string; claude_code_session_url?: string };
    try {
      data = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Routine returned non-JSON response", detail: raw.slice(0, 500) },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      session_id: data.claude_code_session_id,
      session_url: data.claude_code_session_url,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
