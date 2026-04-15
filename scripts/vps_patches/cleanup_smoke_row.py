"""Delete the smoke-test row from Supabase api_cost_events so it doesn't
pollute cost reporting. One-off cleanup after smoke_test_attribution.py."""
import json
import urllib.parse
import urllib.request

with open('/root/harv/.env') as f:
    env = {}
    for line in f:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

url = env['SUPABASE_URL']
key = env['SUPABASE_SERVICE_ROLE_KEY']
endpoint = f'{url}/rest/v1/api_cost_events?agent=eq.Harv%20(telegram-smoke)'
req = urllib.request.Request(
    endpoint,
    method='DELETE',
    headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Prefer': 'return=representation'},
)
with urllib.request.urlopen(req, timeout=30) as r:
    out = json.load(r)
print(f'Deleted {len(out)} smoke-test row(s)')
