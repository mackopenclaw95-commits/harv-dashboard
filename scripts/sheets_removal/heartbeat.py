"""
heartbeat.py — Harv's scheduled cron entry point.

Runs every 90 minutes. Responsibilities:
  1. Acquire a lock so overlapping runs cannot occur
  2. Run the router (process pending tasks)
  3. Prune old rows from the Logs sheet (beyond log_retention_days)
  4. Prune old daily log files from disk
  5. Update Dashboard with last heartbeat timestamp and system health
  6. Send Telegram notification on successful run
  7. Release lock

Cron entries (every 90 min):
  0 0,3,6,9,12,15,18,21 * * * /usr/bin/python3 /root/harv/scripts/heartbeat.py >> /root/harv/logs/cron.log 2>&1
  30 1,4,7,10,13,16,19,22 * * * /usr/bin/python3 /root/harv/scripts/heartbeat.py >> /root/harv/logs/cron.log 2>&1
"""

import fcntl
import importlib.util
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta

sys.path.insert(0, '/root/harv')

from lib.harv_lib import (
    load_core,
    setup_file_logger,
    now_est,
    TZ_EST,
)

AGENT_NAME    = 'Heartbeat'
LEDGER_PATH   = '/root/harv/agents/ledger.py'


def _call_ledger(agent, status, last_task, cost, log):
    """Log agent status to events.db via event_bus. Never raises."""
    try:
        from lib.event_bus import event_bus
        event_bus.emit(
            agent=agent,
            action='status_update',
            status=status.lower().replace(' ', '_'),
            summary=last_task[:200] if last_task else status,
            cost=cost or 0.0,
        )
    except Exception as _e:
        if log:
            log.warning(f'Ledger call failed: {_e}')


LOCK_FILE     = '/tmp/harv_heartbeat.lock'
ROUTER_PATH   = '/root/harv/agents/router.py'
TELEGRAM_CHAT = 6899940023


def _load_env_var(key):
    try:
        with open('/root/harv/.env') as f:
            for line in f:
                line = line.strip()
                if line.startswith(key + '='):
                    return line.split('=', 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return None


def now_eastern():
    return datetime.now(TZ_EST).strftime('%b %-d, %Y %-I:%M %p EST')


def send_telegram(token, chat_id, text, log):
    try:
        payload = json.dumps({'chat_id': chat_id, 'text': text}).encode()
        req = urllib.request.Request(
            f'https://api.telegram.org/bot{token}/sendMessage',
            data=payload, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=10) as r:
            body = json.loads(r.read())
            if body.get('ok'):
                log.info('Telegram notification sent.')
            else:
                log.warning(f'Telegram API error: {body.get("description", body)}')
    except Exception as e:
        log.warning(f'Telegram send failed: {e}')


def acquire_lock(log):
    fh = open(LOCK_FILE, 'w')
    try:
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fh.write(str(os.getpid()))
        fh.flush()
        return fh
    except BlockingIOError:
        log.warning('Another heartbeat is already running. Exiting.')
        sys.exit(0)


def release_lock(fh):
    fcntl.flock(fh, fcntl.LOCK_UN)
    fh.close()
    try:
        os.remove(LOCK_FILE)
    except OSError:
        pass


def run_router(log):
    spec = importlib.util.spec_from_file_location('router', ROUTER_PATH)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.run(dry_run=False)


def prune_disk_logs(log):
    core        = load_core()
    log_dir     = core['paths']['logs']
    retain_days = core['heartbeat']['log_retention_days']
    cutoff      = time.time() - retain_days * 86400
    deleted = 0
    for fname in os.listdir(log_dir):
        fpath = os.path.join(log_dir, fname)
        if os.path.isfile(fpath) and os.path.getmtime(fpath) < cutoff:
            os.remove(fpath)
            deleted += 1
    if deleted:
        log.info(f'Disk log pruning: deleted {deleted} old log file(s).')


def system_health():
    try:
        import shutil
        total, used, _ = shutil.disk_usage('/')
        disk_pct = round(used / total * 100, 1)
        with open('/proc/meminfo') as f:
            lines = f.readlines()
        mem = {}
        for line in lines:
            parts = line.split()
            if parts[0] in ('MemTotal:', 'MemAvailable:'):
                mem[parts[0]] = int(parts[1])
        mem_free_mb = round(mem.get('MemAvailable:', 0) / 1024)
        with open('/proc/uptime') as f:
            uptime_h = int(float(f.read().split()[0]) // 3600)
        return f'disk {disk_pct}% | mem_free {mem_free_mb}MB | uptime {uptime_h}h'
    except Exception:
        return 'health check unavailable'




def check_openclaw(log):
    """Check OpenClaw Docker container health + Ollama, send Telegram ping."""
    try:
        import subprocess
        # Check container is running
        result = subprocess.run(
            ['docker', 'inspect', '--format', '{{.State.Status}}', 'openclaw-yqar-openclaw-1'],
            capture_output=True, text=True, timeout=10
        )
        container_status = result.stdout.strip()

        # Check Ollama is responding
        ollama_ok = False
        try:
            import urllib.request
            req = urllib.request.urlopen('http://172.17.0.1:11434/api/tags', timeout=5)
            ollama_ok = req.status == 200
        except Exception:
            pass

        status = f"container={container_status} ollama={'ok' if ollama_ok else 'down'}"
        log.info(f'OpenClaw health: {status}')

        # Send Telegram
        bot_token = _load_env_var('TELEGRAM_OPENCLAW_HB_TOKEN')
        if bot_token:
            icon = '\U0001f9e0' if container_status == 'running' and ollama_ok else '\u26a0\ufe0f'
            msg = (
                f'{icon} OpenClaw Health\n'
                f'Time: {now_eastern()}\n'
                f'Container: {container_status}\n'
                f'Ollama: {"responding" if ollama_ok else "NOT responding"}\n'
                f'Model: qwen2.5:0.5b (local - free)\n'
                f'Cost: $0.00'
            )
            send_telegram(bot_token, TELEGRAM_CHAT, msg, log)

        return status
    except Exception as e:
        log.warning(f'OpenClaw health check failed: {e}')
        return f'error: {e}'

def main():
    log = setup_file_logger(AGENT_NAME)
    log.info('=== Heartbeat starting ===')
    start = time.time()

    bot_token     = _load_env_var('TELEGRAM_VPS_HB_TOKEN')
    lock_fh       = acquire_lock(log)
    pending_count = 0
    logs_pruned   = False

    try:
        # 1. Run router
        log.info('Running router...')
        try:
            run_router(log)
        except SystemExit:
            pass
        except Exception as e:
            log.error(f'Router error: {e}')

        # 2. Pending task count (from SQLite)
        try:
            from lib.task_store import get_pending as _ts_pending
            pending_count = len(_ts_pending())
        except Exception:
            pass

        # 3. Prune disk logs
        log.info('Pruning logs...')
        try:
            prune_disk_logs(log)
            logs_pruned = True
        except Exception as e:
            log.warning(f'Log pruning error: {e}')

        # 4. System health
        health  = system_health()
        elapsed = round(time.time() - start, 1)
        log.info(f'Health: {health} | elapsed {elapsed}s')

        # 5. Telegram — successful run only
        if bot_token:
            pruned_str = 'yes' if logs_pruned else 'no'
            msg = (
                '\U0001f527 VPS Heartbeat \u2705\n'
                f'Time: {now_eastern()}\n'
                f'Tasks pending: {pending_count}\n'
                f'Logs pruned: {pruned_str}\n'
                'Cost: $0.00 (no LLM)'
            )
            send_telegram(bot_token, TELEGRAM_CHAT, msg, log)

        # 6. Ledger update
        _call_ledger('Heartbeat', 'Active',
                     f'Heartbeat OK | {health}', 0.0, log)

        # 7. Event bus: emit heartbeat + purge old events
        try:
            from lib.event_bus import event_bus
            event_bus.emit(
                agent   = 'Heartbeat',
                action  = 'heartbeat',
                status  = 'success',
                summary = f'Heartbeat OK | {health}',
                cost    = 0.0,
            )
            purged = event_bus.cleanup(days=30)
            if purged:
                log.info(f'Event bus: purged {purged} old events')
        except Exception as _ev_exc:
            log.warning(f'Event bus error: {_ev_exc}')

        # 7b. OpenClaw container health check
        check_openclaw(log)

        # 8. Process pending inter-agent messages
        try:
            from lib.message_queue import get_pending, dequeue, complete, fail
            _pending_msgs = get_pending()
            _processed_msgs = 0
            for _pmsg in _pending_msgs:
                _mid  = _pmsg.get('message_id')
                _to   = _pmsg.get('to_agent', '')
                _deq  = dequeue(_to)
                if _deq is None:
                    continue
                try:
                    complete(_mid, f'heartbeat-ack from {_to}')
                    _processed_msgs += 1
                except Exception as _msg_exc:
                    fail(_mid, str(_msg_exc))
            if _processed_msgs:
                log.info(f'Processed {_processed_msgs} pending agent messages')
        except Exception as _mq_exc:
            log.warning(f'Message queue processing error (non-fatal): {_mq_exc}')

        # 9. Agent health polling removed (was Sheets-based, dashboard reads from events.db)


    except Exception as e:
        log.error(f'Fatal heartbeat error: {e}')
        if client:
            try:
                append_log(client, AGENT_NAME, 'CRITICAL', 'Heartbeat failed', str(e))
            except Exception:
                pass

    finally:
        release_lock(lock_fh)
        log.info(f'=== Heartbeat done ({round(time.time() - start, 1)}s) ===')


if __name__ == '__main__':
    main()
