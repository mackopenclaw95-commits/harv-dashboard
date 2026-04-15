"""Patch /root/harv/scripts/harv_api.py to set the request context before dispatch."""
import py_compile, sys

PATH = '/root/harv/scripts/harv_api.py'
SENTINEL = '# --- COST_TRACKING_INTERNAL_V1 ---'

with open(PATH, 'r') as f:
    content = f.read()

if SENTINEL in content:
    print('already patched')
    sys.exit(0)

# Insert call right after source is extracted
old = (
    "    user_id    = data.get('user_id', '').strip()\n"
    "    source     = data.get('source', 'api')  # 'telegram', 'whatsapp', 'dashboard', 'api'\n"
)
new = (
    old
    + '    ' + SENTINEL + '\n'
    + '    try:\n'
    + '        from lib.harv_lib import set_request_context\n'
    + '        set_request_context(\n'
    + '            user_id=user_id or None,\n'
    + '            source=source or None,\n'
    + '            session_id=session_id,\n'
    + '        )\n'
    + '    except Exception as _ctx_err:\n'
    + "        log.warning('set_request_context failed: %s', _ctx_err)\n"
)

if old not in content:
    print('FATAL: could not locate anchor')
    sys.exit(2)

content = content.replace(old, new)

with open(PATH, 'w') as f:
    f.write(content)

py_compile.compile(PATH, doraise=True)
print('patched + compiled OK')
