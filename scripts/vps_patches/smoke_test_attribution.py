"""Smoke test: send a fake chat request without user_id and verify the
resulting api_cost event has agent='Harv (telegram-smoke)'."""
import json
import time
import urllib.request
import sqlite3

DB = '/root/harv/data/events.db'

# Load API key from .env
api_key = ''
with open('/root/harv/.env', 'r') as f:
    for line in f:
        if line.startswith('API_KEY=') or line.startswith('HARV_API_KEY='):
            api_key = line.split('=', 1)[1].strip().strip('"').strip("'")
            break

# Get the newest event id BEFORE the test so we can find the fresh one after
conn = sqlite3.connect(DB)
before_max = conn.execute(
    "SELECT COALESCE(MAX(id), 0) FROM events WHERE action='api_cost'"
).fetchone()[0]
conn.close()

# Send a trivial request to the internal API
payload = {
    'session_id': 'smoke-test-attribution',
    'text': 'Say the word ok and nothing else.',
    'plan': 'free',
    'model_tier': 'primary',
    'user_id': '',  # intentionally empty
    'source': 'telegram-smoke',
    'agent': 'Harv',
}
req = urllib.request.Request(
    'http://127.0.0.1:8765/chat',
    data=json.dumps(payload).encode('utf-8'),
    headers={
        'Content-Type': 'application/json',
        'X-API-Key': api_key,
    },
)
print(f'POST /chat source=telegram-smoke user_id=""')
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.load(r)
        print(f'reply: {str(resp.get("reply", resp))[:120]}')
except Exception as e:
    print(f'request failed: {e}')
    import sys; sys.exit(2)

# Give the logger a moment
time.sleep(0.5)

# Pull any new api_cost events since our snapshot
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
rows = list(conn.execute(
    "SELECT id, agent, timestamp, metadata FROM events WHERE action='api_cost' AND id > ? ORDER BY id",
    (before_max,)
))
conn.close()

print()
print(f'=== New api_cost events since test started ===')
if not rows:
    print('NONE — attribution logging did not fire')
    import sys; sys.exit(1)

ok = True
for r in rows:
    try:
        meta = json.loads(r['metadata'] or '{}')
    except Exception:
        meta = {}
    print(f'id={r["id"]} agent={r["agent"]!r}')
    print(f'  metadata source={meta.get("source")!r} user_id={meta.get("user_id")!r} model={meta.get("model")!r}')
    if 'telegram-smoke' not in (r['agent'] or ''):
        ok = False

print()
print('PASS — agent includes source suffix' if ok else 'FAIL — agent missing source suffix')
import sys; sys.exit(0 if ok else 1)
