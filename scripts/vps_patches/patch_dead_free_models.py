"""Replace dead OpenRouter `:free` model references across the VPS.

Background: OpenRouter dropped `qwen/qwen3-8b:free` and
`deepseek/deepseek-r1-0528-qwen3-8b:free` — they 404 if anything actually calls
them. Nothing in prod routes through them (Medic calls paid `qwen/qwen3-8b`),
but the /api/agents/list endpoint displays the dead IDs as labels, which
pollutes the dashboard and the cost-tracking audit.

This patcher:
  1. Searches /root/harv-dashboard and /root/harv for dead `:free` strings
  2. Replaces them in-place with live alternatives:
       qwen/qwen3-8b:free  ->  google/gemma-3-4b-it:free
         (background agents Guardian/Medic/Heartbeat)
       deepseek/deepseek-r1-0528-qwen3-8b:free  ->  (deleted, never called)
  3. Prints every file touched so you can sanity-check before restart

After running, restart harv-dashboard.service so the Flask app reloads.

Safe to re-run. No-op on files without matches.
"""
import os
import sys

ROOTS = ['/root/harv-dashboard', '/root/harv']
DEAD_MODELS = {
    'qwen/qwen3-8b:free': 'google/gemma-3-4b-it:free',
    # No replacement — this one only appeared in audit scripts, never routed
    'deepseek/deepseek-r1-0528-qwen3-8b:free': '',
}

SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.next', 'venv', '.venv'}
TEXT_EXTS = {'.py', '.json', '.js', '.ts', '.tsx', '.md', '.txt', '.yml', '.yaml'}


def walk(root: str):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            ext = os.path.splitext(fn)[1]
            if ext and ext not in TEXT_EXTS:
                continue
            yield os.path.join(dirpath, fn)


def patch_file(path: str) -> dict:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            original = f.read()
    except (UnicodeDecodeError, OSError):
        return {}

    new = original
    replaced = {}
    for dead, live in DEAD_MODELS.items():
        if dead not in new:
            continue
        count = new.count(dead)
        if live:
            new = new.replace(dead, live)
        else:
            # No replacement means delete whole line containing the dead ref
            new = '\n'.join(
                line for line in new.split('\n') if dead not in line
            )
        replaced[dead] = count

    if new != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new)
    return replaced


def main() -> int:
    total_files = 0
    total_replacements = 0
    for root in ROOTS:
        if not os.path.isdir(root):
            print(f'skip (missing): {root}')
            continue
        print(f'scanning {root} ...')
        for path in walk(root):
            hits = patch_file(path)
            if hits:
                total_files += 1
                for dead, count in hits.items():
                    total_replacements += count
                    print(f'  {path}: {dead} x{count}')
    print(f'\ndone. touched {total_files} files, {total_replacements} replacements')
    if total_files > 0:
        print('\nnext: systemctl restart harv-dashboard.service')
    return 0


if __name__ == '__main__':
    sys.exit(main())
