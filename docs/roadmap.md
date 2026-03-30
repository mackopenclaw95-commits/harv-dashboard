# Harv Dashboard Roadmap

## Priority 1 — Critical Fixes

### Medic Agent Upgrade (VPS) — DONE ✅
- [x] Pre-restart diagnostics: journalctl check before restarting
- [x] Known fix patterns: Puppeteer locks, orphaned processes, file permissions
- [x] Escalation: Telegram alert with error log after 3 failed restart attempts
- [x] Pre-restart cleanup: pkill child processes before restarting
- [x] Post-restart verification: 30s stability check before marking success

### Google Sheets Removal (VPS) — DONE ✅
Full Sheets removal across 9 files:
- [x] harv_brain.py — task queue now SQLite via task_store, ledger via event_bus
- [x] base_agent.py — removed Sheets client, mission_control.json, ledger via event_bus
- [x] router.py — SQLite-only task queue, routing decisions logged to event_bus
- [x] heartbeat.py — removed prune_sheets_logs, agent health Sheets sync, task sync
- [x] task_store.py — removed sync_to_sheets/sync_from_sheets
- [x] drive.py — removed sheets.read/write/append actions (kept drive file ops)
- [x] harv_lib.py — removed sheets_client, read_sheet, get_pending_tasks, update_dashboard, cost tracker → event_bus
- [x] harv_errors.py — removed safe_sheets_read/write
- [x] feedback.py — stubbed (was 100% Sheets-based)
- [x] core.json — removed google.spreadsheet_id and google.sheets config

### Context Tag Cleanup in Flask — DONE ✅
- [x] Router `dispatch()` strips `[CONTEXT]` and `[PROJECT CONTEXT]` tags before passing to any agent
- [x] Image Gen `_extract_prompt()` strips context tags as safety net
- [x] Image Gen `run()` entry point strips context before execute
- [x] Filenames now clean (derived from stripped prompt slug)
- [x] Also fixed: chat blueprint `/chat` and `/status` endpoints removed Sheets imports

---

## Priority 2 — Features

### Inline Image Display in Chat — DONE ✅
- [x] Flask `/api/agents/media/<path>` endpoint serves files from /root/harv/media/
- [x] Path traversal protection + MIME type detection
- [x] Dashboard /api/media proxy updated to use /api/agents/media/ (passes Hostinger proxy)
- [x] ImageMessage component + chat panel integration already built

### Markdown Rendering — DONE ✅
react-markdown + remark-gfm rendering bold, headers, tables, code blocks, links in chat.

### Agent Response Streaming — DONE ✅
- [x] VPS: Added _call_anthropic_stream() and _call_openrouter_stream() to harv_brain.py
- [x] VPS: Added chat_with_harv_stream() generator with SSE event format
- [x] VPS: Flask /chat endpoint supports stream=true flag → returns text/event-stream
- [x] Dashboard: Next.js API routes forward SSE stream with fallback to non-streaming
- [x] Dashboard: chat-panel.tsx renders text incrementally via ReadableStream reader
- [x] Telegram non-streaming /chat still works (backward compatible)

### Mobile Responsiveness Audit
**Current**: Desktop-first design. Mobile works but needs polish.
**Needed**:
- Test all pages at 375px
- Drawer works on mobile (already does)
- Tab labels collapse to icons on small screens (already does)
- Project detail tabs may need horizontal scroll on mobile

### Conversation Search in Drawer — DONE ✅
- [x] Search input added to ConversationSidebar (between New Chat button and list)
- [x] Client-side filtering by conversation title and agent name
- [x] "No matching conversations" empty state when search has no results
- [x] Search icon + placeholder styling consistent with Obsidian Glass theme

---

## Priority 3 — Polish

### Keyboard Shortcuts — DONE ✅
Global shortcuts: Ctrl+N (new chat), Ctrl+K (search), Esc (close drawer/modal), Ctrl+Shift+P (projects)

### Pin Conversations — DONE ✅
Pin/unpin via action menu, pinned section at top of sidebar, persisted in localStorage

### Drag-and-Drop File Upload — DONE ✅
Drop files onto chat area, visual drop zone overlay with dashed border + icon

### Project Activity Timeline — DONE ✅
Overview tab shows merged timeline of conversations + files, sorted by time, with icons and timeAgo

### Export Project — DONE ✅
Export button downloads markdown file with all conversations (full messages), file list, and instructions

### Notification System — DONE ✅
Polls VPS events API every 60s, shows toasts for health alerts, auto-repairs, task completions, heartbeats

---

## Priority 4 — Platform Architecture (Multi-Tenant Harv)

### Phase 4A: Perfect the Demo
- Finalize Client Harv (Demo/Trial) experience
- Tiered LLM models (demo=cheaper, paid=better)
- Onboarding flow for new users
- Free trial → paid personal conversion flow
- Mobile responsiveness audit

### Phase 4B: Admin Hub + Multi-Tenant Architecture
- **Admin Hub** (Mack's god-mode dashboard):
  - See all instances, conversations, costs, configs, health
  - Impersonate any Harv instance
  - Create/pause/restart instances
  - Push config updates across instances
  - Billing overview, privacy controls
- **Multi-tenant infrastructure**:
  - Instance registry (which Harvs exist, what tier, who owns them)
  - Data isolation strategy (shared vs dedicated VPS per business — TBD)
  - Auth system: Supabase Auth with org-level roles

### Phase 4C: Business Harv
- Custom UI per business (NOT the same dashboard)
- Company knowledge base / shared context
- Employee management (add/remove Employee Harvs)
- Business-specific agent configuration
- Dedicated VPS per business (TBD — needs cost testing)

### Phase 4D: Employee Harv
- One per employee, managed by Business Harv
- Auto-routes up to Business Harv for company context
- Web dashboard access
- Chat integrations: Slack, Teams, WhatsApp

### Existing P4 Features (fold into phases above)
- Agent Builder — visual agent creation, custom routing, custom prompts
- Automation Builder — visual cron builder, trigger→action→notification
- Voice Interface — speech-to-text, TTS, "Hey Harv" wake word
- Analytics V2 — per-project costs, agent performance, response time metrics

---

## Completed This Session (2026-03-29/30)

- [x] Chat page redesign (3 tabs: Harv, Agents, History)
- [x] Conversation drawer (collapsible Sheet)
- [x] Agent grid with parent/sub-agent grouping
- [x] Conversation management (archive, delete, move to project, rename)
- [x] Projects system (gallery, detail page, 5 tabs)
- [x] Project context injection into all agent chats
- [x] File upload to projects + link existing files
- [x] Link existing conversations to projects
- [x] Ka-chow mode (Lightning McQueen theme)
- [x] McQueen quotes, greetings, routing messages
- [x] Markdown rendering in chat
- [x] Inline image display component
- [x] Harv upgraded to Claude Sonnet 4
- [x] Dashboard awareness in Harv's system prompt
- [x] Google Sheets failure made non-fatal
- [x] Context tags stripped from event summaries
- [x] Auto-scroll fix for long responses
- [x] History count badge refresh
- [x] Personality API route (bypasses Hostinger auth)
- [x] Empty conversation cleanup
- [x] Sidebar Agent Chat dropdown removed (clean nav)
