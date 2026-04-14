/**
 * Send a message to an agent and get the plain text response.
 * Handles both SSE (streaming) and plain text response formats.
 */
export async function askAgent(agent: string, message: string): Promise<string> {
  const res = await fetch("/api/chat/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, agent }),
  });

  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();

  // SSE (text/event-stream) — parse the "done" event for full_text
  if (contentType.includes("text/event-stream")) {
    const lines = raw.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const payload = JSON.parse(line.slice(6));
        if (payload.type === "done" && payload.full_text) {
          return payload.full_text;
        }
      } catch {
        // skip malformed
      }
    }
    // Fallback: try to extract from delta events
    let text = "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const payload = JSON.parse(line.slice(6));
        if (payload.type === "delta" && payload.text) {
          text += payload.text;
        }
      } catch {
        // skip
      }
    }
    if (text) return text;
  }

  // Plain text or JSON response
  try {
    const data = JSON.parse(raw);
    return data.response || data.text || data.message || raw;
  } catch {
    return raw || "No response";
  }
}
