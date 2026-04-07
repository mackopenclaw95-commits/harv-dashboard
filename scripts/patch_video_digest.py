"""Patch video_digest.py — update digest JSON schema to include implementation fields."""

VD_PATH = "/root/harv/agents/video_digest.py"
with open(VD_PATH) as f:
    code = f.read()

# Update the JSON structure prompt in _handle_digest_video
old_json_prompt = (
    '\'{"video_title": "...", "channel": "...", "duration": "...", \''
    '\n            f\'"platform": "{plabel}", \''
    '\n            f\'"overall_summary": "2-3 sentences", \''
    '\n            f\'"sections": [{{"number": 1, "title": "...", \''
    '\n            f\'"takeaways": ["..."], "actionable_items": ["..."], \''
    '\n            f\'"suggested_agent": "Fitness|Finance|Learning|Travel|Shopping|Research|Sports|Music|Trading|Scheduler|Email|none", \''
    '\n            f\'"summary": "one line"}}]}}\''
)

# Try a simpler match
old_section = '''"sections": [{{"number": 1, "title": "...", '''
old_section += '''"takeaways": ["..."], "actionable_items": ["..."], '''
old_section += '''"suggested_agent": "Fitness|Finance|Learning|Travel|Shopping|Research|Sports|Music|Trading|Scheduler|Email|none", '''
old_section += '''"summary": "one line"'''

new_section = '''"sections": [{{"number": 1, "title": "...", '''
new_section += '''"takeaways": ["..."], "actionable_items": ["step-by-step actions"], '''
new_section += '''"code_snippets": ["any commands, code, or technical steps"], '''
new_section += '''"implementation_notes": "prerequisites, gotchas, time estimate", '''
new_section += '''"suggested_agent": "Fitness|Finance|Learning|Travel|Shopping|Research|Sports|Music|Trading|Scheduler|Email|Image Gen|none", '''
new_section += '''"summary": "one line"'''

if "code_snippets" not in code:
    code = code.replace(old_section, new_section)
    print("Updated digest JSON schema with implementation fields")
else:
    print("Implementation fields already exist")

# Update the summarize prompt to be more action-oriented
old_summarize = "f'Summarize this {plabel} video in 3-5 sentences. '"
old_summarize += "\n            f'Include the key takeaways as bullet points."
new_summarize = "f'Summarize this {plabel} video as an implementation guide. '"
new_summarize += "\n            f'Include: 1) Key takeaways (bullets), 2) Actionable next steps (numbered), 3) Any code/commands if technical."

if "implementation guide" not in code:
    code = code.replace(old_summarize, new_summarize)
    print("Updated summarize prompt to implementation-focused")
else:
    print("Summarize prompt already updated")

# Update the final instruction line
old_focus = "f'Focus on ACTIONABLE content. What can Mack DO with this information?'"
new_focus = "f'Focus on IMPLEMENTATION. For each section: what does Mack DO next? Include specific steps, commands, tools, or actions. Every section should answer: what do I DO with this?'"

if "IMPLEMENTATION" not in code:
    code = code.replace(old_focus, new_focus)
    print("Updated focus instruction to implementation-first")
else:
    print("Focus instruction already updated")

with open(VD_PATH, "w") as f:
    f.write(code)
print(f"video_digest.py saved ({len(code)} bytes)")
