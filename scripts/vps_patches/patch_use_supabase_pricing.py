"""Wire harv_lib.calc_cost to read rates from pricing_cache (Supabase-backed).

This patches `calc_cost` in /root/harv/lib/harv_lib.py so the inline dict
stops being the source of truth. After this runs, Supabase model_pricing
is the single source of truth for text-token rates.

Steps performed (idempotent, sentinel-guarded):
  1. Verify /root/harv/lib/pricing_cache.py exists (scp before running).
  2. Back up harv_lib.py to harv_lib.py.<timestamp>.bak.
  3. Replace the body of `def calc_cost(...):` with a delegator to
     pricing_cache.calc_cost(), falling back to the old inline dict
     only if pricing_cache import fails.
  4. Compile to catch syntax errors before we write.
  5. Advise a restart of harv-api and harv-dashboard services.

Usage:
    scp scripts/vps_patches/pricing_cache.py root@VPS:/root/harv/lib/
    scp scripts/vps_patches/patch_use_supabase_pricing.py root@VPS:/tmp/
    ssh root@VPS 'python3 /tmp/patch_use_supabase_pricing.py'
    ssh root@VPS 'systemctl restart harv-api harv-dashboard'
    ssh root@VPS 'python3 /root/harv/scripts/verify_calc_cost.py'
"""
import os
import py_compile
import re
import shutil
import sys
import time

HARV_LIB = '/root/harv/lib/harv_lib.py'
CACHE_MODULE = '/root/harv/lib/pricing_cache.py'
SENTINEL = '# --- USES_SUPABASE_PRICING_V1 ---'

NEW_CALC_COST = '''def calc_cost(model, input_tokens, output_tokens):
    """Cost in USD for a text completion. Reads rates from Supabase
    model_pricing via pricing_cache (5min TTL), falls back to inline
    _MODEL_PRICING dict if the cache module is unavailable.
    ''' + SENTINEL + '''"""
    try:
        from lib.pricing_cache import calc_cost as _sb_calc_cost
        return _sb_calc_cost(model, input_tokens, output_tokens)
    except Exception:
        pricing = _MODEL_PRICING.get(model)
        if not pricing:
            return 0.0
        return (
            (float(input_tokens) * float(pricing.get('input', 0)))
            + (float(output_tokens) * float(pricing.get('output', 0)))
        ) / 1_000_000
'''


def main() -> int:
    if not os.path.exists(CACHE_MODULE):
        print(f'FATAL: {CACHE_MODULE} not found. scp pricing_cache.py first.')
        return 2
    if not os.path.exists(HARV_LIB):
        print(f'FATAL: {HARV_LIB} not found.')
        return 2

    with open(HARV_LIB, 'r') as f:
        content = f.read()

    if SENTINEL in content:
        print('already patched (sentinel found). no changes.')
        return 0

    # Back up
    ts = time.strftime('%Y%m%d_%H%M%S')
    backup = f'{HARV_LIB}.{ts}.bak'
    shutil.copy2(HARV_LIB, backup)
    print(f'backup: {backup}')

    # Locate `def calc_cost(` — needs to match the function signature, then
    # greedy-consume lines until the next top-level `def ` or class/module
    # end. We use a regex that captures the function by looking for the next
    # top-level definition.
    m = re.search(
        r'^def calc_cost\([^)]*\):[\s\S]*?(?=^def |^class |\Z)',
        content,
        re.MULTILINE,
    )
    if not m:
        print('FATAL: could not locate def calc_cost(...) in harv_lib.py')
        return 2

    # Preserve trailing blank line before the next def
    old_block = m.group(0)
    # Ensure replacement ends with a blank line
    replacement = NEW_CALC_COST
    if not replacement.endswith('\n\n'):
        replacement = replacement.rstrip('\n') + '\n\n'

    new_content = content.replace(old_block, replacement, 1)
    if new_content == content:
        print('FATAL: replacement would be a no-op (regex matched but substitution failed)')
        return 2

    with open(HARV_LIB, 'w') as f:
        f.write(new_content)

    try:
        py_compile.compile(HARV_LIB, doraise=True)
    except py_compile.PyCompileError as e:
        print(f'FATAL: patched file does not compile: {e}')
        print(f'restoring backup {backup}')
        shutil.copy2(backup, HARV_LIB)
        return 2

    print('calc_cost patched to use pricing_cache (Supabase-backed)')
    print('restart services:')
    print('  systemctl restart harv-api harv-dashboard')
    print('verify:')
    print('  python3 /root/harv/scripts/verify_calc_cost.py')
    return 0


if __name__ == '__main__':
    sys.exit(main())
