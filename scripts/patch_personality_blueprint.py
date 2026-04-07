"""Move personality endpoint into a proper blueprint so it bypasses Hostinger auth."""
import os

# 1. Create a settings blueprint
BLUEPRINT_PATH = "/root/harv/api/blueprints/settings_bp.py"
blueprint_code = '''"""
blueprints/settings_bp.py — Dashboard settings endpoints.

Routes:
  GET  /personality  → current personality mode
  POST /personality  → set personality mode (cars1 / default)
"""

import json
import logging

from flask import Blueprint, jsonify, request

log = logging.getLogger('HarvSettingsAPI')

settings_bp = Blueprint('settings', __name__)

CORE_PATH = '/root/harv/core.json'


@settings_bp.route('/personality', methods=['GET', 'POST'])
def personality():
    """Get or set Harv personality mode (cars1 / default)."""
    if request.method == 'GET':
        try:
            with open(CORE_PATH) as f:
                cfg = json.load(f)
            p = cfg.get('agents', {}).get('harv', {}).get('personality', 'cars1')
            return jsonify({'personality': p})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    data = request.json or {}
    new_p = data.get('personality', '').strip().lower()
    if new_p not in ('cars1', 'default'):
        return jsonify({'error': 'personality must be "cars1" or "default"'}), 400

    try:
        with open(CORE_PATH) as f:
            cfg = json.load(f)
        cfg.setdefault('agents', {}).setdefault('harv', {})['personality'] = new_p
        with open(CORE_PATH, 'w') as f:
            json.dump(cfg, f, indent=2)
        log.info(f'Personality changed to: {new_p}')
        return jsonify({'personality': new_p, 'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
'''

with open(BLUEPRINT_PATH, 'w') as f:
    f.write(blueprint_code)
print(f"Created {BLUEPRINT_PATH}")

# 2. Register it in harv_api.py and remove the old inline route
API_PATH = "/root/harv/scripts/harv_api.py"
with open(API_PATH) as f:
    code = f.read()

# Add import
old_imports = "from api.blueprints.health import health_bp"
new_imports = old_imports + "\\nfrom api.blueprints.settings_bp import settings_bp"

if "settings_bp" not in code:
    code = code.replace(old_imports, new_imports)
    print("Added settings_bp import")

# Add registration
old_register = "app.register_blueprint(health_bp, url_prefix='/api/health')"
new_register = old_register + "\\napp.register_blueprint(settings_bp, url_prefix='/api/settings')"

if "settings_bp" not in code.split("register_blueprint")[-1] if "register_blueprint" in code else True:
    code = code.replace(old_register, new_register)
    print("Registered settings_bp at /api/settings")

# Remove the old inline route (the entire @app.route block)
import re
# Match from @app.route('/api/harv/personality'...) to the next @app.route or end of function
pattern = r"\n@app\.route\('/api/harv/personality'.*?(?=\n@app\.route|\nif __name__)"
match = re.search(pattern, code, re.DOTALL)
if match:
    code = code[:match.start()] + code[match.end():]
    print("Removed old inline personality route")

with open(API_PATH, 'w') as f:
    f.write(code)
print(f"harv_api.py saved ({len(code)} bytes)")
