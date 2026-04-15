import sqlite3, json, sys

c = sqlite3.connect('/root/harv/data/events.db')
c.row_factory = sqlite3.Row
rows = c.execute(
    "SELECT id, agent, action, cost, tokens, metadata FROM events WHERE action=? ORDER BY id DESC LIMIT 5",
    ('api_cost',)
).fetchall()

if not rows:
    print("No api_cost events found")
    sys.exit(0)

for r in rows:
    meta = {}
    try:
        meta = json.loads(r['metadata']) if r['metadata'] else {}
    except Exception:
        meta = {}
    user_id = meta.get('user_id')
    parent = meta.get('parent_agent')
    modality = meta.get('modality', 'text')
    print(f"#{r['id']:>5}  agent={r['agent']:<16}  tokens={r['tokens']:<6}  cost=${r['cost']:.6f}  user_id={user_id}  parent={parent}  modality={modality}")
