import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action } = await req.json();
    const supabase = createServiceClient();

    if (action === "ban") {
      await supabase
        .from("profiles")
        .update({ plan_status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id);
      return NextResponse.json({ status: "cancelled" });
    }

    if (action === "activate") {
      await supabase
        .from("profiles")
        .update({ plan_status: "active", updated_at: new Date().toISOString() })
        .eq("id", id);
      return NextResponse.json({ status: "active" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
