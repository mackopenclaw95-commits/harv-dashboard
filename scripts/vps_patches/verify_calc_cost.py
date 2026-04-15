"""Unit-test VPS calc_cost against the live-verified rates."""
import sys
sys.path.insert(0, '/root/harv')
from lib.harv_lib import calc_cost

cases = [
    ('google/gemini-2.5-flash', 1000, 500, (1000 * 0.30 + 500 * 2.50) / 1_000_000),
    ('x-ai/grok-4.1-fast', 1000, 500, (1000 * 0.20 + 500 * 0.50) / 1_000_000),
    ('qwen/qwen3-8b', 1000, 500, (1000 * 0.05 + 500 * 0.40) / 1_000_000),
    ('minimax/minimax-m2.1', 1000, 500, (1000 * 0.29 + 500 * 0.95) / 1_000_000),
    ('deepseek/deepseek-r1', 1000, 500, (1000 * 0.70 + 500 * 2.50) / 1_000_000),
    ('deepseek/deepseek-chat-v3-0324', 1000, 500, (1000 * 0.20 + 500 * 0.77) / 1_000_000),
    ('deepseek/deepseek-v3.2', 1000, 500, (1000 * 0.26 + 500 * 0.38) / 1_000_000),
    ('openai/gpt-4.1', 2001, 10, (2001 * 2.00 + 10 * 8.00) / 1_000_000),
]

ok = True
for model, i, o, expected in cases:
    actual = calc_cost(model, i, o)
    match = abs(actual - expected) < 1e-9
    ok = ok and match
    status = 'OK' if match else 'FAIL'
    print(f'{model:45} actual={actual:.8f} expected={expected:.8f} {status}')

print()
print('ALL PASS' if ok else 'ONE OR MORE FAILED')
sys.exit(0 if ok else 1)
