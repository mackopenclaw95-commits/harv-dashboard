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

export interface Conversation {
  id: string;
  agent_name: string;
  title: string | null;
  status: string; // 'active' | 'archived' | 'deleted'
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

/** Get or create a conversation for an agent. Returns conversation ID. */
export async function getOrCreateConversation(
  agentName: string
): Promise<string> {
  // Find most recent conversation for this agent (within last 24h)
  const uid = await getUserId();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // Try with status filter first, fall back without it if column doesn't exist
  let existing: { id: string } | null = null;
  let q1 = supabase
    .from("conversations")
    .select("id")
    .eq("agent_name", agentName)
    .eq("status", "active")
    .gte("updated_at", cutoff)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (uid) q1 = q1.eq("user_id", uid);
  const { data: d1, error: e1 } = await q1.single();

  if (!e1) {
    existing = d1;
  } else if (e1.code !== "PGRST116") {
    let q2 = supabase
      .from("conversations")
      .select("id")
      .eq("agent_name", agentName)
      .gte("updated_at", cutoff)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (uid) q2 = q2.eq("user_id", uid);
    const { data: d2 } = await q2.single();
    existing = d2;
  }

  if (existing) return existing.id;

  // Create new conversation
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ agent_name: agentName, user_id: uid })
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

/** Create a new conversation (always fresh, ignores existing ones) */
export async function createConversation(
  agentName: string,
  title?: string
): Promise<string> {
  const uid = await getUserId();
  const { data, error } = await supabase
    .from("conversations")
    .insert({ agent_name: agentName, title: title || null, user_id: uid })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/** Save a single message to a conversation */
export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string
): Promise<ChatMessage> {
  // Update conversation timestamp
  supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .then();

  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role, content, user_id: (await getUserId()) })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Get all messages for a conversation */
export async function getConversationMessages(
  conversationId: string
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

/** Update a conversation title */
export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  await supabase
    .from("conversations")
    .update({ title })
    .eq("id", conversationId);
}

/** Get a single conversation by ID */
export async function getConversationById(
  conversationId: string
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (error) return null;
  return data;
}

/** Get recent conversations, optionally filtered by agent name, status, and project */
export async function getRecentConversations(
  limit = 20,
  agentName?: string,
  status: "active" | "archived" | "all" = "active",
  projectId?: string
): Promise<(Conversation & { message_count: number; last_message?: string })[]> {
  const uid = await getUserId();

  let query = supabase
    .from("conversations")
    .select("*, messages(count)")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (uid) query = query.eq("user_id", uid);

  if (agentName) {
    query = query.eq("agent_name", agentName);
  }

  if (status !== "all") {
    query = query.eq("status", status);
  } else {
    query = query.neq("status", "deleted");
  }

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  let { data, error } = await query;

  // If status column doesn't exist yet, retry without status filter
  if (error && !data) {
    let retryQuery = supabase
      .from("conversations")
      .select("*, messages(count)")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (uid) retryQuery = retryQuery.eq("user_id", uid);
    if (agentName) {
      retryQuery = retryQuery.eq("agent_name", agentName);
    }
    if (projectId) {
      retryQuery = retryQuery.eq("project_id", projectId);
    }

    const retry = await retryQuery;
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;

  const conversations = (data || []).map((c) => ({
    ...c,
    message_count: (c.messages as unknown as { count: number }[])?.[0]?.count || 0,
  }));

  // Filter out empty conversations (0 messages)
  const nonEmpty = conversations.filter((c) => c.message_count > 0);

  // Get last message for each conversation
  const withLastMessage = await Promise.all(
    nonEmpty.map(async (c) => {
      const { data: msgs } = await supabase
        .from("messages")
        .select("content")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1);
      return { ...c, last_message: msgs?.[0]?.content };
    })
  );

  return withLastMessage;
}

/** Get conversations for a specific agent */
export async function getAgentConversations(
  agentName: string
): Promise<Conversation[]> {
  const uid = await getUserId();
  let query = supabase
    .from("conversations")
    .select("*")
    .eq("agent_name", agentName)
    .order("updated_at", { ascending: false });

  if (uid) query = query.eq("user_id", uid);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Get agent names that have conversations, sorted by most recent */
export async function getAgentsWithConversations(): Promise<string[]> {
  const uid = await getUserId();
  let query = supabase
    .from("conversations")
    .select("agent_name, updated_at")
    .order("updated_at", { ascending: false });
  if (uid) query = query.eq("user_id", uid);
  const { data, error } = await query;

  if (error) throw error;

  // Deduplicate, keeping order (most recent first)
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of data || []) {
    if (!seen.has(row.agent_name)) {
      seen.add(row.agent_name);
      result.push(row.agent_name);
    }
  }
  return result;
}

/** Full-text search across all messages */
export async function searchMessages(
  query: string,
  limit = 30,
  options?: { agentName?: string; dateRange?: "today" | "week" | "month" | "all" }
): Promise<
  (ChatMessage & { conversation: Conversation })[]
> {
  const uid = await getUserId();
  let q = supabase
    .from("messages")
    .select("*, conversation:conversations(*)")
    .ilike("content", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (uid) q = q.eq("user_id", uid);

  if (options?.agentName) {
    q = q.eq("conversation.agent_name", options.agentName);
  }

  if (options?.dateRange && options.dateRange !== "all") {
    const now = new Date();
    let cutoff: Date = now;
    if (options.dateRange === "today") {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (options.dateRange === "week") {
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (options.dateRange === "month") {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    q = q.gte("created_at", cutoff.toISOString());
  }

  const { data, error } = await q;

  if (error) throw error;
  const results = (data || []).map((m) => ({
    ...m,
    conversation: m.conversation as unknown as Conversation,
  }));

  if (options?.agentName) {
    return results.filter((m) => m.conversation?.agent_name === options.agentName);
  }
  return results;
}

/** Get list of unique agent names from conversations */
export async function getConversationAgentNames(): Promise<string[]> {
  const uid = await getUserId();
  let query = supabase
    .from("conversations")
    .select("agent_name")
    .neq("status", "deleted")
    .order("updated_at", { ascending: false });
  if (uid) query = query.eq("user_id", uid);
  const { data } = await query;
  if (!data) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of data) {
    if (row.agent_name && !seen.has(row.agent_name)) {
      seen.add(row.agent_name);
      result.push(row.agent_name);
    }
  }
  return result;
}

/** Soft-delete a conversation (marks as deleted, removes messages) */
export async function deleteConversation(
  conversationId: string
): Promise<void> {
  // Delete messages first
  await supabase
    .from("messages")
    .delete()
    .eq("conversation_id", conversationId);

  // Mark conversation as deleted
  await supabase
    .from("conversations")
    .update({ status: "deleted" })
    .eq("id", conversationId);
}

/** Archive a conversation */
export async function archiveConversation(
  conversationId: string
): Promise<void> {
  await supabase
    .from("conversations")
    .update({ status: "archived" })
    .eq("id", conversationId);
}

/** Unarchive a conversation (restore to active) */
export async function unarchiveConversation(
  conversationId: string
): Promise<void> {
  await supabase
    .from("conversations")
    .update({ status: "active" })
    .eq("id", conversationId);
}

/** Move a conversation to a project (or remove from project with null) */
export async function moveToProject(
  conversationId: string,
  projectId: string | null
): Promise<void> {
  await supabase
    .from("conversations")
    .update({ project_id: projectId })
    .eq("id", conversationId);
}

/** Clean up empty conversations older than 5 minutes */
export async function cleanupEmptyConversations(): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute grace period
  const uid = await getUserId();

  // Find conversations with 0 messages older than 5 min
  let q = supabase
    .from("conversations")
    .select("id, messages(count)")
    .lt("created_at", cutoff)
    .eq("status", "active");
  if (uid) q = q.eq("user_id", uid);
  const { data: convos } = await q;

  if (!convos) return 0;

  const emptyIds = convos
    .filter((c) => {
      const count = (c.messages as unknown as { count: number }[])?.[0]?.count || 0;
      return count === 0;
    })
    .map((c) => c.id);

  if (emptyIds.length === 0) return 0;

  // Hard delete empty conversations
  await supabase
    .from("conversations")
    .delete()
    .in("id", emptyIds);

  return emptyIds.length;
}

/** Get chat stats */
export async function getChatStats(): Promise<{
  total_conversations: number;
  total_messages: number;
}> {
  const uid = await getUserId();
  let convQ = supabase.from("conversations").select("*", { count: "exact", head: true });
  let msgQ = supabase.from("messages").select("*", { count: "exact", head: true });
  if (uid) { convQ = convQ.eq("user_id", uid); msgQ = msgQ.eq("user_id", uid); }
  const [convRes, msgRes] = await Promise.all([convQ, msgQ]);

  return {
    total_conversations: convRes.count || 0,
    total_messages: msgRes.count || 0,
  };
}
