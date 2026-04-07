import re

with open("/root/harv/scripts/backup_drive.py") as f:
    content = f.read()

# 1. Remove sheets_client from the import line
content = content.replace(
    "from lib.harv_lib import load_creds, load_core, sheets_client, TZ_EST, now_est",
    "from lib.harv_lib import load_creds, load_core, TZ_EST, now_est"
)

# 2. Remove the SNAPSHOTS_SHEET constant and SNAPSHOTS_HEADER
content = content.replace("SNAPSHOTS_SHEET = 'Snapshots'\n", "")
content = content.replace("SNAPSHOTS_HEADER = ['Date', 'Time (EST)', 'Type', 'Filename', 'Size', 'Status', 'Drive Link', 'Notes']\n", "")

# 3. Remove the ensure_snapshots_sheet function
pattern = r'\ndef ensure_snapshots_sheet\(sc, spreadsheet_id\):.*?(?=\n\ndef )'
content = re.sub(pattern, '\n', content, flags=re.DOTALL)

# 4. Remove the log_to_snapshots function
pattern = r'\ndef log_to_snapshots\(date_str, time_str, btype, filename, size, status, drive_link=.*?(?=\n\n# )'
content = re.sub(pattern, '', content, flags=re.DOTALL)

# 5. Remove all log_to_snapshots calls
content = re.sub(r' +log_to_snapshots\([^)]+\)\n', '', content)

# 6. Remove sheets_client() and ensure_snapshots_sheet calls in run_setup
content = re.sub(r' +sc += sheets_client\(\)\n', '', content)
content = re.sub(r' +ensure_snapshots_sheet\([^)]+\)\n', '', content)

# 7. Remove the Mission Control Snapshots sheet section comment
content = content.replace("# -- Mission Control Snapshots sheet -------------------------------------------\n", "")
content = re.sub(r'# .* Mission Control Snapshots sheet .*\n', '', content)

# 8. Clean up multiple blank lines
content = re.sub(r'\n{4,}', '\n\n\n', content)

with open("/root/harv/scripts/backup_drive.py", "w") as f:
    f.write(content)

print("backup_drive.py patched successfully")
