import {
  getOrCreateConversation,
  saveMessage,
  getConversationMessages,
  getAgentsWithConversations,
  type ChatMessage,
} from "./supabase-chat";

const STORAGE_KEY = "harv-agent-chats";
const MIGRATION_FLAG = "harv-migrated-to-supabase";

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// ── localStorage helpers (kept for migration) ──

function getLocalStore(): Record<string, StoredMessage[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// ── Migration: localStorage → Supabase (one-time) ──

export async function migrateToSupabase(): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  const store = getLocalStore();
  const agents = Object.entries(store).filter(([, msgs]) => msgs.length > 0);

  if (agents.length === 0) {
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
    return;
  }

  try {
    for (const [agentName, messages] of agents) {
      const conversationId = await getOrCreateConversation(agentName);
      for (const msg of messages) {
        await saveMessage(conversationId, msg.role, msg.content);
      }
    }
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
  } catch (err) {
    console.error("Migration to Supabase failed:", err);
  }
}

// ── Supabase-backed API (replaces old localStorage functions) ──

export async function getAgentChat(agentName: string): Promise<StoredMessage[]> {
  try {
    const conversationId = await getOrCreateConversation(agentName);
    const messages = await getConversationMessages(conversationId);
    return messages.map(toStoredMessage);
  } catch {
    // Fallback to localStorage if Supabase is down
    return getLocalStore()[agentName] || [];
  }
}

export async function saveAgentMessage(
  agentName: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  try {
    const conversationId = await getOrCreateConversation(agentName);
    await saveMessage(conversationId, role, content);
  } catch (err) {
    console.error("Failed to save message to Supabase:", err);
  }
}

export async function getAgentsWithHistory(): Promise<string[]> {
  try {
    return await getAgentsWithConversations();
  } catch {
    // Fallback to localStorage
    const store = getLocalStore();
    return Object.entries(store)
      .filter(([, msgs]) => msgs.length > 0)
      .sort(([, a], [, b]) => {
        const lastA = a[a.length - 1]?.timestamp || "";
        const lastB = b[b.length - 1]?.timestamp || "";
        return lastB.localeCompare(lastA);
      })
      .map(([name]) => name);
  }
}

function toStoredMessage(msg: ChatMessage): StoredMessage {
  return {
    id: msg.id,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    timestamp: msg.created_at,
  };
}
