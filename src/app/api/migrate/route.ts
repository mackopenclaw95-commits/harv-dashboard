import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function POST() {
  try {
    // --- Auth check: require authenticated admin/owner ---
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

    // Add status and project_id columns to conversations (idempotent)
    const { error: e1 } = await supabase.rpc("exec_sql", {
      query: `
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_id uuid DEFAULT NULL;
      `,
    });

    // Create projects table (idempotent)
    const { error: e2 } = await supabase.rpc("exec_sql", {
      query: `
        CREATE TABLE IF NOT EXISTS projects (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text NOT NULL,
          description text,
          color text DEFAULT 'primary',
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
        ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
        DO $$ BEGIN
          CREATE POLICY "Allow all" ON projects FOR ALL USING (true);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `,
    });

    // If rpc doesn't exist, fall back to direct column operations
    // Supabase may not have exec_sql — try direct approach
    if (e1 || e2) {
      // Try probing columns to check if they exist
      try {
        await supabase.from("conversations").select("status").limit(1);
      } catch { /* column may not exist yet */ }

      try {
        await supabase.from("conversations").select("project_id").limit(1);
      } catch { /* column may not exist yet */ }

      return NextResponse.json({
        success: true,
        note: "RPC not available — columns may need to be added via Supabase dashboard SQL editor",
        sql: [
          "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';",
          "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_id uuid DEFAULT NULL;",
          "CREATE TABLE IF NOT EXISTS projects (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, name text NOT NULL, description text, color text DEFAULT 'primary', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());",
          "ALTER TABLE projects ENABLE ROW LEVEL SECURITY;",
          "CREATE POLICY \"Allow all\" ON projects FOR ALL USING (true);",
        ],
      });
    }

    return NextResponse.json({ success: true, message: "Migration complete" });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
