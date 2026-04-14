import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { messages, context, plan, model_tier } = await req.json();
  const lastMessage = messages[messages.length - 1]?.content || "";

  const { API_BASE, API_KEY } = await import("@/lib/api-config");

  // Get user info for cross-platform context
  let userId = "";
  let userName = "";
  let userEmail = "";
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      userName = user.user_metadata?.name || user.user_metadata?.full_name || "";
      userEmail = user.email || "";
    }
  } catch {}


  // User-scoped session ID so dashboard conversations are linked to the user
  const sessionId = userId ? `dash-${userId.substring(0, 8)}` : "";

  // If project context is provided, prepend it so Harv has awareness
  const messageWithContext = context
    ? `[CONTEXT]\n${context}\n[/CONTEXT]\n\n${lastMessage}`
    : lastMessage;

  // Try streaming via stream: true flag on /chat
  try {
    const streamRes = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({ message: messageWithContext, stream: true, plan: plan || "free", model_tier: model_tier || "primary", user_id: userId, source: "dashboard", user_name: userName, user_email: userEmail, session_id: sessionId }),
      signal: AbortSignal.timeout(90000),
    });

    if (
      streamRes.ok &&
      streamRes.body &&
      streamRes.headers.get("content-type")?.includes("text/event-stream")
    ) {
      return new Response(streamRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
  } catch {
    // Stream failed — fall back to non-streaming
  }

  // Fallback: non-streaming /chat endpoint
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({ message: messageWithContext, plan: plan || "free", model_tier: model_tier || "primary", user_id: userId, source: "dashboard", user_name: userName, user_email: userEmail, session_id: sessionId }),
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    return new Response("Harv API error", { status: 502 });
  }

  const data = await response.json();
  const reply = data.reply || data.response || data.result || "No response";

  // Strip any context blocks that leaked into the response
  const cleanReply = reply
    .replace(/\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*/g, "")
    .replace(/\[CONTEXT\][\s\S]*?\[\/CONTEXT\]\s*/g, "")
    .trim();

  return new Response(cleanReply, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
