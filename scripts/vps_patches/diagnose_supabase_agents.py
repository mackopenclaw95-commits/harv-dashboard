"""Diagnose which 'agent' values in Supabase api_cost_events have null user_id."""
import json
import urllib.parse
import urllib.request
from collections import Counter

ENV_PATH = '/root/harv/.env'

def load_env() -> dict:
    env = {}
    with open(ENV_PATH, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

env = load_env()
url = env['SUPABASE_URL']
key = env['SUPABASE_SERVICE_ROLE_KEY']

# All rows with null user_id
endpoint = (
    f'{url}/rest/v1/api_cost_events'
    '?select=agent,model,cost,parent_agent,modality,user_id,event_timestamp,summary'
    '&user_id=is.null'
    '&order=event_timestamp.desc'
    '&limit=1000'
)
req = urllib.request.Request(
    endpoint,
    headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Accept': 'application/json'},
)
with urllib.request.urlopen(req, timeout=30) as r:
    rows = json.load(r)

print(f'Found {len(rows)} api_cost_events with null user_id\n')

by_agent = Counter()
agent_cost = {}
agent_samples = {}
for row in rows:
    agent = row.get('agent') or '(empty string)'
    by_agent[agent] += 1
    agent_cost[agent] = agent_cost.get(agent, 0) + float(row.get('cost') or 0)
    if agent not in agent_samples:
        agent_samples[agent] = row

print('=== By agent ===')
for agent, n in by_agent.most_common():
    cost = agent_cost[agent]
    print(f'  {n:4d}  ${cost:.4f}  {agent}')

print('\n=== Sample row per agent ===')
for agent, sample in agent_samples.items():
    print(f'--- {agent} ---')
    print(json.dumps(sample, indent=2, default=str))
    print()
