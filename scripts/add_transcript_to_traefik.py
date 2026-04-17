#!/usr/bin/env python3
"""Add /transcript to the Traefik X-API-Key whitelist so the new Flask route
is reachable from outside without basic auth (it enforces its own X-API-Key).
"""
import shutil
import sys

CFG = '/docker/traefik/data/dynamic/api.yml'

with open(CFG) as f:
    cfg = f.read()

old = '(Path(`/chat`) || Path(`/task`) || Path(`/status`))'
new = '(Path(`/chat`) || Path(`/task`) || Path(`/status`) || Path(`/transcript`))'

if '/transcript' in cfg:
    print('Already whitelisted.')
    sys.exit(0)
if old not in cfg:
    print('FAILED: anchor block not found', file=sys.stderr)
    sys.exit(1)

shutil.copy(CFG, CFG + '.bak_transcript')
cfg = cfg.replace(old, new)
with open(CFG, 'w') as f:
    f.write(cfg)
print('Added /transcript to Traefik key-auth whitelist.')
