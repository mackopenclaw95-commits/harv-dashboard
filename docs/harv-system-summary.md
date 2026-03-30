# Harv AI System — Complete Project Summary

Last updated: 2026-03-25

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
           ├───────────────────────►  Anthropic API (Claude Sonnet 4.6)
           │                          Main conversational AI
           │
           ├───────────────────────►  OpenRouter API
           │                          DeepSeek, MiniMax, Qwen3 for agents
           │
           └───────────────────────►  Ollama (local on VPS)
                                      Qwen 2.5:0.5b for free tasks
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
| `/root/harv/lib/harv_brain.py` (~628 lines) | Core AI brain — Claude conversation loop, tool execution, session history, Supabase memory persistence |
| `/root/harv/scripts/harv_api.py` | Flask HTTP API wrapper (runs as systemd service) |
| `/root/harv/lib/harv_lib.py` | Shared utilities — Google Sheets client, logging, config |
| `/root/harv/telegram_bot.py` | Telegram interface |
| `/root/harv/whatsapp_bot.py` | WhatsApp Twilio interface |
| `/root/harv/core.json` | Master config — paths, Google IDs, LLM settings, agent registry |
| `/root/harv/.env` | Environment variables (API keys, Supabase creds) |
| `/root/harv/lib/feedback.py` | Outcome tracking and pattern recognition |
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
4. Runs agentic loop (up to 10 iterations): sends to Claude, processes tool calls, loops
5. Tools available: `queue_task` (write to Google Sheets + run Router), `get_queue_status`
6. After each exchange, saves to Supabase `memory_entries` via background thread
7. Supports Anthropic (Claude) and OpenRouter providers — model routing based on prefix

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
| `/calendar` | Google Calendar — month grid + agenda view, OAuth connect/disconnect, event details |
| `/journal` | Daily journal summaries — auto-generated at 3am EST, search, date filter |
| `/analytics` | API costs, usage metrics, projections |
| `/settings` | System config, health check, personality toggle, service status |
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

### LLM Models

| Model | Provider | Used By | Cost |
|-------|----------|---------|------|
| claude-sonnet-4-6 | Anthropic | Harv brain | ~$0.01/call |
| deepseek-v3 | OpenRouter | Finance, Learning, Research, Sports, Music, Trading, YouTube, Marketing | ~$0.0003-0.0016/call |
| minimax-m2.1 | OpenRouter | Journal, Scheduler, Email, Travel | ~$0.0001-0.0004/call |
| qwen3-8b | OpenRouter | Router (task classification) | ~$0.00001/call |
| qwen2.5:0.5b | Ollama (local) | Fitness, Shopping, Guardian | FREE |

### Active Agents
- **Scribe** — Google Sheets/Drive read/write
- **Router** — Task classification and dispatch
- **Auto Marketing** — Social media draft agent
- **YouTube Digest** — Video summarization

### Pending Agents
- Postman (Gmail), Archivist (long-term memory), Analyst (data analysis)

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
ANTHROPIC_API_KEY=<redacted>
TELEGRAM_BOT_TOKEN=<redacted>
TELEGRAM_ALLOWED_IDS=<redacted>
TWILIO_ACCOUNT_SID=<redacted>
TWILIO_AUTH_TOKEN=<redacted>
SUPABASE_URL=https://ecqlftxcscddyminhylh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<redacted>
```

---

## Recent Changes (2026-03-25 Session 2)

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

### Business Model
- Blended pricing: Free demo (time-limited) → Starter ($20/mo) → Pro ($50/mo) → BYOK unlock
- Admin/Dev dashboard separate from user dashboard (future)
- Demo timeline: when it's ready, quality over speed

---

## Important Notes

1. **Local vs VPS code:** `C:\Users\macko\harv_deploy\` has a SIMPLER version of harv_brain.py (~350 lines). The LIVE version on VPS at `/root/harv/lib/harv_brain.py` is ~680 lines with OpenRouter support, multi-provider routing, personality toggle, and Ledger integration. Never overwrite the live file — patch it.

2. **Next.js 16 gotchas:** `params` in page components is a Promise (use `use(params)`). Some lucide-react icons renamed. Check `node_modules/next/dist/docs/` for breaking changes.

3. **Vector embeddings:** The `memory_entries.embedding` column exists but is not yet populated. Text search (ilike) works now. Semantic search via pgvector will work once an embedding provider is integrated.

4. **Session memory:** Harv's in-process session history (20 turns) is ephemeral — resets on service restart. Supabase `memory_entries` is the persistent store.

5. **ChromaDB:** Journal still uses local ChromaDB for embed/search/recall actions. Supabase `memory_entries` is the primary dashboard-facing store. The two coexist — ChromaDB for Journal's internal semantic search, Supabase for everything else.
