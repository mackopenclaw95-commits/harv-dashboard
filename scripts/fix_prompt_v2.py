"""Fix harv_brain.py prompt - remove the broken IMPORTANT FACT and fix the return statement."""

BRAIN_PATH = '/root/harv/lib/harv_brain.py'

with open(BRAIN_PATH, 'r') as f:
    content = f.read()

# The problem: the return statement got split incorrectly.
# Find everything between 'return "IMPORTANT' and the f-string start
# and replace with a clean version

import re

# Remove the broken IMPORTANT FACT + duplicate "You are part" lines
# and restore the original return statement with the fact prepended properly
pattern = r'    return "IMPORTANT FACT:.*?"You are part of the Harv agent system\.\\n"\s*\n\s*\nYou are part of the Harv agent system\.\\n'

# Actually, let me just find and fix the exact broken area
# Read line by line
lines = content.split('\n')
new_lines = []
skip_until_fstring = False
i = 0
while i < len(lines):
    line = lines[i]

    if 'IMPORTANT FACT' in line and 'return' in line:
        # Replace this line and skip until we find the f-string
        # The original line was: return "You are part of the Harv agent system.\n..." + f"""You are Harv...
        # Find the f-string line
        j = i + 1
        while j < len(lines) and 'f"""You are Harv' not in lines[j]:
            j += 1

        if j < len(lines):
            # Found the f-string line - reconstruct
            fstring_line = lines[j]
            # Extract just the f-string part
            fstring_start = fstring_line.find('f"""')
            if fstring_start >= 0:
                fstring_part = fstring_line[fstring_start:]
            else:
                fstring_part = fstring_line.strip()

            new_lines.append('    dashboard_fact = "IMPORTANT: On the Harv Dashboard, these agents are COMING SOON (not yet in chat grid): Fitness, Finance, Travel, Shopping, Sports, Music, Trading, Auto Marketing. Only Harv, Journal, Scheduler, Email, Learning, Research, Video Digest, Image Gen, YouTube Digest, Media Manager are LIVE."')
            new_lines.append('    return dashboard_fact + "\\n\\nYou are part of the Harv agent system.\\nMission: Build and continuously improve Harv, and perform all tasks in service of Mack\'s goal: a powerful, fully automated, profitable AI business.\\nPrinciples: Automate over manual. Cost efficiency first. Perfection over speed.\\nDirective: Every task you perform should move Mack closer to building and scaling a profitable AI business. Act with that end goal in mind.\\n\\n" + ' + fstring_part)
            i = j + 1
            continue
        else:
            # Couldn't find f-string, just remove the IMPORTANT FACT line
            new_lines.append(line.replace('return "IMPORTANT FACT:', 'return "You are part of the Harv agent system.'))
    else:
        new_lines.append(line)
    i += 1

content = '\n'.join(new_lines)

with open(BRAIN_PATH, 'w') as f:
    f.write(content)

# Verify
try:
    compile(open(BRAIN_PATH).read(), 'harv_brain.py', 'exec')
    print('Syntax OK!')
except SyntaxError as e:
    print(f'Still broken at line {e.lineno}: {e.msg}')
    with open(BRAIN_PATH) as f:
        all_lines = f.readlines()
    start = max(0, e.lineno - 3)
    for j in range(start, min(len(all_lines), e.lineno + 3)):
        marker = '>>>' if j + 1 == e.lineno else '   '
        print(f'{marker} {j+1}: {all_lines[j].rstrip()[:120]}')
