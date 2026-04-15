import { NextRequest, NextResponse } from "next/server";
import { HARV_HELP_SYSTEM_PROMPT } from "@/lib/harv-help-context";

/**
 * Harv Help chatbot — answers product questions.
 *
 * Calls OpenRouter directly (no VPS roundtrip) using DeepSeek Chat v3 which
 * is cheap and fast. System prompt is a static product-context blob.
 *
 * POST body: { messages: [{role, content}, ...] }
 * Returns: { reply: string }
 */

export const maxDuration = 30;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-chat-v3-0324";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
  }

  let body: { messages?: Message[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  // Trim history to last ~8 turns to keep context cost low
  const recent = messages.slice(-16);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://harv-dashboard.vercel.app",
        "X-Title": "Harv Help",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: HARV_HELP_SYSTEM_PROMPT }, ...recent],
        temperature: 0.3,
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[help-chat] OpenRouter ${res.status}:`, text.slice(0, 300));
      return NextResponse.json(
        { error: `OpenRouter returned ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content || "";
    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[help-chat] exception:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
