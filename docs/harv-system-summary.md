# Harv AI System — Complete Project Summary

Last updated: 2026-04-15 (evening — digest polish + Claude Code routine integration)

---

## Overview

Harv is a personal AI assistant ecosystem built by Mack West. It consists of a Flask backend running on a Hostinger VPS, a Next.js web dashboard, and integrations with Telegram and WhatsApp. All data is persisted in Supabase Cloud.

---

## Owner

- **Name:** Mack West, 22, North Myrtle Beach SC
- **Background:** Former D1 defensive lineman #95 at Coastal Carolina University (CCU Chanticleers), professional Carolina Shag dancer, business degree
- **Interests:** Cars (especially Lightning McQueen), fitness/nutrition/recovery, health-focused lifestyle
- **Style:** Casual and direct. No corporate speak. Short messages are fine.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Interfaces                      │
│  Telegram Bot  │  WhatsApp Bot  │  Next.js Dashboard     │
└───────┬────────┴───────┬────────┴──────────┬─────────────┘
        │                │                   │
        ▼                ▼                   │
┌─────────────────────────────┐              │
│  Flask API (harv_api.py)    │◄─────────────┘ (proxy for agents/crons/analytics)
│  127.0.0.1:8765             │
│  Harv Brain (harv_brain.py) │
└──────────┬──────────────────┘
           │                        ┌──────────────────────┐
           ├───────────────────────►│  Supabase Cloud      │◄── Dashboard (direct)
           │  saves memory entries  │  PostgreSQL + pgvector│
           │                        │  3 tables             │
           ├───────────────────────►│                      │
           │                        └──────────────────────┘
           │
           ├───────────────────────►  Google Sheets (Mission Control)
           │                          Task queue, agent registry, logs
           │
           ├───────────────────────►  OpenRouter API
           │                          All LLM models (Gemini, DeepSeek, GPT-4.1, MiniMax)
           │
           ├───────────────────────►  OpenAI API
           │                          GPT-4.1 (max tier)
           │
           └───────────────────────►  DeepSeek API
                                      DeepSeek V3.2 (pro tier)
```

---

## VPS / Infrastructure

- **Provider:** Hostinger KVM VPS (ID: 1420157)
- **IP:** 187.77.220.169
- **OS:** Ubuntu 24.04
- **Domain:** api.openclaw-yqar.srv1420157.hstgr.cloud (HTTPS via Let's Encrypt)
- **SSH access:** Key-based as root (`~/.ssh/harv_vps`)
- **Python:** 3.12
- **Project root:** `/root/harv/`

---

## Database — Supabase Cloud

- **URL:** https://ecqlftxcscddyminhylh.supabase.co
- **Plan:** Free tier

### Tables

**`conversations`** — Chat sessions grouped by agent
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| agent_name | text | "Harv", "Finance", etc. |
| title | text | Optional conversation title |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last activity |

**`messages`** — Individual chat messages
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| conversation_id | uuid (FK) | Links to conversations |
| role | text | "user", "assistant", or "system" |
| content | text | Message content |
| created_at | timestamptz | When sent |

**`memory_entries`** — Knowledge base (replaces ChromaDB, which was never implemented)
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| content | text | The memory content |
| embedding | vector(1536) | For semantic search (pgvector) — not yet populated |
| metadata | jsonb | session_id, source, timestamp, tags |
| agent_name | text | Which agent created this |
| created_at | timestamptz | When created |

**`documents`** — Files created by agents or uploaded manually
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| filename | text | Original file name |
| file_type | text | Category: image, pdf, document, spreadsheet, presentation, other |
| mime_type | text | MIME type |
| file_size | bigint | Size in bytes |
| storage_path | text | Path in Supabase Storage `documents` bucket |
| agent_name | text | Which agent created this (null for manual uploads) |
| tags | text[] | User/agent-assigned tags |
| description | text | Optional description |
| created_at | timestamptz | When uploaded |
| updated_at | timestamptz | Last modified |

**`journal_entries`** — Daily compressed session summaries
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| date | date | Session date (3am EST boundary) |
| session_id | text | e.g. S-20260325-01 |
| summary | text | Overall day summary |
| accomplishments | text[] | What was completed |
| agents_used | text[] | Which agents were active |
| pending_tasks | text[] | Unfinished items |
| key_info | text[] | Notable facts/decisions |
| total_cost_usd | numeric(10,6) | Day's total API cost |
| created_at | timestamptz | When created |

**RLS:** Enabled on all tables with permissive "allow_all" policies (single-user system).

**Storage Buckets:**
- `documents` — Public bucket for agent-created files and manual uploads

**Functions:**
- `match_memories(query_embedding, match_threshold, match_count)` — Vector similarity search via pgvector (for future use when embeddings are added)

**Indexes:** Full-text search (GIN) on messages.content, memory_entries.content, and documents (filename + description). B-tree indexes on foreign keys, timestamps, file_type, and agent_name.

---

## Flask Backend

### Key Files (on VPS at /root/harv/)

| File | Purpose |
|------|---------|
| `/root/harv/lib/harv_brain.py` (~628 lines) | Core AI brain — OpenRouter conversation loop, tool execution, session history, Supabase memory persistence |
| `/root/harv/scripts/harv_api.py` | Flask HTTP API wrapper (runs as systemd service) |
| `/root/harv/lib/harv_lib.py` | Shared utilities — Google Sheets client, logging, config |
| `/root/harv/telegram_bot.py` | Telegram interface |
| `/root/harv/whatsapp_bot.py` | WhatsApp Twilio interface |
| `/root/harv/core.json` | Master config — paths, Google IDs, LLM settings, agent registry |
| `/root/harv/.env` | Environment variables (API keys, Supabase creds) |
| `/root/harv/lib/feedback.py` | Outcome tracking and pattern recognition |
| `/root/harv/scripts/daily_summary.py` | Daily summary cron — uses MiniMax M2.1 via OpenRouter |
| `/root/harv/agents/` | Individual agent implementations |

### API Endpoints (Flask, 127.0.0.1:8765)

| Route | Method | Purpose |
|-------|--------|---------|
| `/chat` | POST | Send message to Harv brain `{session_id, text, agent?}` → `{reply}` |
| `/clear` | POST | Clear conversation history `{session_id}` |
| `/run_router` | POST | Manually run task router |
| `/health` | GET | Health check |
| `/api/memory/dashboard` | GET | Memory stats (total entries) |
| `/api/memory/search?q=` | GET | Text search across memory entries |

### Harv Brain — How It Works

1. `chat_with_harv(session_id, user_text)` is the entry point
2. Maintains in-memory session history (max 20 turns per session, lost on restart)
3. Builds system prompt with owner info, VPS details, agent hierarchy
4. Runs agentic loop (up to 10 iterations): sends to LLM via OpenRouter, processes tool calls, loops
5. Tools available: `queue_task` (write to Google Sheets + run Router), `get_queue_status`
6. After each exchange, saves to Supabase `memory_entries` via background thread
7. All models routed via OpenRouter — no more Anthropic provider

### Systemd Service

```
Service: harv-api.service
Config:  /etc/systemd/system/harv-api.service
Entry:   /root/harv/scripts/harv_api.py
Env:     /root/harv/.env
Logs:    /root/harv/logs/harv_api.log
Restart: systemctl restart harv-api
```

---

## Dashboard — Next.js 16

### Tech Stack
- **Framework:** Next.js 16.2.1
- **React:** 19.2.4
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Fonts:** Outfit (heading) + JetBrains Mono (code)
- **AI SDK:** Vercel `ai` package
- **Icons:** Lucide React
- **Charts:** Recharts

### Design System — "Obsidian Glass"
- Deep navy background: `oklch(0.085 0.02 265)`
- Teal/cyan primary accent: `oklch(0.78 0.145 192)`
- 3 animated gradient orbs (teal, purple, sea-green) via CSS keyframes
- Cards: `bg-card/50 backdrop-blur-xl` with `ring-white/[0.08]`
- Glass depth via CSS box-shadow on `[data-slot="card"]`
- Sidebar: `bg-sidebar/65 backdrop-blur-2xl` with glowing teal active states
- Custom thin scrollbar, rounded-2xl cards, colored accent stripes

### Pages

| Path | Purpose |
|------|---------|
| `/` | Dashboard — stats (agents, crons, API calls, daily burn), quick links, system overview |
| `/chat` | Chat with Harv — persists to Supabase conversations, supports file attachments |
| `/agents` | Agent list with inline chat, expandable cards |
| `/agents/[name]` | Full agent chat page with sidebar info panel, supports file attachments |
| `/crons` | Cron job monitoring |
| `/documents` | File manager — grid/list view, search, type/agent filters, upload, download, delete |
| `/memory` | Two tabs: "Chat History" (conversations) + "Knowledge Base" (memory entries) |
| `/integrations` | Integration hub — connect Google, Telegram, GitHub, Spotify, etc. with waitlist |
| `/calendar` | Google Calendar — month grid + agenda view, OAuth connect/disconnect, event details |
| `/journal` | Daily journal summaries — auto-generated at 3am EST, search, date filter |
| `/analytics` | API costs, usage metrics, projections (owner/admin only) |
| `/settings` | System config, health check, personality toggle, service status, billing portal |
| `/onboarding` | First-time setup — personality choice, Google connect, permissions |

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Supabase client (browser + service role) |
| `src/lib/supabase-chat.ts` | Chat CRUD — conversations, messages, search, stats |
| `src/lib/supabase-memory.ts` | Memory entry queries, stats, text search |
| `src/lib/supabase-documents.ts` | Document CRUD — upload, list, filter, delete, stats |
| `src/lib/chat-history.ts` | Adapter — delegates to Supabase, handles localStorage migration |
| `src/lib/supabase-journal.ts` | Journal entry CRUD — list, search, stats, date filtering |
| `src/lib/google-calendar.ts` | Google Calendar API client — OAuth, events, token refresh |
| `src/lib/constants.ts` | Routing messages, shared agent config |
| `src/lib/onboarding.ts` | Onboarding state management (localStorage) |
| `src/app/api/proxy/route.ts` | Proxy to Flask backend (GET + POST) with X-API-Key auth |
| `src/app/api/chat/route.ts` | Chat endpoint forwarding to Flask `/chat` |
| `src/app/api/chat/agent/route.ts` | Agent-specific chat forwarding |
| `src/app/api/documents/route.ts` | Document upload API (multipart, X-API-Key auth) |
| `src/components/sidebar.tsx` | Navigation + agent chat dropdown with recent conversations |
| `.env.local` | API URLs, Harv API key, Supabase credentials |

### Chat File Attachments
Both `/chat` and `/agents/[name]` chat pages support file uploads:
- Paperclip button in the chat input bar opens a multi-file picker
- Attached files appear as removable chips (name + size) above the textarea
- On send, file names are appended to the message content as `[Attached: file1.txt, ...]`
- Attachment metadata (name, size, type) is stored on the Message object for future backend integration

### Data Flow

- **Chat/Memory/Documents data:** Dashboard ↔ Supabase Cloud (direct via `@supabase/supabase-js`)
- **Document files:** Supabase Storage `documents` bucket (public URLs for download/preview)
- **Agent/Cron/Analytics/Health:** Dashboard → Next.js API route → Flask backend (proxy pattern)
- **Agent chat:** Dashboard → `/api/chat/agent` → Flask `/chat` with `[DIRECT:AgentName]` routing
- **Agent document upload:** Agent → POST `/api/documents` (multipart + X-API-Key) → Supabase Storage + documents table

---

## Agent System

### Hierarchy
```
Mack → Harv (main brain) → Router → Specialized Agents
```

### LLM Models (Current — All on OpenRouter, no Anthropic/Ollama)

| Model | Provider | Used By | Cost/M tokens (in/out) |
|-------|----------|---------|----------------------|
| gemini-flash-lite | OpenRouter | Free tier primary, Harv (free users) | $0.075/$0.30 |
| deepseek-v3.2 | OpenRouter | Pro tier primary, Finance, Learning, Sports, Music, Trading | $0.26/$0.38 |
| gpt-4.1 | OpenRouter | Max tier primary | $2.00/$8.00 |
| minimax-m2.1 | OpenRouter | Journal, Scheduler, Email, Daily Summary | ~$0.06/$0.06 |
| x-ai/grok-4.1-fast | OpenRouter | Research | $0.05/$0.10 |
| qwen3-8b | OpenRouter | Router (task classification) | Free |
| imagen-4.0-fast | Gemini | Image Gen | $0.003/image |

### Tiered Model Plan (LIVE — dashboard + Stripe integrated)

| Tier | Primary Model | Fallback Model | Daily Premium Limit | Weekly Backstop |
|------|--------------|----------------|-------------------|-----------------|
| Free ($0) | Gemini Flash Lite ($0.075/$0.30) | Qwen 8B free | 25 | 100 |
| Pro ($20) | DeepSeek V3.2 ($0.26/$0.38) | Gemini Flash Lite | 150 | 750 |
| Max ($50) | GPT-4.1 ($2.00/$8.00) | DeepSeek V3.2 | 400 | 2000 |

ChatGPT-style degradation: when daily premium limit hit, model degrades to fallback (unlimited). Weekly backstops prevent abuse.

### Agent Gating

| Tier | Available Agents |
|------|-----------------|
| Free | Harv, Router, Journal, Research, Email, Scheduler, Learning (7 agents) |
| Pro/Max | All agents unlocked |

Locked agents show lock icon + PRO badge on agents page. Chat panel blocks with upgrade toast.

### Active Agents (24 total)

**Free tier agents (7):**
- **Harv** — Main brain, Cars 1 personality (plan-based model: Gemini Flash Lite / DeepSeek V3.2 / GPT-4.1)
- **Router** — Task classification and dispatch (qwen3-8b)
- **Journal** — Daily compressed summaries (minimax-m2.1)
- **Research** — Web research (grok-4.1-fast)
- **Email** — Email drafting (minimax)
- **Scheduler** — Productivity (minimax)
- **Learning** — Educational content (deepseek)

**Pro/Max tier agents (locked for free users):**
- **Finance/Trading/Music/Sports** — Domain agents (deepseek)
- **Video/YouTube Digest** — Video summarization (deepseek)
- **Image Gen** — Image generation (Gemini Imagen 4.0)
- **Auto Marketing** — Social media drafts (deepseek)
- **Guardian/Medic/Heartbeat** — Background system agents
- **Fitness/Shopping** — Lifestyle agents
- **Ledger/Drive** — Tool agents (no LLM)

### Pending Agents
- Postman (Gmail), Archivist (long-term memory), Analyst (data analysis), TikTok Digest, Twitter Digest, Video Gen, Video Editor

---

## Google Integration

- **Mission Control:** Google Sheets spreadsheet — task queue, agent registry, logs, dashboard, config
- **OAuth scopes:** Gmail (modify), Drive, Sheets
- **Credentials:** `/root/harv/credentials/google_token.json` + `google_credentials.json`
- **Harv Feedback:** Separate Google Sheet for outcome tracking, pattern recognition, improvement proposals

---

## Environment Variables

### Dashboard (.env.local)
```
NEXT_PUBLIC_API_URL=https://api.openclaw-yqar.srv1420157.hstgr.cloud
API_URL=https://api.openclaw-yqar.srv1420157.hstgr.cloud
HARV_API_KEY=<redacted>
NEXT_PUBLIC_SUPABASE_URL=https://ecqlftxcscddyminhylh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<redacted>
SUPABASE_SERVICE_ROLE_KEY=<redacted>
```

### VPS (/root/harv/.env)
```
OPENROUTER_API_KEY=<redacted>
TELEGRAM_BOT_TOKEN=<redacted>
TELEGRAM_ALLOWED_IDS=<redacted>
TWILIO_ACCOUNT_SID=<redacted>
TWILIO_AUTH_TOKEN=<redacted>
SUPABASE_URL=https://ecqlftxcscddyminhylh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<redacted>
```

---

## Recent Changes (2026-04-15 evening) — Digest polish + Claude Code integration

### One-click "Send to Claude Code" on the digest page
The Digest page's Implement mode now has a **🚀 Send to Claude Code** button that fires a Claude Code Routine on Anthropic's cloud, passing the generated implementation guide as the initial user message. Claude Code spawns a full session against the real `harv-dashboard` repo, makes edits on a `claude/*` branch, and opens a PR. The user can watch the session live via a URL returned in the response and a toast action.

- **Routine:** "Harv Digest Implement" (`trig_018dTGvBTreLDhJuTrzX3G8G`), created at claude.ai/code/routines
- **Fire URL:** `https://api.anthropic.com/v1/claude_code/routines/trig_018dTGvBTreLDhJuTrzX3G8G/fire`
- **Auth:** per-routine bearer token (`sk-ant-oat01-...`), generated once in the routine's API trigger settings
- **Model / tools:** Opus 4.6 1M context, Bash/Read/Write/Edit/Glob/Grep/WebFetch/WebSearch
- **Headers required:** `anthropic-beta: experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01`
- **Env vars on Vercel** (Production + Preview, sensitive-flagged):
  - `CLAUDE_ROUTINE_FIRE_URL`
  - `CLAUDE_ROUTINE_TOKEN`
- **Files added/changed:**
  - `src/app/api/digest/implement/route.ts` — admin-gated, validates text ≤ 65536 chars, forwards to fire URL
  - `src/app/(dashboard)/digest/page.tsx` — new `sendToClaudeCode()`, green button, session banner + toast
- **Docs:** https://platform.claude.com/docs/en/api/claude-code/routines-fire

### Hidden SSE parser bug on digest page (now fixed)
`askDigest()` was calling `res.json()` on `/api/chat/agent`, which returns either `text/event-stream` or `text/plain` — never JSON. Every digest call had been silently throwing with "Failed to get response" since streaming was added to the agent route (probably during the 2026-04-14 MEGA session). Fix mirrors the parser in `chat-panel.tsx` — handles SSE delta events + plain-text fallback.

**Rule of thumb for future work:** any consumer of `/api/chat/agent` must NOT use `res.json()`. Copy the parser from `src/components/chat/chat-panel.tsx:488-562`.

### Digest page polish (5 bugs)
1. "Generate Implementation Guide" button was broken — stale-closure `setMode + handleSubmit` in same tick. Now calls `askDigest` directly.
2. Progress labels said "Whisper" on Visual mode (which uses Gemini VLM). `PROGRESS_STEPS_BY_MODE` now has per-mode labels.
3. Hardcoded "Implement Section 1/2/3" buttons replaced with `extractSections()` that parses numbered markdown headings from the response and renders only real sections labeled with their titles.
4. Progress card stalled silently after ~40s. Now shows "Still working — long videos can take 60–90s" when elapsed > lastStep + 20.
5. Ctrl/Cmd+Enter didn't submit the multi-URL textarea — added keydown handler.

### VPS YouTube issue (open, side task spawned)
yt-dlp is bot-gated on the VPS datacenter IP. YouTube videos return "Unknown Video by Unknown" because metadata extraction fails at the yt-dlp level, before captions or Whisper are even attempted. TikTok and X/Twitter work. Two side tasks spawned to (1) fix the bot-gate with cookies/proxy and (2) unify the Whisper fallback chain across platforms so failures are reported with what-step-failed detail.

### Commits (master)
- `8025284 feat(digest): Send to Claude Code button — fires routine via API`
- `e317b67 fix(digest): parse SSE + plain text, not JSON`

---

## Recent Changes (2026-04-08) — Multi-User Integrations

### Telegram Integration (Full End-to-End)
- `user_integrations` Supabase table for account linking (provider, external_id, status, link_code)
- 4 API routes: /api/integrations/{link, verify, status, unlink}
- Dashboard: setup guide dialogs, 6-digit link code flow with 3s polling, success dialog
- VPS: @HarvAI_bot with /link command, Supabase auth, user-scoped sessions (tg-{user_id})
- Plan routing: bot looks up user's plan via dashboard API, passes to Flask, correct model used
- Conversations saved to Supabase conversations + messages tables per user
- Usage logged to usage_logs per user
- User context: [USER] Name/Email/Plan/Source [/USER] injected into each message

### Google OAuth Expanded
- Scopes: Calendar + Gmail + Drive + Docs + Sheets (all granted in one consent)
- Vercel env vars configured (NEXT_PUBLIC_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
- Setup guide + post-connect confirmation dialogs

### WhatsApp Integration (Code Ready, Hidden)
- Same architecture as Telegram, hidden until dedicated phone number available
- Shows as "Coming Soon — Q3 2026"

### VPS Changes
- Flask /chat (port 5050) forwards plan, model_tier, user_id, source to harv_brain
- Flask saves conversations + usage to Supabase for linked users
- Telegram bot token: @HarvAI_bot (8772238863)
- HARV_DASHBOARD_URL=https://harv-dashboard.vercel.app added to .env

---

## Previous Changes (2026-04-08) — P2 Sprint

### Standalone Integrations Page
- New `/integrations` route with full integration management
- Connected services (Telegram, WhatsApp) at top with green status
- Google OAuth connect/disconnect functional
- Coming soon integrations (Notion, Spotify, GitHub, Discord, Slack, etc.) with "Notify Me" waitlist
- Grouped by category: Productivity, Communication, Social, Developer
- Settings integrations tab simplified to compact Google + "Manage All Integrations" link
- Added to sidebar as 8th core nav item (Link2 icon)

### API Keys — Max Plan Gate
- API Keys tab now locked for non-Max users with upgrade CTA
- Max users get generate/copy/regenerate/revoke flow with created date
- Revoke button added alongside regenerate

### Dashboard Customization
- 3 new stat card options: Calendar, Files, Projects (10 total, pick 2-4)
- Quick Access section now configurable — Customize button, show/hide links (min 3)
- 3 new quick links: Calendar, Integrations, Projects (9 total)
- Sidebar tab reorder in Settings > General — up/down arrows, persists to localStorage

### Planned Agents Upgrade
- Enhanced PlannedAgentCard with capability bullets, ETA badge, "Notify Me" waitlist
- 7 planned agents with rich descriptions: TikTok Digest, Twitter Digest, Video Gen, Video Editor, Product Research, Market Research, Data Viz
- Research agent detail modal shows multi-model pipeline: Grok (search) -> Kimi K2 (analysis) -> DeepSeek (fallback)

### Code Cleanup
- Consolidated duplicated agent constants: agent-data.ts is now single source of truth
- Removed ~100 lines of duplicated constants from agents/page.tsx
- constants.ts now re-exports from agent-data.ts
- Fixed COMING_SOON_AGENTS discrepancy (added Travel, Auto Marketing)
- New integrations module: src/lib/integrations.ts
- New sidebar order utility: src/lib/sidebar-order.ts

### UI Polish
- Global micro-interactions: button press scale, badge transitions, focus rings
- Onboarding tour updated with Integrations phase (8 phases total)

### Key New Files
- `src/app/(dashboard)/integrations/page.tsx` — Integrations hub
- `src/lib/integrations.ts` — Integration registry and helpers
- `src/lib/sidebar-order.ts` — Sidebar reorder persistence

---

## Previous Changes (2026-04-07)

### P0 Sprint Complete — Full Model Migration
- **All models now on OpenRouter** — removed Anthropic (Claude) and Ollama entirely
- Services list: OpenRouter, OpenAI, DeepSeek (no more Anthropic, Ollama)
- Daily summary script switched from Claude Haiku to MiniMax M2.1 (OpenRouter)
- Removed all Claude/$200 Anthropic plan references from admin cost cards

### Stripe LIVE Mode
- All 5 live Stripe keys configured in .env.local and Vercel env vars
- Webhook configured for live mode
- Billing portal button for paid users (returns to /settings?tab=billing)

### Usage Limits Synced with Plan Config
- Fixed hardcoded 50/day — now pulls real limits from plan-config.ts
- Daily/weekly backstop enforcement working end-to-end
- Usage tab shows real data from /api/usage/check with correct per-plan limits

### Agent Gating (Free Plan Lock)
- FREE_PLAN_AGENTS: Harv, Router, Journal, Research, Email, Scheduler, Learning
- Locked agents show lock icon + PRO badge + upgrade toast on agents page
- Chat panel blocks locked agents with toast notification

### Admin Hub Redesign
- Sidebar: Admin Hub is expandable dropdown with "Dashboard" and "Analytics" sub-items
- Analytics page only visible to owner/admin (auth race condition fixed)
- Cost breakdown dialog: 3 tabs (By Model, By Agent, Daily) with summary row

### Agent Model Display
- Only Harv shows the plan-based model (Gemini Flash Lite / DeepSeek V3.2 / GPT-4.1)
- Other agents keep their specialized backend models in display

### Claude Event Cleanup
- Deleted old Claude cost events from Supabase
- Filtered sync to prevent re-import of stale Claude events

---

## Previous Changes (2026-03-31)

### API Cost Fix
- **Root cause**: VPS events API caps at 50 results, Guardian scans flood out `api_cost` events
- **Fix**: New `api_cost_events` Supabase table persists costs permanently, synced from VPS on each admin page load

### Usage Limits + Model Degradation (ChatGPT-style)
- Three tiers: Free (25 premium/day), Pro (150/day), Max (400/day)
- After daily limit: model degrades to cheaper fallback (never hard-blocked for paid tiers)
- Weekly backstops prevent abuse: Free 100, Pro 750, Max 2000
- Image generation limits per tier: Free 0, Pro 10/day, Max 30/day

### Plan Rename: Business → Max
- Consumer-friendly naming matching Claude/ChatGPT
- Stripe checkout/webhook flow works with "max" plan key

### New Supabase Tables
- `api_cost_events` — Persistent API cost tracking (survives VPS event rotation)
- `usage_logs` — Per-user message/token/cost tracking (used for degradation)

---

## Previous Changes (2026-03-25 Session 2)

### Dashboard
- **Agent hierarchy restructure:** Media Manager (parent of Image Gen, Video Gen, Video Editor), Research (parent of Product Research, Market Research, Data Viz)
- **6 new planned agents** added to PLANNED_AGENTS with icons across all 3 files (agents page, agent detail, sidebar)
- **Scribe** agent added to dashboard registry (was active on VPS but missing from UI)
- **Personality toggle** on Settings page — switch between Cars 1 and Default mode, calls `/api/config/personality`
- Updated agent descriptions: Harv (Cars 1 personality), Router (two-tier confidence), Journal (3am cutoff), Video Digest (implementation assistant), Memory (Supabase not ChromaDB)

### Backend (VPS)
- **Cars 1 personality toggle:** `core.json` `agents.harv.personality` field (`cars1`/`default`), `harv_brain.py` reads it in `build_system_prompt()`, two preset personality strings
- **Two-tier Router confidence routing:** `router.py` `dispatch()` now falls back to Harv when Router LLM returns `low` confidence instead of routing to an uncertain agent
- **Journal 3am EST cutoff:** `_today_str()` uses 3am EST as day boundary (before 3am = previous day's session), added `_in_quiet_window()` helper for future use
- **Journal Supabase persistence:** `_action_compress()` now saves journal summaries to `memory_entries` table after compression
- **New API endpoint:** `GET/POST /api/config/personality` — read and toggle Harv's personality mode
- **harv-api.service restarted** and all endpoints verified

### Previous Session (2026-03-25 Session 1)
- File upload in all chat windows (paperclip button, file chips)
- Agents page redesign: flowchart, type-grouped sections, sub-agent nesting
- "Coming Soon" section for: Music, Fitness, Finance, Shopping, Sports, Trading
- Chat disabled for Router, Tools, Background agents
- Journal `_parse()` fix for plain text input
- Router accuracy 72.4% → 79.7% on 59-prompt test suite

### Business Model (Stripe LIVE)
- **Free** ($0): 7 agents, 25 premium messages/day (Gemini Flash Lite), degrades after limit
- **Pro** ($20/mo): All agents, 150 premium messages/day (DeepSeek V3.2), unlimited standard, 10 images/day
- **Max** ($50/mo): All agents, 400 premium messages/day (GPT-4.1), unlimited DeepSeek V3.2, 30 images/day, admin dashboard
- Target margins: ~75% on Pro ($14-17 profit), ~75% on Max ($35-42 profit)
- Overhead: $17.99 VPS + API costs (no more Anthropic $200 plan)
- Demo timeline: when it's ready, quality over speed

---

## Important Notes

1. **Local vs VPS code:** `C:\Users\macko\harv_deploy\` has a SIMPLER version of harv_brain.py (~350 lines). The LIVE version on VPS at `/root/harv/lib/harv_brain.py` is ~680 lines with OpenRouter-only routing, personality toggle, and Ledger integration. Never overwrite the live file — patch it.

2. **Next.js 16 gotchas:** `params` in page components is a Promise (use `use(params)`). Some lucide-react icons renamed. Check `node_modules/next/dist/docs/` for breaking changes.

3. **Vector embeddings:** The `memory_entries.embedding` column exists but is not yet populated. Text search (ilike) works now. Semantic search via pgvector will work once an embedding provider is integrated.

4. **Session memory:** Harv's in-process session history (20 turns) is ephemeral — resets on service restart. Supabase `memory_entries` is the persistent store.

5. **ChromaDB:** Journal still uses local ChromaDB for embed/search/recall actions. Supabase `memory_entries` is the primary dashboard-facing store. The two coexist — ChromaDB for Journal's internal semantic search, Supabase for everything else.
