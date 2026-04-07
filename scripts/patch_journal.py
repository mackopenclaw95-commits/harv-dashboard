"""Patch journal.py on VPS — adds 3am EST cutoff and Supabase persistence."""
import os

JOURNAL = "/root/harv/agents/journal.py"
with open(JOURNAL) as f:
    code = f.read()

# 1. Fix _today_str to use 3am EST cutoff
old_today = '''def _today_str() -> str:
    return datetime.now(TZ_EST).strftime('%Y%m%d')'''

new_today = '''def _today_str() -> str:
    """Return YYYYMMDD using 3am EST as the day boundary.
    Before 3am EST counts as the previous day (session still open)."""
    now = datetime.now(TZ_EST)
    if now.hour < 3:
        now = now - timedelta(days=1)
    return now.strftime('%Y%m%d')'''

if "3am EST as the day boundary" not in code:
    code = code.replace(old_today, new_today)
    print("Updated _today_str with 3am EST cutoff")
else:
    print("3am cutoff already exists")

# 2. Add quiet window helper + Supabase persistence
quiet_block = '''

def _in_quiet_window() -> bool:
    """True during the 2:30am-3:30am EST quiet window (session transition)."""
    now = datetime.now(TZ_EST)
    return (now.hour == 2 and now.minute >= 30) or (now.hour == 3 and now.minute <= 30)


def _save_journal_to_supabase(session_id: str, summary: dict) -> None:
    """Persist journal summary to Supabase memory_entries. Never raises."""
    try:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            return
        from supabase import create_client
        sb = create_client(url, key)
        content = "[Journal " + session_id + "] " + " | ".join(
            summary.get("accomplishments", []) + summary.get("key_info", [])
        )
        sb.table("memory_entries").insert({
            "content": content,
            "agent_name": "Journal",
            "metadata": {
                "session_id": session_id,
                "source": "journal_compress",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "cost_usd": summary.get("total_cost_usd", 0),
                "agents_used": summary.get("agents_used", []),
            },
        }).execute()
    except Exception:
        pass


'''

marker = "# ---------------------------------------------------------------------------\n# OpenRouter / MiniMax"
if "_in_quiet_window" not in code:
    code = code.replace(marker, quiet_block + marker)
    print("Added quiet window helper and Supabase persistence")
else:
    print("Quiet window already exists")

# 3. Add Supabase save after compress
old_compress_log = '    log.info(f\'compress: wrote session.json for {sid} (in={in_tok} out={out_tok})\')'
new_compress_log = old_compress_log + '''

    # Persist to Supabase for dashboard access
    _save_journal_to_supabase(sid, summary)'''

if "_save_journal_to_supabase" not in code:
    code = code.replace(old_compress_log, new_compress_log, 1)
    print("Added Supabase persistence to compress")
else:
    print("Supabase persistence already exists")

with open(JOURNAL, "w") as f:
    f.write(code)
print(f"journal.py saved ({len(code)} bytes)")
