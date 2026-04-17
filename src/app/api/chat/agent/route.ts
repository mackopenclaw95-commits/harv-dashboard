import { API_BASE, API_KEY } from "@/lib/api-config";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { message, agent, context, plan, model_tier } = await req.json();

  const messageWithContext = context
    ? `[CONTEXT]\n${context}\n[/CONTEXT]\n\n${message}`
    : message;

  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({
      message: messageWithContext,
      agent,
      stream: true,
      plan: plan || "free",
      model_tier: model_tier || "primary",
    }),
    signal: AbortSignal.timeout(290_000),
  });

  if (!res.ok) {
    return new Response("Harv API error", { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream") && res.body) {
    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const data = await res.json();
  const reply = data.reply || data.response || data.result || "No response";

  const cleanReply = reply
    .replace(/\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*/g, "")
    .replace(/\[CONTEXT\][\s\S]*?\[\/CONTEXT\]\s*/g, "")
    .trim();

  return new Response(cleanReply, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
