"""
feedback.py -- Feedback Loop library for Harv agents.

DEPRECATED: Google Sheets storage removed. All functions are no-ops.
TODO: Rewrite to use SQLite if feedback loop is needed again.
"""

import sys

sys.path.insert(0, '/root/harv')

from lib.harv_errors import log_error


def log_outcome(agent_name, task, result, success, duration=None, cost=None, notes=''):
    """DEPRECATED: Sheets removed."""
    log_error('feedback', f'log_outcome called but Sheets removed — agent={agent_name}', level='DEBUG')


def analyze_patterns(agent_name=None):
    """DEPRECATED: Sheets removed. Returns empty list."""
    return []


def suggest_improvements(agent_name=None):
    """DEPRECATED: Sheets removed. Returns empty list."""
    return []


def get_agent_stats(agent_name):
    """DEPRECATED: Sheets removed. Returns empty dict."""
    return {}


def get_pending_proposals(agent_name=None):
    """DEPRECATED: Sheets removed. Returns empty list."""
    return []


def approve_proposal(row_number):
    """DEPRECATED: Sheets removed."""
    return False


def reject_proposal(row_number, reason=None):
    """DEPRECATED: Sheets removed."""
    return False


def mark_implemented(row_number):
    """DEPRECATED: Sheets removed."""
    return False
