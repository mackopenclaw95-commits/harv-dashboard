import { supabase, createBrowserSupabase } from "./supabase";

async function isOwnerUser(): Promise<boolean> {
  try {
    const browser = createBrowserSupabase();
    const { data } = await browser.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return false;
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", uid).single();
    return profile?.role === "owner" || profile?.role === "admin";
  } catch {
    return false;
  }
}

export interface JournalEntry {
  id: string;
  date: string;
  session_id: string;
  summary: string | null;
  accomplishments: string[];
  agents_used: string[];
  pending_tasks: string[];
  key_info: string[];
  total_cost_usd: number;
  created_at: string;
}

/** Get journal entries, newest first. Optional date range filter. */
export async function getJournalEntries(
  startDate?: string,
  endDate?: string,
  limit = 30
): Promise<JournalEntry[]> {
  if (!(await isOwnerUser())) return [];

  let query = supabase
    .from("journal_entries")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);

  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as JournalEntry[];
}

/** Get a single journal entry by date. */
export async function getJournalByDate(
  date: string
): Promise<JournalEntry | null> {
  if (!(await isOwnerUser())) return null;

  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data as JournalEntry | null;
}

/** Search journal entries by text across summary, accomplishments, key_info. */
export async function searchJournal(query: string): Promise<JournalEntry[]> {
  if (!(await isOwnerUser())) return [];

  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .or(
      `summary.ilike.%${query}%,accomplishments.cs.{${query}},key_info.cs.{${query}}`
    )
    .order("date", { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data || []) as JournalEntry[];
}

/** Get journal stats. */
export async function getJournalStats(): Promise<{
  totalEntries: number;
  totalCost: number;
  agentsUsed: string[];
}> {
  if (!(await isOwnerUser())) return { totalEntries: 0, totalCost: 0, agentsUsed: [] };

  const { data, error, count } = await supabase
    .from("journal_entries")
    .select("total_cost_usd, agents_used", { count: "exact" });

  if (error) throw error;

  const entries = data || [];
  const totalCost = entries.reduce(
    (sum, e) => sum + (e.total_cost_usd || 0),
    0
  );
  const allAgents = new Set<string>();
  for (const e of entries) {
    for (const a of e.agents_used || []) {
      allAgents.add(a);
    }
  }

  return {
    totalEntries: count || 0,
    totalCost,
    agentsUsed: Array.from(allAgents).sort(),
  };
}
