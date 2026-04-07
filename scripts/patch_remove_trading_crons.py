"""Remove trading cron entries from crons blueprint."""

CRONS_PATH = "/root/harv/api/blueprints/crons.py"
with open(CRONS_PATH) as f:
    code = f.read()

lines_to_remove = [
    "    'paper_trade_cycle.py': {'name': 'Paper Trade Cycle', 'desc': 'Automated daily paper trading — scan, analyze, trade', 'group': 'Trading'},",
    "    'btc_5min_cron.py': {'name': 'BTC 5min Tracker', 'desc': 'Bitcoin price tracking every 5 minutes', 'group': 'Trading'},",
    "    'arb_check.py': {'name': 'Arb Scanner', 'desc': 'Polymarket/Kalshi arbitrage opportunity scanner', 'group': 'Trading'},",
]

for line in lines_to_remove:
    if line in code:
        code = code.replace(line + "\n", "")
        print(f"Removed: {line.split(':')[0].strip()}")

with open(CRONS_PATH, "w") as f:
    f.write(code)
print(f"crons.py saved ({len(code)} bytes)")
