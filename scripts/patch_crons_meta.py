"""Replace CRON_META with better organized registry."""

CRONS_PATH = "/root/harv/api/blueprints/crons.py"
with open(CRONS_PATH) as f:
    code = f.read()

old_meta = """CRON_META = {
    'guardian.py health': {'name': 'Guardian Health', 'desc': 'VPS health check \u2014 CPU, RAM, disk, services', 'group': 'System'},
    'guardian.py snapshot': {'name': 'Guardian Snapshot', 'desc': 'Daily VPS snapshot via Hostinger API', 'group': 'System'},
    'heartbeat.py': {'name': 'Heartbeat', 'desc': 'Router cycle \u2014 processes task queue, updates dashboard', 'group': 'Core'},
    'backup_drive.py daily': {'name': 'Daily Backup', 'desc': 'Full backup to Google Drive (daily)', 'group': 'System'},
    'backup_drive.py permanent': {'name': 'Weekly Backup', 'desc': 'Permanent backup to Google Drive (Mondays)', 'group': 'System'},
    'openclaw_notify.py': {'name': 'OpenClaw Heartbeat', 'desc': 'Docker container health ping for OpenClaw', 'group': 'System'},
    'openclaw_updater.py': {'name': 'OpenClaw Updater', 'desc': 'Nightly OpenClaw dependency & security updates', 'group': 'System'},
    'daily_summary.py': {'name': 'Daily Summary', 'desc': 'End-of-day summary + auto tweet', 'group': 'Social'},
}"""

new_meta = """CRON_META = {
    # Core
    'heartbeat.py': {
        'name': 'Task Router',
        'desc': 'Processes task queue, routes to agents, updates Mission Control',
        'group': 'Core',
    },
    # System
    'guardian.py health': {
        'name': 'System Health',
        'desc': 'VPS monitor — CPU, RAM, disk, services, Telegram alerts',
        'group': 'System',
    },
    'guardian.py snapshot': {
        'name': 'VPS Snapshot',
        'desc': 'Automated VPS snapshot via Hostinger API for disaster recovery',
        'group': 'System',
    },
    'backup_drive.py daily': {
        'name': 'Daily Backup',
        'desc': 'Full system backup to Google Drive — configs, logs, credentials',
        'group': 'System',
    },
    'backup_drive.py permanent': {
        'name': 'Weekly Archive',
        'desc': 'Permanent backup to Google Drive, retained indefinitely',
        'group': 'System',
    },
    'openclaw_notify.py': {
        'name': 'OpenClaw Health',
        'desc': 'Docker container health — Ollama status, memory, uptime',
        'group': 'System',
    },
    'openclaw_updater.py': {
        'name': 'Dependency Updates',
        'desc': 'Nightly security patches and dependency updates for OpenClaw',
        'group': 'System',
    },
    # Automation
    'daily_summary.py': {
        'name': 'Daily Digest',
        'desc': 'End-of-day activity summary — stats, highlights, auto-post',
        'group': 'Automation',
    },
}"""

if old_meta in code:
    code = code.replace(old_meta, new_meta)
    print("Replaced CRON_META")
else:
    print("Could not match old CRON_META exactly")

with open(CRONS_PATH, "w") as f:
    f.write(code)
print(f"crons.py saved ({len(code)} bytes)")
