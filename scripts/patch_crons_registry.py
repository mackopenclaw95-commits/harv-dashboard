"""Rewrite the crons registry with clean organized groups and better descriptions."""

CRONS_PATH = "/root/harv/api/blueprints/crons.py"
with open(CRONS_PATH) as f:
    code = f.read()

# Find and replace the KNOWN_CRONS dict
import re
pattern = r"KNOWN_CRONS\s*=\s*\{[^}]+\}"
new_registry = """KNOWN_CRONS = {
    # ── Core ─────────────────────────────────────────────
    'heartbeat.py': {
        'name': 'Task Router',
        'desc': 'Processes pending task queue, routes to agents, updates Mission Control',
        'group': 'Core',
        'schedule': 'Every 90 min',
        'icon': 'router',
    },
    # ── System ───────────────────────────────────────────
    'guardian.py health': {
        'name': 'System Health',
        'desc': 'VPS health monitor — CPU, RAM, disk, service status, Telegram alerts',
        'group': 'System',
        'schedule': 'Every 15 min',
        'icon': 'shield',
    },
    'guardian.py snapshot': {
        'name': 'VPS Snapshot',
        'desc': 'Automated VPS snapshot via Hostinger API for disaster recovery',
        'group': 'System',
        'schedule': 'Daily 7:00 AM',
        'icon': 'camera',
    },
    'backup_drive.py daily': {
        'name': 'Daily Backup',
        'desc': 'Full system backup to Google Drive — configs, logs, credentials',
        'group': 'System',
        'schedule': 'Daily 12:00 PM',
        'icon': 'cloud',
    },
    'backup_drive.py permanent': {
        'name': 'Weekly Backup',
        'desc': 'Permanent backup archive to Google Drive (retained indefinitely)',
        'group': 'System',
        'schedule': 'Mondays 12:00 PM',
        'icon': 'archive',
    },
    'openclaw_notify.py': {
        'name': 'OpenClaw Health',
        'desc': 'Docker container health check — Ollama status, memory, uptime ping',
        'group': 'System',
        'schedule': 'Every 90 min',
        'icon': 'container',
    },
    'openclaw_updater.py': {
        'name': 'OpenClaw Updater',
        'desc': 'Nightly dependency updates and security patches for OpenClaw container',
        'group': 'System',
        'schedule': 'Daily 6:00 AM',
        'icon': 'refresh',
    },
    # ── Automation ────────────────────────────────────────
    'daily_summary.py': {
        'name': 'Daily Summary',
        'desc': 'End-of-day activity digest — compiles stats, auto-posts to social',
        'group': 'Automation',
        'schedule': 'Daily 2:00 AM',
        'icon': 'summary',
    },
}"""

match = re.search(pattern, code, re.DOTALL)
if match:
    code = code[:match.start()] + new_registry + code[match.end():]
    print("Replaced KNOWN_CRONS registry")
else:
    print("Could not find KNOWN_CRONS pattern")

with open(CRONS_PATH, "w") as f:
    f.write(code)
print(f"crons.py saved ({len(code)} bytes)")
