"""
harv_lib.py — shared utilities for all Harv agents.

Provides:
  - load_core()           load and return core.json
  - load_creds()          return refreshed Google Credentials
  - sheets_client()       authenticated Sheets API client
  - gmail_client()        authenticated Gmail API client
  - read_sheet()          return all rows from a named sheet
  - get_pending_tasks()   return pending task rows with metadata
  - update_task_row()     write status/output back to a task row
  - append_log()          append one row to the Logs sheet
  - update_dashboard()    write key stats to the Dashboard sheet
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone, timedelta

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CORE_PATH = '/root/harv/core.json'

TASK_COLS = {
    'id':       0,
    'created':  1,
    'agent':    2,
    'priority': 3,
    'status':   4,
    'input':    5,
    'output':   6,
    'notes':    7,
}
PRIORITY_ORDER = {'critical': 0, 'high': 1, 'normal': 2, 'low': 3}

# ---------------------------------------------------------------------------
# Core config
# ---------------------------------------------------------------------------
_core_cache = None

def load_core():
    global _core_cache
    if _core_cache is None:
        with open(CORE_PATH) as f:
            _core_cache = json.load(f)
    return _core_cache


# ---------------------------------------------------------------------------
# Google auth
# ---------------------------------------------------------------------------
def load_creds():
    """Load credentials from token file, refresh if expired, save if refreshed."""
    core = load_core()
    token_path = core['paths']['google_token']

    with open(token_path) as f:
        t = json.load(f)

    creds = Credentials(
        token=t['token'],
        refresh_token=t['refresh_token'],
        token_uri=t['token_uri'],
        client_id=t['client_id'],
        client_secret=t['client_secret'],
        scopes=t['scopes'],
    )

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        # Persist refreshed token
        t['token'] = creds.token
        with open(token_path, 'w') as f:
            json.dump(t, f, indent=2)

    return creds


def sheets_client():
    """DEPRECATED: Google Sheets removed. Raises if called."""
    raise RuntimeError('Google Sheets has been removed. Use SQLite/event_bus instead.')


def gmail_client():
    return build('gmail', 'v1', credentials=load_creds())


# ---------------------------------------------------------------------------
# Timestamp
# ---------------------------------------------------------------------------
# Fixed UTC-4 offset — always labelled EST regardless of daylight saving time.
TZ_EST = timezone(timedelta(hours=-4))


def now_est():
    """Current time as fixed UTC-4, formatted for Mission Control sheets.
    Format: 2026-03-15 4:12 PM EST
    """
    return datetime.now(TZ_EST).strftime('%Y-%m-%d %-I:%M %p EST')


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
def _now_str():
    return now_est()


def append_log(client, agent, level, event, details=''):
    """DEPRECATED: Sheets removed. Logs go to file logger + event_bus now."""
    pass


def setup_file_logger(agent_name):
    """Return a stdlib logger that writes to harv/logs/harv_YYYY-MM-DD.log."""
    core = load_core()
    log_dir = core['paths']['logs']
    os.makedirs(log_dir, exist_ok=True)
    filename = datetime.now().strftime('harv_%Y-%m-%d.log')
    log_path = os.path.join(log_dir, filename)

    logger = logging.getLogger(agent_name)
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)
        fh = logging.FileHandler(log_path)
        fh.setFormatter(logging.Formatter('%(asctime)s [%(name)s] %(levelname)s %(message)s'))
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(logging.Formatter('[%(name)s] %(levelname)s %(message)s'))
        logger.addHandler(fh)
        logger.addHandler(sh)
    return logger


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
def update_dashboard(client=None, status=None, last_heartbeat=None,
                     active_agents=None, tasks_pending=None,
                     completed_today=None, errors_today=None):
    """DEPRECATED: Sheets dashboard removed. Dashboard reads from events.db now."""
    pass


# ---------------------------------------------------------------------------
# API Cost Tracker
# ---------------------------------------------------------------------------
# Pricing per million tokens (as of 2026-03). Update as rates change.
_MODEL_PRICING = {
    'claude-sonnet-4-6':         {'input': 3.00,  'output': 15.00},
    'claude-opus-4-6':           {'input': 15.00, 'output': 75.00},
    'claude-haiku-4-5-20251001': {'input': 0.80,  'output':  4.00},
    'claude-haiku-4-5':          {'input': 0.80,  'output':  4.00},
    'claude-3-5-haiku-20241022': {'input': 0.80,  'output':  4.00},
    'minimax/minimax-m2.1':      {'input': 0.27,  'output':  0.95},
    'minimax/minimax-m2':        {'input': 0.255, 'output':  1.00},
    'deepseek/deepseek-chat':    {'input': 0.32,  'output':  0.89},
    'deepseek/deepseek-chat-v3-0324': {'input': 0.20, 'output': 0.77},
    'qwen/qwen3-8b':                  {'input': 0.04, 'output': 0.09},
    'qwen/qwen3-14b':                 {'input': 0.08, 'output': 0.23},
}


def calc_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Return cost in USD for a single API call."""
    key = model.lower().strip()
    pricing = _MODEL_PRICING.get(key)
    if pricing is None:
        for k, v in _MODEL_PRICING.items():
            if key.startswith(k):
                pricing = v
                break
    if pricing is None:
        return 0.0   # unknown model / local Ollama
    cost = (input_tokens * pricing['input'] + output_tokens * pricing['output']) / 1_000_000
    return round(cost, 8)


def log_api_cost(session_id: str, agent: str, model: str,
                 input_tokens: int, output_tokens: int, task_type: str = '') -> None:
    """
    Log API cost to events.db via event_bus.
    Silent-fail: never raises — cost logging must not break the calling agent.
    """
    try:
        from lib.event_bus import event_bus
        cost = calc_cost(model, int(input_tokens or 0), int(output_tokens or 0))
        tokens = int(input_tokens or 0) + int(output_tokens or 0)
        event_bus.emit(
            agent=agent,
            action='api_cost',
            status='success',
            summary=f'{model} | {tokens} tokens | ${cost:.6f}',
            cost=cost,
            tokens=tokens,
            metadata={'session_id': session_id, 'model': model,
                      'input_tokens': int(input_tokens or 0),
                      'output_tokens': int(output_tokens or 0),
                      'task_type': task_type},
        )
    except Exception:
        pass  # cost logging must never break the calling agent



# ---------------------------------------------------------------------------
# Agent Registry
# ---------------------------------------------------------------------------
_REGISTRY_PATH = '/root/harv/config/agent_registry.json'
_registry_cache: dict = {'data': None, 'mtime': 0.0}


def load_agent_registry() -> dict:
    """
    Load and return agent_registry.json.

    Uses mtime-based cache invalidation: re-reads from disk only when the
    file has been modified since last load. Thread-safe for single-process use.

    Returns {'agents': [...], 'tools': [...], 'background': [...]} or
    empty equivalent on any error.
    """
    try:
        mtime = os.path.getmtime(_REGISTRY_PATH)
        if _registry_cache['data'] is None or mtime > _registry_cache['mtime']:
            with open(_REGISTRY_PATH, encoding='utf-8') as _fh:
                _registry_cache['data'] = json.load(_fh)
            _registry_cache['mtime'] = mtime
        return _registry_cache['data']
    except Exception:
        return {'agents': [], 'tools': [], 'background': []}

# ---------------------------------------------------------------------------
# Agent Response Contract
# ---------------------------------------------------------------------------
from dataclasses import dataclass, field, asdict as _asdict
from typing import Any as _Any

_VALID_STATUSES = frozenset({'success', 'error', 'partial', 'skipped'})


@dataclass
class AgentResponse:
    """
    Standard return type for all agent execute() calls.

    Callers that previously expected a plain string still work because
    __str__ returns result_text (backwards-compatible shim).

    Usage:
        return AgentResponse.success("Done!", cost=0.0012, tokens_used=450)
        return AgentResponse.error("API timeout")
    """
    status: str                              # success | error | partial | skipped
    result_text: str                         # human-readable result for the user
    cost: float                = 0.0         # total API cost in USD
    tokens_used: int           = 0           # total tokens consumed
    agent_name: str            = ''          # filled automatically by BaseAgent
    domain_updates: _Any       = None        # dict: key-value pairs to merge into domain slice
    follow_up_tasks: _Any      = None        # list of task dicts for other agents
    entities_extracted: _Any   = None        # list of entities found during execution
    duration_seconds: float    = 0.0         # wall-clock time, filled by BaseAgent.execute()
    metadata: _Any             = None        # agent-specific extras (email_id, event_id, …)

    def __post_init__(self) -> None:
        if self.status not in _VALID_STATUSES:
            raise ValueError(
                f'AgentResponse.status must be one of {sorted(_VALID_STATUSES)}, '
                f'got {self.status!r}'
            )

    def __str__(self) -> str:
        """Backwards-compatible: callers expecting a plain string get result_text."""
        return self.result_text

    # ------------------------------------------------------------------
    # Convenience constructors
    # ------------------------------------------------------------------

    @classmethod
    def success(cls, text: str, **kwargs) -> 'AgentResponse':
        return cls(status='success', result_text=text, **kwargs)

    @classmethod
    def error(cls, text: str, **kwargs) -> 'AgentResponse':
        return cls(status='error', result_text=text, **kwargs)

    @classmethod
    def partial(cls, text: str, **kwargs) -> 'AgentResponse':
        return cls(status='partial', result_text=text, **kwargs)

    @classmethod
    def skipped(cls, text: str, **kwargs) -> 'AgentResponse':
        return cls(status='skipped', result_text=text, **kwargs)

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        """Return a dict with None values stripped."""
        return {k: v for k, v in _asdict(self).items() if v is not None}
