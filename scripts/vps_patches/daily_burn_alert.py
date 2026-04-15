"""Daily burn-rate alert — Telegram ping when cost spikes.

Runs on the VPS (cron: every hour). Reads today's api_cost_events total
from Supabase and alerts on Telegram when it crosses a configurable
threshold. Default threshold: $2/day. Fires once per day — tracks
last-alerted-date in /tmp/harv_burn_alert_state.

Goal: catch runaway background loops early (e.g., a rogue Medic retry
eating $40 overnight). Weekly drift is for pricing, this is for volume.

Installation on VPS:
    python3 /root/harv/scripts/daily_burn_alert.py   # dry run
    crontab -e
    # Every hour at :23 (off the hour)
    23 * * * * /usr/bin/python3 /root/harv/scripts/daily_burn_alert.py >> /var/log/harv/burn_alert.log 2>&1

Environment (from /root/harv/.env):
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    TELEGRAM_BOT_TOKEN
    TELEGRAM_CHAT_ID
    DAILY_BURN_ALERT_THRESHOLD  (optional, default 2.0)
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ENV_PATH = '/root/harv/.env'
STATE_PATH = '/tmp/harv_burn_alert_state'
DEFAULT_THRESHOLD = 2.0  # USD/day


def load_env() -> dict:
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


def fetch_today_cost(env: dict) -> tuple[float, int]:
    """Return (total_cost_today_usd, event_count)."""
    url = env.get('SUPABASE_URL') or os.environ.get('SUPABASE_URL', '')
    key = env.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        print('FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
        sys.exit(2)

    # Midnight UTC — matches the "today" definition Next.js uses for cap checks.
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    iso = today_start.isoformat()

    endpoint = (
        f'{url}/rest/v1/api_cost_events'
        '?select=cost'
        f'&event_timestamp=gte.{urllib.parse.quote(iso)}'
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
        rows = json.load(r)

    total = 0.0
    for row in rows:
        try:
            total += float(row.get('cost') or 0)
        except (TypeError, ValueError):
            pass
    return total, len(rows)


def read_state() -> str:
    try:
        return Path(STATE_PATH).read_text().strip()
    except Exception:
        return ''


def write_state(value: str) -> None:
    try:
        Path(STATE_PATH).write_text(value)
    except Exception as e:
        print(f'WARN: could not persist state to {STATE_PATH}: {e}')


def send_telegram(env: dict, message: str) -> None:
    token = env.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = env.get('TELEGRAM_CHAT_ID', '') or env.get('TELEGRAM_OWNER_CHAT_ID', '')
    if not token or not chat_id:
        print('WARN: TELEGRAM_BOT_TOKEN/CHAT_ID missing — alert printed only')
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


def main() -> int:
    env = load_env()
    try:
        threshold = float(env.get('DAILY_BURN_ALERT_THRESHOLD', DEFAULT_THRESHOLD))
    except ValueError:
        threshold = DEFAULT_THRESHOLD

    total, count = fetch_today_cost(env)
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    print(f'[{today}] {count} events, ${total:.4f} total (threshold ${threshold:.2f})')

    if total < threshold:
        print('Under threshold. Silent.')
        return 0

    last_alerted = read_state()
    if last_alerted == today:
        print(f'Already alerted today ({today}). Silent.')
        return 0

    pct = int((total / threshold) * 100)
    message = (
        f'⚠ *Harv daily burn alert*\n\n'
        f'Today: *${total:.4f}* across {count} events\n'
        f'Threshold: ${threshold:.2f} ({pct}%)\n\n'
        f'Check admin hub → API Cost for breakdown.'
    )
    print(message)
    send_telegram(env, message)
    write_state(today)
    return 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:
        print(f'FATAL: {type(e).__name__}: {e}')
        sys.exit(2)
