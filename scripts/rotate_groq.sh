#!/usr/bin/env bash
# Rotate the Groq API key on the VPS .env file without touching the
# terminal history, logs, or any conversation transcript.
#
# Usage:
#   bash scripts/rotate_groq.sh
#
# Reads the new key via `read -s` (silent, no echo), ships it to the
# VPS over SSH using the key as stdin for the remote shell (never a
# CLI argument), and updates /root/harv/.env in place. A .env.bak is
# left on the VPS so you can restore if anything goes wrong.
set -euo pipefail

VPS=root@187.77.220.169
SSH_KEY=${SSH_KEY:-~/.ssh/harv_vps}

echo ">> Paste the new Groq API key and press Enter (it will NOT be shown):"
read -rs NEW_KEY
echo

if [ -z "${NEW_KEY:-}" ]; then
  echo "ERROR: empty key"
  exit 1
fi

if [[ "$NEW_KEY" != gsk_* ]]; then
  echo "WARNING: key doesn't start with 'gsk_' — continue anyway? (y/N)"
  read -r ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "aborted"; exit 1; }
fi

echo ">> Updating /root/harv/.env on VPS..."
# Pipe the key into ssh on stdin; the remote reads it via `read`.
# This avoids putting the key in the command line, which would end
# up in ps/auditd/shell history.
printf '%s\n' "$NEW_KEY" | ssh -i "$SSH_KEY" "$VPS" '
  set -euo pipefail
  read -r K
  cp /root/harv/.env /root/harv/.env.bak
  # Escape any & | \ characters for sed
  esc=$(printf "%s" "$K" | sed -e "s/[&|\\]/\\\\&/g")
  sed -i "s|^GROQ_API_KEY=.*|GROQ_API_KEY=$esc|" /root/harv/.env
  unset K esc
  # Sanity check: line still present, and it changed
  grep -q "^GROQ_API_KEY=" /root/harv/.env && echo "ok: key line present"
  if diff -q /root/harv/.env /root/harv/.env.bak >/dev/null; then
    echo "ERROR: .env did not change — abort" >&2
    exit 1
  fi
  echo "ok: .env changed"
'

unset NEW_KEY
echo ">> Done. Tell Claude to restart harv-api and verify."
