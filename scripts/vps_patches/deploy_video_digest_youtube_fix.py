"""
VPS deploy script — ship the YouTube bot-gate fix for the Video Digest agent.

This copies the updated whisper_client.py + gemini_vlm_client.py from
harv_deploy/ in this repo to wherever they live on the VPS, syntax-checks
them, and restarts the harv services. Idempotent: safe to re-run.

Run on the VPS:

    cd /root/harv-dashboard
    git pull origin claude/fix-video-digest-agent-bFcfZ
    python3 scripts/vps_patches/deploy_video_digest_youtube_fix.py

If `harv-dashboard` isn't cloned on the VPS yet, one-liner:

    curl -fsSL https://raw.githubusercontent.com/mackopenclaw95-commits/harv-dashboard/claude/fix-video-digest-agent-bFcfZ/scripts/vps_patches/deploy_video_digest_youtube_fix.py | python3
"""
import os
import shutil
import subprocess
import sys
import urllib.request

REPO_RAW_BASE = (
    'https://raw.githubusercontent.com/mackopenclaw95-commits/harv-dashboard/'
    'claude/fix-video-digest-agent-bFcfZ'
)

# Where the files might already live on the VPS. We search in this order and
# update whichever path exists. If none exist, we create at the first one.
CANDIDATE_DIRS = ['/root/harv/lib', '/root/harv']

FILES = ['whisper_client.py', 'gemini_vlm_client.py']

SERVICES = ['harv-api', 'harv-dashboard', 'harv-telegram']


def find_existing(name: str) -> str:
    """Return the path where `name` already exists on the VPS, or ''."""
    for d in CANDIDATE_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return ''


def read_local_source(name: str) -> str:
    """Read the new file content from the repo checkout, falling back to GitHub raw."""
    here = os.path.dirname(os.path.abspath(__file__))
    # scripts/vps_patches/ -> repo root -> harv_deploy/<name>
    repo_root = os.path.dirname(os.path.dirname(here))
    local_path = os.path.join(repo_root, 'harv_deploy', name)
    if os.path.exists(local_path):
        with open(local_path) as f:
            return f.read()
    # Fallback: fetch from GitHub raw (when running from the curl one-liner)
    url = f'{REPO_RAW_BASE}/harv_deploy/{name}'
    print(f'  fetching from {url}')
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read().decode('utf-8')


def syntax_check(path: str) -> None:
    import py_compile
    py_compile.compile(path, doraise=True)


def restart_services() -> None:
    restarted = []
    for svc in SERVICES:
        # Skip services that don't exist on this host
        probe = subprocess.run(
            ['systemctl', 'list-unit-files', f'{svc}.service'],
            capture_output=True, text=True,
        )
        if svc not in probe.stdout:
            continue
        r = subprocess.run(
            ['systemctl', 'restart', svc],
            capture_output=True, text=True,
        )
        if r.returncode == 0:
            restarted.append(svc)
            print(f'  restarted: {svc}')
        else:
            print(f'  WARNING: restart {svc} failed: {r.stderr.strip()[:200]}')
    if not restarted:
        print('  no harv services found to restart — restart manually if needed')


def main() -> int:
    if os.geteuid() != 0:
        print('WARNING: not running as root — file writes and systemctl may fail')

    print('=== deploy: video digest YouTube fix ===')
    for name in FILES:
        target = find_existing(name) or os.path.join(CANDIDATE_DIRS[0], name)
        os.makedirs(os.path.dirname(target), exist_ok=True)

        new_content = read_local_source(name)

        # Backup only if content actually differs
        if os.path.exists(target):
            with open(target) as f:
                if f.read() == new_content:
                    print(f'unchanged: {target}')
                    continue
            bak = target + '.bak'
            shutil.copy2(target, bak)
            print(f'backed up: {target} -> {bak}')

        with open(target, 'w') as f:
            f.write(new_content)
        try:
            syntax_check(target)
        except Exception as e:
            print(f'  SYNTAX ERROR in {target}: {e}')
            # Roll back
            bak = target + '.bak'
            if os.path.exists(bak):
                shutil.copy2(bak, target)
                print(f'  rolled back from {bak}')
            return 2
        print(f'deployed:  {target}')

    print('\nrestarting services...')
    restart_services()

    print('\nDONE. Try a YouTube digest now.')
    print('If it still fails with a bot-gate error, set one of:')
    print('  YT_DLP_COOKIES_FILE=/root/harv/cookies.txt   # netscape-format cookies')
    print('  YT_DLP_PROXY=http://user:pass@residential-proxy:port')
    print('in /root/harv/.env, then re-run this script.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
