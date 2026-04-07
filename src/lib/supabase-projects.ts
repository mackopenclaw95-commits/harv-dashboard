import { supabase, createBrowserSupabase } from "./supabase";
import type { Conversation } from "./supabase-chat";

async function getUserId(): Promise<string | null> {
  try {
    const browser = createBrowserSupabase();
    const { data } = await browser.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectStats {
  conversationCount: number;
  documentCount: number;
  lastActivity: string | null;
}

export const PROJECT_COLORS = [
  { name: "Teal", value: "primary", class: "bg-primary" },
  { name: "Blue", value: "blue", class: "bg-blue-500" },
  { name: "Purple", value: "purple", class: "bg-purple-500" },
  { name: "Pink", value: "pink", class: "bg-pink-500" },
  { name: "Orange", value: "orange", class: "bg-orange-500" },
  { name: "Green", value: "green", class: "bg-green-500" },
  { name: "Red", value: "red", class: "bg-red-500" },
  { name: "Yellow", value: "yellow", class: "bg-yellow-500" },
];

export function getColorClass(color: string): string {
  return PROJECT_COLORS.find((c) => c.value === color)?.class || "bg-primary";
}

/** Get all projects sorted by most recently updated */
export async function getProjects(): Promise<Project[]> {
  const uid = await getUserId();
  let q = supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (uid) q = q.eq("user_id", uid);
  const { data, error } = await q;

  if (error) throw error;
  return data || [];
}

/** Get a single project by ID */
export async function getProjectById(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

/** Get project stats (conversation count, document count, last activity) */
export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  // Count only conversations that have messages (non-empty)
  const convCountRes = await getProjectConversations(projectId);
  const conversationCount = convCountRes.length;
  const convLastActivity = convCountRes[0]?.updated_at || null;

  const [docRes] = await Promise.all([
    supabase
      .from("documents")
      .select("updated_at", { count: "exact" })
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  const docDate = docRes.data?.[0]?.updated_at || null;
  let lastActivity: string | null = null;
  if (convLastActivity && docDate) {
    lastActivity = convLastActivity > docDate ? convLastActivity : docDate;
  } else {
    lastActivity = convLastActivity || docDate;
  }

  return {
    conversationCount,
    documentCount: docRes.count || 0,
    lastActivity,
  };
}

/** Get conversations linked to a project with message counts */
export async function getProjectConversations(
  projectId: string
): Promise<(Conversation & { message_count: number; last_message?: string })[]> {
  const uid = await getUserId();
  let q = supabase
    .from("conversations")
    .select("*, messages(count)")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  if (uid) q = q.eq("user_id", uid);
  const { data, error } = await q;

  if (error) return [];

  const conversations = (data || []).map((c) => ({
    ...c,
    message_count:
      (c.messages as unknown as { count: number }[])?.[0]?.count || 0,
  }));

  // Filter empty and get last message
  const nonEmpty = conversations.filter((c) => c.message_count > 0);

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

/** Create a new project */
export async function createProject(
  name: string,
  description?: string,
  color?: string
): Promise<Project> {
  const uid = await getUserId();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      description: description || null,
      color: color || "primary",
      user_id: uid,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Update a project */
export async function updateProject(
  id: string,
  fields: Partial<Pick<Project, "name" | "description" | "color" | "instructions">>
): Promise<void> {
  await supabase
    .from("projects")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** Delete a project and unlink all its conversations and documents */
export async function deleteProject(id: string): Promise<void> {
  // Unlink conversations
  await supabase
    .from("conversations")
    .update({ project_id: null })
    .eq("project_id", id);

  // Unlink documents
  await supabase
    .from("documents")
    .update({ project_id: null })
    .eq("project_id", id);

  // Delete the project
  await supabase.from("projects").delete().eq("id", id);
}

/** Get conversation count per project */
export async function getProjectConversationCount(
  projectId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "active");

  if (error) return 0;
  return count || 0;
}
