import re

with open("/root/harv/agents/guardian.py") as f:
    content = f.read()

# 1. Fix the import line - remove sheets_client, append_log, log_api_cost
content = content.replace(
    "from lib.harv_lib import load_core, sheets_client, append_log, setup_file_logger, log_api_cost, now_est, TZ_EST",
    "from lib.harv_lib import load_core, setup_file_logger, now_est, TZ_EST"
)

# 2. Remove the import of log_to_snapshots from backup_drive
content = content.replace(
    "from scripts.backup_drive import log_to_snapshots\n",
    ""
)

# 3. Remove the entire _call_ledger function (from def to end of function)
pattern = r'\ndef _call_ledger\(agent, status, last_task, cost, log\):.*?(?=\n\n# )'
content = re.sub(pattern, '', content, flags=re.DOTALL)

# 4. Remove all _call_ledger(...) calls (standalone lines)
content = re.sub(r' +_call_ledger\([^)]+\)\n', '', content)

# 5. Remove log_api_cost call in ollama_summary
content = re.sub(r' +log_api_cost\([^)]+\)\n', '', content)

# 6. Remove all append_log calls
content = re.sub(r' +append_log\([^)]+\)\n', '', content)

# 7. In run_health_check: remove "client" parameter
content = content.replace("def run_health_check(log, client):", "def run_health_check(log):")

# 8. In run_snapshot: remove client parameter
content = content.replace("def run_snapshot(log, client):", "def run_snapshot(log):")

# 9. In run() function: remove sheets_client() try/except block
old_run_block = """    try:
        client = sheets_client()
    except Exception:
        client = None

    action = 'health'"""
content = content.replace(old_run_block, "    action = 'health'")

# 10. Fix run_snapshot and run_health_check calls to remove client arg
content = content.replace("run_snapshot(log, client)", "run_snapshot(log)")
content = content.replace("run_health_check(log, client)", "run_health_check(log)")

# 11. In main(): remove sheets_client() try/except block
old_main_block = """    try:
        client = sheets_client()
    except Exception as e:
        log.warning('Google Sheets auth failed: ' + str(e) + ' -- running without logging')
        client = None

    try:"""
content = content.replace(old_main_block, "    try:")

# 12. Remove the log_to_snapshots call block in run_snapshot
pattern_snap = r' +try:\n +_snap_now = datetime\.now\(TZ_EST\)\n +log_to_snapshots\([^)]+\)\n +except Exception:\n +pass\n'
content = re.sub(pattern_snap, '', content)

# 13. Clean up orphaned "if client:" lines
lines = content.split('\n')
cleaned = []
for line in lines:
    if line.strip() == 'if client:':
        continue
    cleaned.append(line)
content = '\n'.join(cleaned)

# 14. Clean up any double blank lines (more than 2 consecutive)
content = re.sub(r'\n{4,}', '\n\n\n', content)

with open("/root/harv/agents/guardian.py", "w") as f:
    f.write(content)

print("guardian.py patched successfully")
