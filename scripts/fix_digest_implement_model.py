#!/usr/bin/env python3
"""Swap implement/multi_digest handlers from deepseek-chat-v3-0324 (slow, ~50 tok/s)
to google/gemini-2.5-flash (fast, ~200 tok/s) so implement mode finishes under
Vercel Hobby's 60s function timeout.
"""
import py_compile
import shutil
import sys

VD = '/root/harv/agents/video_digest.py'
OLD = "model='deepseek/deepseek-chat-v3-0324'"
NEW = "model='google/gemini-2.5-flash'"

with open(VD) as f:
    code = f.read()

count_old = code.count(OLD)
if count_old == 0:
    if code.count(NEW) > 0:
        print('Already swapped, nothing to do.')
        sys.exit(0)
    print('Neither old nor new model slug found — aborting.', file=sys.stderr)
    sys.exit(1)

shutil.copy(VD, VD + '.bak2')
code = code.replace(OLD, NEW)
with open(VD, 'w') as f:
    f.write(code)

py_compile.compile(VD, doraise=True)
print(f'Swapped {count_old} model slug(s). Backup: {VD}.bak2')
