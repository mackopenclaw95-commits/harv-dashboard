import { supabase, createBrowserSupabase } from "./supabase";

async function getUserId(): Promise<string | null> {
  try {
    const browser = createBrowserSupabase();
    const { data } = await browser.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function isOwnerUser(): Promise<boolean> {
  const uid = await getUserId();
  if (!uid) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", uid).single();
  return data?.role === "owner" || data?.role === "admin";
}

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  agent_name: string | null;
  created_at: string;
  similarity?: number;
}

/** Get memory entries with optional text search */
export async function searchMemoryEntries(
  query?: string,
  limit = 30
): Promise<MemoryEntry[]> {
  // Memory entries are owner-only (created by VPS backend, no user_id)
  if (!(await isOwnerUser())) return [];

  let q = supabase
    .from("memory_entries")
    .select("id, content, metadata, agent_name, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (query) {
    q = q.ilike("content", `%${query}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Get memory stats */
export async function getMemoryStats(): Promise<{
  total_entries: number;
  agents: string[];
}> {
  if (!(await isOwnerUser())) return { total_entries: 0, agents: [] };

  const { count, error } = await supabase
    .from("memory_entries")
    .select("*", { count: "exact", head: true });

  if (error) throw error;

  const { data: agentData } = await supabase
    .from("memory_entries")
    .select("agent_name")
    .not("agent_name", "is", null);

  const agents = [
    ...new Set((agentData || []).map((r) => r.agent_name).filter(Boolean)),
  ] as string[];

  return {
    total_entries: count || 0,
    agents,
  };
}

/** Get memory entries grouped by agent */
export async function getMemoryByAgent(
  agentName: string,
  limit = 20
): Promise<MemoryEntry[]> {
  if (!(await isOwnerUser())) return [];

  const { data, error } = await supabase
    .from("memory_entries")
    .select("id, content, metadata, agent_name, created_at")
    .eq("agent_name", agentName)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
