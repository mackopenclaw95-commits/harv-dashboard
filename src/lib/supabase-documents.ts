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

export interface Document {
  id: string;
  filename: string;
  file_type: string; // 'image' | 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'other'
  mime_type: string | null;
  file_size: number;
  storage_path: string;
  agent_name: string | null;
  project_id: string | null;
  tags: string[];
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** File type categories based on MIME type */
export function categorizeFile(mimeType: string, filename: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("csv") ||
    filename.match(/\.(xlsx?|csv|ods)$/i)
  )
    return "spreadsheet";
  if (
    mimeType.includes("presentation") ||
    filename.match(/\.(pptx?|odp)$/i)
  )
    return "presentation";
  if (
    mimeType.includes("document") ||
    mimeType.includes("msword") ||
    mimeType.includes("text/") ||
    filename.match(/\.(docx?|odt|txt|md|rtf)$/i)
  )
    return "document";
  return "other";
}

/** Format file size for display */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Get all documents with optional filters */
export async function getDocuments(opts?: {
  query?: string;
  fileType?: string;
  agentName?: string;
  projectId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ documents: Document[]; total: number }> {
  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;

  let q = supabase
    .from("documents")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts?.query) {
    q = q.or(
      `filename.ilike.%${opts.query}%,description.ilike.%${opts.query}%`
    );
  }
  if (opts?.fileType && opts.fileType !== "all") {
    q = q.eq("file_type", opts.fileType);
  }
  if (opts?.agentName && opts.agentName !== "all") {
    q = q.eq("agent_name", opts.agentName);
  }
  if (opts?.projectId) {
    q = q.eq("project_id", opts.projectId);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { documents: data || [], total: count || 0 };
}

/** Get document stats */
export async function getDocumentStats(): Promise<{
  total: number;
  byType: Record<string, number>;
  agents: string[];
}> {
  const { data, error } = await supabase
    .from("documents")
    .select("file_type, agent_name");

  if (error) throw error;

  const byType: Record<string, number> = {};
  const agentSet = new Set<string>();

  for (const doc of data || []) {
    byType[doc.file_type] = (byType[doc.file_type] || 0) + 1;
    if (doc.agent_name) agentSet.add(doc.agent_name);
  }

  return {
    total: (data || []).length,
    byType,
    agents: [...agentSet].sort(),
  };
}

/** Get public URL for a document */
export function getDocumentUrl(storagePath: string): string {
  const { data } = supabase.storage
    .from("documents")
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

/** Delete a document (metadata + storage) */
export async function deleteDocument(doc: Document): Promise<void> {
  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([doc.storage_path]);
  if (storageError) throw storageError;

  // Delete metadata
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) throw error;
}

/** Upload a document from the browser */
/** Get documents linked to a specific project */
export async function getDocumentsByProject(
  projectId: string
): Promise<Document[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data || [];
}

/** Link or unlink a document to/from a project */
export async function linkDocumentToProject(
  documentId: string,
  projectId: string | null
): Promise<void> {
  await supabase
    .from("documents")
    .update({ project_id: projectId })
    .eq("id", documentId);
}

export async function uploadDocument(
  file: File,
  agentName?: string,
  description?: string,
  tags?: string[],
  projectId?: string
): Promise<Document> {
  const fileType = categorizeFile(file.type, file.name);
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${agentName || "manual"}/${timestamp}_${safeName}`;

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  // Create metadata row
  const uid = await getUserId();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      filename: file.name,
      file_type: fileType,
      mime_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      agent_name: agentName || null,
      project_id: projectId || null,
      tags: tags || [],
      description: description || null,
      user_id: uid,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
