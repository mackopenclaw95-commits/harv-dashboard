"""Diagnose what's calling chat_with_harv / log_api_cost without user_id.

Queries /root/harv/data/events.db for recent api_cost events where
agent='Harv' and user_id is null, groups by model + any caller
hints in metadata, prints a summary.
"""
import json
import sqlite3
from collections import Counter
from datetime import datetime, timedelta

DB = '/root/harv/data/events.db'

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

# Last 30 days of Harv api_cost events (match Supabase window)
since = (datetime.now() - timedelta(days=30)).isoformat()
cur = conn.execute(
    """
    SELECT timestamp, metadata
    FROM events
    WHERE action='api_cost'
      AND timestamp >= ?
    ORDER BY timestamp DESC
    """,
    (since,),
)

total = 0
harv_with_user = 0
harv_no_user = 0
harv_no_user_models = Counter()
harv_no_user_sources = Counter()
harv_no_user_samples = []

all_agents = Counter()
no_user_by_agent = Counter()

for row in cur:
    total += 1
    try:
        meta = json.loads(row['metadata'] or '{}')
    except Exception:
        continue
    agent = meta.get('agent') or 'NONE'
    all_agents[agent] += 1
    uid = meta.get('user_id')
    if not uid:
        no_user_by_agent[agent] += 1
    if agent.lower() == 'harv':
        if uid:
            harv_with_user += 1
        else:
            harv_no_user += 1
            harv_no_user_models[meta.get('model', '?')] += 1
            source = meta.get('parent_agent') or meta.get('source') or meta.get('origin') or 'unknown'
            harv_no_user_sources[source] += 1
            if len(harv_no_user_samples) < 5:
                harv_no_user_samples.append(meta)

print(f'=== api_cost events (30-day window) ===')
print(f'Total events: {total}')
print()
print('=== All agents ===')
for agent, n in all_agents.most_common():
    no_u = no_user_by_agent.get(agent, 0)
    print(f'  {n:4d}  {agent:20}  (no_user: {no_u})')
print()
print(f'Harv with user_id: {harv_with_user}')
print(f'Harv WITHOUT user_id: {harv_no_user}')
print()
print('=== Harv no-user by model ===')
for model, n in harv_no_user_models.most_common():
    print(f'  {n:4d}  {model}')
print()
print('=== Harv no-user by source hint ===')
for src, n in harv_no_user_sources.most_common():
    print(f'  {n:4d}  {src}')
print()
print('=== Sample metadata blobs ===')
for i, sample in enumerate(harv_no_user_samples, 1):
    print(f'--- sample {i} ---')
    print(json.dumps(sample, indent=2, default=str))
