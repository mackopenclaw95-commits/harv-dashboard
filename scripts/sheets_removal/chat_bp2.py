"""
blueprints/chat.py — Central chat/task/status endpoints for Harv API.

Routes (all require X-API-Key header except noted):
  POST /chat          {message, session_id?}  -> {reply, session_id}
  POST /task          {task, agent?, priority?} -> {task_id, status}
  GET  /status        -> Mission Control dashboard summary
  GET  /health        -> uptime + last heartbeat (NO auth required)

Auth: X-API-Key header matched against HARV_API_KEY env var.
Rate limit: 60/minute per IP (applied at app level via Flask-Limiter).
"""

import logging
import os
import time
import uuid
from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify, request

log = logging.getLogger('HarvChatAPI')

# SQLite task store (primary queue)
try:
    from lib.task_store import create_task as _ts_create_task, get_stats as _ts_get_stats
    _TS_OK = True
except Exception as _ts_e:
    log.warning(f'task_store import failed: {_ts_e}')
    _TS_OK = False

chat_bp = Blueprint('chat', __name__)

TZ_EST    = timezone(timedelta(hours=-4))
_BOOT_TIME = time.time()


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def _check_api_key() -> bool:
    """Return True if the request carries a valid X-API-Key."""
    expected = os.environ.get('HARV_API_KEY', '').strip()
    if not expected:
        log.warning('HARV_API_KEY not set -- denying all requests')
        return False
    provided = request.headers.get('X-API-Key', '').strip()
    return provided == expected


def _require_auth():
    """Return None if auth passes, or a 401 Response."""
    if not _check_api_key():
        return jsonify({'error': 'Unauthorized -- missing or invalid X-API-Key'}), 401
    return None


# ---------------------------------------------------------------------------
# POST /chat
# ---------------------------------------------------------------------------

@chat_bp.route('/chat', methods=['POST'])
def chat():
    auth_err = _require_auth()
    if auth_err:
        return auth_err

    data    = request.get_json(force=True) or {}
    message = (data.get('message') or data.get('text') or '').strip()
    if not message:
        return jsonify({'error': 'message field is required'}), 400

    session_id = (data.get('session_id') or '').strip()
    if not session_id:
        session_id = f'api-{uuid.uuid4().hex[:12]}'

    agent = (data.get('agent') or '').strip()
    log.info('POST /chat session=%s agent=%s msg=%r', session_id, agent or 'harv', message[:80])

    # If agent specified, prefix message with routing directive
    routed_message = message
    if agent:
        routed_message = f'[DIRECT:{agent}] {message}'

    # Streaming mode: return SSE if stream=true in body
    if data.get('stream'):
        def generate():
            try:
                from lib.harv_brain import chat_with_harv_stream
                for chunk in chat_with_harv_stream(session_id, routed_message):
                    yield chunk
            except Exception as e:
                log.error('stream error: %s', e)
                import json as _json
                yield f'data: {_json.dumps({"type": "error", "message": str(e)})}\n\n'
        from flask import Response
        return Response(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive',
            },
        )

    try:
        from lib.harv_brain import chat_with_harv
        reply = chat_with_harv(session_id, routed_message)
        if not reply:
            reply = '(no response)'
    except Exception as e:
        log.error('chat error: %s', e)
        return jsonify({'error': str(e)}), 500

    return jsonify({'reply': reply, 'session_id': session_id})



# ---------------------------------------------------------------------------
# POST /chat/clear
# ---------------------------------------------------------------------------

@chat_bp.route('/chat/clear', methods=['POST'])
def chat_clear():
    auth_err = _require_auth()
    if auth_err:
        return auth_err

    data = request.get_json(force=True) or {}
    session_id = (data.get('session_id') or '').strip()
    if not session_id:
        return jsonify({'error': 'session_id required'}), 400

    try:
        from lib.harv_brain import clear_history
        clear_history(session_id)
        log.info('POST /chat/clear session=%s', session_id)
        return jsonify({'status': 'cleared', 'session_id': session_id})
    except Exception as e:
        log.error('clear error: %s', e)
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# POST /task
# ---------------------------------------------------------------------------

@chat_bp.route('/task', methods=['POST'])
def task():
    auth_err = _require_auth()
    if auth_err:
        return auth_err

    data     = request.get_json(force=True) or {}
    task_str = (data.get('task') or data.get('description') or '').strip()
    if not task_str:
        return jsonify({'error': 'task field is required'}), 400

    agent    = (data.get('agent') or 'Drive').strip()
    priority = (data.get('priority') or 'normal').lower().strip()

    log.info('POST /task agent=%s priority=%s task=%r', agent, priority, task_str[:80])

    # Try SQLite task store first
    if _TS_OK:
        try:
            task_id = _ts_create_task(
                description=task_str,
                priority=priority,
                agent=agent if agent and agent != 'Drive' else None,
                source='api',
            )
            log.info('task_store: created %s', task_id)
            return jsonify({
                'task_id': task_id,
                'status':  'queued',
                'agent':   agent,
                'priority': priority,
            }), 202
        except Exception as e:
            log.warning('task_store create_task failed, falling back to harv_brain: %s', e)

    # Fallback: harv_brain tool_queue_task
    try:
        from lib.harv_brain import tool_queue_task
        result = tool_queue_task({
            'description': task_str,
            'agent':       agent,
            'priority':    priority,
            'input':       task_str,
        })
        return jsonify({'result': result, 'agent': agent, 'priority': priority}), 202
    except Exception as e:
        log.error('task error: %s', e)
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# GET /status
# ---------------------------------------------------------------------------

@chat_bp.route('/status', methods=['GET'])
def status():
    auth_err = _require_auth()
    if auth_err:
        return auth_err

    log.info('GET /status')
    task_stats = {}
    if _TS_OK:
        try:
            task_stats = _ts_get_stats()
        except Exception as _stat_e:
            log.warning('task_store get_stats failed: %s', _stat_e)
    try:
        return jsonify({
            'status':     'ok',
            'timestamp':  datetime.now(TZ_EST).strftime('%Y-%m-%d %I:%M %p EST'),
            'task_store': task_stats,
        })
    except Exception as e:
        log.error('status error: %s', e)
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# GET /health -- NO auth required
# ---------------------------------------------------------------------------

@chat_bp.route('/health', methods=['GET'])
def health():
    """Lightweight liveness probe. Pass ?agents=true for per-agent health_check() data."""
    try:
        with open('/proc/uptime') as f:
            uptime_secs = int(float(f.read().split()[0]))
    except Exception:
        uptime_secs = -1

    base = {
        'status':             'ok',
        'service':            'harv-api',
        'timestamp':          datetime.now(TZ_EST).strftime('%Y-%m-%dT%H:%M:%S'),
        'uptime_seconds':     uptime_secs,
        'api_uptime_seconds': int(time.time() - _BOOT_TIME),
    }

    # Optional per-agent health_check() data
    if request.args.get('agents') == 'true':
        import importlib.util as _ilu_h
        import os as _os_h
        import json as _json_h

        _agents_dir_h = '/root/harv/agents'
        _discovered_h = []
        try:
            for _fname_h in sorted(_os_h.listdir(_agents_dir_h)):
                if not _fname_h.endswith('.py') or _fname_h.startswith('_'):
                    continue
                if _fname_h in ('base_agent.py', 'ledger.py', 'router.py', 'guardian.py',
                                 'analytics.py', 'health.py', 'journal.py', 'drive.py',
                                 'analytics_server.py', 'memory_server.py', 'entity_store.py'):
                    continue
                _fpath_h = _os_h.path.join(_agents_dir_h, _fname_h)
                try:
                    _spec_h = _ilu_h.spec_from_file_location('_hc_' + _fname_h, _fpath_h)
                    _mod_h  = _ilu_h.module_from_spec(_spec_h)
                    _spec_h.loader.exec_module(_mod_h)
                    for _attr_h in dir(_mod_h):
                        _cls_h = getattr(_mod_h, _attr_h, None)
                        if (isinstance(_cls_h, type) and
                                hasattr(_cls_h, 'health_check') and
                                hasattr(_cls_h, 'execute') and
                                _attr_h != 'BaseAgent'):
                            _discovered_h.append((_attr_h, _cls_h))
                except Exception:
                    pass
        except Exception as _de_h:
            log.warning('health?agents: discovery error: %s', _de_h)

        _agent_results_h = []
        from zoneinfo import ZoneInfo as _ZI_h
        from datetime import datetime as _dt_h
        from lib.harv_errors import (get_circuit_status as _gcs_h, log_error as _le_h,
                                      safe_api_call as _sac_h)

        for _cls_name_h, _cls_h in _discovered_h:
            try:
                _inst_h = _cls_h.__new__(_cls_h)
                _inst_h.agent_name       = _cls_name_h
                _inst_h.provider         = None
                _inst_h.domain           = None
                _inst_h._google_services = None
                _inst_h._http_client     = None
                _inst_h._started_at      = _dt_h.now(_ZI_h('America/New_York'))
                _inst_h._last_execution  = None
                _inst_h._last_error      = None
                _inst_h._error_log       = []
                _inst_h.safe_api_call      = _sac_h
                _inst_h.log_error          = _le_h
                _inst_h.get_circuit_status = _gcs_h
                try:
                    with open('/root/harv/core.json') as _cf_h:
                        _inst_h._core = _json_h.load(_cf_h)
                except Exception:
                    _inst_h._core = {}
                _agent_results_h.append(_inst_h.health_check())
            except Exception as _ae_h:
                log.warning('health?agents: %s failed: %s', _cls_name_h, _ae_h)
                _agent_results_h.append({
                    'agent_name': _cls_name_h,
                    'status': 'error',
                    'last_execution': None,
                    'last_error': {
                        'timestamp': datetime.now(TZ_EST).strftime('%Y-%m-%dT%H:%M:%S'),
                        'message': str(_ae_h),
                    },
                    'error_count_24h': 0,
                    'circuit_breaker_state': 'unknown',
                    'uptime_seconds': 0,
                    'message_queue_depth': -1,
                    'model': 'unknown',
                    'timestamp': datetime.now(TZ_EST).strftime('%Y-%m-%dT%H:%M:%S'),
                })

        base['agents'] = _agent_results_h

    return jsonify(base)



# ---------------------------------------------------------------------------
# POST /chat/stream — SSE streaming chat
# ---------------------------------------------------------------------------

@chat_bp.route('/chat/stream', methods=['POST'])
def chat_stream():
    auth_err = _require_auth()
    if auth_err:
        return auth_err

    data    = request.get_json(force=True) or {}
    message = (data.get('message') or data.get('text') or '').strip()
    if not message:
        return jsonify({'error': 'message field is required'}), 400

    session_id = (data.get('session_id') or '').strip()
    if not session_id:
        session_id = f'api-{uuid.uuid4().hex[:12]}'

    agent = (data.get('agent') or '').strip()
    log.info('POST /chat/stream session=%s agent=%s msg=%r', session_id, agent or 'harv', message[:80])

    routed_message = message
    if agent:
        routed_message = f'[DIRECT:{agent}] {message}'

    def generate():
        try:
            from lib.harv_brain import chat_with_harv_stream
            for chunk in chat_with_harv_stream(session_id, routed_message):
                yield chunk
        except Exception as e:
            log.error('stream error: %s', e)
            import json as _json
            yield f'data: {_json.dumps({type: error, message: str(e)})}\n\n'

    from flask import Response
    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        },
    )
