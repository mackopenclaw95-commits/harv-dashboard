import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const [profileRes, convosRes, docsRes, projectsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).single(),
      supabase
        .from("conversations")
        .select("id, title, agent_name, status, updated_at, messages(count)")
        .eq("user_id", id)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("documents")
        .select("id, filename, file_type, file_size, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("projects")
        .select("id, name, created_at, updated_at")
        .eq("user_id", id)
        .order("updated_at", { ascending: false }),
    ]);

    return NextResponse.json({
      profile: profileRes.data,
      conversations: convosRes.data || [],
      documents: docsRes.data || [],
      projects: projectsRes.data || [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
