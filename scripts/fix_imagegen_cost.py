"""Fix Image Gen cost logging. Run on VPS."""
with open("/root/harv/agents/image_gen.py") as f:
    lines = f.readlines()

new_lines = []
skip_mangled = False
for i, line in enumerate(lines):
    # Skip the mangled one-liner
    if "# Log API cost for image generation" in line and "try:" in line:
        skip_mangled = True
        continue
    if skip_mangled:
        skip_mangled = False
        # This line should be the continuation of _record_generation
        if "result.get('model'" in line:
            new_lines.append(line)
            # Add clean cost logging after
            new_lines.append("            # Log image generation cost to event_bus\n")
            new_lines.append("            try:\n")
            new_lines.append("                from lib.event_bus import event_bus\n")
            new_lines.append("                _model = result.get('model', 'imagen-4.0-fast')\n")
            new_lines.append("                event_bus.emit('Image Gen', 'api_cost', 'success',\n")
            new_lines.append("                               summary=f'{_model} | 0 tokens | $0.030000',\n")
            new_lines.append("                               cost=0.03, tokens=0)\n")
            new_lines.append("            except Exception:\n")
            new_lines.append("                pass\n")
            print(f"Added clean cost logging at line {i+1}")
        else:
            new_lines.append(line)
        continue
    new_lines.append(line)

with open("/root/harv/agents/image_gen.py", "w") as f:
    f.writelines(new_lines)

print("Done")
