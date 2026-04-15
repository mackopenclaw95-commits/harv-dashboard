/**
 * Server-side Google API helper for the /google dashboard page.
 *
 * Reads per-user OAuth tokens from Supabase user_integrations, refreshes
 * them when expired, and exposes small wrappers for the Gmail, Drive,
 * Docs, and Sheets REST APIs.
 *
 * Use this ONLY from server-side route handlers (never expose in the
 * browser — client_secret lives in env).
 */

import { createClient } from "@supabase/supabase-js";

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface IntegrationRow {
  user_id: string;
  provider: string;
  metadata: GoogleTokens | null;
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function _refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[google-api] token refresh failed:", text.slice(0, 200));
    return null;
  }
  return res.json();
}

/**
 * Returns a valid access token for the given user, refreshing if needed
 * and persisting the new token back to user_integrations. Returns null
 * if the user hasn't connected Google or the refresh failed.
 */
export async function getUserAccessToken(userId: string): Promise<string | null> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("user_integrations")
    .select("user_id, provider, metadata")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  if (error || !data) {
    console.error("[google-api] no integration row:", error?.message);
    return null;
  }
  const row = data as IntegrationRow;
  const tokens = row.metadata;
  if (!tokens?.refresh_token) {
    console.error("[google-api] no refresh_token in metadata");
    return null;
  }

  // Check if access token is still fresh (1 min buffer)
  const now = Date.now();
  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0;
  if (tokens.access_token && expiresAt > now + 60_000) {
    return tokens.access_token;
  }

  // Refresh
  const refreshed = await _refreshAccessToken(tokens.refresh_token);
  if (!refreshed) return null;

  const newExpiresAt = new Date(now + (refreshed.expires_in || 3600) * 1000).toISOString();
  try {
    await sb
      .from("user_integrations")
      .update({
        metadata: {
          ...tokens,
          access_token: refreshed.access_token,
          expires_at: newExpiresAt,
        },
      })
      .eq("user_id", userId)
      .eq("provider", "google");
  } catch (e) {
    console.error("[google-api] failed to persist refreshed token:", e);
  }

  return refreshed.access_token;
}

/**
 * Authorized GET to a Google API endpoint.
 */
export async function googleGet(userId: string, url: string): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status: number }> {
  const token = await getUserAccessToken(userId);
  if (!token) return { ok: false, error: "Google not connected", status: 401 };

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: text.slice(0, 300), status: res.status };
  }

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: true, data: text };
  }
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

export async function gmailListMessages(userId: string, q: string = "", max: number = 20) {
  const params = new URLSearchParams({
    maxResults: String(max),
    ...(q ? { q } : {}),
  });
  const listRes = await googleGet(userId, `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
  if (!listRes.ok) return listRes;

  const list = listRes.data as { messages?: { id: string }[] };
  const ids = (list.messages || []).slice(0, max).map((m) => m.id);
  if (ids.length === 0) return { ok: true as const, data: { messages: [] } };

  // Fetch metadata for each message in parallel (headers only)
  const messages = await Promise.all(
    ids.map(async (id) => {
      const mRes = await googleGet(
        userId,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      if (!mRes.ok) return null;
      const m = mRes.data as {
        id: string;
        snippet?: string;
        internalDate?: string;
        labelIds?: string[];
        payload?: { headers?: { name: string; value: string }[] };
      };
      const headers = m.payload?.headers || [];
      const findHeader = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
      return {
        id: m.id,
        from: findHeader("From"),
        subject: findHeader("Subject"),
        date: findHeader("Date"),
        snippet: m.snippet || "",
        internal_date: m.internalDate || "",
        unread: (m.labelIds || []).includes("UNREAD"),
      };
    }),
  );

  return { ok: true as const, data: { messages: messages.filter(Boolean) } };
}

export async function gmailUnreadCount(userId: string) {
  const res = await googleGet(userId, "https://gmail.googleapis.com/gmail/v1/users/me/labels/UNREAD");
  if (!res.ok) return res;
  const label = res.data as { messagesUnread?: number };
  return { ok: true as const, data: { count: label.messagesUnread || 0 } };
}

export async function gmailGetMessage(userId: string, id: string) {
  const res = await googleGet(
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
  );
  if (!res.ok) return res;
  const m = res.data as {
    id: string;
    snippet?: string;
    payload?: {
      headers?: { name: string; value: string }[];
      mimeType?: string;
      body?: { data?: string };
      parts?: { mimeType?: string; body?: { data?: string } }[];
    };
  };
  const headers = m.payload?.headers || [];
  const findHeader = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

  // Extract text body (prefer text/plain)
  const decodePart = (data?: string) => {
    if (!data) return "";
    try {
      return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    } catch {
      return "";
    }
  };

  let body = "";
  const parts = m.payload?.parts || [];
  const plainPart = parts.find((p) => p.mimeType === "text/plain");
  if (plainPart?.body?.data) {
    body = decodePart(plainPart.body.data);
  } else if (m.payload?.body?.data) {
    body = decodePart(m.payload.body.data);
  } else if (parts.length > 0 && parts[0].body?.data) {
    body = decodePart(parts[0].body.data);
  }

  return {
    ok: true as const,
    data: {
      id: m.id,
      from: findHeader("From"),
      to: findHeader("To"),
      subject: findHeader("Subject"),
      date: findHeader("Date"),
      snippet: m.snippet || "",
      body: body.slice(0, 50000),
    },
  };
}

// Drive mime types
export const MIME_DOC = "application/vnd.google-apps.document";
export const MIME_SHEET = "application/vnd.google-apps.spreadsheet";
export const MIME_SLIDES = "application/vnd.google-apps.presentation";

export async function driveList(userId: string, mimeType: string = "", q: string = "", max: number = 30) {
  const queryParts = ["trashed = false"];
  if (mimeType) queryParts.push(`mimeType = '${mimeType}'`);
  if (q) queryParts.push(`name contains '${q.replace(/'/g, "\\'")}'`);

  const params = new URLSearchParams({
    q: queryParts.join(" and "),
    pageSize: String(max),
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink,iconLink,owners,size)",
  });

  const res = await googleGet(userId, `https://www.googleapis.com/drive/v3/files?${params}`);
  if (!res.ok) return res;
  const data = res.data as {
    files?: {
      id: string;
      name: string;
      mimeType: string;
      modifiedTime: string;
      webViewLink: string;
      iconLink: string;
      owners?: { displayName?: string }[];
      size?: string;
    }[];
  };
  const files = (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    mime_type: f.mimeType,
    modified_time: f.modifiedTime,
    url: f.webViewLink,
    icon: f.iconLink,
    owner: f.owners?.[0]?.displayName || "",
    size: f.size ? parseInt(f.size, 10) : 0,
  }));
  return { ok: true as const, data: { files } };
}

export async function docsExportPlain(userId: string, docId: string) {
  const token = await getUserAccessToken(userId);
  if (!token) return { ok: false as const, error: "Google not connected", status: 401 };

  // Drive export endpoint returns plain text directly
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/plain`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    return { ok: false as const, error: text.slice(0, 300), status: res.status };
  }
  const text = await res.text();

  // Also get metadata
  const metaRes = await googleGet(
    userId,
    `https://www.googleapis.com/drive/v3/files/${docId}?fields=id,name,modifiedTime,webViewLink`,
  );
  const meta = metaRes.ok ? (metaRes.data as { id: string; name: string; modifiedTime: string; webViewLink: string }) : { name: "", modifiedTime: "", webViewLink: "" };

  return {
    ok: true as const,
    data: {
      id: docId,
      name: meta.name,
      modified_time: meta.modifiedTime,
      url: meta.webViewLink,
      content: text.slice(0, 100000),
    },
  };
}

export async function sheetsPreview(userId: string, sheetId: string) {
  // Get spreadsheet metadata
  const metaRes = await googleGet(
    userId,
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,sheets.properties.title`,
  );
  if (!metaRes.ok) return metaRes;
  const meta = metaRes.data as {
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
  };
  const sheetTabs = (meta.sheets || []).map((s) => s.properties?.title || "").filter(Boolean);
  const firstTab = sheetTabs[0] || "Sheet1";

  const range = encodeURIComponent(`'${firstTab}'!A1:Z20`);
  const valuesRes = await googleGet(
    userId,
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
  );
  if (!valuesRes.ok) return valuesRes;
  const values = (valuesRes.data as { values?: unknown[][] }).values || [];

  return {
    ok: true as const,
    data: {
      id: sheetId,
      title: meta.properties?.title || "",
      first_sheet: firstTab,
      sheet_tabs: sheetTabs,
      preview: values,
      url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    },
  };
}
