"""Add OpenClaw health check into heartbeat.py and remove the separate cron."""

HB_PATH = "/root/harv/scripts/heartbeat.py"
with open(HB_PATH) as f:
    code = f.read()

# Add OpenClaw check function after the system_health function
openclaw_func = '''

def check_openclaw(log):
    """Check OpenClaw Docker container health + Ollama, send Telegram ping."""
    try:
        import subprocess
        # Check container is running
        result = subprocess.run(
            ['docker', 'inspect', '--format', '{{.State.Status}}', 'openclaw-yqar-openclaw-1'],
            capture_output=True, text=True, timeout=10
        )
        container_status = result.stdout.strip()

        # Check Ollama is responding
        ollama_ok = False
        try:
            import urllib.request
            req = urllib.request.urlopen('http://172.17.0.1:11434/api/tags', timeout=5)
            ollama_ok = req.status == 200
        except Exception:
            pass

        status = f"container={container_status} ollama={'ok' if ollama_ok else 'down'}"
        log.info(f'OpenClaw health: {status}')

        # Send Telegram
        bot_token = _load_env_var('TELEGRAM_OPENCLAW_HB_TOKEN')
        if bot_token:
            icon = '\\U0001f9e0' if container_status == 'running' and ollama_ok else '\\u26a0\\ufe0f'
            msg = (
                f'{icon} OpenClaw Health\\n'
                f'Time: {now_eastern()}\\n'
                f'Container: {container_status}\\n'
                f'Ollama: {"responding" if ollama_ok else "NOT responding"}\\n'
                f'Model: qwen2.5:0.5b (local - free)\\n'
                f'Cost: $0.00'
            )
            send_telegram(bot_token, TELEGRAM_CHAT, msg, log)

        return status
    except Exception as e:
        log.warning(f'OpenClaw health check failed: {e}')
        return f'error: {e}'

'''

# Insert after system_health function
marker = "def main():"
if "def check_openclaw" not in code:
    code = code.replace(marker, openclaw_func + marker)
    print("Added check_openclaw function")
else:
    print("check_openclaw already exists")

# Add call inside main(), after step 7 (event bus)
step_marker = "        # 8. Process pending inter-agent messages"
openclaw_call = """        # 7b. OpenClaw container health check
        openclaw_status = check_openclaw(log)

"""

if "check_openclaw(log)" not in code:
    code = code.replace(step_marker, openclaw_call + step_marker)
    print("Added OpenClaw check to heartbeat main()")
else:
    print("OpenClaw check already in main()")

with open(HB_PATH, "w") as f:
    f.write(code)
print(f"heartbeat.py saved ({len(code)} bytes)")
