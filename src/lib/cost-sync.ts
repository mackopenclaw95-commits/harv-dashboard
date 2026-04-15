/**
 * Cost event sync — pulls api_cost events from VPS and upserts into
 * Supabase api_cost_events with user_id attribution.
 *
 * Called from:
 *  - /api/admin/stats (on-demand when admin loads dashboard)
 *  - /api/cron/sync-costs (every 5 min via Vercel Cron)
 */
import { createServiceClient } from "@/lib/supabase";
import { API_BASE as API_URL_CFG, API_KEY as API_KEY_CFG } from "@/lib/api-config";
import { getModelPricing, estimateCost as computeCost, splitLegacyTokens } from "@/lib/model-pricing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SyncResult {
  ok: boolean;
  fetched: number;
  cost_events: number;
  synced: number;
  error?: string;
}

export async function syncCostEventsFromVPS(limit = 500): Promise<SyncResult> {
  const pricing = await getModelPricing();
  const supabase = createServiceClient();

  try {
    const eventsRes = await fetch(`${API_URL_CFG}/api/events/recent?limit=${limit}`, {
      headers: { "X-API-Key": API_KEY_CFG },
      signal: AbortSignal.timeout(15000),
    });
    if (!eventsRes.ok) {
      return { ok: false, fetched: 0, cost_events: 0, synced: 0, error: `VPS returned ${eventsRes.status}` };
    }

    const json = await eventsRes.json();
    const events = json.events || json || [];
    const costEvents = events.filter((evt: Record<string, unknown>) =>
      evt.action === "api_cost" && !String(evt.summary || "").startsWith("claude-")
    );

    if (costEvents.length === 0) {
      return { ok: true, fetched: events.length, cost_events: 0, synced: 0 };
    }

    const rows = costEvents.map((evt: Record<string, unknown>) => {
      const summary = String(evt.summary || "");
      const model = summary.split("|")[0]?.trim() || "";
      const tokens = (evt.tokens as number) || 0;
      const meta = (evt.metadata && typeof evt.metadata === "object"
        ? (evt.metadata as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const tokensIn = (meta.input_tokens as number) || (evt.tokens_in as number) || 0;
      const tokensOut = (meta.output_tokens as number) || (evt.tokens_out as number) || 0;
      const cachedTokens = (meta.cached_tokens as number) || 0;
      const units = (meta.units as number) || 0;
      const modality = (meta.modality as string) || "text";
      let cost = (evt.cost as number) || 0;
      if (cost === 0) {
        if (tokensIn || tokensOut) {
          cost = computeCost(pricing, model, { tokensIn, tokensOut, cachedTokens });
        } else if (tokens > 0) {
          const split = splitLegacyTokens(tokens);
          cost = computeCost(pricing, model, split);
        } else if (units > 0) {
          cost = computeCost(pricing, model, { units });
        }
      }
      const rawUserId = (meta.user_id as string) || "";
      return {
        vps_event_id: evt.id as number,
        model,
        tokens,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cached_tokens: cachedTokens,
        units,
        cost,
        agent: String(evt.agent || ""),
        parent_agent: (meta.parent_agent as string) || null,
        user_id: rawUserId && UUID_RE.test(rawUserId) ? rawUserId : null,
        modality,
        summary,
        event_timestamp: evt.timestamp as string,
      };
    });

    const { error: upsertErr, count } = await supabase
      .from("api_cost_events")
      .upsert(rows, { onConflict: "vps_event_id", ignoreDuplicates: true, count: "exact" });

    if (upsertErr) {
      console.error("[cost-sync] upsert failed:", upsertErr.message, "— sample row:", JSON.stringify(rows[0]));
      return {
        ok: false,
        fetched: events.length,
        cost_events: costEvents.length,
        synced: 0,
        error: upsertErr.message,
      };
    }

    return {
      ok: true,
      fetched: events.length,
      cost_events: costEvents.length,
      synced: count ?? rows.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cost-sync] exception:", msg);
    return { ok: false, fetched: 0, cost_events: 0, synced: 0, error: msg };
  }
}
