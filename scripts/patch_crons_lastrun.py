"""Fix crons blueprint to extract last run time from log file mtime as fallback."""

CRONS_PATH = "/root/harv/api/blueprints/crons.py"
with open(CRONS_PATH) as f:
    code = f.read()

# Replace the last_log_time extraction section to also use file mtime
old_block = '''        last_log = None
        last_log_time = None
        if log_file and os.path.exists(log_file):
            try:
                result = subprocess.check_output(
                    ['tail', '-n', '5', log_file],
                    stderr=subprocess.DEVNULL, text=True, timeout=3
                ).strip()
                if result:
                    lines = result.splitlines()
                    last_log = lines[-1][:200]
                    ts_match = re.match(r'(\\d{4}-\\d{2}-\\d{2}[\\sT]\\d{2}:\\d{2}:\\d{2})', last_log)
                    if ts_match:
                        last_log_time = ts_match.group(1)
            except Exception:
                pass'''

new_block = '''        last_log = None
        last_log_time = None
        if log_file and os.path.exists(log_file):
            try:
                result = subprocess.check_output(
                    ['tail', '-n', '5', log_file],
                    stderr=subprocess.DEVNULL, text=True, timeout=3
                ).strip()
                if result:
                    lines = result.splitlines()
                    last_log = lines[-1][:200]
                    # Try to extract timestamp from log line
                    ts_match = re.match(r'(\\d{4}-\\d{2}-\\d{2}[\\sT]\\d{2}:\\d{2}:\\d{2})', last_log)
                    if ts_match:
                        last_log_time = ts_match.group(1)
                # Fallback: use file modification time if no timestamp found in log
                if not last_log_time:
                    from datetime import datetime, timezone, timedelta
                    mtime = os.path.getmtime(log_file)
                    est = timezone(timedelta(hours=-4))
                    dt = datetime.fromtimestamp(mtime, tz=est)
                    last_log_time = dt.strftime('%Y-%m-%d %H:%M:%S')
            except Exception:
                pass'''

if 'Fallback: use file modification time' not in code:
    code = code.replace(old_block, new_block)
    print("Added file mtime fallback for last_log_time")
else:
    print("Already patched")

with open(CRONS_PATH, "w") as f:
    f.write(code)
print(f"Saved ({len(code)} bytes)")
