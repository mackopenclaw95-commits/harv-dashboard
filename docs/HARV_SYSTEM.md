# Harv — System Overview for AI Coding Agents

> Read this before writing code. For exhaustive detail see [harv-system-summary.md](./harv-system-summary.md). This doc is a decision-making layer: what Harv is, what's in scope, what to reject.

## 1. What Harv is

A personal AI assistant ecosystem for a **solo founder** (Mack West). One user today, multi-user architecture ready. Three surfaces:

- **Next.js 16 dashboard** on Vercel Hobby — `harvai.app` / `harv-dashboard.vercel.app`
- **Python Flask agents** on a Hostinger VPS (`/root/harv/`) — 15+ specialist agents
- **Messaging bots** — Telegram live, WhatsApp code-ready/hidden, Discord half-built

Data lives in **Supabase Cloud** (single source of truth for chat history, memory, documents, usage). LLMs route through **OpenRouter** (Gemini/DeepSeek/GPT-4.1/MiniMax/Grok/Qwen). No Anthropic models in production.

## 2. Architecture at a glance

```
browser ──► Next.js on Vercel ──► VPS Flask /chat ──► VideoDigest/Finance/etc ──► OpenRouter
                 │                      │
                 └──► Supabase ◄────────┘
```

Two Flask processes on the VPS — `harv-api.service` (port 8765, internal) and `harv-dashboard.service` (port 5050, public via Traefik). **Dashboard changes hit the port-5050 one** — restart that service after patching.

## 3. Current agent roster

The single source of truth is [`src/lib/agent-data.ts`](../src/lib/agent-data.ts) (read it — don't assume from this doc). As of 2026-04-16 roughly:

- **Free tier (7):** Harv, Router, Journal, Research, Email, Scheduler, Learning
- **Pro/Max tier:** Finance, Travel, Sports, Music, Product Research, Market Research, Video Digest, TikTok Digest, Twitter Digest, Video Gen, Video Editor, Image Gen, Image Editor, Media Manager, Auto Marketing, Guardian, Medic, Heartbeat
- **Planned / Coming Soon:** Fitness, Shopping, Trading, Data Viz, Postman, Archivist, Analyst

Before proposing a new agent, grep the repo — there's a good chance it already exists in some form.

## 4. Things Harv already has (don't rebuild)

When evaluating a video/feature for implementation, these are the most common false positives — video suggests X, Harv already has it:

- **Multi-agent router** — `lib/router.py` on VPS, two-tier confidence. Qwen3-8b classifier.
- **Telegram/WhatsApp/Discord integrations** — `user_integrations` Supabase table, link-code flow, per-user session scoping.
- **Per-agent memory** — `memory_entries` table tagged with `agent_name`. Search + filter in `/memory`.
- **Chat persistence** — `conversations` + `messages` tables, per-agent history, full-text search.
- **Cron/scheduled jobs** — `/crons` page, VPS crontab for sub-daily (Hobby can only do daily).
- **Usage tracking + degradation** — `usage_logs` + `api_cost_events`, ChatGPT-style daily/weekly limits per tier.
- **Auth/RLS** — Supabase Auth + permissive RLS (single-user effectively, but policies are in place).
- **File attachments** — `documents` Supabase table + Storage bucket, multi-file upload on chat pages.
- **Admin hub** — analytics, cost breakdown by model/agent/day, support inbox.
- **Cost tracking pipeline** — text/vlm/audio/image all tracked per-user, VPS crontab syncs every 5min to Supabase.

## 5. What IS in scope right now (launch prep)

Mode: **polish and ship**, not new surfaces.

- Performance + cost polish on existing agents
- Memory UX upgrades (pinned, importance scoring, cross-agent "hive mind" views — all extensions of `memory_entries`)
- Landing page / pricing / marketing copy
- Onboarding tour polish
- Bug fixes discovered via stress-tests (see `docs/testing-report-*.md`)
- Agent gating + tier UX

## 6. What is DELIBERATELY out of scope

Reject implementation plans that touch these unless explicitly requested:

- **Voice (Pipecat / Gemini Live / Deepgram / Cartesia)** — infra-heavy, on backburner. Don't add voice pipelines.
- **Video meeting rooms (Daily.co / WebRTC)** — not a Harv use case.
- **Hermes / OpenClaw replacement** — future research, not a current build target.
- **Anthropic models in production** — user is off the $200 Anthropic plan. Don't add `anthropic` as an LLM provider. (The Claude Code Routines API is fine — that's dev tooling, not product inference.)
- **Google Sheets as primary storage** — migrated to Supabase. Sheets only survives as a Mission Control mirror.
- **New chat systems that duplicate the existing `/chat` + `/agents/[name]`** — extend what's there.
- **Fitness / Shopping / Trading backend work** — marked "Coming Soon", UI stubs only until launch ships.

## 7. Hard constraints (violating these will break production)

- **Vercel Hobby = 60s function max.** Long work (transcript fetch, LLM generation > ~15s) must be pre-fetched, streamed, or moved to the VPS.
- **YouTube bot-gates the VPS datacenter IP.** `yt-dlp` fails on YouTube — don't add new code that relies on it. Transcript path is Gemini VLM + cache (already built).
- **Reddit API blocks datacenter IPs.** Use Reddit submit URLs, not PRAW. Don't try to automate posting.
- **Traefik whitelists Flask routes by path.** New root-level Flask routes need adding to `/docker/traefik/data/dynamic/api.yml`. Routes under `/api/*` are already prefix-matched.
- **Next.js 16 breaking changes.** `params` is a Promise (use `use(params)`). Lucide icons renamed. Read `node_modules/next/dist/docs/` before using any pattern you're unsure about.
- **Two Flask processes on VPS.** Restart `harv-dashboard.service` (port 5050), not `harv-api.service` (port 8765), for dashboard-facing changes.
- **Transcript + metadata cache lives in `/root/harv/cache/transcripts/<hash>.json`.** 7-day TTL. Respect it — don't re-fetch what's cached.

## 8. Design philosophy (for judgment calls)

- **Solo founder → small PRs.** One focused change per PR. Don't bundle cleanups with features.
- **No premature abstraction.** Three similar files is fine. Build the fourth before you extract.
- **No speculative features.** Don't add flags/options/configs for use cases that don't exist yet.
- **Plain English over jargon.** Business-impact framing beats technical framing when summarizing.
- **Vercel-friendly.** Assume Hobby constraints unless told otherwise.
- **Respect what's already built.** Extend > replace. Snapshot (git tag) before replacing.
- **Free tier matters.** Launch plan is free → pro → max. Don't put new features behind paid tier by default.

## 9. When a video suggests something — the decision tree

Before proposing implementation:

1. **Is it in Section 4 (already built)?** → Skip. Don't rebuild. Maybe extend.
2. **Is it in Section 6 (out of scope)?** → Reject with reason. Don't invent busywork.
3. **Does it violate Section 7 (hard constraints)?** → Reject with reason, or propose a constraint-safe alternative.
4. **Does it fit Section 5 (in-scope launch prep)?** → Propose with effort/blast-radius/trade-offs.
5. **Is it a real new capability that fits Harv's model?** → Propose, but tagged "new surface area, low priority vs launch."

If unsure, **ask the user** rather than guess. Prefer "reject + explain" over "build + hope."

## 10. Useful references

- [harv-system-summary.md](./harv-system-summary.md) — detailed architecture, tables, endpoints, change log
- [roadmap.md](./roadmap.md) — active roadmap
- [`src/lib/agent-data.ts`](../src/lib/agent-data.ts) — authoritative agent list
- [`src/lib/plan-config.ts`](../src/lib/plan-config.ts) — tier gating + limits
- [`harv_deploy/`](../harv_deploy/) — local mirror of key VPS files (often stale vs VPS; VPS `/root/harv/` is authoritative)
