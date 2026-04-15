"""Tag Harv cost events with source when user_id is missing, and fix the
/chat/stream route's latent NameError + missing request context.

Root cause of the "Harv 47 calls $0.0399 in System bucket" mystery:

  1. Telegram users who haven't linked their Supabase account send
     source='telegram' but user_id='' — lib.log_api_cost stored those
     as agent='Harv' with user_id=null, collapsing them into a single
     faceless bucket in the admin System tab.

  2. api/blueprints/chat.py:chat_stream() references `plan` and
     `model_tier` at line ~502 but never reads them from the request.
     The NameError is caught by the generator's except block and
     swallowed — so chat_with_harv_stream was effectively never reached
     from this route, but it also never emitted events.

  3. scripts/telegram_bot.py:1323 falls back to chat_with_harv() directly
     when harv-api.service is unreachable. No request context is set,
     so user_id/source are both lost.

This patch is idempotent (sentinel-guarded) and fixes all three:

  - lib/harv_lib.py:log_api_cost — if no user_id but source is set,
    append '(<source>)' to agent name before emitting.
  - api/blueprints/chat.py:chat_stream — read plan/model_tier/user_id
    from request, call set_request_context(), and fix the NameError.
  - scripts/telegram_bot.py:1323 fallback — set a minimal context so
    the event tags as 'Harv (telegram-fallback)'.

Run after scp-ing this file to /tmp:
    ssh root@VPS 'python3 /tmp/patch_harv_attribution.py'
    ssh root@VPS 'systemctl restart harv-api harv-dashboard'
"""
from __future__ import annotations
import os
import py_compile
import shutil
import sys
import time

HARV_LIB = '/root/harv/lib/harv_lib.py'
CHAT_BP = '/root/harv/api/blueprints/chat.py'
TELEGRAM_BOT = '/root/harv/scripts/telegram_bot.py'

# Sentinels so the patcher is idempotent
SENTINEL_HARV_LIB = '# --- HARV_ATTRIBUTION_V1 ---'
SENTINEL_CHAT_BP = '# --- CHAT_STREAM_CTX_V1 ---'
SENTINEL_TELEGRAM = '# --- TELEGRAM_FALLBACK_CTX_V1 ---'


def backup(path: str) -> str:
    ts = time.strftime('%Y%m%d_%H%M%S')
    bk = f'{path}.{ts}.bak'
    shutil.copy2(path, bk)
    return bk


# ──────────────────────────────────────────────────────────────────────
# Patch 1: lib/harv_lib.py log_api_cost — tag agent with source on no-user
# ──────────────────────────────────────────────────────────────────────

def patch_harv_lib() -> bool:
    with open(HARV_LIB, 'r') as f:
        content = f.read()
    if SENTINEL_HARV_LIB in content:
        print(f'[harv_lib] already patched')
        return False

    # Find the event_bus.emit(...) call inside log_api_cost and insert
    # agent re-tagging logic right before it. We look for the exact
    # 'event_bus.emit(' line that lives inside log_api_cost.
    old = (
        "        if ctx.get('source'):\n"
        "            meta['source'] = ctx.get('source')\n"
        "\n"
        "        event_bus.emit(\n"
        "            agent=agent,"
    )
    new = (
        "        if ctx.get('source'):\n"
        "            meta['source'] = ctx.get('source')\n"
        "\n"
        "        # " + SENTINEL_HARV_LIB + "\n"
        "        # Tag agent with source when there's no user attribution — keeps\n"
        "        # unlinked Telegram/WhatsApp/fallback events from collapsing into\n"
        "        # a faceless 'Harv' bucket in the admin System tab.\n"
        "        effective_agent = agent\n"
        "        if not eff_user and ctx.get('source') and '(' not in (agent or ''):\n"
        "            effective_agent = f\"{agent} ({ctx.get('source')})\"\n"
        "\n"
        "        event_bus.emit(\n"
        "            agent=effective_agent,"
    )
    if old not in content:
        print('[harv_lib] FATAL: anchor not found — file may have been modified')
        return False

    bk = backup(HARV_LIB)
    with open(HARV_LIB, 'w') as f:
        f.write(content.replace(old, new, 1))
    try:
        py_compile.compile(HARV_LIB, doraise=True)
    except py_compile.PyCompileError as e:
        print(f'[harv_lib] compile failed, restoring: {e}')
        shutil.copy2(bk, HARV_LIB)
        return False
    print(f'[harv_lib] patched (backup: {bk})')
    return True


# ──────────────────────────────────────────────────────────────────────
# Patch 2: api/blueprints/chat.py chat_stream — context + NameError fix
# ──────────────────────────────────────────────────────────────────────

def patch_chat_stream() -> bool:
    with open(CHAT_BP, 'r') as f:
        content = f.read()
    if SENTINEL_CHAT_BP in content:
        print(f'[chat.py] already patched')
        return False

    # The broken block reads data but never defines plan/model_tier, then
    # references them inside the generator. Replace with a version that
    # reads them + sets request context + passes them through correctly.
    old = (
        "    agent = (data.get('agent') or '').strip()\n"
        "    log.info('POST /chat/stream session=%s agent=%s msg=%r', session_id, agent or 'harv', message[:80])\n"
        "\n"
        "    routed_message = message\n"
        "    if agent:\n"
        "        routed_message = f'[DIRECT:{agent}] {message}'\n"
        "\n"
        "    def generate():\n"
        "        try:\n"
        "            from lib.harv_brain import chat_with_harv_stream\n"
        "            for chunk in chat_with_harv_stream(session_id, routed_message, plan=plan, model_tier=model_tier):\n"
        "                yield chunk"
    )
    new = (
        "    agent = (data.get('agent') or '').strip()\n"
        "    plan = (data.get('plan') or 'free').strip()\n"
        "    model_tier = (data.get('model_tier') or 'primary').strip()\n"
        "    user_id = (data.get('user_id') or '').strip()\n"
        "    source = (data.get('source') or 'api').strip()\n"
        "    # " + SENTINEL_CHAT_BP + "\n"
        "    try:\n"
        "        from lib.harv_lib import set_request_context\n"
        "        set_request_context(\n"
        "            user_id=user_id or None,\n"
        "            source=source or None,\n"
        "            session_id=session_id,\n"
        "        )\n"
        "    except Exception as _ctx_err:\n"
        "        log.warning('chat_stream set_request_context failed: %s', _ctx_err)\n"
        "    log.info('POST /chat/stream session=%s agent=%s msg=%r', session_id, agent or 'harv', message[:80])\n"
        "\n"
        "    routed_message = message\n"
        "    if agent:\n"
        "        routed_message = f'[DIRECT:{agent}] {message}'\n"
        "\n"
        "    def generate():\n"
        "        try:\n"
        "            from lib.harv_brain import chat_with_harv_stream\n"
        "            for chunk in chat_with_harv_stream(session_id, routed_message, plan=plan, model_tier=model_tier):\n"
        "                yield chunk"
    )
    if old not in content:
        print('[chat.py] FATAL: chat_stream anchor not found')
        return False

    bk = backup(CHAT_BP)
    with open(CHAT_BP, 'w') as f:
        f.write(content.replace(old, new, 1))
    try:
        py_compile.compile(CHAT_BP, doraise=True)
    except py_compile.PyCompileError as e:
        print(f'[chat.py] compile failed, restoring: {e}')
        shutil.copy2(bk, CHAT_BP)
        return False
    print(f'[chat.py] patched (backup: {bk})')
    return True


# ──────────────────────────────────────────────────────────────────────
# Patch 3: telegram_bot fallback — set context so events tag as fallback
# ──────────────────────────────────────────────────────────────────────

def patch_telegram_fallback() -> bool:
    with open(TELEGRAM_BOT, 'r') as f:
        content = f.read()
    if SENTINEL_TELEGRAM in content:
        print(f'[telegram_bot] already patched')
        return False

    old = (
        "            log.info('API fallback: calling chat_with_harv directly')\n"
        "            reply = await loop.run_in_executor(None, chat_with_harv, session_id, text, plan, 'primary')"
    )
    new = (
        "            log.info('API fallback: calling chat_with_harv directly')\n"
        "            # " + SENTINEL_TELEGRAM + "\n"
        "            try:\n"
        "                from lib.harv_lib import set_request_context\n"
        "                set_request_context(\n"
        "                    user_id=(harv_uid or None),\n"
        "                    source='telegram-fallback',\n"
        "                    session_id=session_id,\n"
        "                )\n"
        "            except Exception as _ctx_err:\n"
        "                log.warning('telegram fallback set_request_context failed: %s', _ctx_err)\n"
        "            reply = await loop.run_in_executor(None, chat_with_harv, session_id, text, plan, 'primary')"
    )
    if old not in content:
        print('[telegram_bot] FATAL: fallback anchor not found')
        return False

    bk = backup(TELEGRAM_BOT)
    with open(TELEGRAM_BOT, 'w') as f:
        f.write(content.replace(old, new, 1))
    try:
        py_compile.compile(TELEGRAM_BOT, doraise=True)
    except py_compile.PyCompileError as e:
        print(f'[telegram_bot] compile failed, restoring: {e}')
        shutil.copy2(bk, TELEGRAM_BOT)
        return False
    print(f'[telegram_bot] patched (backup: {bk})')
    return True


def main() -> int:
    any_changed = False
    for fn, label in [
        (patch_harv_lib, 'lib/harv_lib.py'),
        (patch_chat_stream, 'api/blueprints/chat.py'),
        (patch_telegram_fallback, 'scripts/telegram_bot.py'),
    ]:
        try:
            if fn():
                any_changed = True
        except Exception as e:
            print(f'[{label}] FATAL: {type(e).__name__}: {e}')
            return 2
    print()
    if any_changed:
        print('✓ patches applied. restart services:')
        print('  systemctl restart harv-api harv-dashboard')
        print('  systemctl restart harv-telegram  # if it was running')
    else:
        print('nothing to patch — already current')
    return 0


if __name__ == '__main__':
    sys.exit(main())
