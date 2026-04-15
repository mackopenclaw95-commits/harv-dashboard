"""Weekly pricing drift check — Supabase vs OpenRouter live /v1/models.

Runs on the VPS, reads the canonical `model_pricing` table from Supabase,
compares against OpenRouter's live pricing, and sends a Telegram alert if
anything drifted, became a zombie, or a model flagged `is_free=true`
started charging.

This is the self-maintaining replacement for check_openrouter_pricing.py,
which hardcoded `OUR_RATES` in Python constants — that design drifts
silently whenever Supabase is updated without mirroring to the script.

Installation (on VPS):
    # One-off test run
    python3 /root/harv/scripts/weekly_pricing_drift.py

    # Add to crontab — Monday 9:07am local VPS time (off-the-hour to avoid
    # load spikes; weekly so cache-miss cost is irrelevant)
    crontab -e
    7 9 * * 1 /usr/bin/python3 /root/harv/scripts/weekly_pricing_drift.py >> /var/log/harv/pricing_drift.log 2>&1

Exit codes:
    0 — all rows match OpenRouter live pricing
    1 — one or more drifts / zombies / wrongly-flagged free models
    2 — script error (missing env, network, etc.)
"""
import json
import os
import sys
import urllib.request
from typing import Optional

ENV_PATH = '/root/harv/.env'
DRIFT_THRESHOLD_USD_PER_MILLION = 0.001  # 0.1 cents per million tokens


# ── env loader ─────────────────────────────────────────────────────────

def load_env() -> dict:
    """Read key=value lines from /root/harv/.env into a dict."""
    env = {}
    try:
        with open(ENV_PATH, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except Exception as e:
        print(f'FATAL: could not read {ENV_PATH}: {e}')
        sys.exit(2)
    return env


# ── data fetchers ──────────────────────────────────────────────────────

def fetch_supabase_pricing(env: dict) -> list[dict]:
    """Read every token-priced row from model_pricing. Skips image/audio/tts
    rows because OpenRouter doesn't serve those for direct comparison."""
    url = env.get('SUPABASE_URL') or os.environ.get('SUPABASE_URL', '')
    key = env.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        print('FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
        sys.exit(2)

    endpoint = (
        f'{url}/rest/v1/model_pricing'
        '?select=model,input_per_million,output_per_million,unit,is_free,provider'
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
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fetch_openrouter_models(env: dict) -> dict:
    """Return {model_id: {prompt, completion}} in $/token (native OpenRouter unit)."""
    key = env.get('OPENROUTER_API_KEY', '')
    if not key:
        print('FATAL: OPENROUTER_API_KEY missing from .env')
        sys.exit(2)
    req = urllib.request.Request(
        'https://openrouter.ai/api/v1/models',
        headers={'Authorization': f'Bearer {key}'},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)

    out = {}
    for m in data.get('data', []):
        mid = m.get('id', '')
        p = m.get('pricing', {}) or {}
        try:
            prompt = float(p.get('prompt', 0) or 0)
            completion = float(p.get('completion', 0) or 0)
        except (TypeError, ValueError):
            prompt = completion = 0.0
        out[mid] = {'prompt': prompt, 'completion': completion}
    return out


# ── drift detection ────────────────────────────────────────────────────

def detect_issues(
    ours: list[dict],
    live: dict,
) -> tuple[list[str], list[str], list[str]]:
    """Return (zombies, free_wrong, drifts) as lists of human-readable lines."""
    zombies: list[str] = []
    free_wrong: list[str] = []
    drifts: list[str] = []

    for row in ours:
        mid = row['model']
        # Only check OpenRouter-routed models (provider='openrouter')
        if row.get('provider') != 'openrouter':
            continue

        live_row = live.get(mid)
        if live_row is None:
            zombies.append(mid)
            continue

        our_in = float(row.get('input_per_million') or 0)
        our_out = float(row.get('output_per_million') or 0)
        live_in = live_row['prompt'] * 1_000_000
        live_out = live_row['completion'] * 1_000_000

        is_free = bool(row.get('is_free'))
        if is_free and (live_in > 0 or live_out > 0):
            free_wrong.append(
                f'{mid}: flagged is_free but live charges '
                f'${live_in:.4f}/M in, ${live_out:.4f}/M out'
            )
            continue

        in_diff = abs(our_in - live_in)
        out_diff = abs(our_out - live_out)
        if in_diff > DRIFT_THRESHOLD_USD_PER_MILLION or out_diff > DRIFT_THRESHOLD_USD_PER_MILLION:
            drifts.append(
                f'{mid}: ours ${our_in:.4f}/${our_out:.4f} vs '
                f'live ${live_in:.4f}/${live_out:.4f}'
            )

    return zombies, free_wrong, drifts


# ── telegram alert ─────────────────────────────────────────────────────

def send_telegram(env: dict, message: str) -> None:
    """Best-effort Telegram alert via the bot token from .env."""
    token = env.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = env.get('TELEGRAM_CHAT_ID', '') or env.get('TELEGRAM_OWNER_CHAT_ID', '')
    if not token or not chat_id:
        print('WARN: no TELEGRAM_BOT_TOKEN/CHAT_ID in .env — alert printed only')
        return
    try:
        data = json.dumps({
            'chat_id': chat_id,
            'text': message,
            'parse_mode': 'Markdown',
        }).encode('utf-8')
        req = urllib.request.Request(
            f'https://api.telegram.org/bot{token}/sendMessage',
            data=data,
            headers={'Content-Type': 'application/json'},
        )
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        print(f'WARN: telegram send failed: {e}')


# ── main ───────────────────────────────────────────────────────────────

def main() -> int:
    env = load_env()
    print('Fetching Supabase model_pricing ...')
    ours = fetch_supabase_pricing(env)
    print(f'  {len(ours)} token-priced rows')

    print('Fetching OpenRouter /v1/models ...')
    live = fetch_openrouter_models(env)
    print(f'  {len(live)} live models')

    zombies, free_wrong, drifts = detect_issues(ours, live)

    print()
    print('=' * 70)
    if not (zombies or free_wrong or drifts):
        print('✓  All rates match OpenRouter live pricing. No drift.')
        return 0

    lines: list[str] = ['⚠ *Harv pricing drift detected*', '']
    if zombies:
        lines.append(f'*Zombies ({len(zombies)})* — model dead on OpenRouter:')
        for m in zombies:
            lines.append(f'  • `{m}`')
        lines.append('')
    if free_wrong:
        lines.append(f'*Mis-flagged free ({len(free_wrong)})* — is_free=true but live charges:')
        for m in free_wrong:
            lines.append(f'  • {m}')
        lines.append('')
    if drifts:
        lines.append(f'*Rate drift ({len(drifts)})*:')
        for m in drifts:
            lines.append(f'  • {m}')
        lines.append('')
    lines.append('Update `model_pricing` in Supabase to resolve.')

    report = '\n'.join(lines)
    print(report)
    send_telegram(env, report)
    return 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:
        print(f'FATAL: {type(e).__name__}: {e}')
        sys.exit(2)
