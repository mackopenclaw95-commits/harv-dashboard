#!/bin/bash
# Idempotent installer for the weekly pricing drift cron job.
#
# Runs on the VPS. Expects weekly_pricing_drift.py to already be scp'd to
# /root/harv/scripts/. Creates /var/log/harv, appends the crontab line only
# if it isn't already present, and runs the script once as a smoke test.
#
# Usage (from Windows PowerShell):
#   scp scripts/vps_patches/install_drift_cron.sh root@187.77.220.169:/tmp/
#   ssh -i ~/.ssh/harv_vps root@187.77.220.169 "bash /tmp/install_drift_cron.sh"

set -euo pipefail

SCRIPT_PATH=/root/harv/scripts/weekly_pricing_drift.py
LOG_DIR=/var/log/harv
LOG_FILE=$LOG_DIR/pricing_drift.log
CRON_LINE="7 9 * * 1 /usr/bin/python3 $SCRIPT_PATH >> $LOG_FILE 2>&1"

echo "== 1/4 checking script exists =="
if [ ! -f "$SCRIPT_PATH" ]; then
  echo "FATAL: $SCRIPT_PATH not found — scp it first:"
  echo "  scp scripts/vps_patches/weekly_pricing_drift.py root@<vps>:$SCRIPT_PATH"
  exit 1
fi

echo "== 2/4 creating log directory =="
mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

echo "== 3/4 dry-run smoke test =="
if /usr/bin/python3 "$SCRIPT_PATH"; then
  echo "  clean — no drift detected"
else
  rc=$?
  echo "  drift detected (exit $rc) — review output above, fix Supabase rows, re-run"
  echo "  (installing cron anyway so the weekly check stays armed)"
fi

echo "== 4/4 installing crontab entry =="
current=$(crontab -l 2>/dev/null || true)
if echo "$current" | grep -q "weekly_pricing_drift.py"; then
  echo "  cron entry already present — leaving alone"
else
  printf '%s\n%s\n' "$current" "$CRON_LINE" | crontab -
  echo "  installed: $CRON_LINE"
fi

echo
echo "done. verify with: crontab -l | grep weekly_pricing"
