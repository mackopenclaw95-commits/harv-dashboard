"""Supabase-backed pricing cache for VPS calc_cost.

Replaces the manually-synced `_MODEL_PRICING` dict in harv_lib.py.
Reads from Supabase `model_pricing` (the same table /api/admin/pricing-drift
and the weekly drift cron use), caches in-process for 5 minutes, and falls
back to a hardcoded safe dict if Supabase is unreachable or returns garbage.

Design goals:
- One source of truth for text-token prices (pitfall #4 eliminated).
- New models added to Supabase Just Work on next cache refresh.
- No hard dependency on supabase-py — uses stdlib urllib only.
- Fail-safe: Supabase down / HTTP 5xx / malformed JSON all fall back to
  the embedded dict rather than crashing a chat request.

Installed to: /root/harv/lib/pricing_cache.py
Used by:     /root/harv/lib/harv_lib.py:calc_cost() (after patch_use_supabase_pricing.py)
"""
from __future__ import annotations
import json
import os
import time
import urllib.request
from threading import Lock

CACHE_TTL_SECONDS = 300  # 5 minutes
ENV_PATH = '/root/harv/.env'

# Fallback — last-known-good rates, used only if Supabase is unreachable.
# Keep this in rough sync with Supabase model_pricing to minimize drift when
# the cache is cold. Updated 2026-04-15 after dead :free cleanup.
_FALLBACK_PRICING: dict[str, dict[str, float]] = {
    'claude-sonnet-4-6':               {'input': 3.00,  'output': 15.00},
    'claude-opus-4-6':                 {'input': 15.00, 'output': 75.00},
    'claude-haiku-4-5-20251001':       {'input': 0.80,  'output':  4.00},
    'claude-haiku-4-5':                {'input': 0.80,  'output':  4.00},
    'claude-3-5-haiku-20241022':       {'input': 0.80,  'output':  4.00},
    'deepseek/deepseek-chat':          {'input': 0.32,  'output':  0.89},
    'deepseek/deepseek-chat-v3-0324':  {'input': 0.20,  'output':  0.77},
    'deepseek/deepseek-v3.2':          {'input': 0.26,  'output':  0.38},
    'deepseek/deepseek-r1':            {'input': 0.70,  'output':  2.50},
    'x-ai/grok-4.1-fast':              {'input': 0.20,  'output':  0.50},
    'x-ai/grok-3':                     {'input': 3.00,  'output': 15.00},
    'minimax/minimax-m2.1':            {'input': 0.29,  'output':  0.95},
    'minimax/minimax-m2':              {'input': 0.255, 'output':  1.00},
    'qwen/qwen3-8b':                   {'input': 0.05,  'output':  0.40},
    'qwen/qwen3-14b':                  {'input': 0.08,  'output':  0.23},
    'meta-llama/llama-3.3-70b-instruct:free': {'input': 0.00, 'output': 0.00},
    'google/gemma-3-4b-it:free':       {'input': 0.00,  'output':  0.00},
    'google/gemini-2.0-flash-lite-001':{'input': 0.075, 'output':  0.30},
    'google/gemini-2.5-flash':         {'input': 0.30,  'output':  2.50},
    'openai/gpt-4.1':                  {'input': 2.00,  'output':  8.00},
    'gpt-4.1':                         {'input': 2.00,  'output':  8.00},
    'gpt-4o':                          {'input': 2.50,  'output': 10.00},
    'gpt-4o-mini':                     {'input': 0.15,  'output':  0.60},
}

_cache: dict[str, dict[str, float]] = {}
_cache_expires_at: float = 0.0
_cache_lock = Lock()


def _load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    try:
        with open(ENV_PATH, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    return env


def _fetch_from_supabase() -> dict[str, dict[str, float]] | None:
    env = _load_env()
    url = env.get('SUPABASE_URL') or os.environ.get('SUPABASE_URL', '')
    key = env.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        return None
    endpoint = (
        f'{url}/rest/v1/model_pricing'
        '?select=model,input_per_million,output_per_million,unit'
        '&unit=eq.tokens'
    )
    req = urllib.request.Request(
        endpoint,
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Accept': 'application/json',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            rows = json.load(r)
    except Exception:
        return None
    if not isinstance(rows, list) or not rows:
        return None
    out: dict[str, dict[str, float]] = {}
    for row in rows:
        try:
            mid = row.get('model')
            if not mid:
                continue
            out[mid] = {
                'input': float(row.get('input_per_million') or 0),
                'output': float(row.get('output_per_million') or 0),
            }
        except (TypeError, ValueError):
            continue
    return out or None


def _refresh_if_stale() -> None:
    global _cache, _cache_expires_at
    now = time.time()
    if now < _cache_expires_at and _cache:
        return
    with _cache_lock:
        # Double-check after acquiring lock
        if time.time() < _cache_expires_at and _cache:
            return
        fresh = _fetch_from_supabase()
        if fresh:
            _cache = fresh
            _cache_expires_at = time.time() + CACHE_TTL_SECONDS
        elif not _cache:
            # Cold start + Supabase unreachable — seed with fallback so calc_cost
            # still returns real numbers on the first call.
            _cache = dict(_FALLBACK_PRICING)
            # Short expiry so we retry Supabase soon.
            _cache_expires_at = time.time() + 30


def get_pricing(model: str) -> dict[str, float] | None:
    """Return {'input': $/M, 'output': $/M} for model, or None if unknown."""
    _refresh_if_stale()
    if model in _cache:
        return _cache[model]
    # Second-chance fallback — Supabase might not have the row yet, but our
    # embedded dict might. Doesn't crash if still missing.
    return _FALLBACK_PRICING.get(model)


def calc_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Drop-in replacement for the inline calc_cost in harv_lib."""
    pricing = get_pricing(model)
    if not pricing:
        return 0.0
    return (
        (float(input_tokens) * float(pricing.get('input', 0)))
        + (float(output_tokens) * float(pricing.get('output', 0)))
    ) / 1_000_000


def cache_status() -> dict:
    """For diagnostics: how many models are cached and when it expires."""
    return {
        'cached_models': len(_cache),
        'expires_in_seconds': max(0, int(_cache_expires_at - time.time())),
        'is_fallback_only': _cache == _FALLBACK_PRICING and _cache_expires_at - time.time() < 60,
    }


if __name__ == '__main__':
    # CLI smoke test
    print('--- pricing_cache smoke test ---')
    for model in ['openai/gpt-4.1', 'google/gemini-2.5-flash', 'deepseek/deepseek-v3.2']:
        pricing = get_pricing(model)
        cost = calc_cost(model, 2001, 10)
        print(f'{model:45} pricing={pricing} cost(2001in/10out)=${cost:.8f}')
    print('cache_status:', cache_status())
