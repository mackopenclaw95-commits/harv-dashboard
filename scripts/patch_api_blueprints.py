"""Register all blueprints in harv_api.py so the dashboard endpoints work."""

API_PATH = "/root/harv/scripts/harv_api.py"
with open(API_PATH) as f:
    code = f.read()

# Add blueprint imports after the existing imports
import_marker = "from lib.harv_brain import chat_with_harv, clear_history, run_router_manual"

blueprint_imports = '''from lib.harv_brain import chat_with_harv, clear_history, run_router_manual
from lib.harv_lib import append_log, sheets_client

# Blueprint imports
from api.blueprints.agents import agents_bp
from api.blueprints.analytics import analytics_bp
from api.blueprints.crons import crons_bp
from api.blueprints.events import events_bp
from api.blueprints.health import health_bp'''

# Only patch if not already done
if "agents_bp" not in code:
    # Replace the import line + the next line (harv_lib import)
    old_imports = '''from lib.harv_brain import chat_with_harv, clear_history, run_router_manual
from lib.harv_lib import append_log, sheets_client'''
    code = code.replace(old_imports, blueprint_imports)
    print("Added blueprint imports")
else:
    print("Blueprint imports already present")

# Register blueprints after app = Flask(__name__)
app_marker = "app = Flask(__name__)"
blueprint_register = '''app = Flask(__name__)

# Register API blueprints
app.register_blueprint(agents_bp, url_prefix='/api/agents')
app.register_blueprint(analytics_bp, url_prefix='/api/analytics')
app.register_blueprint(crons_bp, url_prefix='/api/crons')
app.register_blueprint(events_bp, url_prefix='/api/events')
app.register_blueprint(health_bp, url_prefix='/api/health')'''

if "register_blueprint" not in code:
    code = code.replace(app_marker, blueprint_register)
    print("Registered 5 blueprints")
else:
    print("Blueprints already registered")

with open(API_PATH, "w") as f:
    f.write(code)
print(f"harv_api.py saved ({len(code)} bytes)")
