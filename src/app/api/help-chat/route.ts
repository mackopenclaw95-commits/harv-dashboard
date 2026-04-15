import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import { HARV_HELP_SYSTEM_PROMPT } from "@/lib/harv-help-context";
import { getModelPricing, estimateCost } from "@/lib/model-pricing";

/**
 * Harv Help chatbot — answers product questions.
 *
 * Calls OpenRouter directly (no VPS roundtrip) using DeepSeek Chat v3 which
 * is cheap and fast. Cost is logged to usage_logs with the calling user_id.
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

  // Resolve user (optional — help-chat works logged out too, but we log when possible)
  let userId: string | null = null;
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(c) { c.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options); } catch {} }); },
        },
      }
    );
    const { data: { user } } = await authClient.auth.getUser();
    userId = user?.id || null;
  } catch {
    // unauthenticated help-chat is allowed — just no attribution
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
    const tokensIn: number = data?.usage?.prompt_tokens || 0;
    const tokensOut: number = data?.usage?.completion_tokens || 0;
    const totalTokens = tokensIn + tokensOut;

    // Log cost if we have a user
    if (userId && totalTokens > 0) {
      try {
        const pricing = await getModelPricing();
        const cost = estimateCost(pricing, MODEL, { tokensIn, tokensOut });
        const svc = createServiceClient();
        await svc.from("usage_logs").insert({
          user_id: userId,
          agent_name: "Harv Help",
          tokens_used: totalTokens,
          estimated_cost: cost,
        });
      } catch (err) {
        console.error("[help-chat] cost log failed:", err);
      }
    }

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[help-chat] exception:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
