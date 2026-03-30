# Session Summary — 2026-03-25: Agent Direct Chat Feature

## What We Built

Added direct chat functionality for every agent in the Harv dashboard. Users can now chat with any agent without going through the main Harv chat.

### UX Flow
1. Click an agent card on `/agents` → card expands inline showing description, details, and a chat input
2. Type and send a message → response appears inline in the expanded card (no navigation)
3. An "Open full chat →" link appears after the response
4. Clicking it opens `/agents/[name]` with the inline messages carried over via localStorage
5. Full chat page supports continued conversation with message history persistence

### Sidebar Enhancement
- Added "Agent Chat" dropdown below Settings (with spacer line)
- "Recent" section shows agents with chat history (sorted by most recent)
- "All Agents" section shows remaining agents
- Auto-opens when navigating to an agent chat page

---

## Files Changed

### New Files
- **`src/app/api/chat/agent/route.ts`** — Next.js API route that forwards to backend `/chat` with `agent` parameter and `X-API-Key` header
- **`src/lib/chat-history.ts`** — localStorage helper for per-agent chat persistence (`getAgentChat`, `saveAgentChat`, `getAgentsWithHistory`)

### Modified Files
- **`src/app/agents/page.tsx`** — Added `AgentCard` component with expandable inline chat, API calls, and "Open full chat" link that saves to localStorage
- **`src/app/agents/[name]/page.tsx`** — Full chat page; loads history from localStorage on mount using consolidated effect with ref guard
- **`src/components/sidebar.tsx`** — Added "Agent Chat" dropdown with Recent/All Agents sections, icon mapping, history tracking
- **`src/app/api/chat/route.ts`** — Fixed to use `/chat` endpoint (not `/api/chat`) and added `X-API-Key` header
- **`src/app/crons/page.tsx`** — Fixed broken lucide icon imports (`Twitter`→`Timer`, `Heart`→`HeartPulse`, `HelpCircle`→`CircleHelp`)
- **`.env.local`** — Added `HARV_API_KEY`

### VPS Files Changed (via SSH)
- **`/root/harv/api/blueprints/chat.py`** — POST `/chat` accepts optional `agent` param, prefixes message with `[DIRECT:AgentName]`
- **`/root/harv/lib/harv_brain.py`** — Added `[DIRECT:AgentName]` handler in `_pre_route()` that routes directly to specified agent via `tool_queue_task()`, strips `[completed]`/`[failed]` prefix from responses

---

## Bugs Fixed

### 1. "Harv API error" on chat
- **Cause**: Next.js API routes were hitting `${API_BASE}/api/chat` but the Flask backend registers the chat blueprint without url_prefix, so endpoint is `/chat`
- **Fix**: Changed to `${API_BASE}/chat` in both `route.ts` files, added `X-API-Key` header

### 2. Missing API key (401s)
- **Cause**: `.env.local` didn't have `HARV_API_KEY`
- **Fix**: Added `HARV_API_KEY=_OKSttGOm6pKnWgqbVt0L-_pKSy2Yiu9k2RReNTz9FU`

### 3. "Agent Travel not found in registry"
- **Cause**: `_pre_route()` in `harv_brain.py` had no handler for `[DIRECT:AgentName]` prefix
- **Fix**: Added regex match + dispatch in `_pre_route()`, restarted `harv-dashboard.service`

### 4. `[completed]` prefix in agent responses
- **Cause**: `tool_queue_task()` returns `[completed] actual output`
- **Fix**: Added regex strip for direct agent responses in `harv_brain.py`

### 5. Silent hydration failure on agent detail page (Next.js 16)
- **Cause**: `useSearchParams()` requires Suspense boundary in Next.js 16
- **Fix**: Replaced with `window.location.search` in a useEffect

### 6. Stale closure in sendMessage
- **Cause**: `useCallback` with `isSending` state dependency captured stale value
- **Fix**: Replaced with plain function + `useRef` for the sending guard

### 7. Chat history not carrying over to full chat page
- **Cause**: Separate useEffects for agent fetch and history load created race condition
- **Fix**: Consolidated into single useEffect with `historyLoadedRef` guard; history loads inside the same async function as the API fetch

### 8. Crons page build error
- **Cause**: `Twitter`, `Heart`, `HelpCircle` icons don't exist in current lucide-react
- **Fix**: Replaced with `Timer`, `HeartPulse`, `CircleHelp`

---

## Key Architecture Notes

### Agent Chat API Flow
```
Browser → /api/chat/agent (Next.js route)
       → POST https://api.openclaw-yqar.srv1420157.hstgr.cloud/chat
         with { message, agent } + X-API-Key header
       → Flask chat.py prepends [DIRECT:AgentName] to message
       → harv_brain.py _pre_route() catches [DIRECT:*] prefix
       → tool_queue_task() dispatches to the agent
       → Response stripped of [completed]/[failed] prefix
       → Plain text returned to browser
```

### localStorage Schema
```
Key: "harv-agent-chats"
Value: {
  "AgentName": [
    { id: string, role: "user"|"assistant", content: string, timestamp: ISO-string }
  ]
}
```

### Important: Next.js 16 Gotchas
- `useSearchParams()` requires Suspense boundary — use `window.location.search` instead for simple cases
- `params` in page components is now a Promise — must use `use(params)` to unwrap
- Some lucide-react icons were renamed/removed

---

## Git Commits
```
e104bf2 feat: inline agent chat, sidebar agent dropdown, and chat history
fae1afb fix: load chat history reliably on agent detail page
```

## Services Restarted on VPS
- `harv-dashboard.service` (for Python module changes to take effect)
