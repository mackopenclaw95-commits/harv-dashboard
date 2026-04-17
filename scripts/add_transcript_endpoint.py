#!/usr/bin/env python3
"""Add a /transcript endpoint to chat blueprint.

Returns the transcript + basic metadata for a video URL without invoking any LLM.
Reuses VideoDigestAgent._resolve_video so all existing caching (transcript cache,
metadata cache) kicks in. Fresh video: 30-60s. Cached: <1s.

Used by the dashboard to fetch a transcript client-side before firing the Claude
Code routine — Claude Code's sandbox can't reach YouTube directly.
"""
import py_compile
import shutil
import sys

CHAT = '/root/harv/api/blueprints/chat.py'

with open(CHAT) as f:
    code = f.read()

if "@chat_bp.route('/transcript'" in code:
    print('Already added, nothing to do.')
    sys.exit(0)

# Insert the new route before the last route in the file so it lives with the others.
anchor = "@chat_bp.route('/chat/stream', methods=['POST'])"
if anchor not in code:
    print('FAILED: anchor not found', file=sys.stderr)
    sys.exit(1)

new_route = '''@chat_bp.route('/transcript', methods=['POST'])
def transcript():
    """Return transcript + metadata for a video URL. No LLM calls.

    Request:  {"url": "https://..."}
    Response: {"transcript": "...", "title": "...", "channel": "...",
               "video_id": "...", "platform": "youtube|tiktok|twitter",
               "error": ""}
    """
    auth_err = _require_auth()
    if auth_err:
        return auth_err

    data = request.get_json(force=True) or {}
    url = (data.get('url') or '').strip()
    if not url:
        return jsonify({'error': 'url field is required'}), 400

    try:
        from agents.video_digest import VideoDigestAgent
        agent = VideoDigestAgent()
        info = agent._resolve_video(url)
        transcript_text = info.get('transcript') or ''
        meta = info.get('meta') or {}
        return jsonify({
            'transcript': transcript_text,
            'title': meta.get('title', 'Unknown'),
            'channel': meta.get('channel', 'Unknown'),
            'duration': meta.get('duration', '?'),
            'video_id': info.get('video_id', ''),
            'platform': info.get('platform', ''),
            'length': len(transcript_text),
            'error': info.get('error', ''),
        })
    except Exception as exc:
        log.error('transcript fetch failed: %s', exc, exc_info=True)
        return jsonify({'error': f'transcript fetch failed: {exc}'}), 500


'''

code = code.replace(anchor, new_route + anchor)
shutil.copy(CHAT, CHAT + '.bak_transcript')
with open(CHAT, 'w') as f:
    f.write(code)
py_compile.compile(CHAT, doraise=True)
print(f'Added /transcript route. Backup: {CHAT}.bak_transcript')
