"""
lib/task_store.py — SQLite-backed task queue for Harv.

SQLite-backed task queue for Harv (sole task store — Google Sheets removed).

DB: /root/harv/memory/tasks.db  (WAL mode, thread-safe)

Public API:
  create_task(description, priority, agent, source, parent_task_id) -> str
  get_pending(agent=None, priority_order=True) -> list[dict]
  get_task(task_id) -> dict | None
  update_task(task_id, **kwargs) -> bool
  complete_task(task_id, result) -> bool
  fail_task(task_id, error) -> bool
  get_recent(limit=50, status=None) -> list[dict]
  get_stats() -> dict
"""

import logging
import os
import random
import sqlite3
import string
import sys
import threading
from datetime import datetime, timezone, timedelta

sys.path.insert(0, '/root/harv')

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log = logging.getLogger('task_store')
if not log.handlers:
    _h = logging.StreamHandler(sys.stdout)
    _h.setFormatter(logging.Formatter('[task_store] %(levelname)s %(message)s'))
    log.addHandler(_h)
    log.setLevel(logging.DEBUG)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_DB_PATH    = '/root/harv/memory/tasks.db'
_LOCK       = threading.Lock()
_PRIORITY_CASE = (
    "CASE priority "
    "WHEN 'critical' THEN 0 "
    "WHEN 'high' THEN 1 "
    "WHEN 'normal' THEN 2 "
    "WHEN 'low' THEN 3 "
    "ELSE 4 END"
)

TZ_EST = timezone(timedelta(hours=-4))


def _now_est() -> str:
    """Return current time in fixed EST (UTC-4) as ISO-ish string."""
    return datetime.now(TZ_EST).strftime('%Y-%m-%d %H:%M:%S')


def _get_conn() -> sqlite3.Connection:
    """Open a connection to _DB_PATH with row_factory set."""
    conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row) -> dict:
    if row is None:
        return None
    return dict(row)


# ---------------------------------------------------------------------------
# Schema init
# ---------------------------------------------------------------------------

def _init_db() -> None:
    """Create the tasks table if it does not exist. Called at module load."""
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    conn = _get_conn()
    try:
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS tasks (
                task_id        TEXT PRIMARY KEY,
                description    TEXT NOT NULL,
                assigned_agent TEXT,
                priority       TEXT DEFAULT 'normal',
                status         TEXT DEFAULT 'pending',
                created_at     TEXT,
                updated_at     TEXT,
                completed_at   TEXT,
                result         TEXT,
                source         TEXT DEFAULT 'user',
                parent_task_id TEXT
            )
        ''')
        conn.commit()
    finally:
        conn.close()


# Run at import time
_init_db()


# ---------------------------------------------------------------------------
# Task ID generator
# ---------------------------------------------------------------------------

def _gen_task_id() -> str:
    """Generate T-XXXX where XXXX is 4 random uppercase hex chars."""
    chars = string.hexdigits.upper()[:16]   # 0-9, A-F
    return 'T-' + ''.join(random.choices(chars, k=4))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_task(
    description: str,
    priority: str = 'normal',
    agent: str = None,
    source: str = 'user',
    parent_task_id: str = None,
) -> str:
    """
    Insert a new task. Returns the generated task_id.
    Retries on the rare ID collision (max 10 attempts).
    """
    now = _now_est()
    for _ in range(10):
        tid = _gen_task_id()
        with _LOCK:
            conn = _get_conn()
            try:
                conn.execute(
                    '''INSERT INTO tasks
                       (task_id, description, assigned_agent, priority,
                        status, created_at, updated_at, source, parent_task_id)
                       VALUES (?,?,?,?,?,?,?,?,?)''',
                    (tid, description, agent, priority,
                     'pending', now, now, source, parent_task_id),
                )
                conn.commit()
                log.debug('create_task: %s [%s] %r', tid, priority, description[:60])
                return tid
            except sqlite3.IntegrityError:
                # Collision -- try again
                continue
            finally:
                conn.close()
    raise RuntimeError('task_store: could not generate unique task_id after 10 attempts')


def get_pending(agent: str = None, priority_order: bool = True) -> list:
    """
    Return list of dicts for all pending tasks.
    If agent is given, filter by assigned_agent = agent.
    If priority_order, sort by critical->high->normal->low.
    """
    conn = _get_conn()
    try:
        if agent:
            sql = (
                "SELECT * FROM tasks WHERE status='pending' AND assigned_agent=? "
                + (f'ORDER BY {_PRIORITY_CASE}, created_at ASC' if priority_order else '')
            )
            rows = conn.execute(sql, (agent,)).fetchall()
        else:
            sql = (
                "SELECT * FROM tasks WHERE status='pending' "
                + (f'ORDER BY {_PRIORITY_CASE}, created_at ASC' if priority_order else '')
            )
            rows = conn.execute(sql).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_task(task_id: str) -> dict:
    """Return the task dict for task_id, or None if not found."""
    conn = _get_conn()
    try:
        row = conn.execute('SELECT * FROM tasks WHERE task_id=?', (task_id,)).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


def update_task(task_id: str, **kwargs) -> bool:
    """
    Update arbitrary columns on a task. updated_at is set automatically.
    Returns True if a row was updated, False if task_id not found.
    """
    if not kwargs:
        return False

    # Disallow primary key change
    kwargs.pop('task_id', None)
    kwargs['updated_at'] = _now_est()

    cols  = ', '.join(f'{k}=?' for k in kwargs)
    vals  = list(kwargs.values()) + [task_id]

    with _LOCK:
        conn = _get_conn()
        try:
            cur = conn.execute(f'UPDATE tasks SET {cols} WHERE task_id=?', vals)
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def complete_task(task_id: str, result: str) -> bool:
    """Mark a task completed with the given result string."""
    now = _now_est()
    with _LOCK:
        conn = _get_conn()
        try:
            cur = conn.execute(
                '''UPDATE tasks SET status='completed', result=?,
                   completed_at=?, updated_at=? WHERE task_id=?''',
                (str(result), now, now, task_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def fail_task(task_id: str, error) -> bool:
    """Mark a task failed, storing the error string in result."""
    now = _now_est()
    with _LOCK:
        conn = _get_conn()
        try:
            cur = conn.execute(
                '''UPDATE tasks SET status='failed', result=?,
                   updated_at=? WHERE task_id=?''',
                (str(error), now, task_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()


def get_recent(limit: int = 50, status: str = None) -> list:
    """
    Return up to `limit` tasks ordered by created_at DESC.
    If status is given, filter by that status.
    """
    conn = _get_conn()
    try:
        if status:
            rows = conn.execute(
                'SELECT * FROM tasks WHERE status=? ORDER BY created_at DESC LIMIT ?',
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?',
                (limit,),
            ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_stats() -> dict:
    """
    Return aggregate statistics:
    {
      'total': N,
      'by_status': {'pending': X, 'in_progress': Y, 'completed': Z, 'failed': W},
      'by_agent':  {'AgentName': N, ...},
      'avg_completion_seconds': N
    }
    """
    conn = _get_conn()
    try:
        total = conn.execute('SELECT COUNT(*) FROM tasks').fetchone()[0]

        by_status_rows = conn.execute(
            "SELECT status, COUNT(*) FROM tasks GROUP BY status"
        ).fetchall()
        by_status = {r[0]: r[1] for r in by_status_rows}

        by_agent_rows = conn.execute(
            "SELECT assigned_agent, COUNT(*) FROM tasks "
            "WHERE assigned_agent IS NOT NULL GROUP BY assigned_agent"
        ).fetchall()
        by_agent = {r[0]: r[1] for r in by_agent_rows}

        # Average completion time for completed tasks that have both timestamps
        avg_row = conn.execute(
            "SELECT AVG((julianday(completed_at) - julianday(created_at)) * 86400) "
            "FROM tasks WHERE status='completed' AND completed_at IS NOT NULL AND created_at IS NOT NULL"
        ).fetchone()
        avg_secs = round(avg_row[0], 2) if avg_row[0] is not None else 0.0

        return {
            'total':                   total,
            'by_status':               by_status,
            'by_agent':                by_agent,
            'avg_completion_seconds':  avg_secs,
        }
    finally:
        conn.close()



# Sheets sync functions removed — SQLite is now the sole task store.
