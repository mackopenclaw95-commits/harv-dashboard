/**
 * Model pricing — single source of truth, read from Supabase `model_pricing` table.
 *
 * Usage:
 *   const pricing = await getModelPricing();
 *   const cost = estimateCost(pricing, "deepseek/deepseek-v3.2", { tokensIn: 1200, tokensOut: 800 });
 *
 * Falls back to hardcoded defaults if Supabase is unreachable so cost tracking
 * never silently returns 0.
 */

import { createServiceClient } from "@/lib/supabase";

export interface ModelPrice {
  model: string;
  provider: string;
  input_per_million: number;
  output_per_million: number;
  unit: "tokens" | "image" | "audio_minute" | "tts_char";
  per_unit_cost: number;
  modality: "text" | "image" | "audio" | "vlm" | "tts";
  is_free: boolean;
}

export type PricingMap = Record<string, ModelPrice>;

// ── Fallback rates (verified against OpenRouter live /v1/models 2026-04-15) ──
const FALLBACK: PricingMap = {
  "deepseek/deepseek-chat":           mk("deepseek/deepseek-chat", 0.32, 0.89),
  "deepseek/deepseek-chat-v3-0324":   mk("deepseek/deepseek-chat-v3-0324", 0.20, 0.77),
  "deepseek/deepseek-v3.2":           mk("deepseek/deepseek-v3.2", 0.26, 0.38),
  "deepseek/deepseek-r1":             mk("deepseek/deepseek-r1", 0.70, 2.50),
  "x-ai/grok-4.1-fast":               mk("x-ai/grok-4.1-fast", 0.20, 0.50),
  "x-ai/grok-3":                      mk("x-ai/grok-3", 3.00, 15.00),
  "minimax/minimax-m2.1":             mk("minimax/minimax-m2.1", 0.29, 0.95),
  "qwen/qwen3-8b":                    mk("qwen/qwen3-8b", 0.05, 0.40),
  // Free models — verified alive on OpenRouter /v1/models 2026-04-15
  "meta-llama/llama-3.3-70b-instruct:free": { ...mk("meta-llama/llama-3.3-70b-instruct:free", 0, 0), is_free: true },
  "google/gemma-3-4b-it:free":        { ...mk("google/gemma-3-4b-it:free", 0, 0), is_free: true },
  "google/gemini-2.0-flash-lite-001": mk("google/gemini-2.0-flash-lite-001", 0.075, 0.30),
  "google/gemini-2.5-flash":          { ...mk("google/gemini-2.5-flash", 0.30, 2.50), modality: "vlm" },
  "openai/gpt-4.1":                   mk("openai/gpt-4.1", 2.00, 8.00),
  "groq/whisper-large-v3-turbo": {
    model: "groq/whisper-large-v3-turbo", provider: "groq",
    input_per_million: 0, output_per_million: 0,
    unit: "audio_minute", per_unit_cost: 0.00067,
    modality: "audio", is_free: false,
  },
  "openai/whisper-1": {
    model: "openai/whisper-1", provider: "openai",
    input_per_million: 0, output_per_million: 0,
    unit: "audio_minute", per_unit_cost: 0.006,
    modality: "audio", is_free: false,
  },
  "google/imagen-4": {
    model: "google/imagen-4", provider: "google",
    input_per_million: 0, output_per_million: 0,
    unit: "image", per_unit_cost: 0.030,
    modality: "image", is_free: false,
  },
  "kie/nano-banana": {
    model: "kie/nano-banana", provider: "kie",
    input_per_million: 0, output_per_million: 0,
    unit: "image", per_unit_cost: 0.020,
    modality: "image", is_free: false,
  },
  "openai/dall-e-3": {
    model: "openai/dall-e-3", provider: "openai",
    input_per_million: 0, output_per_million: 0,
    unit: "image", per_unit_cost: 0.040,
    modality: "image", is_free: false,
  },
};

function mk(model: string, input: number, output: number): ModelPrice {
  const provider = model.split("/")[0] || "openrouter";
  return {
    model,
    provider,
    input_per_million: input,
    output_per_million: output,
    unit: "tokens",
    per_unit_cost: 0,
    modality: "text",
    is_free: input === 0 && output === 0,
  };
}

// ── In-memory cache (refreshed every 5 min) ─────────────────────────────
let cache: { map: PricingMap; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getModelPricing(): Promise<PricingMap> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.map;
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("model_pricing")
      .select("model, provider, input_per_million, output_per_million, unit, per_unit_cost, modality, is_free");
    if (error || !data || data.length === 0) {
      return FALLBACK;
    }
    const map: PricingMap = {};
    for (const row of data) {
      map[row.model] = {
        model: row.model,
        provider: row.provider || "openrouter",
        input_per_million: Number(row.input_per_million) || 0,
        output_per_million: Number(row.output_per_million) || 0,
        unit: (row.unit as ModelPrice["unit"]) || "tokens",
        per_unit_cost: Number(row.per_unit_cost) || 0,
        modality: (row.modality as ModelPrice["modality"]) || "text",
        is_free: !!row.is_free,
      };
    }
    // Merge FALLBACK for any missing models so new models have a baseline
    cache = { map: { ...FALLBACK, ...map }, fetchedAt: Date.now() };
    return cache.map;
  } catch {
    return FALLBACK;
  }
}

/** Force-refresh the cache (e.g. after updating rates from the admin UI) */
export function clearPricingCache() {
  cache = null;
}

// ── Cost estimation ─────────────────────────────────────────────────────

export interface CostInput {
  tokensIn?: number;
  tokensOut?: number;
  cachedTokens?: number; // input tokens served from cache (10% of normal price)
  units?: number;        // for non-token modalities (minutes of audio, # of images)
}

/**
 * Returns cost in USD. Returns 0 for unknown models rather than throwing —
 * callers should check cost=0 against known free models vs. unknown ones.
 */
export function estimateCost(
  pricing: PricingMap,
  model: string,
  input: CostInput,
): number {
  const p = pricing[model] || resolveByPrefix(pricing, model);
  if (!p) return 0;

  // Non-token modalities: image, audio_minute, tts_char
  if (p.unit !== "tokens") {
    const units = input.units || 0;
    return units * p.per_unit_cost;
  }

  const tokensIn = input.tokensIn || 0;
  const tokensOut = input.tokensOut || 0;
  const cached = Math.min(input.cachedTokens || 0, tokensIn);
  const freshIn = Math.max(0, tokensIn - cached);

  // Prompt caching discount: cached tokens billed at 10% of normal input rate
  const inCost =
    (freshIn * p.input_per_million + cached * p.input_per_million * 0.1) / 1_000_000;
  const outCost = (tokensOut * p.output_per_million) / 1_000_000;
  return inCost + outCost;
}

/** If the exact model isn't in the map, try a few fuzzy matches. */
function resolveByPrefix(pricing: PricingMap, model: string): ModelPrice | null {
  const normalized = model.toLowerCase().trim();
  // exact (case-insensitive)
  for (const key of Object.keys(pricing)) {
    if (key.toLowerCase() === normalized) return pricing[key];
  }
  // strip :free / :nitro / date suffixes and try again
  const stripped = normalized.replace(/:(free|nitro|beta)$/, "").replace(/-\d{8,}$/, "");
  for (const key of Object.keys(pricing)) {
    if (key.toLowerCase().startsWith(stripped)) return pricing[key];
  }
  return null;
}

/**
 * Given a legacy "tokens_used" number (collapsed), split into input/output
 * using a conservative 60/40 ratio. Used for migrating old chat-panel logs.
 */
export function splitLegacyTokens(totalTokens: number): { tokensIn: number; tokensOut: number } {
  const tokensIn = Math.round(totalTokens * 0.6);
  return { tokensIn, tokensOut: totalTokens - tokensIn };
}
