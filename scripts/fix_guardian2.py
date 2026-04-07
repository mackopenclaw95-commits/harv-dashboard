import re

with open("/root/harv/agents/guardian.py") as f:
    content = f.read()

# 1. Remove log_api_cost call in ollama_summary (spans 3 lines)
content = content.replace(
    """        log_api_cost('guardian-health', 'Guardian', 'ollama/' + model,
                     data.get('prompt_eval_count', 0), data.get('eval_count', 0),
                     task_type='health-summary')
""",
    ""
)

# 2. Remove _call_ledger call in run_health_check (spans 2 lines)
content = content.replace(
    """    _call_ledger('Guardian', 'Error' if has_critical else 'Warning',
                 'Health alert: ' + '; '.join(issues[:2]), 0.0, log)
""",
    ""
)

# 3. Remove log_to_snapshots block in run_snapshot
content = content.replace(
    """            try:
                _snap_now = datetime.now(TZ_EST)
                log_to_snapshots(_snap_now.strftime('%Y-%m-%d'), _snap_now.strftime('%-I:%M %p EST'), 'Hostinger', 'VPS snapshot', '', 'Success', '', 'Daily Hostinger VPS snapshot')
            except Exception:
                pass
""",
    ""
)

# 4. Remove append_log call in run_snapshot (spans 2 lines)
content = content.replace(
    """            append_log(client, AGENT_NAME, 'INFO', 'Snapshot created',
                       'VPS ' + str(VPS_ID) + ' at ' + now_str)
""",
    ""
)

# 5. Remove LEDGER_PATH constant (no longer needed)
content = content.replace("LEDGER_PATH      = '/root/harv/agents/ledger.py'\n", "")

# 6. Clean up multiple blank lines
content = re.sub(r'\n{4,}', '\n\n\n', content)

with open("/root/harv/agents/guardian.py", "w") as f:
    f.write(content)

print("guardian.py second pass complete")
