"""Patch harv_brain.py to add dynamic agent list builder."""

import re

BRAIN_PATH = '/root/harv/lib/harv_brain.py'

with open(BRAIN_PATH, 'r') as f:
    content = f.read()

# Add the helper function before build_system_prompt
helper_func = '''
def _build_agent_list(core: dict) -> str:
    """Build agent status list from core.json for the system prompt."""
    agents = core.get("agents", {})
    live, coming, bg, tools = [], [], [], []
    for key, agent in agents.items():
        name = agent.get("name", key)
        status = agent.get("dashboard_status", "live")
        if status == "live":
            live.append(f"- {name} (live)")
        elif status == "coming_soon":
            coming.append(f"- {name} (backend works, NOT in dashboard chat grid yet)")
        elif status == "background":
            bg.append(f"- {name} (background service)")
        elif status == "tool":
            tools.append(f"- {name} (internal tool)")

    parts = []
    if live:
        parts.append("### Live on Dashboard Chat Grid:\\n" + "\\n".join(live))
    if coming:
        parts.append("### Coming Soon — NOT in dashboard chat grid yet:\\n" + "\\n".join(coming))
    if bg:
        parts.append("### Background Services:\\n" + "\\n".join(bg))
    if tools:
        parts.append("### Internal Tools:\\n" + "\\n".join(tools))
    return "\\n\\n".join(parts)

'''

if '_build_agent_list' not in content:
    content = content.replace(
        'def build_system_prompt() -> str:',
        helper_func + 'def build_system_prompt() -> str:'
    )
    print("Added _build_agent_list function")

# Now replace the static agents section with a dynamic call
# Find the agents section and replace it
old_pattern = r'## Agents\nMack.*?### Internal Tools:.*?Memory.*?pgvector\)'
new_text = '## Agents\\nMack → Harv → Router → Agents\\n\\n{_build_agent_list(core)}'

content = re.sub(old_pattern, new_text, content, flags=re.DOTALL)

with open(BRAIN_PATH, 'w') as f:
    f.write(content)

print("Patched successfully")
