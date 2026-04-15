import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  gmailListMessages,
  gmailUnreadCount,
  gmailGetMessage,
  driveList,
  docsExportPlain,
  sheetsPreview,
  MIME_DOC,
  MIME_SHEET,
} from "@/lib/google-api";

export const maxDuration = 30;

/**
 * Unified Google Workspace proxy for the /google dashboard page.
 *
 * GET actions (via ?action=):
 *   gmail-inbox        → recent messages
 *   gmail-unread       → unread count + preview
 *   gmail-search&q=    → search messages
 *   gmail-message&id=  → full message body
 *
 *   drive-list&q=      → all drive files
 *   docs-list&q=       → Google Docs only
 *   docs-content&id=   → read doc plain text
 *   sheets-list&q=     → Google Sheets only
 *   sheets-preview&id= → first 20 rows preview
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(c) { c.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options); } catch {} }); },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || "";
  const q = searchParams.get("q") || "";
  const id = searchParams.get("id") || "";
  const max = parseInt(searchParams.get("max") || "20", 10);

  try {
    let result;
    switch (action) {
      case "gmail-inbox":
        result = await gmailListMessages(user.id, "", max);
        break;
      case "gmail-unread":
        result = await gmailUnreadCount(user.id);
        break;
      case "gmail-search":
        if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
        result = await gmailListMessages(user.id, q, max);
        break;
      case "gmail-message":
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        result = await gmailGetMessage(user.id, id);
        break;
      case "drive-list":
        result = await driveList(user.id, "", q, max);
        break;
      case "docs-list":
        result = await driveList(user.id, MIME_DOC, q, max);
        break;
      case "docs-content":
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        result = await docsExportPlain(user.id, id);
        break;
      case "sheets-list":
        result = await driveList(user.id, MIME_SHEET, q, max);
        break;
      case "sheets-preview":
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        result = await sheetsPreview(user.id, id);
        break;
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, needs_reconnect: result.status === 401 },
        { status: result.status },
      );
    }
    return NextResponse.json(result.data);
  } catch (e) {
    console.error("[google route] exception:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
