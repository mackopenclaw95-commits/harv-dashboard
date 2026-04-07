"""
harv_api.py — Internal HTTP API wrapping harv_brain.py.

Listens on 127.0.0.1:8765 (localhost only — not exposed to internet).
Called by whatsapp_bot.js (Node.js) to reach the Python/Claude brain.

Endpoints:
  POST /chat        {session_id, text, agent?}  → {reply}
  POST /clear       {session_id}                → {ok}
  POST /run_router  {}                          → {n_pending, processed, still_pending}
  GET  /health                                  → {status}
"""

import logging
import os
import sys

# ── Load /root/harv/.env ─────────────────────────────────────────────────────
ENV_PATH = '/root/harv/.env'
if os.path.exists(ENV_PATH):
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

sys.path.insert(0, '/root/harv')

from flask import Flask, jsonify, request

from lib.harv_brain import chat_with_harv, clear_history, run_router_manual
from lib.harv_lib import append_log, sheets_client

# Blueprint imports
from api.blueprints.agents import agents_bp
from api.blueprints.analytics import analytics_bp
from api.blueprints.crons import crons_bp
from api.blueprints.events import events_bp
from api.blueprints.health import health_bp
from api.blueprints.settings_bp import settings_bp

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s %(message)s',
)
log = logging.getLogger('HarvAPI')

app = Flask(__name__)

# Register API blueprints
app.register_blueprint(agents_bp, url_prefix='/api/agents')
app.register_blueprint(analytics_bp, url_prefix='/api/analytics')
app.register_blueprint(crons_bp, url_prefix='/api/crons')
app.register_blueprint(events_bp, url_prefix='/api/events')
app.register_blueprint(health_bp, url_prefix='/api/health')
app.register_blueprint(settings_bp, url_prefix='/api/settings')


@app.route('/chat', methods=['POST'])
def chat():
    data       = request.json or {}
    session_id = data.get('session_id', '').strip()
    text       = data.get('text', '').strip()
    agent      = data.get('agent', 'WhatsApp')

    if not session_id or not text:
        return jsonify({'error': 'session_id and text are required'}), 400

    log.info(f'[{agent}] [{session_id}]: {text[:80]}')

    try:
        reply = chat_with_harv(session_id, text)
        if not reply:
            reply = '(no response)'
    except Exception as e:
        log.error(f'Chat error: {e}')
        return jsonify({'error': str(e)}), 500

    try:
        client = sheets_client()
        append_log(client, agent, 'INFO', 'Message',
                   f'from={session_id} in={len(text)} out={len(reply)}')
    except Exception:
        pass

    return jsonify({'reply': reply})


@app.route('/clear', methods=['POST'])
def clear():
    data       = request.json or {}
    session_id = data.get('session_id', '').strip()
    if not session_id:
        return jsonify({'error': 'session_id required'}), 400
    clear_history(session_id)
    log.info(f'Cleared history for {session_id}')
    return jsonify({'ok': True})


@app.route('/run_router', methods=['POST'])
def run_router():
    try:
        result = run_router_manual()
        return jsonify(result)
    except Exception as e:
        log.error(f'Router error: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/memory/dashboard', methods=['GET'])
def memory_dashboard():
    """Memory stats for the dashboard."""
    from lib.harv_brain import _get_supabase
    sb = _get_supabase()
    if not sb:
        return jsonify({'stats': {'total_entries': 0, 'collection_name': 'memory_entries'}}), 200
    try:
        result = sb.table('memory_entries').select('*', count='exact').limit(0).execute()
        return jsonify({
            'stats': {
                'total_entries': result.count or 0,
                'collection_name': 'memory_entries',
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/memory/search', methods=['GET'])
def memory_search():
    """Text search across memory entries."""
    from lib.harv_brain import _get_supabase
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'results': []}), 200
    sb = _get_supabase()
    if not sb:
        return jsonify({'results': []}), 200
    try:
        result = sb.table('memory_entries') \
            .select('id, content, metadata, agent_name, created_at') \
            .ilike('content', f'%{query}%') \
            .order('created_at', desc=True) \
            .limit(20) \
            .execute()
        results = [{
            'id': r['id'],
            'content': r['content'],
            'metadata': r.get('metadata', {}),
            'timestamp': r.get('created_at', ''),
        } for r in (result.data or [])]
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'harv-api'})


if __name__ == '__main__':
    log.info('Starting Harv API on 127.0.0.1:8765...')
    app.run(host='127.0.0.1', port=8765, debug=False)
