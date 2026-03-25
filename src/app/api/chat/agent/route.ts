export async function POST(req: Request) {
  const { message, agent } = await req.json();

  const API_BASE =
    process.env.API_URL ||
    "https://api.openclaw-yqar.srv1420157.hstgr.cloud";
  const API_KEY = process.env.HARV_API_KEY || "";

  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({ message, agent }),
  });

  if (!response.ok) {
    return new Response("Harv API error", { status: 502 });
  }

  const data = await response.json();
  const reply = data.reply || data.response || data.result || "No response";

  return new Response(reply, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
