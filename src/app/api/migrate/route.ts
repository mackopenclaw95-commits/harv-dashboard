import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST() {
  try {
    const supabase = createServiceClient();

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
