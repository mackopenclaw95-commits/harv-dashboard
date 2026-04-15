import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

// Admin CRUD for model_pricing rows. Replaces raw SQL edits.
// GET  — list all rows
// POST — upsert one row
// DELETE ?model=... — delete one row

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
  return { supabase };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.supabase
    .from("model_pricing")
    .select("*")
    .order("unit", { ascending: true })
    .order("model", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }
  // Matches docs/supabase-model-pricing.sql unit enum
  const unit = typeof body.unit === "string" ? body.unit : "tokens";
  const validUnits = ["tokens", "image", "audio_minute", "tts_char"];
  if (!validUnits.includes(unit)) {
    return NextResponse.json(
      { error: `unit must be one of ${validUnits.join("|")}` },
      { status: 400 }
    );
  }
  const modality = typeof body.modality === "string" ? body.modality : "text";

  const row = {
    model,
    unit,
    modality,
    input_per_million: Number(body.input_per_million) || 0,
    output_per_million: Number(body.output_per_million) || 0,
    per_unit_cost: Number(body.per_unit_cost) || 0,
    provider: typeof body.provider === "string" ? body.provider : "openrouter",
    is_free: Boolean(body.is_free),
    notes: typeof body.notes === "string" ? body.notes : null,
  };

  const { data, error } = await auth.supabase
    .from("model_pricing")
    .upsert(row, { onConflict: "model" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const model = url.searchParams.get("model");
  if (!model) {
    return NextResponse.json({ error: "?model=... required" }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("model_pricing")
    .delete()
    .eq("model", model);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
