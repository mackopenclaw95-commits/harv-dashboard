const STORAGE_KEY = "harv-agent-chats";

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO string for serialization
}

interface ChatStore {
  [agentName: string]: StoredMessage[];
}

function getStore(): ChatStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setStore(store: ChatStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getAgentChat(agentName: string): StoredMessage[] {
  return getStore()[agentName] || [];
}

export function saveAgentChat(agentName: string, messages: StoredMessage[]) {
  const store = getStore();
  store[agentName] = messages;
  setStore(store);
}

/** Returns agent names that have chat history, sorted by most recent first */
export function getAgentsWithHistory(): string[] {
  const store = getStore();
  return Object.entries(store)
    .filter(([, msgs]) => msgs.length > 0)
    .sort(([, a], [, b]) => {
      const lastA = a[a.length - 1]?.timestamp || "";
      const lastB = b[b.length - 1]?.timestamp || "";
      return lastB.localeCompare(lastA);
    })
    .map(([name]) => name);
}
