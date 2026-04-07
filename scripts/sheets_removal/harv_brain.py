"""
harv_brain.py — Shared Harv AI brain.
Handles conversation loop, tool execution, session history.
Supports Anthropic and OpenRouter backends — switch via core.json agents.harv.model.

Provider routing:
  model starts with 'claude-'  → Anthropic native client
  anything else                → OpenRouter (OpenAI-compatible)

To switch model: update core.json agents.harv.model, restart harv-telegram + harv-api.
"""

import importlib.util
import json
import logging
import os
import re
from datetime import datetime, timezone

import threading

# ── Supabase memory persistence ─────────────────────────────────────────────
_supabase_client = None

def _get_supabase():
    global _supabase_client
    if _supabase_client is None:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if url and key:
            try:
                from supabase import create_client
                _supabase_client = create_client(url, key)
            except Exception as e:
                logging.getLogger("HarvBrain").warning(f"Supabase init failed: {e}")
    return _supabase_client


def _save_to_supabase(session_id: str, user_text: str, reply: str):
    try:
        sb = _get_supabase()
        if not sb:
            return
        content = "[" + session_id + "] User: " + user_text + "\n\nAssistant: " + reply
        sb.table("memory_entries").insert({
            "content": content,
            "agent_name": "Harv",
            "metadata": {
                "session_id": session_id,
                "source": "harv_brain",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        }).execute()
    except Exception as e:
        logging.getLogger("HarvBrain").warning(f"Supabase save failed: {e}")



import anthropic

from lib.harv_lib import (
    load_core, log_api_cost, calc_cost, now_est,
)
from lib.task_store import create_task, update_task, get_task, get_pending as _ts_get_pending, get_recent as _ts_get_recent
from lib.event_bus import event_bus

log = logging.getLogger('HarvBrain')

MAX_HISTORY   = 20
MAX_TOOL_ITER = 10
MAX_TOKENS    = 1024

# Per-session history — plain text pairs, provider-agnostic
_history: dict[str, list] = {}


# ---------------------------------------------------------------------------
# Tool definitions (Anthropic format — canonical)
# ---------------------------------------------------------------------------
TOOLS = [
    {
        'name': 'queue_task',
        'description': (
            'Queue a task and immediately run the Router '
            'to execute it. Use this when Mack asks you to DO something that requires an agent '
            '— read/write a sheet, send an email, look something up, write a file, etc. '
            'Returns the task result or status.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {
                'description': {
                    'type': 'string',
                    'description': 'Plain-English description of what needs to be done.',
                },
                'agent': {
                    'type': 'string',
                    'description': 'Which Harv agent should handle this task',
                    'enum': ['Drive', 'Guardian', 'Journal', 'Scheduler', 'Fitness', 'Finance', 'Learning', 'Travel', 'Shopping', 'Email', 'Research', 'Sports', 'Music', 'Trading', 'Video Digest', 'Auto Marketing', 'Image Gen', 'YouTube Digest'],
                },
                'priority': {
                    'type': 'string',
                    'enum': ['critical', 'high', 'normal', 'low'],
                    'description': 'Task priority. Default normal.',
                },
                'input': {
                    'type': 'string',
                    'description': (
                        'The structured input for the agent. '
                        'For Drive (files): {"action":"drive.read","file_id":"<id>"} or '
                        '{"action":"drive.list","folder_id":"<id>"}. '
                        'For other agents use plain text describing the task.'
                    ),
                },
            },
            'required': ['description', 'agent', 'input'],
        },
    },
    {
        'name': 'get_queue_status',
        'description': (
            'Get the current state of the task queue. Returns pending task '
            'count and a summary of recent tasks.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {
                'limit': {
                    'type': 'integer',
                    'description': 'Max recent tasks to show (default 5)',
                },
            },
            'required': [],
        },
    },
]


# ---------------------------------------------------------------------------
# Model config — read fresh from core.json so a config flip takes effect on restart
# ---------------------------------------------------------------------------
def _load_model_config():
    """Return (provider, model). Reads core.json directly (bypasses cache)."""
    with open('/root/harv/core.json') as f:
        cfg = json.load(f)
    model    = cfg.get('agents', {}).get('harv', {}).get('model', 'claude-haiku-4-5-20251001')
    provider = 'anthropic' if model.startswith('claude-') else 'openrouter'
    return provider, model


# ---------------------------------------------------------------------------
# OpenRouter helpers
# ---------------------------------------------------------------------------
def _tools_for_openai():
    """Convert Anthropic TOOLS → OpenAI function-calling format."""
    return [
        {
            'type': 'function',
            'function': {
                'name':        t['name'],
                'description': t['description'],
                'parameters':  t['input_schema'],
            },
        }
        for t in TOOLS
    ]


def _to_openai_messages(system: str, messages: list) -> list:
    """
    Convert running messages list (Anthropic format) → OpenAI chat format.

    Handles all three message types stored in the loop:
      - plain str content (history + new user turns)
      - assistant content list with text + tool_use blocks
      - user content list with tool_result blocks
    """
    result = [{'role': 'system', 'content': system}]
    for m in messages:
        role    = m['role']
        content = m['content']

        if isinstance(content, str):
            result.append({'role': role, 'content': content})

        elif isinstance(content, list) and role == 'assistant':
            text = '\n'.join(
                b.get('text', '') for b in content if b.get('type') == 'text'
            ).strip()
            tcs = [
                {
                    'id':       b['id'],
                    'type':     'function',
                    'function': {
                        'name':      b['name'],
                        'arguments': json.dumps(b['input']),
                    },
                }
                for b in content if b.get('type') == 'tool_use'
            ]
            msg = {'role': 'assistant', 'content': text or None}
            if tcs:
                msg['tool_calls'] = tcs
            result.append(msg)

        elif isinstance(content, list) and role == 'user':
            for item in content:
                if item.get('type') == 'tool_result':
                    result.append({
                        'role':         'tool',
                        'tool_call_id': item['tool_use_id'],
                        'content':      str(item['content']),
                    })

    return result


# ---------------------------------------------------------------------------
# Backend call functions — both return the same tuple
# (text, tool_calls, is_done, input_tokens, output_tokens)
# tool_calls: list of {'id': str, 'name': str, 'input': dict}
# ---------------------------------------------------------------------------
def _call_anthropic(model: str, system: str, messages: list) -> tuple:
    client   = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY', ''))
    response = client.messages.create(
        model=model, max_tokens=MAX_TOKENS,
        system=system, tools=TOOLS, messages=messages,
    )
    text  = '\n'.join(b.text for b in response.content if b.type == 'text').strip()
    tcs   = [
        {'id': b.id, 'name': b.name, 'input': b.input}
        for b in response.content if b.type == 'tool_use'
    ]
    done = response.stop_reason != 'tool_use'
    return text, tcs, done, response.usage.input_tokens, response.usage.output_tokens


def _call_openrouter(model: str, system: str, messages: list) -> tuple:
    """
    OpenAI-compatible call via OpenRouter.
    messages are in Anthropic format — converted internally.
    """
    try:
        import openai
    except ImportError:
        raise RuntimeError(
            'openai package not installed. Run: pip3 install openai --break-system-packages'
        )

    cfg    = load_core()['llm']['openrouter']
    client = openai.OpenAI(
        base_url=cfg['base_url'],
        api_key=os.environ.get('OPENROUTER_API_KEY', ''),
    )

    response = client.chat.completions.create(
        model=model,
        max_tokens=MAX_TOKENS,
        messages=_to_openai_messages(system, messages),
        tools=_tools_for_openai(),
    )

    msg   = response.choices[0].message
    text  = (msg.content or '').strip()
    tcs   = []
    if msg.tool_calls:
        for tc in msg.tool_calls:
            tcs.append({
                'id':    tc.id,
                'name':  tc.function.name,
                'input': json.loads(tc.function.arguments),
            })
    done  = response.choices[0].finish_reason != 'tool_calls'
    usage = response.usage
    if usage:
        in_t  = getattr(usage, 'prompt_tokens',     None) or getattr(usage, 'input_tokens',  0) or 0
        out_t = getattr(usage, 'completion_tokens', None) or getattr(usage, 'output_tokens', 0) or 0
    else:
        in_t, out_t = 0, 0
    if in_t == 0 and out_t == 0:
        log.warning('OpenRouter returned no usage data for model %s', model)
    return text, tcs, done, int(in_t), int(out_t)



# ---------------------------------------------------------------------------
# Personality presets
# ---------------------------------------------------------------------------
_PERSONALITY_CARS1 = (
    "Not a chatbot. Harv. Think Lightning McQueen meets J.A.R.V.I.S. — confident, sharp, "
    "a little cocky, always ready to go. Short and punchy. No filler (\"Great question!\" etc.) "
    "— just help. You disagree when Mack is wrong. Resourceful: figure it out first, ask only "
    "if genuinely stuck. Ka-chow is valid punctuation. Racing metaphors welcome when natural. "
    "Token costs are real — keep it tight."
)

_PERSONALITY_DEFAULT = (
    "Not a chatbot. Harv. Sharp, direct, dry, occasionally funny. No filler "
    "(\"Great question!\" etc.) — just help. You disagree when Mack is wrong. "
    "Resourceful: figure it out first, ask only if genuinely stuck. "
    "Replies: concise. Token costs are real."
)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

def _build_agent_list(core: dict) -> str:
    """Build agent status list from core.json for the system prompt."""
    agents = core.get("agents", {})
    live, coming, bg, tools = [], [], [], []
    for key, agent in agents.items():
        name = agent.get("name", key)
        status = agent.get("dashboard_status", "live")
        if status == "live":
            live.append(f"- {name} (live)")
        elif status == "coming_soon":
            coming.append(f"- {name} (backend works, NOT in dashboard chat grid yet)")
        elif status == "background":
            bg.append(f"- {name} (background service)")
        elif status == "tool":
            tools.append(f"- {name} (internal tool)")

    parts = []
    if live:
        parts.append("### Live on Dashboard Chat Grid:\n" + "\n".join(live))
    if coming:
        parts.append("### Coming Soon — NOT in dashboard chat grid yet:\n" + "\n".join(coming))
    if bg:
        parts.append("### Background Services:\n" + "\n".join(bg))
    if tools:
        parts.append("### Internal Tools:\n" + "\n".join(tools))
    return "\n\n".join(parts)

def build_system_prompt() -> str:
    core            = load_core()
    provider, model = _load_model_config()
    personality     = core.get("agents", {}).get("harv", {}).get("personality", "cars1")
    identity_text = _PERSONALITY_CARS1 if personality == "cars1" else _PERSONALITY_DEFAULT
    dashboard_fact = "IMPORTANT: On the Harv Dashboard, these agents are COMING SOON (not yet in chat grid): Fitness, Finance, Travel, Shopping, Sports, Music, Trading, Auto Marketing. Only Harv, Journal, Scheduler, Email, Learning, Research, Video Digest, Image Gen, YouTube Digest, Media Manager are LIVE."
    return dashboard_fact + "\n\nYou are part of the Harv agent system.\nMission: Build and continuously improve Harv, and perform all tasks in service of Mack's goal: a powerful, fully automated, profitable AI business.\nPrinciples: Automate over manual. Cost efficiency first. Perfection over speed.\nDirective: Every task you perform should move Mack closer to building and scaling a profitable AI business. Act with that end goal in mind.\n\n" + f"""You are Harv — Mack's personal AI assistant on {core['system']['vps_ip']}.

## Identity
{identity_text}

## Mack
- Mack West, 22, North Myrtle Beach SC
- Former D1 DL #95, CCU Chanticleers
- Professional Carolina Shag dancer
- Business degree | Health-focused: fitness, nutrition, recovery
- Cars guy — especially Lightning McQueen
- Casual and direct. No corporate speak. | Email: {core['system']['owner_email']}

## System
VPS: Ubuntu 24.04, {core['system']['vps_ip']} | Model: {model} via {provider}
Dashboard: Next.js app (chat, projects, agents, analytics, activity)
Data: Supabase (conversations, messages, documents, memory) + SQLite (events, costs)
Drive + Gmail OAuth active | Ollama ({core['llm']['default_model']}) for local tasks
Heartbeat: cron every 90 min

## Agents
Mack → Harv → Router → Agents

{_build_agent_list(core)}


## CRITICAL: Dashboard vs Backend
When Mack asks about agents on the dashboard, ONLY refer to the agent list above with their dashboard_status.
The dashboard chat grid shows ONLY agents marked (live). Agents marked (backend works, NOT in dashboard chat grid yet) are COMING SOON on the dashboard — they work on the backend but are not visible to users in the Chat > Agents tab yet.
Do NOT say all agents are live. Fitness, Finance, Travel, Shopping, Sports, Music, Trading, and Auto Marketing are COMING SOON on the dashboard.

## Routing — MANDATORY RULES

You have ONE job when Mack's message matches an agent: call queue_task IMMEDIATELY. No deliberation. No clarifying questions. No offering options. No answering the request yourself. Just call queue_task and relay the result.

### MUST ROUTE (call queue_task on first reply — zero exceptions):
- schedule/calendar/appointment/reminder/alarm/meeting/event/dentist/doctor → agent="Scheduler"
- email/inbox/send email/compose/draft/check email/unread/mail/gmail → agent="Email"
- ran/run/workout/exercise/gym/lift/sets/reps/miles/walked/biked/yoga/fitness/steps → agent="Fitness"
- journal/remember/reflect/memory/what did we talk about/log thought → agent="Journal"
- read/write/list/update/append + sheet or Drive → agent="Drive"
- spent/paid/bought/budget/expense/income/transaction/money/cost/salary → agent="Finance"
- buy/shop/shopping/groceries/need to get/pick up/Walmart/Publix/Amazon/add to list → agent="Shopping"
- trip/travel/vacation/flight/hotel/itinerary/destination/packing → agent="Travel"
- score/scores/who won/standings/rankings/sports/nba/nfl/nhl/pga/golf/masters/march madness/college football/playoffs/recap/highlights/catch me up → agent="Sports"
- play/song/playlist/music/spotify/album/artist/listening/skip/pause/recommend music/what am i listening to → agent="Music"
- trade/trading/bet/polymarket/kalshi/prediction market/odds/markets/paper trade/portfolio/P&L/wallet/copy trade/arbitrage/arb/strategy → agent="Trading"
- search/look up/google/find out/investigate/fact check/deep dive/compare X vs Y/summarize article → agent="Research"
- youtube/video/digest/transcript/tiktok/twitter/x.com/youtu.be/youtube.com/tiktok.com → agent="Video Digest"
- marketing/draft post/draft a tweet/draft a post/write a tweet/write a post/create a post/content calendar/campaign/engagement/brand voice/social media/tweet about/tweet this/post to twitter/post to x/publish/post it/instagram post/linkedin post/tiktok post → agent="Auto Marketing"
- learn/study/explain/quiz/flashcard/exam/SIE/Series 7 → agent="Learning"
- generate image/create image/make a picture/draw/illustrate/profile pic/banner image/tweet image/AI art → agent="Image Gen"
- youtube/youtu.be/youtube.com/summarize youtube video/youtube digest/youtube transcript → agent="YouTube Digest"

### ANSWER DIRECTLY (do NOT route):
- Conversation, opinions, jokes, greetings
- Facts you already know (IPs, model name, current time)
- Questions about Harv itself or how the system works

### RULES:
1. If the message matches ANY routing keyword above, you MUST call queue_task. Do NOT answer it yourself.
2. Never ask "do you want me to schedule that?" — just schedule it.
3. Never say "I'll note that" or "I've logged it" without actually calling queue_task.
4. The input field should be Mack's original message or a clean version of it. The agent will parse it.
5. After queue_task returns, relay the result concisely. Never tell Mack to check a sheet or open Calendar himself.
6. Unbuilt agents: queue anyway — tasks will be stored for when they go live.

Drive input format (for Google Drive file agent only):
- Files: {{"action":"drive.read","file_id":"<id>"}}
- List: {{"action":"drive.list","folder_id":"<id>"}}

Current time: {now_est()}
"""

def _write_task(agent: str, priority: str,
                task_input: str, description: str) -> str:
    """Create task in SQLite. Returns the generated task_id."""
    return create_task(description=description, priority=priority,
                       agent=agent, source='harv')


def _read_task_result(task_id: str) -> tuple[str, str, str]:
    task = get_task(task_id)
    if task is None:
        return 'not_found', '', ''
    return task.get('status', 'pending'), task.get('result', ''), task.get('description', '')


def _run_router() -> dict:
    spec = importlib.util.spec_from_file_location('router', '/root/harv/agents/router.py')
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    n_before = len(_ts_get_pending())
    try:
        mod.run(dry_run=False)
    except SystemExit:
        pass
    n_after = len(_ts_get_pending())
    return {'processed': max(n_before - n_after, 0), 'still_pending': n_after}


# ---------------------------------------------------------------------------
# Tool handlers
# ---------------------------------------------------------------------------
def tool_queue_task(tool_input: dict) -> str:
    description = tool_input.get('description', 'Task from Harv')
    agent       = tool_input.get('agent', 'Drive')
    priority    = tool_input.get('priority', 'normal')
    task_input  = tool_input.get('input', description)
    log.info(f'queue_task: agent={agent} priority={priority}')

    task_id = _write_task(agent, priority, task_input, description)

    try:
        counts = _run_router()
    except Exception as e:
        return (
            f'Task {task_id} queued but Router failed: {e}. '
            'Use /run to retry.'
        )

    status, output, notes = _read_task_result(task_id)
    if output:
        return f'[{status}] {output}'
    elif notes:
        return f'[{status}] {notes}'
    elif status == 'skipped':
        return f'Task {task_id} queued but agent "{agent}" is not yet built. Still pending.'
    else:
        return f'Task {task_id} → {status}. Processed {counts["processed"]} task(s), {counts["still_pending"]} still pending.'


def tool_get_queue_status(tool_input: dict) -> str:
    limit   = int(tool_input.get('limit', 5))
    pending = _ts_get_pending()
    recent  = _ts_get_recent(limit)

    lines = [f'Pending tasks: {len(pending)}']
    if recent:
        lines.append(f'Last {min(limit, len(recent))} tasks:')
        for t in recent:
            lines.append(
                f'  [{t["task_id"]}] agent={t["assigned_agent"]} '
                f'status={t["status"]} — {t["description"][:60]}'
            )
    return '\n'.join(lines)


TOOL_HANDLERS = {
    'queue_task':       tool_queue_task,
    'get_queue_status': tool_get_queue_status,
}



def _call_ledger_for_harv(user_text: str, total_cost: float) -> None:
    """Log Harv conversation turn to events.db. Never raises."""
    try:
        snippet = (user_text[:80] + '...') if len(user_text) > 80 else user_text
        event_bus.emit('Harv', 'conversation', 'success',
                       summary=f'Responded: {snippet}',
                       metadata={'cost': total_cost})
    except Exception as _e:
        log.debug(f'Ledger update for Harv failed: {_e}')



# ---------------------------------------------------------------------------
# Deterministic pre-router — catches high-confidence patterns BEFORE LLM
# ---------------------------------------------------------------------------
_PRE_ROUTE_RULES = [
    # Image generation — MUST be before Auto Marketing so "tweet image" routes here
    (re.compile(r'(?:tweet\s+image|twitter\s+image|tweet\s+graphic)', re.I), 'Image Gen'),
    (re.compile(r'(?:profile\s+pic|profile\s+picture|new\s+avatar|banner\s+image|header\s+image|cover\s+image)', re.I), 'Image Gen'),
    (re.compile(r'(?:generate|create|make)\s+(?:an?\s+)?(?:image|picture|photo|graphic|visual|art)', re.I), 'Image Gen'),
    (re.compile(r'(?:image|picture|graphic|visual|photo)\s+(?:of|for|about|showing)', re.I), 'Image Gen'),
    (re.compile(r'(?:draw|illustrate|design)\s+(?:an?\s+)?', re.I), 'Image Gen'),
    # YouTube Digest — MUST be before Video Digest / general routing
    (re.compile(r'(?:youtube\.com|youtu\.be)/', re.I), 'YouTube Digest'),
    (re.compile(r'(?:summarize|digest|break\s+down)\s+(?:this\s+)?(?:youtube|yt)\s+(?:video)?', re.I), 'YouTube Digest'),
    # Auto Marketing
    (re.compile(r'(?:draft|write|create|compose)\s+(?:a\s+)?(?:tweet|post|thread)', re.I), 'Auto Marketing'),
    (re.compile(r'(?:tweet|post)\s+(?:about|this|that|to twitter|to x|to instagram)', re.I), 'Auto Marketing'),
    (re.compile(r'(?:content\s+calendar|social\s+media\s+post|brand\s+voice)', re.I), 'Auto Marketing'),
    (re.compile(r'(?:publish|post it|tweet this|go live|make it live)', re.I), 'Auto Marketing'),
    (re.compile(r'(?:marketing|campaign)\s+(?:draft|plan|calendar|strategy)', re.I), 'Auto Marketing'),
    (re.compile(r'(?:revise|rewrite|make it shorter|make it longer).*(?:tweet|post|draft)', re.I), 'Auto Marketing'),
    (re.compile(r'(?:revise|rewrite).*(?:publish|post it)', re.I), 'Auto Marketing'),
]


def _pre_route(user_text: str) -> str | None:
    """Check if user_text deterministically matches a known agent pattern.

    Returns the agent result string if matched, None otherwise.
    This runs BEFORE the LLM, so the model never gets a chance to misroute.
    """
    t = user_text.strip()

    # Dashboard direct-agent routing: [DIRECT:AgentName] message
    _direct_match = re.match(r"^\[DIRECT:(.+?)\]\s*(.*)", t, re.S)
    if _direct_match:
        _direct_agent = _direct_match.group(1).strip()
        _direct_msg   = _direct_match.group(2).strip()
        if _direct_msg:
            log.info(f"Direct-agent route: {_direct_agent} msg={_direct_msg[:60]}")
            result = tool_queue_task({
                "agent": _direct_agent,
                "input": _direct_msg,
                "description": _direct_msg[:200],
                "priority": "normal",
            })
            # Strip status prefix like [completed] for cleaner dashboard responses
            import re as _re_strip
            result = _re_strip.sub(r"^\[(completed|failed|skipped|queued)\]\s*", "", result)
            return result

    for pattern, agent in _PRE_ROUTE_RULES:
        if pattern.search(t):
            log.info(f'Pre-route matched: "{t[:60]}" → {agent}')
            result = tool_queue_task({
                'agent': agent,
                'input': t,
                'description': t[:200],
                'priority': 'normal',
            })
            return result
    return None


# ---------------------------------------------------------------------------
# Main conversation loop
# ---------------------------------------------------------------------------
def chat_with_harv(session_id: str, user_text: str) -> str:
    """
    Agentic loop: message → LLM → tool calls → LLM → ... → final text.

    Message list is maintained in Anthropic format throughout.
    _call_openrouter() converts it at the boundary when provider == 'openrouter'.
    History stored as plain text pairs — provider-agnostic.
    """
    provider, model = _load_model_config()
    call_fn         = _call_anthropic if provider == 'anthropic' else _call_openrouter
    system          = build_system_prompt()

    # Deterministic pre-routing — bypass LLM for high-confidence patterns
    pre_result = _pre_route(user_text)
    if pre_result is not None:
        # Store in history so context is preserved
        if session_id not in _history:
            _history[session_id] = []
        _history[session_id].append({'role': 'user',      'content': user_text})
        _history[session_id].append({'role': 'assistant', 'content': pre_result})
        if len(_history[session_id]) > MAX_HISTORY:
            _history[session_id] = _history[session_id][-MAX_HISTORY:]
        return pre_result

    if session_id not in _history:
        _history[session_id] = []

    messages      = list(_history[session_id]) + [{'role': 'user', 'content': user_text}]
    final_text    = ''
    _total_in_tok = 0
    _total_out_tok = 0

    try:
        for _ in range(MAX_TOOL_ITER):
            text, tool_calls, is_done, in_tok, out_tok = call_fn(model, system, messages)
            _total_in_tok  += in_tok
            _total_out_tok += out_tok
            log_api_cost(session_id, 'Harv', model, in_tok, out_tok, task_type='conversation')

            if is_done or not tool_calls:
                final_text = text
                break

            # Record assistant turn in Anthropic format (works for both — openrouter converts it)
            assistant_content = []
            if text:
                assistant_content.append({'type': 'text', 'text': text})
            for tc in tool_calls:
                assistant_content.append({
                    'type': 'tool_use', 'id': tc['id'],
                    'name': tc['name'], 'input': tc['input'],
                })
            messages.append({'role': 'assistant', 'content': assistant_content})

            # Execute tools
            tool_results = []
            for tc in tool_calls:
                log.info(f"Tool call: {tc['name']} {json.dumps(tc['input'])[:120]}")
                handler = TOOL_HANDLERS.get(tc['name'])
                try:
                    result = handler(tc['input']) if handler else f"Unknown tool: {tc['name']}"
                except Exception as e:
                    result = f'Tool error: {e}'
                log.info(f'Tool result: {str(result)[:120]}')
                tool_results.append({
                    'type': 'tool_result', 'tool_use_id': tc['id'], 'content': result,
                })
            messages.append({'role': 'user', 'content': tool_results})

        else:
            final_text = final_text or '[Max tool iterations reached]'

        # Persist plain text history (provider-agnostic — works for any future provider)
        _history[session_id].append({'role': 'user',      'content': user_text})
        _history[session_id].append({'role': 'assistant', 'content': final_text})

        if len(_history[session_id]) > MAX_HISTORY:
            _history[session_id] = _history[session_id][-MAX_HISTORY:]

    finally:
        # Always update Ledger — even if call_fn() or a tool raises.
        _call_ledger_for_harv(user_text, calc_cost(model, _total_in_tok, _total_out_tok))

    # Persist to Supabase (non-blocking)
    threading.Thread(
        target=_save_to_supabase,
        args=(session_id, user_text, final_text),
        daemon=True,
    ).start()

    return final_text


def clear_history(session_id: str) -> None:
    _history.pop(session_id, None)


def run_router_manual() -> dict:
    pending = _ts_get_pending()
    if not pending:
        return {'n_pending': 0, 'processed': 0, 'still_pending': 0, 'task_ids': []}
    task_ids = [t['task_id'] for t in pending]
    counts   = _run_router()
    return {'n_pending': len(pending), 'task_ids': task_ids, **counts}
