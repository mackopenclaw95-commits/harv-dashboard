"""
cost_tracking_vps.py — Apply all VPS patches for per-user cost tracking.

Run on VPS:
    python3 /root/harv/scripts/vps_patches_cost_tracking.py

Idempotent (uses sentinel comments to detect prior application).
Patches:
  1. lib/harv_lib.py — contextvars + extended log_api_cost()
  2. api/blueprints/chat.py — set_request_context() at start of chat
  3. lib/whisper_client.py — cost emission on successful transcription
"""

import os
import sys
import py_compile

SENTINEL_HARV_LIB = "# --- COST_TRACKING_PATCH_V1 ---"
SENTINEL_CHAT = "# --- COST_TRACKING_CHAT_V1 ---"
SENTINEL_WHISPER = "# --- COST_TRACKING_WHISPER_V1 ---"


def patch_harv_lib():
    path = "/root/harv/lib/harv_lib.py"
    with open(path, "r") as f:
        content = f.read()

    if SENTINEL_HARV_LIB in content:
        print(f"[harv_lib] already patched — skipping")
        return

    # Insert contextvars + helpers before the log_api_cost definition.
    injection = f"""

{SENTINEL_HARV_LIB}
import contextvars as _ctxvars

_REQUEST_CTX = _ctxvars.ContextVar("harv_request_ctx", default=None)


def set_request_context(user_id=None, parent_agent=None, source=None, session_id=None):
    \"\"\"Attach the current request's user/agent context for cost attribution.

    Must be called in the Flask request handler BEFORE any agent or model
    call. Contextvars propagate through same-thread function calls (including
    streaming generators), so downstream log_api_cost() calls can read it.
    \"\"\"
    ctx = {{
        "user_id": user_id,
        "parent_agent": parent_agent,
        "source": source,
        "session_id": session_id,
    }}
    _REQUEST_CTX.set(ctx)


def get_request_context():
    ctx = _REQUEST_CTX.get()
    return ctx if isinstance(ctx, dict) else {{}}
# --- END COST_TRACKING_PATCH_V1 ---

"""

    # Replace the existing log_api_cost definition with the enhanced one.
    old_log = '''def log_api_cost(session_id: str, agent: str, model: str,
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
        pass  # cost logging must never break the calling agent'''

    new_log = '''def log_api_cost(session_id: str, agent: str, model: str,
                 input_tokens: int, output_tokens: int, task_type: str = '',
                 user_id=None, parent_agent=None, cached_tokens: int = 0,
                 modality: str = 'text', units: float = 0.0) -> None:
    """
    Log API cost to events.db via event_bus.

    Accepts explicit user_id / parent_agent, or falls back to the contextvar
    set by set_request_context(). Stuffs everything into the metadata JSON
    so no schema change is needed.

    Silent-fail: never raises — cost logging must not break the calling agent.
    """
    try:
        from lib.event_bus import event_bus
        ctx = get_request_context()
        eff_user = user_id or ctx.get('user_id')
        eff_parent = parent_agent or ctx.get('parent_agent')
        eff_session = session_id or ctx.get('session_id') or ''

        in_tok = int(input_tokens or 0)
        out_tok = int(output_tokens or 0)
        cached = int(cached_tokens or 0)
        tokens = in_tok + out_tok

        if modality == 'text' or modality == 'vlm':
            cost = calc_cost(model, in_tok, out_tok)
        else:
            cost = 0.0  # non-text costs must be passed explicitly via metadata

        meta = {
            'session_id': eff_session,
            'model': model,
            'input_tokens': in_tok,
            'output_tokens': out_tok,
            'cached_tokens': cached,
            'task_type': task_type,
            'modality': modality,
            'units': float(units or 0),
        }
        if eff_user:
            meta['user_id'] = eff_user
        if eff_parent:
            meta['parent_agent'] = eff_parent
        if ctx.get('source'):
            meta['source'] = ctx.get('source')

        event_bus.emit(
            agent=agent,
            action='api_cost',
            status='success',
            summary=f'{model} | {tokens} tokens | ${cost:.6f}',
            cost=cost,
            tokens=tokens,
            metadata=meta,
        )
    except Exception:
        pass  # cost logging must never break the calling agent'''

    if old_log not in content:
        print("[harv_lib] FATAL: could not locate existing log_api_cost — not patching")
        sys.exit(2)

    content = content.replace(old_log, new_log)

    # Inject contextvar helpers just before the new log_api_cost
    anchor = "def log_api_cost(session_id: str, agent: str, model: str,"
    content = content.replace(anchor, injection + anchor, 1)

    with open(path, "w") as f:
        f.write(content)

    py_compile.compile(path, doraise=True)
    print(f"[harv_lib] patched + compiled OK")


def patch_chat():
    path = "/root/harv/api/blueprints/chat.py"
    with open(path, "r") as f:
        content = f.read()

    if SENTINEL_CHAT in content:
        print(f"[chat] already patched — skipping")
        return

    # Insert set_request_context call right after user_id is extracted.
    old = "    user_id = (data.get('user_id') or '').strip()\n    source = (data.get('source') or 'api').strip()"
    new = (
        "    user_id = (data.get('user_id') or '').strip()\n"
        "    source = (data.get('source') or 'api').strip()\n"
        "    " + SENTINEL_CHAT + "\n"
        "    try:\n"
        "        from lib.harv_lib import set_request_context\n"
        "        set_request_context(\n"
        "            user_id=user_id or None,\n"
        "            source=source or None,\n"
        "            session_id=session_id,\n"
        "        )\n"
        "    except Exception as _ctx_err:\n"
        "        log.warning('set_request_context failed: %s', _ctx_err)"
    )

    if old not in content:
        print("[chat] FATAL: could not locate user_id extraction — not patching")
        sys.exit(2)

    content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)

    py_compile.compile(path, doraise=True)
    print(f"[chat] patched + compiled OK")


def patch_whisper():
    path = "/root/harv/lib/whisper_client.py"
    with open(path, "r") as f:
        content = f.read()

    if SENTINEL_WHISPER in content:
        print(f"[whisper] already patched — skipping")
        return

    # Add cost-emit helper after the logger line
    helper_block = f"""

{SENTINEL_WHISPER}
_GROQ_RATE_MIN = 0.00067   # $0.04/hr turbo
_OPENAI_RATE_MIN = 0.006   # $0.006/min whisper-1


def _audio_duration_min(path):
    \"\"\"Best-effort audio duration in minutes (size-based fallback).\"\"\"
    try:
        mb = os.path.getsize(path) / (1024 * 1024)
        return mb / 0.94  # ~128kbps mp3
    except Exception:
        return 0.0


def _emit_whisper_cost(provider, model, duration_min):
    if duration_min <= 0:
        return
    try:
        from lib.event_bus import event_bus
        from lib.harv_lib import get_request_context
        rate = _GROQ_RATE_MIN if 'groq' in provider.lower() else _OPENAI_RATE_MIN
        cost = duration_min * rate
        ctx = get_request_context()
        meta = {{
            'model': f'{{provider.lower()}}/{{model}}',
            'modality': 'audio',
            'units': round(duration_min, 4),
            'provider': provider.lower(),
        }}
        if ctx.get('user_id'):
            meta['user_id'] = ctx['user_id']
        if ctx.get('parent_agent'):
            meta['parent_agent'] = ctx['parent_agent']
        if ctx.get('session_id'):
            meta['session_id'] = ctx['session_id']

        event_bus.emit(
            agent='Video Digest',
            action='api_cost',
            status='success',
            summary=f'{{provider.lower()}}/{{model}} | {{duration_min:.2f}}min | ${{cost:.6f}}',
            cost=cost,
            tokens=0,
            metadata=meta,
        )
    except Exception as _e:
        log.warning(f'whisper cost emit failed: {{_e}}')
# --- END COST_TRACKING_WHISPER_V1 ---

"""

    content = content.replace(
        "log = logging.getLogger('whisper_client')",
        "log = logging.getLogger('whisper_client')" + helper_block,
        1,
    )

    # Hook into the success branch — emit cost after successful transcription.
    old_success = (
        "            if resp.status_code == 200:\n"
        "                text = resp.text.strip()\n"
        "                log.info(f'{provider_name} whisper: {len(text)} chars transcribed')\n"
        "                return text"
    )
    new_success = (
        "            if resp.status_code == 200:\n"
        "                text = resp.text.strip()\n"
        "                log.info(f'{provider_name} whisper: {len(text)} chars transcribed')\n"
        "                try:\n"
        "                    _emit_whisper_cost(provider_name, model, _audio_duration_min(audio_path))\n"
        "                except Exception as _ce:\n"
        "                    log.warning(f'whisper cost emit caller error: {_ce}')\n"
        "                return text"
    )

    if old_success not in content:
        print("[whisper] WARN: could not patch success branch — cost NOT wired")
    else:
        content = content.replace(old_success, new_success)

    with open(path, "w") as f:
        f.write(content)

    py_compile.compile(path, doraise=True)
    print(f"[whisper] patched + compiled OK")


def main():
    print("=== VPS cost tracking patch ===")
    patch_harv_lib()
    patch_chat()
    patch_whisper()
    print("All patches applied successfully.")
    print("Next: systemctl restart harv-api harv-dashboard")


if __name__ == "__main__":
    main()
