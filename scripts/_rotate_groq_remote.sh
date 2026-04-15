#!/usr/bin/env bash
# Remote rotation script — runs on the VPS.
# Reads one line (the new Groq API key) from stdin and rewrites .env.
set -euo pipefail

read -r K
# Strip CR (Windows clipboard), LF, whitespace
K=$(printf '%s' "$K" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
if [ -z "$K" ]; then
  echo "ERROR: empty key on stdin" >&2
  exit 1
fi
# Sanity: must look like a Groq key
case "$K" in
  gsk_*) ;;
  *) echo "ERROR: key does not start with gsk_ (got ${#K} chars)" >&2; exit 1 ;;
esac

cp /root/harv/.env /root/harv/.env.bak

# Escape sed special chars in the key
esc=$(printf '%s' "$K" | sed -e 's/[&|\\/]/\\&/g')

sed -i "s|^GROQ_API_KEY=.*|GROQ_API_KEY=$esc|" /root/harv/.env
unset K esc

if ! grep -q '^GROQ_API_KEY=' /root/harv/.env; then
  echo "ERROR: GROQ_API_KEY line not found after update" >&2
  exit 1
fi

if diff -q /root/harv/.env /root/harv/.env.bak >/dev/null; then
  echo "ERROR: .env unchanged" >&2
  exit 1
fi

echo "ok: .env changed"
