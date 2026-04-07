"""Add check_openclaw call to heartbeat main()."""

HB_PATH = "/root/harv/scripts/heartbeat.py"
with open(HB_PATH) as f:
    code = f.read()

old = "        # 8. Process pending inter-agent messages"
new = """        # 7b. OpenClaw container health check
        check_openclaw(log)

        # 8. Process pending inter-agent messages"""

if "check_openclaw(log)" not in code:
    code = code.replace(old, new)
    print("Added check_openclaw call")
else:
    print("Already there")

with open(HB_PATH, "w") as f:
    f.write(code)
print(f"Saved ({len(code)} bytes)")
