import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

// Last N pricing drift checks — used by the admin card to show
// "clean for X days" vs recent incident count.
export async function GET() {
  try {
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

    const { data, error } = await supabase
      .from("pricing_drift_log")
      .select("id,checked_at,source,is_clean,zombies_count,free_wrong_count,drifts_count")
      .order("checked_at", { ascending: false })
      .limit(30);

    if (error) {
      // Table might not exist yet if the SQL hasn't been applied.
      return NextResponse.json({ entries: [], error: error.message });
    }

    // Compute "clean streak" — most recent consecutive clean checks.
    let cleanStreak = 0;
    for (const row of data || []) {
      if (row.is_clean) cleanStreak++;
      else break;
    }

    // Days since last dirty check
    let daysSinceDirty: number | null = null;
    const firstDirty = (data || []).find((r) => !r.is_clean);
    if (firstDirty) {
      const diff = Date.now() - new Date(firstDirty.checked_at).getTime();
      daysSinceDirty = Math.floor(diff / (1000 * 60 * 60 * 24));
    } else if ((data || []).length > 0) {
      const oldest = (data || [])[(data || []).length - 1];
      const diff = Date.now() - new Date(oldest.checked_at).getTime();
      daysSinceDirty = Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    return NextResponse.json({
      entries: data || [],
      clean_streak: cleanStreak,
      days_since_dirty: daysSinceDirty,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
