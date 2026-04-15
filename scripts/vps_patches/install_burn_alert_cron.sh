#!/bin/bash
# Installer for daily_burn_alert.py VPS cron.
# Runs hourly at :23 off-the-hour (same convention as drift cron :07).
# Idempotent — safe to re-run.
#
# Usage (from local repo):
#   scp scripts/vps_patches/daily_burn_alert.py root@VPS_IP:/root/harv/scripts/
#   scp scripts/vps_patches/install_burn_alert_cron.sh root@VPS_IP:/tmp/
#   ssh root@VPS_IP 'bash /tmp/install_burn_alert_cron.sh'
set -euo pipefail

SCRIPT_PATH='/root/harv/scripts/daily_burn_alert.py'
LOG_DIR='/var/log/harv'
LOG_PATH="$LOG_DIR/burn_alert.log"
CRON_LINE="23 * * * * /usr/bin/python3 $SCRIPT_PATH >> $LOG_PATH 2>&1"

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "FATAL: $SCRIPT_PATH not found. Scp it to the VPS first."
  exit 1
fi

mkdir -p "$LOG_DIR"
touch "$LOG_PATH"

# Remove old entry if present, then append the canonical one.
CRONTAB=$(crontab -l 2>/dev/null || true)
NEW_CRONTAB=$(echo "$CRONTAB" | grep -v 'daily_burn_alert.py' || true)
NEW_CRONTAB="${NEW_CRONTAB}"$'\n'"${CRON_LINE}"
echo "$NEW_CRONTAB" | sed '/^$/d' | crontab -

echo "✓ installed daily_burn_alert cron"
echo "  schedule: every hour at :23"
echo "  script:   $SCRIPT_PATH"
echo "  log:      $LOG_PATH"
echo ""
echo "Crontab now:"
crontab -l | grep burn_alert || true

echo ""
echo "Smoke test (dry run — won't alert unless you're over threshold):"
echo "  python3 $SCRIPT_PATH"
