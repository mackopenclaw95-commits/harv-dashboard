export async function POST(req: Request) {
  const { messages } = await req.json();
  const lastMessage = messages[messages.length - 1]?.content || "";

  const API_BASE =
    process.env.API_URL ||
    "https://api.openclaw-yqar.srv1420157.hstgr.cloud";

  // Forward to Harv's Flask API chat endpoint
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: lastMessage }),
  });

  if (!response.ok) {
    return new Response("Harv API error", { status: 502 });
  }

  const data = await response.json();
  const reply = data.reply || data.response || data.result || "No response";

  // Return as a streaming-compatible response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(reply));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
