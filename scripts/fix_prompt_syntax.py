"""Fix the syntax error in harv_brain.py system prompt."""

BRAIN_PATH = '/root/harv/lib/harv_brain.py'

with open(BRAIN_PATH, 'r') as f:
    lines = f.readlines()

# Find the broken line and fix it
fixed_lines = []
for i, line in enumerate(lines):
    if 'IMPORTANT FACT:' in line and 'return' in line:
        # Replace with a properly escaped version
        fixed_lines.append(
            '    return "IMPORTANT FACT: On the Harv Dashboard, these agents are COMING SOON (not yet in the chat grid): Fitness, Finance, Travel, Shopping, Sports, Music, Trading, Auto Marketing. Only Harv, Journal, Scheduler, Email, Learning, Research, Video Digest, Image Gen, YouTube Digest are LIVE on the dashboard.\\n\\n" + "You are part of the Harv agent system.\\n"\n'
        )
        # Skip the next line if it's a continuation
        continue
    elif i > 0 and 'IMPORTANT FACT' in lines[i-1] and line.strip().startswith('"You are part'):
        # Skip - already handled above
        continue
    else:
        fixed_lines.append(line)

with open(BRAIN_PATH, 'w') as f:
    f.writelines(fixed_lines)

# Verify
try:
    compile(open(BRAIN_PATH).read(), 'harv_brain.py', 'exec')
    print('Syntax OK!')
except SyntaxError as e:
    print(f'Still broken at line {e.lineno}: {e.msg}')
    # Show the problematic area
    with open(BRAIN_PATH) as f:
        all_lines = f.readlines()
    start = max(0, e.lineno - 3)
    for j in range(start, min(len(all_lines), e.lineno + 2)):
        print(f'  {j+1}: {all_lines[j].rstrip()}')
