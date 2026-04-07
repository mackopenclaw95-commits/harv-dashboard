"""
base_agent.py -- Base class for all Harv domain agents.

# Supported providers: anthropic, openrouter, ollama, gemini

Every future agent inherits BaseAgent and implements one method: run(self, task).
The base class handles all boilerplate:
  - .env and core.json loading
  - Circuit-breaker-aware LLM calls (Anthropic / OpenRouter / Ollama)
  - Automatic API cost logging to events.db
  - Ledger updates via event_bus (status, last task)
  - Structured error logging to errors.log

Usage:
    class MyAgent(BaseAgent):
        def run(self, task):
            reply = self.call_llm([{'role': 'user', 'content': task}])
            return reply

    result = MyAgent('MyAgent', provider='anthropic').execute('do something')
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

sys.path.insert(0, '/root/harv')

from lib.harv_errors import (
    CircuitBreakerOpen,
    get_circuit_status,
    log_error,
    safe_api_call,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_CORE_PATH = '/root/harv/core.json'
_ENV_PATH  = '/root/harv/.env'
_OLLAMA_URL = 'http://172.17.0.1:11434'
_GEMINI_KEY_PATH = '/root/harv/credentials/gemini_key.json'

# ---------------------------------------------------------------------------
# Mission block -- injected into every agent's system context automatically
# ---------------------------------------------------------------------------
MISSION_BLOCK = "You are part of the Harv agent system.\nMission: Build and continuously improve Harv, and perform all tasks in service of Mack's goal: a powerful, fully automated, profitable AI business.\nPrinciples: Automate over manual. Cost efficiency first. Perfection over speed.\nDirective: Every task you perform should move Mack closer to building and scaling a profitable AI business. Act with that end goal in mind."



# ===========================================================================
class BaseAgent:
    """
    Abstract base for all Harv agents.

    Subclasses MUST implement:
        def run(self, task: str) -> str

    Subclasses SHOULD call via:
        result = agent.execute(task)   # handles ledger updates + error wrapping
    """

    def __init__(self, agent_name: str, provider: Optional[str] = None):
        """
        agent_name : human label used in logs and Ledger (e.g. 'Scheduler')
        provider   : 'anthropic' | 'openrouter' | 'ollama' | 'gemini' | None
                     None means this agent makes no LLM calls.
        """
        self.agent_name = agent_name
        self.provider   = provider

        # Expose harv_errors utilities as instance attributes so subclasses
        # can call self.safe_api_call(...) without extra imports.
        self.safe_api_call      = safe_api_call
        self.log_error          = log_error
        self.get_circuit_status = get_circuit_status

        # Internal state -- populated by _setup()
        self._core             = {}
        self._service          = None        # DEPRECATED: was Sheets client, kept as None for compat
        self.domain            = None        # domain slice dict, loaded in _setup()
        self._google_services  = None        # GoogleServices instance, lazy via self.google
        self._http_client      = None        # HTTPClient instance, lazy via self.http

        # Backward compat: agents that still call self.safe_sheets_*
        self.safe_sheets_write  = lambda *a, **kw: None
        self.safe_sheets_read   = lambda *a, **kw: {'values': []}

        # Health tracking state
        self._started_at: datetime = datetime.now(ZoneInfo('America/New_York'))
        self._last_execution: Optional[datetime] = None
        self._last_error: Optional[dict] = None   # {"timestamp": str, "message": str}
        self._error_log: list = []  # list of {"timestamp": datetime, "message": str}

        self._setup()

    # ------------------------------------------------------------------
    # Setup (called once during __init__)
    # ------------------------------------------------------------------

    def _setup(self) -> None:
        """Load config and build API clients. Each step fails independently."""

        # 1. Load .env into os.environ (override=False keeps existing env vars)
        try:
            from dotenv import load_dotenv
            load_dotenv(_ENV_PATH, override=False)
        except ImportError:
            # dotenv not installed -- fall back to manual parse
            self._load_env_manual()
        except Exception as exc:
            log_error(self.agent_name, f'_setup: .env load failed: {exc}', level='WARNING')

        # 2. Load core.json
        try:
            with open(_CORE_PATH) as fh:
                self._core = json.load(fh)
        except Exception as exc:
            log_error(self.agent_name, f'_setup: core.json load failed: {exc}')

        # 3. Load domain slice (None if no slice exists for this agent -- not an error)
        self.domain = self._load_domain()

    def _load_domain(self) -> 'dict | None':
        """
        Load this agent's domain slice from disk (or Drive if local missing).
        Returns None silently if no slice exists -- never raises.
        """
        try:
            from lib.domain_manager import DomainSliceManager
            return DomainSliceManager().read_slice(self.agent_name)
        except Exception as exc:
            log_error(self.agent_name, f'_load_domain: {exc}', level='WARNING')
            return None

    def save_domain(self, updates: dict) -> None:
        """
        Merge updates into this agent's domain slice and sync to Drive.
        Creates the slice if it does not yet exist.
        Silent-fail: never raises -- domain errors must not break the agent.
        """
        try:
            from lib.domain_manager import DomainSliceManager
            dm = DomainSliceManager()
            if dm.read_slice(self.agent_name) is None:
                dm.create_slice(self.agent_name, updates)
            else:
                dm.update_slice(self.agent_name, updates)
            dm.sync_to_drive(self.agent_name)
            # Refresh the cached domain attribute
            self.domain = dm.read_slice(self.agent_name)
        except Exception as exc:
            log_error(self.agent_name, f'save_domain: {exc}', level='WARNING')

    @property
    def google(self) -> 'GoogleServices':
        """
        Lazy accessor for the shared Google API layer (Calendar, Gmail, Drive, Sheets).
        Client objects inside GoogleServices are themselves lazy -- no network call
        until a specific method (get_events, send_email, etc.) is invoked.

        Usage in subclasses:
            events = self.google.get_events(days_ahead=3)
            count  = self.google.get_unread_count()
        """
        if self._google_services is None:
            from lib.google_services import GoogleServices
            self._google_services = GoogleServices()
        return self._google_services

    @property
    def http(self) -> 'HTTPClient':
        """
        Lazy-loaded HTTPClient with caching, rate limiting, and retry.

        Usage in subclasses:
            result = self.http.get('https://api.example.com/data')
            result = self.http.post('https://api.example.com/item', json={...})
        """
        if self._http_client is None:
            from lib.http_client import HTTPClient
            self._http_client = HTTPClient()
        return self._http_client

    def _load_env_manual(self) -> None:
        """Minimal .env parser used if python-dotenv is unavailable."""
        try:
            with open(_ENV_PATH) as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    key, val = line.split('=', 1)
                    os.environ.setdefault(key.strip(), val.strip())
        except Exception as exc:
            log_error(self.agent_name, f'_load_env_manual: {exc}', level='WARNING')

    # ------------------------------------------------------------------
    # Sheet wrappers (DEPRECATED — Google Sheets removed, stubs kept for compat)
    # ------------------------------------------------------------------

    def read_sheet(self, range_name: str) -> list:
        """DEPRECATED: Sheets removed. Returns empty list."""
        log_error(self.agent_name,
                  f'read_sheet({range_name}): Sheets removed — use SQLite/event_bus',
                  level='WARNING')
        return []

    def write_sheet(self, range_name: str, values: list) -> bool:
        """DEPRECATED: Sheets removed. Returns False."""
        log_error(self.agent_name,
                  f'write_sheet({range_name}): Sheets removed — use SQLite/event_bus',
                  level='WARNING')
        return False

    # ------------------------------------------------------------------
    # LLM caller
    # ------------------------------------------------------------------

    def call_llm(
        self,
        messages: list,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
    ) -> str:
        """
        Call the configured LLM and return response text.

        messages: list of {'role': 'user'|'assistant', 'content': str}
        model:    override the default model for this call
        Automatically logs cost to the Mission Control Cost Tracker.
        Raises RuntimeError if provider is None.
        Raises CircuitBreakerOpen if the provider's circuit is tripped.
        """
        if self.provider is None:
            raise RuntimeError(
                f'{self.agent_name}: call_llm() called but provider=None. '
                'Set a provider in __init__ to enable LLM calls.'
            )

        dispatch = {
            'anthropic':  self._call_anthropic,
            'openrouter': self._call_openrouter,
            'ollama':     self._call_ollama,
            'gemini':     self._call_gemini,
        }
        handler = dispatch.get(self.provider)
        if handler is None:
            raise ValueError(
                f'{self.agent_name}: unknown provider "{self.provider}". '
                'Valid values: anthropic, openrouter, ollama, gemini.'
            )
        return handler(messages, model, temperature, max_tokens)

    def _resolve_model(self, model: Optional[str], fallback: str) -> str:
        """Return caller-supplied model, else core.json agent config, else fallback."""
        if model:
            return model
        return (
            self._core
            .get('agents', {})
            .get(self.agent_name.lower(), {})
            .get('model', fallback)
        )

    def _call_anthropic(self, messages, model, temperature, max_tokens) -> str:
        import anthropic

        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        if not api_key:
            raise RuntimeError('ANTHROPIC_API_KEY not set')

        resolved = self._resolve_model(model, 'claude-haiku-4-5-20251001')
        client   = anthropic.Anthropic(api_key=api_key)

        def _call():
            return client.messages.create(
                model=resolved,
                max_tokens=max_tokens,
                temperature=temperature,
                system=MISSION_BLOCK,
                messages=messages,
            )

        resp = safe_api_call(_call, provider='anthropic')
        text = resp.content[0].text if resp.content else ''
        self._log_cost(resolved, resp.usage.input_tokens, resp.usage.output_tokens)
        return text

    def _call_openrouter(self, messages, model, temperature, max_tokens) -> str:
        import openai as _openai

        api_key  = os.environ.get('OPENROUTER_API_KEY', '')
        if not api_key:
            raise RuntimeError('OPENROUTER_API_KEY not set')

        base_url = (
            self._core.get('llm', {})
                      .get('openrouter', {})
                      .get('base_url', 'https://openrouter.ai/api/v1')
        )
        resolved = self._resolve_model(model, 'minimax/minimax-m2.1')
        client   = _openai.OpenAI(api_key=api_key, base_url=base_url)

        _msgs = [{'role': 'system', 'content': MISSION_BLOCK}] + messages
        def _call():
            return client.chat.completions.create(
                model=resolved,
                messages=_msgs,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        resp   = safe_api_call(_call, provider='openrouter')
        text   = resp.choices[0].message.content if resp.choices else ''
        usage  = resp.usage or type('U', (), {'prompt_tokens': 0, 'completion_tokens': 0})()
        self._log_cost(
            resolved,
            getattr(usage, 'prompt_tokens', 0),
            getattr(usage, 'completion_tokens', 0),
        )
        return text

    def _call_ollama(self, messages, model, temperature, max_tokens) -> str:
        import requests as _req

        resolved = self._resolve_model(
            model,
            self._core.get('llm', {}).get('default_model', 'qwen2.5:0.5b'),
        )

        _msgs = [{'role': 'system', 'content': MISSION_BLOCK}] + messages
        def _call():
            r = _req.post(
                f'{_OLLAMA_URL}/api/chat',
                json={
                    'model':   resolved,
                    'messages': _msgs,
                    'stream':  False,
                    'options': {
                        'temperature': temperature,
                        'num_predict': max_tokens,
                    },
                },
                timeout=60,
            )
            r.raise_for_status()
            return r.json()

        data = safe_api_call(_call, provider='ollama')
        text = (data.get('message') or {}).get('content', '')

        # Ollama token field names differ from OpenAI
        self._log_cost(
            f'ollama/{resolved}',
            data.get('prompt_eval_count', 0),
            data.get('eval_count', 0),
        )
        return text


    def _call_gemini(self, messages, model, temperature, max_tokens) -> str:
        from google import genai
        from google.genai import types

        # Load API key
        api_key = os.environ.get('GEMINI_API_KEY', '')
        if not api_key:
            try:
                with open(_GEMINI_KEY_PATH) as f:
                    api_key = json.load(f).get('api_key', '')
            except Exception:
                pass
        if not api_key:
            raise RuntimeError('GEMINI_API_KEY not set and credentials/gemini_key.json not found')

        resolved = self._resolve_model(model, 'gemini-2.5-flash')
        client = genai.Client(api_key=api_key)

        # Extract system prompt from MISSION_BLOCK and user message from messages
        system_instruction = MISSION_BLOCK
        user_parts = []
        for msg in messages:
            if msg.get('role') == 'system':
                system_instruction = msg['content']
            else:
                user_parts.append(msg.get('content', ''))
        user_text = '\n'.join(user_parts) if user_parts else ''

        def _call():
            return client.models.generate_content(
                model=resolved,
                contents=user_text,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                ),
            )

        resp = safe_api_call(_call, provider='gemini')
        text = resp.text or ''

        # Log cost (Gemini free tier = $0.00, paid tier has its own rates)
        in_tok = getattr(resp.usage_metadata, 'prompt_token_count', 0) or 0
        out_tok = getattr(resp.usage_metadata, 'candidates_token_count', 0) or 0
        self._log_cost(resolved, in_tok, out_tok)
        return text

    def _log_cost(self, model: str, input_tokens: int, output_tokens: int) -> None:
        """Append one row to the Cost Tracker sheet and accumulate per-execution totals."""
        try:
            from lib.harv_lib import log_api_cost, calc_cost
            session_id = f'{self.agent_name}-{int(time.time())}'
            log_api_cost(session_id, self.agent_name, model,
                         int(input_tokens or 0), int(output_tokens or 0))
            # Accumulate for AgentResponse auto-fill
            self._exec_cost   = getattr(self, '_exec_cost', 0.0) + calc_cost(
                model, int(input_tokens or 0), int(output_tokens or 0))
            self._exec_tokens = getattr(self, '_exec_tokens', 0) + int(input_tokens or 0) + int(output_tokens or 0)
        except Exception as exc:
            log_error(self.agent_name, f'_log_cost: {exc}', level='WARNING')

    # ------------------------------------------------------------------
    # Ledger
    # ------------------------------------------------------------------

    def update_ledger(self, status: str, last_task: str = '') -> None:
        """
        Log agent status update to events.db via event_bus.
        Silent-fail: never raises.
        """
        try:
            from lib.event_bus import event_bus
            event_bus.emit(
                agent=self.agent_name,
                action='status_update',
                status=status.lower().replace(' ', '_'),
                summary=last_task[:200] if last_task else status,
            )
        except Exception as exc:
            log_error(self.agent_name, f'update_ledger({status!r}): {exc}', level='WARNING')

    # ------------------------------------------------------------------
    # Logging shortcut
    # ------------------------------------------------------------------

    def log(self, message: str, level: str = 'INFO') -> None:
        """Write to errors.log tagged with this agent's name."""
        log_error(self.agent_name, message, level)

    # ------------------------------------------------------------------
    # Abstract method
    # ------------------------------------------------------------------

    def run(self, task: str) -> str:
        """
        Agent-specific logic. MUST be implemented by every subclass.

        task   : the input string describing what to do
        returns: result string (shown to user / stored in ledger)
        """
        raise NotImplementedError(
            f'{self.__class__.__name__} must implement run(self, task) -> str'
        )

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    def health_check(self) -> dict:
        """Return health status dict. Pure local -- no LLM calls."""
        now = datetime.now(ZoneInfo('America/New_York'))

        # Prune error_log to 24h window
        cutoff = now - timedelta(hours=24)
        self._error_log = [e for e in self._error_log if e["timestamp"] > cutoff]
        error_count = len(self._error_log)

        # Circuit breaker state -- aggregate across all providers
        cb_state = "unknown"
        try:
            # Use self.get_circuit_status so it can be patched in tests
            circuit_status = self.get_circuit_status()
            states = [v["state"] for v in circuit_status.values()]
            if "open" in states:
                cb_state = "open"
            elif "half-open" in states:
                cb_state = "half-open"
            else:
                cb_state = "closed"
        except Exception:
            cb_state = "unknown"

        # Message queue depth
        queue_depth = 0
        try:
            messages = self.check_messages()
            queue_depth = len(messages)
        except Exception:
            queue_depth = -1

        # Uptime
        uptime_seconds = int((now - self._started_at).total_seconds())

        # Status determination
        if cb_state == "open" or error_count > 10:
            status = "down"
        elif cb_state in ("half-open",) or 3 <= error_count <= 10:
            status = "degraded"
        elif self._last_error and not self._last_execution:
            status = "degraded"
        elif (self._last_execution and
              (now - self._last_execution).total_seconds() > 7200 and
              error_count > 0):
            status = "degraded"
        else:
            status = "ok"

        # Resolve current model name
        try:
            model_name = self._resolve_model(None, 'unknown')
        except Exception:
            model_name = 'unknown'

        return {
            "agent_name": self.agent_name,
            "status": status,
            "last_execution": self._last_execution.isoformat() if self._last_execution else None,
            "last_error": self._last_error,
            "error_count_24h": error_count,
            "circuit_breaker_state": cb_state,
            "uptime_seconds": uptime_seconds,
            "message_queue_depth": queue_depth,
            "model": model_name,
            "timestamp": now.isoformat(),
        }

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def _emit_event(self, resp: 'AgentResponse') -> None:
        """Auto-emit an event_bus entry after execute() completes. Never raises."""
        try:
            from lib.event_bus import event_bus
            # Truncate summary to 200 chars for legibility
            summary = (resp.result_text or '')[:200]
            event_bus.emit(
                agent    = resp.agent_name or self.agent_name,
                action   = 'task_completed',
                status   = resp.status,
                summary  = summary,
                cost     = resp.cost or 0.0,
                tokens   = resp.tokens_used or 0,
                duration = resp.duration_seconds or 0.0,
            )
        except Exception as _exc:
            log_error(self.agent_name, f'_emit_event: {_exc}', level='DEBUG')

    # ------------------------------------------------------------------
    # Inter-agent messaging
    # ------------------------------------------------------------------

    def send_message(self, to_agent: str, action: str, payload: dict,
                     priority: str = 'normal') -> str:
        """Send a message to another agent via the message queue."""
        # Import here to avoid circular imports at module load time
        from lib.message_queue import enqueue
        from lib.agent_messages import create_message
        msg = create_message(
            from_agent=self.__class__.__name__,
            to_agent=to_agent,
            action=action,
            payload=payload,
            priority=priority,
        )
        return enqueue(msg)

    def check_messages(self) -> list:
        """Check for pending messages addressed to this agent."""
        from lib.message_queue import get_pending
        return get_pending(agent_name=self.__class__.__name__)

    def process_message(self, message: dict) -> dict:
        """Process an incoming inter-agent message. Override in subclasses."""
        import logging as _logging
        _logging.getLogger(__name__).info(
            '[%s] Unhandled message: action=%s from=%s',
            self.__class__.__name__,
            message.get('action'),
            message.get('from_agent'),
        )
        return {
            'status': 'unhandled',
            'agent':  self.__class__.__name__,
            'action': message.get('action'),
        }

    def execute(self, task: str) -> 'AgentResponse':
        """
        Public entry point for running this agent on a task.

        Returns an AgentResponse in all cases. Callers that previously
        expected a plain string still work because AgentResponse.__str__()
        returns result_text.

        Lifecycle:
            1. Reset per-execution cost accumulators
            2. update_ledger('Running', task)
            3. Start wall-clock timer; call run(task)
            4. Wrap return value in AgentResponse if needed
            5. Auto-fill agent_name, duration_seconds, cost, tokens_used
            6a. success  -> update_ledger('Active', task), return AgentResponse
            6b. circuit  -> update_ledger('Circuit Open'), return error AgentResponse
            6c. other    -> update_ledger('Error'),        return error AgentResponse
        """
        from lib.harv_lib import AgentResponse

        # Reset per-execution accumulators (populated by _log_cost)
        self._exec_cost   = 0.0
        self._exec_tokens = 0

        self.update_ledger('Running', task[:80])
        t0 = time.time()
        try:
            result   = self.run(task)
            duration = time.time() - t0

            # Wrap non-AgentResponse returns gracefully
            if isinstance(result, AgentResponse):
                resp = result
            elif isinstance(result, str):
                resp = AgentResponse.success(result)
            else:
                resp = AgentResponse.success(str(result) if result is not None else '')

            # Auto-fill standard fields (only if the subclass left them at defaults)
            resp.agent_name = resp.agent_name or self.agent_name
            if resp.duration_seconds == 0.0:
                resp.duration_seconds = round(duration, 6)
            if resp.cost == 0.0 and self._exec_cost:
                resp.cost = round(self._exec_cost, 8)
            if resp.tokens_used == 0 and self._exec_tokens:
                resp.tokens_used = self._exec_tokens

            # Track health state on success
            self._last_execution = datetime.now(ZoneInfo('America/New_York'))

            self.update_ledger('Active', task[:80])

            # Auto-apply domain_updates if the agent returned any
            if resp.domain_updates is not None:
                try:
                    from lib.domain_manager import DomainSliceManager
                    dm = DomainSliceManager()
                    if dm.read_slice(resp.agent_name) is None:
                        dm.create_slice(resp.agent_name, resp.domain_updates)
                    else:
                        dm.update_slice(resp.agent_name, resp.domain_updates)
                    dm.sync_to_drive(resp.agent_name)
                    self.domain = dm.read_slice(resp.agent_name)
                except Exception as _exc:
                    log_error(self.agent_name, f'execute: domain_updates apply failed: {_exc}', level='WARNING')

            self._emit_event(resp)
            return resp

        except NotImplementedError:
            raise  # developer error -- propagate so it's visible
        except CircuitBreakerOpen as exc:
            duration = time.time() - t0
            msg = f'Circuit open for {exc.provider}: {exc}'
            self.log(msg, level='ERROR')
            # Track health state on circuit breaker error
            _now = datetime.now(ZoneInfo('America/New_York'))
            self._last_error = {"timestamp": _now.isoformat(), "message": msg}
            self._error_log.append({"timestamp": _now, "message": msg})
            self.update_ledger('Circuit Open')
            _cb_resp = AgentResponse(
                status='error', result_text=msg,
                agent_name=self.agent_name, duration_seconds=round(duration, 3),
            )
            self._emit_event(_cb_resp)
            return _cb_resp
        except Exception as exc:
            duration = time.time() - t0
            msg = f'{type(exc).__name__}: {exc}'
            self.log(msg, level='ERROR')
            # Track health state on error
            _now = datetime.now(ZoneInfo('America/New_York'))
            self._last_error = {"timestamp": _now.isoformat(), "message": msg}
            self._error_log.append({"timestamp": _now, "message": msg})
            self.update_ledger('Error')
            _err_resp = AgentResponse(
                status='error', result_text=msg,
                agent_name=self.agent_name, duration_seconds=round(duration, 3),
            )
            self._emit_event(_err_resp)
            return _err_resp
