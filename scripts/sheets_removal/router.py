"""
router.py — Harv core loop.

Cycle:
  1. Load core.json
  2. Authenticate with Google
  3. Read pending tasks from Mission Control (Tasks sheet)
  4. For each task (sorted by priority, up to max_per_run):
       a. If no agent specified, call Qwen via OpenRouter to pick one
       b. Mark task in_progress
       c. Dispatch to the named agent module
       d. Write output + final status (completed / failed)
  5. Update Dashboard stats
  6. Append summary log entry

Usage:
  python3 /root/harv/agents/router.py
  python3 /root/harv/agents/router.py --dry-run
  python3 /root/harv/agents/router.py --test "help me plan a workout"
"""

import importlib.util
import os
import sys
import argparse

sys.path.insert(0, '/root/harv')

# Load .env so OPENROUTER_API_KEY and other secrets are available
_ENV = '/root/harv/.env'
if os.path.exists(_ENV):
    with open(_ENV) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip())

from lib.harv_lib import (
    load_core,
    setup_file_logger,
    log_api_cost,
    calc_cost,
)

# ---------------------------------------------------------------------------
# SQLite task store (primary queue; Sheets remains secondary/fallback)
# ---------------------------------------------------------------------------
try:
    from lib.task_store import (
        get_pending as _ts_get_pending,
        update_task as _ts_update_task,
        complete_task as _ts_complete_task,
        fail_task as _ts_fail_task,
    )
    _TASK_STORE_OK = True
except Exception as _ts_err:
    import logging as _ts_log
    _ts_log.getLogger('Router').warning(f'task_store unavailable: {_ts_err}')
    _TASK_STORE_OK = False

AGENT_NAME   = 'Router'
ROUTER_MODEL = 'qwen/qwen3-8b'   # override via core.json router.model
LEDGER_PATH  = '/root/harv/agents/ledger.py'

# ---------------------------------------------------------------------------
# Routing data — built dynamically from agent_registry.json
# Falls back to hardcoded list if registry is unavailable.
# ---------------------------------------------------------------------------
_ROUTING_FALLBACK = [
    ('Harv',       'General conversation, greetings, small talk, unclear requests, multi-purpose questions that dont fit other agents'),
    ('Journal',    'Memory recall, what did we talk about, remember, session history, log a thought, save a note, reflect on past conversations'),
    ('Scheduler',  'Calendar, schedule, reminders, appointments, meetings, am I free, time management, cancel appointment'),
    ('Email',      'Gmail, email, inbox, unread, send email, draft reply, archive emails, newsletters, mail'),
    ('Fitness',    'Workouts, exercise, gym, running, lifting, health metrics, training plans, Garmin, reps, sets'),
    ('Finance',    'Bank account, transactions, spending, expenses, budget tracking, Plaid, financial reports, bills'),
    ('Learning',   'Teach me, explain, quiz me, flashcards, study, tutor, learn about, education, courses, exam prep, what is the difference between, how does X work'),
    ('Travel',     'Trips, flights, hotels, itineraries, vacation, getaway, travel planning, destinations, how much to visit, weekend trip, booking'),
    ('Shopping',   'Shopping list, buy, purchase, groceries, product deals, price compare for products to buy'),
    ('Research',   'Web search, latest news, headlines, fact-check, look up, current events, search the web, research report, find information online'),
    ('Sports',     'Scores, standings, game schedules, NFL, NBA, MLB, sports news, injury reports, game recaps'),
    ('Music',      'Spotify, play music, playlist, song recommendations, music search, listening history'),
    ('Trading',    'Prediction markets, Polymarket, Kalshi, crypto, BTC, paper trading, wallet tracking'),
    ('Video Digest', 'Video summary, transcript, digest a video, summarize video, TikTok video, act on video section, video URL'),
    ('Auto Marketing', 'Draft tweet, social media post, content strategy, Instagram post, Reddit post, marketing campaign, blog post, content creation'),
    ('Drive',      'Google Drive, upload file, download file, list files, read document, write document, file management, folder, Drive operations'),
    ('Media Manager', 'Any media creation: generate image, create video, edit video, draw, illustrate, AI art, profile picture, banner, storyboard — routes to Image Gen, Video Gen, or Video Editor'),
    ('Image Gen',  'Generate image, draw, illustrate, create picture, AI art, profile picture, logo, visual design — NOT social media posts'),
    ('YouTube Digest', 'YouTube video URL, youtube.com link, youtu.be link, YouTube transcript, YouTube summary'),
]


def _get_routing_agents():
    """
    Build routing list from agent_registry.json.
    Includes agents+tools that have routing_intents defined.
    Falls back to _ROUTING_FALLBACK if registry load fails.
    """
    try:
        from lib.harv_lib import load_agent_registry
        reg = load_agent_registry()
        all_entries = reg.get('agents', []) + reg.get('tools', [])
        result = []
        for entry in all_entries:
            if not entry.get('routing_intents'):
                continue
            name  = entry['name']
            desc  = entry.get('description', '')
            hints = ', '.join(entry['routing_intents'][:8])
            result.append((name, f'{desc} | triggers: {hints}'))
        return result if result else _ROUTING_FALLBACK
    except Exception:
        return _ROUTING_FALLBACK


def _get_known_agents():
    """
    Return set of all lowercase agent names from the registry.
    Includes agents, tools, and background processes.
    Falls back to names in _ROUTING_FALLBACK if registry load fails.
    """
    try:
        from lib.harv_lib import load_agent_registry
        reg = load_agent_registry()
        all_entries = (reg.get('agents', []) +
                       reg.get('tools', []) +
                       reg.get('background', []))
        return {e['name'].lower() for e in all_entries}
    except Exception:
        return {n.lower() for n, _ in _ROUTING_FALLBACK}


# Module-level sets — built once at import, valid for process lifetime.
# Re-read by calling _get_routing_agents() / _get_known_agents() directly.
ROUTING_AGENTS = _get_routing_agents()
KNOWN_AGENTS   = _get_known_agents()


def _routing_system_prompt():
    """Build system prompt from live registry data (called per-request)."""
    agents = _get_routing_agents()
    lines  = '\n'.join(f'- {name}: {desc}' for name, desc in agents)
    return (
        'Task router. Reply ONLY: AgentName|confidence (high/medium/low). '
        'Example: Fitness|high\n\nAgents:\n' + lines
    )


def _call_router_llm(task_description, core, log):
    """
    Ask Qwen via OpenRouter which agent should handle this task.
    Returns (agent_name: str, confidence: str, in_tokens: int, out_tokens: int).
    Falls back to ('Harv', 'unknown', 0, 0) on any error.
    """
    try:
        import openai
    except ImportError:
        log.warning('Router LLM: openai package not installed')
        return 'Harv', 'unknown', 0, 0

    model = core.get('router', {}).get('model', ROUTER_MODEL)
    cfg   = core['llm']['openrouter']

    try:
        client = openai.OpenAI(
            base_url=cfg['base_url'],
            api_key=os.environ.get('OPENROUTER_API_KEY', ''),
        )
        response = client.chat.completions.create(
            model=model,
            max_tokens=1500,  # Qwen3 uses ~400-600 tokens on reasoning; needs headroom for answer
            temperature=0.0,
            extra_body={'enable_thinking': False},
            messages=[
                {'role': 'system', 'content': _routing_system_prompt()},
                {'role': 'user',   'content': task_description},
            ],
        )
        # Qwen3 via OpenRouter exhausts max_tokens on reasoning leaving content=None.
        # Strategy: content first, then extract agent name from reasoning natural language.
        _msg     = response.choices[0].message
        _content = (_msg.content or '').strip()
        if not _content:
            _reasoning = (getattr(_msg, 'reasoning', None) or '').strip()
            # 1. Try structured pipe format in reasoning
            import re as _re
            _m = _re.search(r'([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)[|](high|medium|low)',
                            _reasoning)
            if _m:
                _content = f'{_m.group(1)}|{_m.group(2)}'
            elif _reasoning:
                # 2. Find the last-mentioned known agent name + infer confidence
                _tail     = _reasoning[-400:]
                _tail_low = _tail.lower()
                _known    = _get_known_agents()
                # Build multi-word aware search: longest match wins
                _found    = ''
                _found_pos = -1
                for _aname in sorted(_known, key=len, reverse=True):
                    _pos = _tail_low.rfind(_aname)
                    if _pos > _found_pos:
                        _found_pos = _pos
                        _found     = _aname
                if _found:
                    _conf = 'high' if any(
                        w in _tail_low for w in ('high confidence', 'clear fit', 'definitely', 'right choice')
                    ) else 'medium'
                    _content = f'{_found.title()}|{_conf}'
        raw = _content

        # Strip <think>...</think> blocks (Qwen3 extended-thinking mode)
        if '<think>' in raw:
            raw = raw.split('</think>')[-1].strip()

        # Parse agent_name|confidence — split on pipe
        confidence = 'unknown'
        if '|' in raw:
            parts     = raw.split('|', 1)
            agent_raw = parts[0].strip()
            conf_raw  = parts[1].strip().lower().split()[0].rstrip('.,;:') if parts[1].strip() else 'unknown'
            confidence = conf_raw if conf_raw in ('high', 'medium', 'low') else 'unknown'
        else:
            agent_raw = raw

        # Resolve agent name — try full string first, then first two words, then first word.
        # Alias map handles abbreviated names the LLM sometimes returns.
        _ALIASES = {
            'auto': 'Auto Marketing',
            'marketing': 'Auto Marketing',
            'automarketing': 'Auto Marketing',
            'video': 'Video Digest',
            'youtube': 'YouTube Digest',
            'social': 'Auto Marketing',
            'image': 'Image Gen',
            'imagegen': 'Image Gen',
            'image gen': 'Image Gen',
            'picture': 'Image Gen',
            'art': 'Image Gen',
            'draw': 'Image Gen',
            'imagen': 'Image Gen',
            'yt': 'YouTube Digest',
        }
        _known = _get_known_agents()
        _raw_clean = agent_raw.strip().rstrip('.,;:|') if agent_raw else ''
        _raw_lower = _raw_clean.lower()
        if _raw_lower in _known:
            agent_name = _raw_clean.title()
        elif ' '.join(_raw_lower.split()[:2]) in _known:
            agent_name = ' '.join(_raw_clean.split()[:2]).title()
        elif _raw_lower.split()[0] if _raw_lower else '' in _known:
            agent_name = _raw_lower.split()[0].title() if _raw_lower else 'Harv'
        elif _raw_lower in _ALIASES:
            agent_name = _ALIASES[_raw_lower]
        elif _raw_lower.split()[0] if _raw_lower else '' in _ALIASES:
            agent_name = _ALIASES[_raw_lower.split()[0]]
        else:
            agent_name = _raw_clean.split()[0].capitalize() if _raw_clean else 'Harv'

        if agent_name.lower() not in _known:
            log.warning(f'Router LLM returned unknown agent "{agent_name}" — falling back to Harv')
            agent_name = 'Harv'

        usage = response.usage
        in_t  = getattr(usage, 'prompt_tokens',     0) or 0
        out_t = getattr(usage, 'completion_tokens', 0) or 0

        log.info(f'Router LLM: "{task_description[:60]}" → {agent_name} [{confidence}] ({in_t}in/{out_t}out tok)')
        return agent_name, confidence, int(in_t), int(out_t)

    except Exception as e:
        log.warning(f'Router LLM call failed: {e}')
        return 'Harv', 'unknown', 0, 0


def _call_ledger(agent, status, last_task, cost, log):
    """Log agent status to events.db via event_bus. Never raises."""
    try:
        from lib.event_bus import event_bus
        event_bus.emit(
            agent=agent,
            action='status_update',
            status=status.lower().replace(' ', '_'),
            summary=last_task[:200] if last_task else status,
            cost=cost or 0.0,
        )
    except Exception as _e:
        if log:
            log.warning(f'Ledger call failed: {_e}')



# ---------------------------------------------------------------------------
# Routing Decisions logging (via event_bus, not Sheets)
# ---------------------------------------------------------------------------

def _log_routing_decision(task_description: str, agent_name: str, confidence: str, session_id: str):
    """Log routing decision to events.db. Fire-and-forget, never raises."""
    try:
        from lib.event_bus import event_bus
        from lib.harv_lib import now_est
        snippet = (task_description[:100] + '...') if len(task_description) > 100 else task_description
        event_bus.emit(
            agent='Router',
            action='routing_decision',
            status='success',
            summary=f'{agent_name} (conf={confidence}): {snippet}',
            metadata={'agent_selected': agent_name, 'confidence': confidence,
                      'session_id': session_id},
        )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Agent dispatch
# ---------------------------------------------------------------------------
def load_agent_module(module_rel_path):
    full_path = os.path.join('/root/harv', module_rel_path)
    if not os.path.exists(full_path):
        return None
    spec = importlib.util.spec_from_file_location('agent_module', full_path)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# Inter-agent message dispatch helpers
# ---------------------------------------------------------------------------

def _get_agent_instance(agent_name: str):
    """
    Return a BaseAgent-subclass instance for the given name, or None.
    Extend this registry as new agents are built.
    """
    try:
        name_lower = agent_name.strip().lower()

        # Registry: agent_name (lowercase) -> (module_path, class_name)
        _AGENT_REGISTRY = {
            'guardian':  ('agents/guardian.py',  'GuardianAgent'),
            'scribe':    ('agents/scribe.py',     'ScribeAgent'),
            'journal':   ('agents/journal.py',    'JournalAgent'),
            'drive':     ('agents/drive.py',      'DriveAgent'),
            'analytics': ('agents/analytics.py',  'AnalyticsAgent'),
            'health':    ('agents/health.py',      'HealthAgent'),
            'scheduler': ('agents/scheduler.py',  'SchedulerAgent'),
            'email':     ('agents/postman.py',    'EmailAgent'),
            'fitness':   ('agents/fitness.py',    'FitnessAgent'),
            'finance':   ('agents/finance.py',    'FinanceAgent'),
            'learning':  ('agents/learning.py',   'LearningAgent'),
            'travel':    ('agents/travel.py',     'TravelAgent'),
            'shopping':  ('agents/shopping.py',   'ShoppingAgent'),
            'research':  ('agents/research.py',   'ResearchAgent'),
            'sports':    ('agents/sports.py',     'SportsAgent'),
            'music':     ('agents/music.py',      'MusicAgent'),
            'trading':   ('agents/trading.py',    'TradingAgent'),
            'video digest': ('agents/video_digest.py', 'VideoDigestAgent'),
            'auto marketing': ('agents/auto_marketing.py', 'AutoMarketingAgent'),
            'image gen':      ('agents/image_gen.py',       'ImageGenAgent'),
            'youtube digest': ('agents/youtube_digest.py',  'YouTubeDigestAgent'),
        }

        if name_lower not in _AGENT_REGISTRY:
            return None

        module_rel, class_name = _AGENT_REGISTRY[name_lower]
        full_path = os.path.join('/root/harv', module_rel)
        if not os.path.exists(full_path):
            return None

        spec = importlib.util.spec_from_file_location(f'agent_{name_lower}', full_path)
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        cls = getattr(mod, class_name, None)
        if cls is None:
            return None

        return cls(agent_name)
    except Exception:
        return None


def _check_and_dispatch_messages(log) -> None:
    """
    Process any pending inter-agent messages after routing completes.
    Never raises -- any failure is logged and silently ignored.
    """
    try:
        from lib.message_queue import get_pending, dequeue, complete, fail

        pending = get_pending()
        if not pending:
            return

        log.info(f'Message queue: {len(pending)} pending message(s) to dispatch')
        processed = 0

        for pmsg in pending:
            to_agent = pmsg.get('to_agent', '')
            mid      = pmsg.get('message_id', '')
            action   = pmsg.get('action', '')

            msg = dequeue(to_agent)
            if msg is None:
                continue  # race condition -- another process took it

            agent_inst = _get_agent_instance(to_agent)
            if agent_inst is None:
                fail(mid, f'unknown agent: {to_agent}')
                log.warning(f'Message {mid}: unknown agent {to_agent!r} -- failed')
                continue

            try:
                result = agent_inst.process_message(msg)
                complete(mid, str(result) if result else 'ok')
                processed += 1
                log.info(f'Message {mid} ({action} -> {to_agent}): completed')
            except Exception as exc:
                fail(mid, str(exc))
                log.warning(f'Message {mid} ({action} -> {to_agent}): failed: {exc}')

        if processed:
            log.info(f'Message queue: dispatched {processed} message(s)')

    except Exception as exc:
        log.warning(f'_check_and_dispatch_messages failed (non-fatal): {exc}')


def find_agent_config(core, agent_name_field):
    name_lower = agent_name_field.strip().lower()
    for key, cfg in core['agents'].items():
        if cfg['name'].lower() == name_lower or key == name_lower:
            return key, cfg
    return None, None


def _strip_context_tags(text: str) -> str:
    """Remove [CONTEXT]...[/CONTEXT] and [PROJECT CONTEXT]...[END PROJECT CONTEXT] blocks."""
    import re
    text = re.sub(r'\[CONTEXT\][\s\S]*?\[/CONTEXT\]\s*', '', text)
    text = re.sub(r'\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*', '', text)
    return text.strip()


def dispatch(task, core, log, dry_run=False):
    """
    Route one task to its agent.
    Returns (status, output, notes, routed_agent, in_tok, out_tok).
    Uses LLM when task has no explicit agent field; code-routes otherwise.
    """
    # Strip context tags from task input before dispatching to any agent
    if task.get('input'):
        task['input'] = _strip_context_tags(task['input'])

    agent_field = (task.get('agent') or '').strip()
    in_tok, out_tok = 0, 0

    if not agent_field:
        # LLM routing — Qwen picks the agent
        task_desc  = (task.get('input') or '').strip() or 'No description provided'
        agent_field, confidence, in_tok, out_tok = _call_router_llm(task_desc, core, log)
        task['agent'] = agent_field
        _log_routing_decision(task_desc, agent_field, confidence, task.get('id') or 'unknown')

    agent_key, agent_cfg = find_agent_config(core, agent_field)
    if agent_cfg is None:
        return 'failed', '', f'Unknown agent: {agent_field}', agent_field, in_tok, out_tok

    module_path = agent_cfg.get('module', '')
    mod = load_agent_module(module_path)
    if mod is None:
        return 'skipped', '', f'Agent module not yet built: {module_path}', agent_field, in_tok, out_tok

    if not hasattr(mod, 'run'):
        return 'failed', '', f'Agent module {module_path} has no run() function', agent_field, in_tok, out_tok

    if dry_run:
        return 'skipped', '', f'Dry run — would dispatch to {agent_field}', agent_field, in_tok, out_tok

    try:
        result = mod.run(task['input'], task)
        output = str(result) if result is not None else ''
        return 'completed', output, '', agent_field, in_tok, out_tok
    except Exception as e:
        return 'failed', '', f'{type(e).__name__}: {e}', agent_field, in_tok, out_tok


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def run(dry_run=False):
    log  = setup_file_logger(AGENT_NAME)
    core = load_core()
    max_tasks    = core['tasks']['max_per_run']
    router_model = core.get('router', {}).get('model', ROUTER_MODEL)

    log.info(f'=== Harv Router starting (dry_run={dry_run}, model={router_model}) ===')

    if not _TASK_STORE_OK:
        log.error('task_store unavailable — cannot process tasks')
        return

    # --- Task queue: SQLite only ---
    try:
        sqlite_tasks = _ts_get_pending()
        tasks = []
        for _t in sqlite_tasks:
            tasks.append({
                'id':        _t['task_id'],
                'created':   _t.get('created_at', ''),
                'agent':     (_t.get('assigned_agent') or '').strip(),
                'priority':  (_t.get('priority') or 'normal').strip().lower(),
                'status':    _t.get('status', 'pending'),
                'input':     _t.get('description', ''),
                'output':    _t.get('result', ''),
                'notes':     '',
            })
        log.info(f'task_store: {len(tasks)} pending task(s) from SQLite')
    except Exception as _ts_exc:
        log.error(f'Failed to read task_store: {_ts_exc}')
        return

    log.info(f'Pending tasks found: {len(tasks)} (will process up to {max_tasks})')

    if not tasks:
        log.info('No pending tasks.')
        _call_ledger('Router', 'Active', 'No pending tasks', 0.0, log)
        return

    batch             = tasks[:max_tasks]
    completed         = 0
    failed            = 0
    skipped           = 0
    total_router_cost = 0.0
    total_in_tok      = 0
    total_out_tok     = 0

    for task in batch:
        tid = task['id']
        log.info(f"Task {tid} | agent={task['agent'] or '(unrouted)'} | priority={task['priority']}")

        if not dry_run:
            try:
                _ts_update_task(task['id'], status='in_progress', assigned_agent=task.get('agent') or None)
            except Exception as _sq_e:
                log.warning(f'SQLite mark in_progress failed for {tid}: {_sq_e}')

        status, output, notes, routed_agent, in_tok, out_tok = dispatch(
            task, core, log, dry_run=dry_run
        )
        log.info(f'Task {tid} → {routed_agent} → {status}' + (f' | {notes}' if notes else ''))

        # Log Router's LLM cost per task
        if in_tok > 0 or out_tok > 0:
            task_cost          = calc_cost(router_model, in_tok, out_tok)
            total_router_cost += task_cost
            total_in_tok      += in_tok
            total_out_tok     += out_tok
            log_api_cost(tid, 'Router', router_model, in_tok, out_tok,
                         task_type=f'route\u2192{routed_agent}')

        if not dry_run:
            try:
                if status == 'completed':
                    _ts_complete_task(task['id'], output or notes or '')
                elif status == 'failed':
                    _ts_fail_task(task['id'], notes or output or 'unknown error')
                else:
                    _ts_update_task(task['id'], status=status)
            except Exception as _sq_e:
                log.warning(f'SQLite final write failed for {tid}: {_sq_e}')

        _call_ledger(
            routed_agent,
            'Active' if status == 'completed' else 'Error',
            f'Task {tid}: {(task.get("input") or "")[:80]}',
            0.0, log,
        )

        if status == 'completed':
            completed += 1
        elif status == 'failed':
            failed += 1
        else:
            skipped += 1

    summary = (
        f'Processed {len(batch)} tasks: {completed} completed, '
        f'{failed} failed, {skipped} skipped'
    )
    if total_router_cost > 0:
        summary += f' | router ${total_router_cost:.6f} ({total_in_tok}in/{total_out_tok}out tok)'
    log.info(summary)

    avg_cost = total_router_cost / max(1, len(batch))
    _call_ledger('Router', 'Active', summary, avg_cost, log)

    # Process any queued inter-agent messages that accumulated during this run
    _check_and_dispatch_messages(log)

    log.info('=== Harv Router done ===')


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Harv Router — LLM-powered task dispatcher')
    parser.add_argument('--dry-run', action='store_true',
                        help='Read tasks and log dispatch without executing or writing results')
    parser.add_argument('--test', metavar='TASK',
                        help='Test LLM routing for a task description (no Sheets I/O)')
    args = parser.parse_args()

    if args.test:
        import logging
        _log = logging.getLogger('Router')
        _log.addHandler(logging.StreamHandler())
        _log.setLevel(logging.INFO)
        _core = load_core()
        _model = _core.get('router', {}).get('model', ROUTER_MODEL)
        agent, confidence, in_t, out_t = _call_router_llm(args.test, _core, _log)
        cost = calc_cost(_model, in_t, out_t)
        print(f'\nTask:       "{args.test}"')
        print(f'Agent:      {agent}')
        print(f'Confidence: {confidence}')
        print(f'Tokens:     {in_t} in / {out_t} out')
        print(f'Cost:       ${cost:.6f}')
        _log_routing_decision(args.test, agent, confidence, '--test')
        print('Logged to events.db.')
    else:
        run(dry_run=args.dry_run)
