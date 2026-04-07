"""
harv_errors.py -- Centralized error handling for all Harv agents.

Provides:
  - log_error()            write structured errors to errors.log (EST timestamps)
  - retry_with_backoff()   exponential-backoff wrapper (1s/2s/4s, max 3 retries)
  - safe_sheets_write()    Sheets API write with 401/403 token refresh + backoff
  - safe_sheets_read()     Sheets API read with 401/403 token refresh + backoff
  - safe_api_call()        generic external-API wrapper with backoff
  - CircuitBreaker         per-provider open/closed/half-open state machine
  - CircuitBreakerOpen     exception raised when a provider circuit is tripped
  - get_circuit_status()   returns state dict for all 5 providers
  - reset_circuit()        manually closes a provider's circuit

No agent-specific imports -- safe to import from any agent without circular deps.
"""

import functools
import os
import time
import traceback
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.errors import HttpError

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
LOG_PATH = '/root/harv/logs/errors.log'
CREDS_PATH = '/root/harv/credentials/google_token.json'
CLIENT_SECRETS_PATH = '/root/harv/credentials/google_credentials.json'
ENV_PATH = '/root/harv/.env'
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/gmail.modify',
]
EST = ZoneInfo('America/New_York')

CIRCUIT_ALERT_USER_ID = 6899940023
CIRCUIT_TRIP_THRESHOLD = 3
CIRCUIT_COOLDOWN_SECONDS = 15 * 60  # 15 minutes

# ---------------------------------------------------------------------------
# 1. Centralized logger
# ---------------------------------------------------------------------------

def log_error(source: str, message: str, level: str = 'ERROR') -> None:
    """Write a structured line to errors.log. Never raises -- silent on I/O failure."""
    try:
        now = datetime.now(tz=EST).strftime('%Y-%m-%d %I:%M %p EST')
        line = f'[{now}] [{level}] [{source}] {message}\n'
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, 'a', encoding='utf-8') as f:
            f.write(line)
    except Exception:
        pass  # never propagate logging errors


# ---------------------------------------------------------------------------
# Circuit breaker -- Telegram alert helper
# ---------------------------------------------------------------------------

def _get_bot_token() -> str:
    """Read TELEGRAM_BOT_TOKEN from .env file. Returns empty string on failure."""
    try:
        with open(ENV_PATH) as f:
            for line in f:
                line = line.strip()
                if line.startswith('TELEGRAM_BOT_TOKEN='):
                    return line.split('=', 1)[1].strip()
    except Exception:
        pass
    return os.environ.get('TELEGRAM_BOT_TOKEN', '')


def _send_circuit_telegram(message: str) -> None:
    """Send a Telegram message to the owner about a circuit event. Never raises."""
    try:
        token = _get_bot_token()
        if not token:
            log_error('circuit_breaker', 'No TELEGRAM_BOT_TOKEN for circuit alert', level='WARNING')
            return
        url = f'https://api.telegram.org/bot{token}/sendMessage'
        requests.post(
            url,
            json={'chat_id': CIRCUIT_ALERT_USER_ID, 'text': message},
            timeout=10,
        )
    except Exception as exc:
        log_error('circuit_breaker', f'Telegram circuit alert failed: {exc}', level='WARNING')


# ---------------------------------------------------------------------------
# 2. Circuit breaker
# ---------------------------------------------------------------------------

class CircuitBreakerOpen(Exception):
    """Raised when a call is blocked because a provider's circuit is open."""
    def __init__(self, provider: str, message: str = ''):
        self.provider = provider
        super().__init__(message or f'Circuit open for provider: {provider}')


class CircuitBreaker:
    """
    Per-provider circuit breaker with closed / open / half-open states.

    Providers: anthropic, openrouter, ollama, google, gemini
    Trip threshold: 3 consecutive top-level failures
    Cooldown: 15 minutes before one test call is allowed (half-open)
    """

    CLOSED = 'closed'
    OPEN = 'open'
    HALF_OPEN = 'half-open'

    VALID_PROVIDERS = ('anthropic', 'openrouter', 'ollama', 'google', 'gemini')

    def __init__(self):
        self._state: dict[str, dict] = {
            p: self._fresh_state() for p in self.VALID_PROVIDERS
        }

    @staticmethod
    def _fresh_state() -> dict:
        return {
            'state': CircuitBreaker.CLOSED,
            'consecutive_failures': 0,
            'last_failure_time': None,
            'last_failure_msg': '',
        }

    def _get(self, provider: str) -> dict:
        if provider not in self._state:
            # Unknown provider: add it dynamically, never block
            self._state[provider] = self._fresh_state()
        return self._state[provider]

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def check(self, provider: str) -> None:
        """
        Call before making an API call.
        Raises CircuitBreakerOpen if the circuit is open/half-open.
        Transitions OPEN -> HALF_OPEN when cooldown has elapsed.
        """
        s = self._get(provider)
        if s['state'] == self.CLOSED:
            return

        if s['state'] == self.OPEN:
            elapsed = (datetime.now(tz=EST) - s['last_failure_time']).total_seconds()
            if elapsed >= CIRCUIT_COOLDOWN_SECONDS:
                # Allow one test call through
                s['state'] = self.HALF_OPEN
                log_error(
                    'circuit_breaker',
                    f'{provider} cooldown elapsed -- entering half-open, allowing test call',
                    level='WARNING',
                )
                return  # let the call proceed
            mins_left = int((CIRCUIT_COOLDOWN_SECONDS - elapsed) / 60) + 1
            raise CircuitBreakerOpen(
                provider,
                f'Circuit open for {provider}. Retry in ~{mins_left} min.',
            )

        if s['state'] == self.HALF_OPEN:
            raise CircuitBreakerOpen(
                provider,
                f'Circuit half-open for {provider}: test call already in flight.',
            )

    def record_success(self, provider: str) -> None:
        """Call after a successful API call to reset failure count or close circuit."""
        s = self._get(provider)
        was_recovering = s['state'] in (self.HALF_OPEN, self.OPEN)
        s['state'] = self.CLOSED
        s['consecutive_failures'] = 0
        s['last_failure_msg'] = ''

        if was_recovering:
            msg = (
                f'\u2705 CIRCUIT BREAKER: {provider} recovered. '
                f'Resuming normal operations.'
            )
            log_error('circuit_breaker', f'{provider} circuit closed (recovered)', level='INFO')
            _send_circuit_telegram(msg)

    def record_failure(self, provider: str, error_msg: str) -> None:
        """
        Call after a fully-exhausted failed attempt.
        Trips the circuit when threshold is reached; handles half-open re-open.
        """
        s = self._get(provider)
        s['last_failure_time'] = datetime.now(tz=EST)
        s['last_failure_msg'] = str(error_msg)[:200]

        if s['state'] == self.HALF_OPEN:
            # Test call failed -- stay open, reset cooldown timer
            s['state'] = self.OPEN
            log_error(
                'circuit_breaker',
                f'{provider} test call failed -- staying open, cooldown reset',
                level='ERROR',
            )
            tg_msg = (
                f'\u26a0\ufe0f CIRCUIT BREAKER: {provider} still failing. '
                f'Staying paused. Next retry in 15 min.'
            )
            _send_circuit_telegram(tg_msg)
            return

        if s['state'] == self.CLOSED:
            s['consecutive_failures'] += 1
            if s['consecutive_failures'] >= CIRCUIT_TRIP_THRESHOLD:
                s['state'] = self.OPEN
                log_error(
                    'circuit_breaker',
                    f'{provider} circuit TRIPPED after {s["consecutive_failures"]} consecutive failures. '
                    f'Last error: {s["last_failure_msg"]}',
                    level='ERROR',
                )
                tg_msg = (
                    f'\u26a0\ufe0f CIRCUIT BREAKER: {provider} tripped after '
                    f'{CIRCUIT_TRIP_THRESHOLD} consecutive failures. '
                    f'All {provider} agents paused. '
                    f'Last error: {s["last_failure_msg"]}. '
                    f'Use /circuit reset {provider} to manually reset.'
                )
                _send_circuit_telegram(tg_msg)

    def reset(self, provider: str) -> str:
        """Manually close the circuit for a provider. Returns confirmation string."""
        if provider not in self.VALID_PROVIDERS and provider not in self._state:
            return f'Unknown provider: {provider}. Valid: {", ".join(self.VALID_PROVIDERS)}'
        s = self._get(provider)
        prev_state = s['state']
        self._state[provider] = self._fresh_state()
        log_error(
            'circuit_breaker',
            f'{provider} circuit manually reset from {prev_state} to closed',
            level='INFO',
        )
        return f'Circuit for {provider} manually reset (was: {prev_state}). Calls resuming.'

    def status(self) -> dict:
        """Return a snapshot of all provider states."""
        result = {}
        for provider in self.VALID_PROVIDERS:
            s = self._get(provider)
            result[provider] = {
                'state': s['state'],
                'consecutive_failures': s['consecutive_failures'],
                'last_failure_time': s['last_failure_time'],
                'last_failure_msg': s['last_failure_msg'],
            }
        return result


# Module-level singleton
_circuit = CircuitBreaker()


def get_circuit_status() -> dict:
    """Return current state of all provider circuits."""
    return _circuit.status()


def reset_circuit(provider: str) -> str:
    """Manually reset a provider's circuit breaker. Returns confirmation string."""
    return _circuit.reset(provider)


# ---------------------------------------------------------------------------
# 3. retry_with_backoff
# ---------------------------------------------------------------------------

def retry_with_backoff(
    func=None,
    *,
    max_retries: int = 3,
    base_delay: float = 1.0,
    provider: str = None,
):
    """
    Decorator OR plain wrapper with exponential backoff + optional circuit breaker.

    provider: if given, checks the circuit before each attempt and records
              success/failure against that provider's circuit state.

    As a decorator (no arguments):
        @retry_with_backoff
        def my_func(): ...

    As a decorator (with arguments):
        @retry_with_backoff(max_retries=5, base_delay=0.5, provider='anthropic')
        def my_func(): ...

    As a plain wrapper (wrap-then-call):
        wrapped = retry_with_backoff(some_callable, max_retries=3, provider='openrouter')
        result  = wrapped()
    """
    if func is None:
        def decorator(f):
            return retry_with_backoff(
                f, max_retries=max_retries, base_delay=base_delay, provider=provider
            )
        return decorator

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        # Circuit check before we even start
        if provider:
            _circuit.check(provider)  # raises CircuitBreakerOpen if open

        last_exc = None
        for attempt in range(1, max_retries + 2):  # 1 ... max_retries+1 total tries
            try:
                result = func(*args, **kwargs)
                # Success -- reset circuit failure count
                if provider:
                    _circuit.record_success(provider)
                return result
            except CircuitBreakerOpen:
                raise  # never retry a blocked call
            except Exception as exc:
                last_exc = exc
                if attempt <= max_retries:
                    delay = base_delay * (2 ** (attempt - 1))
                    log_error(
                        source=func.__name__,
                        message=(
                            f'Attempt {attempt}/{max_retries} failed: '
                            f'{type(exc).__name__}: {exc} -- retrying in {delay:.1f}s'
                        ),
                        level='WARNING',
                    )
                    time.sleep(delay)
                else:
                    log_error(
                        source=func.__name__,
                        message=(
                            f'All {max_retries} retries exhausted. '
                            f'Final error: {type(exc).__name__}: {exc}\n'
                            f'{traceback.format_exc()}'
                        ),
                        level='ERROR',
                    )
                    # Record final failure against circuit
                    if provider:
                        _circuit.record_failure(provider, f'{type(exc).__name__}: {exc}')
                    raise
        raise last_exc  # unreachable but satisfies type checkers

    return wrapper


# ---------------------------------------------------------------------------
# Internal Google auth helpers
# ---------------------------------------------------------------------------

def _refresh_google_token() -> Credentials:
    """Load and refresh the saved Google OAuth token. Returns fresh Credentials."""
    creds = Credentials.from_authorized_user_file(CREDS_PATH, SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(CREDS_PATH, 'w') as f:
            f.write(creds.to_json())
    return creds


def _is_auth_error(exc: Exception) -> bool:
    """Return True if the exception signals an expired/invalid token (401 or 403)."""
    if isinstance(exc, HttpError):
        return exc.resp.status in (401, 403)
    return False


def _is_transient_error(exc: Exception) -> bool:
    """Return True for rate-limit / server-side errors worth retrying."""
    if isinstance(exc, HttpError):
        return exc.resp.status in (429, 500, 503)
    if isinstance(exc, (requests.exceptions.ConnectionError,
                         requests.exceptions.Timeout,
                         requests.exceptions.ChunkedEncodingError)):
        return True
    return False



# safe_sheets_write and safe_sheets_read removed — Google Sheets integration deleted.


# ---------------------------------------------------------------------------
# 6. safe_api_call
# ---------------------------------------------------------------------------

def safe_api_call(func, *args, provider: str = None, **kwargs):
    """
    Generic wrapper for external API calls (Anthropic, OpenRouter, etc.).

    provider: 'anthropic', 'openrouter', 'ollama', or 'google'
              Checked against the circuit breaker before each attempt.

    Applies retry_with_backoff (3x, 1s base) then logs and re-raises on final failure.

    Usage:
        result = safe_api_call(client.messages.create, model=..., messages=...,
                               provider='anthropic')
    """
    @functools.wraps(func)
    def _bound():
        return func(*args, **kwargs)

    try:
        return retry_with_backoff(_bound, max_retries=3, base_delay=1.0, provider=provider)()
    except CircuitBreakerOpen:
        raise
    except Exception as exc:
        log_error(
            'safe_api_call',
            f'API call to {getattr(func, "__name__", repr(func))} failed: '
            f'{type(exc).__name__}: {exc}',
        )
        raise
