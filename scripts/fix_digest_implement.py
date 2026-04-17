#!/usr/bin/env python3
"""Fix two bugs in /root/harv/agents/video_digest.py so implement/multi modes route correctly.

Bug 1: _detect_intent returns 'digest_video' on URL match BEFORE the implement/multi
       regex gets a chance. Move explicit-keyword checks ABOVE URL detection.

Bug 2: run() handlers dict is missing 'implement' and 'multi_digest' keys, so even
       if intent detection returned them, dispatch would fall back to digest_video.
"""
import py_compile
import shutil
import sys

VD = '/root/harv/agents/video_digest.py'

with open(VD) as f:
    code = f.read()

changes = 0

# --- Fix 1: reorder _detect_intent ---
# The patch appended implement/multi regex AFTER the URL short-circuit. Move the
# keyword-based intents BEFORE the URL checks so explicit user intent wins.
old_block = """    # digest (default for URLs -- YouTube, TikTok, or Twitter)
    if extract_video_id(task) or extract_tiktok_id(task) or extract_twitter_id(task):
        return 'digest_video'

    if re.search(r'implement|build.*from|do.*section|execute.*section|walk.*through|guide.*from|step.*by.*step', t):
        return 'implement'
    if t.count('http') >= 2 or re.search(r'these.*video|multiple.*video|combine.*video|synthesize|ideas.*from', t):
        return 'multi_digest'"""

new_block = """    # multi-video synthesis: 2+ URLs or explicit synthesis keywords
    if t.count('http') >= 2 or re.search(r'these.*video|multiple.*video|combine.*video|synthesize|ideas.*from', t):
        return 'multi_digest'

    # implementation guide: explicit keywords (matches before URL short-circuit)
    if re.search(r'implement|build.*from|do.*section|execute.*section|walk.*through|guide.*from|step.*by.*step', t):
        return 'implement'

    # digest (default for URLs -- YouTube, TikTok, or Twitter)
    if extract_video_id(task) or extract_tiktok_id(task) or extract_twitter_id(task):
        return 'digest_video'"""

if old_block in code:
    code = code.replace(old_block, new_block)
    changes += 1
    print('Fix 1: reordered _detect_intent — implement/multi now checked before URL')
elif new_block in code:
    print('Fix 1: already applied (skipping)')
else:
    print('Fix 1: FAILED — old block not found, bailing', file=sys.stderr)
    sys.exit(1)

# --- Fix 2: add missing handlers to run() dispatch ---
old_handlers = """        handlers = {
            'digest_video':    self._handle_digest_video,
            'extract_media':   self._handle_extract_media,
            'summarize_video': self._handle_summarize_video,
            'act_on_section':  self._handle_act_on_section,
            'list_digests':    self._handle_list_digests,
            'search_digests':  self._handle_search_digests,
            'digest_playlist': self._handle_digest_playlist,
        }"""

new_handlers = """        handlers = {
            'digest_video':    self._handle_digest_video,
            'extract_media':   self._handle_extract_media,
            'summarize_video': self._handle_summarize_video,
            'act_on_section':  self._handle_act_on_section,
            'list_digests':    self._handle_list_digests,
            'search_digests':  self._handle_search_digests,
            'digest_playlist': self._handle_digest_playlist,
            'implement':       self._handle_implement,
            'multi_digest':    self._handle_multi_digest,
        }"""

if old_handlers in code:
    code = code.replace(old_handlers, new_handlers)
    changes += 1
    print('Fix 2: added implement + multi_digest to dispatch handlers')
elif new_handlers in code:
    print('Fix 2: already applied (skipping)')
else:
    print('Fix 2: FAILED — old handlers block not found, bailing', file=sys.stderr)
    sys.exit(1)

if changes == 0:
    print('Nothing to change. Exiting.')
    sys.exit(0)

shutil.copy(VD, VD + '.bak')
with open(VD, 'w') as f:
    f.write(code)

py_compile.compile(VD, doraise=True)
print(f'Done. {changes} changes. Syntax OK. ({len(code)} bytes)')
print(f'Backup: {VD}.bak')
