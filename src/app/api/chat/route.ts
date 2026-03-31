export async function POST(req: Request) {
  const { messages, context, plan } = await req.json();
  const lastMessage = messages[messages.length - 1]?.content || "";

  const API_BASE =
    process.env.API_URL ||
    "https://api.openclaw-yqar.srv1420157.hstgr.cloud";
  const API_KEY = process.env.HARV_API_KEY || "";

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
      body: JSON.stringify({ message: messageWithContext, stream: true, plan: plan || "free" }),
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
    body: JSON.stringify({ message: messageWithContext }),
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
