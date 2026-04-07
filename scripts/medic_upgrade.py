"""
medic.py -- Harv Medic Agent

Background repair agent. Receives problem diagnoses from Guardian and attempts
automatic fixes using a two-gear approach:

  Gear 1 -- Scripted fixes (no LLM, $0.00): known-problem / known-fix pairs.
  Gear 2 -- LLM debugging (qwen/qwen3-8b via OpenRouter, ~$0.00002/call):
            reads logs, asks the model for a fix, validates and executes it.

Called by: Guardian (inside the */15 health-check cycle -- no separate cron).
Never modifies .py files, credentials, config files, or the database.
"""

import json
import logging
import os
import subprocess
import sys
import time

import requests as _requests

sys.path.insert(0, "/root/harv")

from agents.base_agent import BaseAgent
from lib.harv_lib import now_est, log_api_cost
from lib.harv_errors import log_error

AGENT_NAME       = "Medic"
MEDIC_LOG        = "/root/harv/logs/medic.log"
OLLAMA_URL       = "http://172.17.0.1:11434"
MAX_ATTEMPTS     = 3
STABILITY_WAIT_S = 30
TELEGRAM_USER    = 6899940023

# ---------------------------------------------------------------------------
# Safety: commands containing any of these are NEVER executed
# ---------------------------------------------------------------------------
_FORBIDDEN_CMD_PATTERNS = [
    "rm -rf",
    "dd ",
    "mkfs",
    "fdisk",
    "/dev/",
    "wipefs",
    "shred",
    ":(){:|:&};:",
]
_FORBIDDEN_PATHS = [
    "/root/harv/.env",
    "/root/harv/credentials/",
    "/root/harv/memory/",
    "/root/harv/data/",
    "core.json",
    "session.json",
]


# ---------------------------------------------------------------------------
# Dedicated persistent log (separate from rotating daily harv_ log)
# ---------------------------------------------------------------------------
def _setup_medic_logger() -> logging.Logger:
    logger = logging.getLogger("MedicFile")
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)
        os.makedirs(os.path.dirname(MEDIC_LOG), exist_ok=True)
        fh = logging.FileHandler(MEDIC_LOG)
        fh.setFormatter(logging.Formatter(
            "[%(asctime)s] [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))
        logger.addHandler(fh)
    return logger


# ===========================================================================
class Medic(BaseAgent):
    """
    Background repair agent -- inherits BaseAgent for Sheets / LLM plumbing.
    Primary public method: attempt_fix(problem_dict) -> result_dict
    """

    def __init__(self):
        super().__init__(AGENT_NAME, provider="openrouter")
        self._mlog = _setup_medic_logger()

    # ------------------------------------------------------------------
    # BaseAgent interface (used when called via execute())
    # ------------------------------------------------------------------

    def run(self, task: str) -> str:
        """Parse task as JSON problem dict and call attempt_fix."""
        try:
            problem = json.loads(task)
        except (json.JSONDecodeError, TypeError):
            problem = {
                "component": "unknown",
                "issue":     str(task),
                "details":   "",
                "timestamp": now_est(),
            }
        result = self.attempt_fix(problem)
        return json.dumps(result)

    # ------------------------------------------------------------------
    # Main public method -- called directly by Guardian
    # ------------------------------------------------------------------

    def attempt_fix(self, problem: dict) -> dict:
        """
        Try to fix a problem reported by Guardian.

        problem: {
            component: str  -- e.g. harv-telegram, disk, memory
            issue:     str  -- human-readable description
            details:   str  -- raw status / output from Guardian
            timestamp: str
        }

        Returns: {
            fixed:        bool,
            gear_used:    1 | 2 | 0,
            action_taken: str,
            details:      str,
        }
        """
        component = problem.get("component", "unknown")
        issue     = problem.get("issue", "")
        self._mlog.info(
            "=== Medic attempt_fix component=%r issue=%r ===", component, issue
        )

        g1 = self._gear1_fix(problem)
        if g1 is not None:
            self._mlog.info(
                "Gear 1 result: fixed=%s action=%r", g1["fixed"], g1["action_taken"]
            )
            return g1

        self._mlog.info("No Gear 1 fix applies -- escalating to Gear 2 (LLM)")
        g2 = self._gear2_fix(problem)
        self._mlog.info(
            "Gear 2 result: fixed=%s action=%r", g2["fixed"], g2["action_taken"]
        )
        return g2

    # ------------------------------------------------------------------
    # Gear 1 -- Scripted fixes
    # ------------------------------------------------------------------

    def _gear1_fix(self, problem: dict):
        """Return result dict if a scripted fix applies, or None."""
        component = problem.get("component", "").lower().strip()
        issue     = problem.get("issue", "").lower()

        # Service crashed
        if self._is_harv_service(component) or "service" in issue:
            svc = self._extract_service_name(component, issue)
            if svc:
                return self._fix_restart_service(svc)

        # Ollama not responding
        if "ollama" in component or "ollama" in issue:
            return self._fix_restart_ollama()

        # Docker container stopped
        if any(w in component for w in ("docker", "container")) or "docker" in issue:
            container = self._extract_container_name(component)
            if container:
                return self._fix_restart_container(container)

        # Log file too large
        if "log" in component and any(w in issue for w in ("large", "size", "mb", "50mb")):
            log_path = problem.get("details", "")
            if log_path and log_path.endswith(".log") and os.path.exists(log_path):
                return self._fix_rotate_log(log_path)

        # Disk usage high
        if "disk" in component or "disk" in issue:
            return self._fix_disk_cleanup()

        # High memory
        if any(w in component for w in ("memory", "ram")) or \
                any(w in issue for w in ("memory", "ram", "mem")):
            return self._fix_memory_pressure()

        # Zombie / stale PID
        if any(w in issue for w in ("zombie", "stale", "pid")):
            return self._fix_zombie_processes()

        # Puppeteer / Chrome lock files
        if any(w in issue or w in component for w in ("puppeteer", "chrome", "browser", "headless")):
            return self._fix_puppeteer_locks()

        # File permission issues
        if any(w in issue for w in ("permission", "eacces", "eperm", "denied")):
            return self._fix_file_permissions()

        return None

    def _is_harv_service(self, name: str) -> bool:
        return name.startswith("harv-") or name in (
            "harv-telegram", "harv-api", "harv-whatsapp",
            "harv-dashboard", "harv-guardian", "harv-memory", "harv-analytics",
        )

    def _extract_service_name(self, component: str, issue: str):
        known = [
            "harv-telegram", "harv-api", "harv-whatsapp",
            "harv-dashboard", "harv-guardian", "harv-memory",
            "harv-analytics", "ollama",
        ]
        for svc in known:
            if svc in component or svc in issue:
                return svc
        non_svc = ("disk", "memory", "ram", "docker", "container", "log", "unknown")
        if component and component not in non_svc:
            return component
        return None

    def _extract_container_name(self, component: str):
        for c in ("openclaw-yqar-openclaw-1", "traefik", "harv-guardian"):
            if c in component:
                return c
        return None

    # ------------------------------------------------------------------
    # Telegram escalation
    # ------------------------------------------------------------------

    def _send_telegram(self, message: str) -> bool:
        token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        if not token:
            self._mlog.error("TELEGRAM_BOT_TOKEN not set -- cannot escalate")
            return False
        try:
            r = _requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": TELEGRAM_USER, "text": message, "parse_mode": "Markdown"},
                timeout=10,
            )
            r.raise_for_status()
            self._mlog.info("Telegram escalation sent")
            return True
        except Exception as e:
            self._mlog.error("Telegram send failed: %s", e)
            return False

    # ------------------------------------------------------------------
    # Pre-restart diagnostics
    # ------------------------------------------------------------------

    def _diagnose_service(self, service: str) -> str:
        """Read journalctl for the service before attempting restart."""
        rc, journal = self._run_cmd(
            f'journalctl -u {service} --no-pager -n 30 --since "5 min ago" 2>/dev/null',
            timeout=10,
        )
        journal = journal.strip()[:3000] if journal.strip() else "(no journal entries)"
        self._mlog.info("Pre-restart journal for %s:\n%s", service, journal[:500])
        return journal

    # ------------------------------------------------------------------
    # Pre-restart cleanup
    # ------------------------------------------------------------------

    def _pre_restart_cleanup(self, service: str) -> None:
        """Kill child processes and stale patterns before restarting."""
        # Get main PID
        rc, pid_out = self._run_cmd(
            f"systemctl show -p MainPID --value {service}", timeout=5
        )
        main_pid = pid_out.strip()
        if main_pid and main_pid != "0":
            self._mlog.info("Killing children of PID %s (%s)", main_pid, service)
            self._run_cmd(f"pkill -P {main_pid}", timeout=5)

        # Kill known stale process patterns
        svc_short = service.replace("harv-", "")
        self._run_cmd(f'pkill -f "python.*{svc_short}" 2>/dev/null', timeout=5)
        self._run_cmd(f'pkill -f "node.*{svc_short}" 2>/dev/null', timeout=5)

        time.sleep(2)
        self._mlog.info("Pre-restart cleanup done for %s", service)

    # ------------------------------------------------------------------
    # Service restart (upgraded: diagnose -> cleanup -> restart -> 30s verify -> escalate)
    # ------------------------------------------------------------------

    def _fix_restart_service(self, service: str) -> dict:
        self._mlog.info("Gear 1: restarting service %r", service)

        # Step 1: diagnose before touching anything
        journal_ctx = self._diagnose_service(service)

        # Step 2: pre-restart cleanup
        self._pre_restart_cleanup(service)

        # Step 3: restart loop with 30s stability verification
        for attempt in range(1, MAX_ATTEMPTS + 1):
            rc, out = self._run_cmd(f"systemctl restart {service}", timeout=30)
            if rc != 0:
                self._mlog.warning("Restart attempt %d failed: %s", attempt, out[:200])
                time.sleep(2)
                continue

            # Quick sanity check at 5s
            time.sleep(5)
            rc2, status = self._run_cmd(f"systemctl is-active {service}", timeout=5)
            if status.strip() != "active":
                self._mlog.warning(
                    "Attempt %d: not active at 5s: %s", attempt, status.strip()
                )
                time.sleep(3)
                continue

            # Stability check: wait until 30s total, then verify again
            self._mlog.info(
                "Attempt %d: active at 5s, waiting %ds for stability...",
                attempt, STABILITY_WAIT_S - 5,
            )
            time.sleep(STABILITY_WAIT_S - 5)
            rc3, status2 = self._run_cmd(f"systemctl is-active {service}", timeout=5)
            if status2.strip() == "active":
                msg = (
                    f"Restarted {service} successfully (attempt {attempt}, "
                    f"stable for {STABILITY_WAIT_S}s)"
                )
                self._mlog.info(msg)
                return {"fixed": True, "gear_used": 1,
                        "action_taken": f"restarted {service}", "details": msg}

            self._mlog.warning(
                "Attempt %d: died between 5s and %ds: %s",
                attempt, STABILITY_WAIT_S, status2.strip(),
            )

        # Step 4: all attempts failed -- escalate via Telegram
        journal_last10 = "\n".join(journal_ctx.split("\n")[-10:])
        escalation_msg = (
            f"\U0001f527 *Medic Escalation*\n"
            f"Service: `{service}`\n"
            f"Failed after {MAX_ATTEMPTS} restart attempts\n\n"
            f"Last error (journalctl):\n```\n{journal_last10[:800]}\n```\n\n"
            f"Manual intervention needed."
        )
        self._send_telegram(escalation_msg)

        msg = f"Failed to restart {service} after {MAX_ATTEMPTS} attempts -- Telegram alert sent"
        self._mlog.error(msg)
        return {"fixed": False, "gear_used": 1,
                "action_taken": f"attempted restart of {service} (escalated)",
                "details": msg}

    def _fix_restart_ollama(self) -> dict:
        self._mlog.info("Gear 1: restarting Ollama")
        rc, out = self._run_cmd("systemctl restart ollama", timeout=30)
        if rc != 0:
            msg = f"systemctl restart ollama failed: {out[:200]}"
            self._mlog.error(msg)
            return {"fixed": False, "gear_used": 1,
                    "action_taken": "attempted Ollama restart", "details": msg}
        time.sleep(10)
        try:
            r = _requests.get(f"{OLLAMA_URL}/api/tags", timeout=10)
            r.raise_for_status()
            msg = "Ollama restarted and responding"
            self._mlog.info(msg)
            return {"fixed": True, "gear_used": 1,
                    "action_taken": "restarted ollama", "details": msg}
        except Exception as e:
            msg = f"Ollama restarted but still not responding: {e}"
            self._mlog.error(msg)
            return {"fixed": False, "gear_used": 1,
                    "action_taken": "attempted Ollama restart", "details": msg}

    def _fix_restart_container(self, container: str) -> dict:
        self._mlog.info("Gear 1: restarting Docker container %r", container)
        rc, out = self._run_cmd(f"docker restart {container}", timeout=60)
        if rc != 0:
            msg = f"docker restart {container} failed: {out[:200]}"
            self._mlog.error(msg)
            return {"fixed": False, "gear_used": 1,
                    "action_taken": f"attempted docker restart {container}",
                    "details": msg}
        time.sleep(10)
        fmt = "{{.Names}}"
        rc2, ps_out = self._run_cmd(
            f'docker ps --filter name={container} --filter status=running --format "{fmt}"',
            timeout=10,
        )
        if container in ps_out:
            msg = f"Container {container} restarted and running"
            self._mlog.info(msg)
            return {"fixed": True, "gear_used": 1,
                    "action_taken": f"restarted container {container}", "details": msg}
        msg = f"Container {container} still not running after restart"
        self._mlog.error(msg)
        return {"fixed": False, "gear_used": 1,
                "action_taken": f"attempted docker restart {container}", "details": msg}

    def _fix_rotate_log(self, log_path: str) -> dict:
        self._mlog.info("Gear 1: rotating oversized log %r", log_path)
        try:
            archive_path = log_path + ".archive"
            rc, tail_out = self._run_cmd(f"tail -n 1000 {log_path}", timeout=10)
            with open(archive_path, "a", encoding="utf-8", errors="replace") as af:
                af.write(f"\n--- Archived {now_est()} ---\n")
                af.write(tail_out)
            open(log_path, "w").close()
            msg = f"Rotated {log_path} -- last 1000 lines in {archive_path}"
            self._mlog.info(msg)
            return {"fixed": True, "gear_used": 1,
                    "action_taken": f"rotated log {os.path.basename(log_path)}",
                    "details": msg}
        except Exception as e:
            msg = f"Log rotation failed: {e}"
            self._mlog.error(msg)
            return {"fixed": False, "gear_used": 1,
                    "action_taken": "attempted log rotation", "details": msg}

    def _fix_disk_cleanup(self) -> dict:
        self._mlog.info("Gear 1: disk cleanup")
        rc1, _ = self._run_cmd("apt-get clean", timeout=30)
        rc2, _ = self._run_cmd(
            "find /root/harv/logs -name '*.log' -mtime +7 -delete", timeout=20
        )
        rc3, _ = self._run_cmd(
            "find /tmp -maxdepth 1 -type f -mtime +1 -delete", timeout=20
        )
        results = [
            "apt-get clean: "   + ("ok" if rc1 == 0 else "failed"),
            "rotate old logs: " + ("ok" if rc2 == 0 else "failed"),
            "clear /tmp: "      + ("ok" if rc3 == 0 else "failed"),
        ]
        msg = " | ".join(results)
        self._mlog.info("Disk cleanup: %s", msg)
        return {"fixed": (rc1 == 0 and rc2 == 0), "gear_used": 1,
                "action_taken": "disk cleanup (apt clean + log rotation + /tmp clear)",
                "details": msg}

    def _fix_memory_pressure(self) -> dict:
        self._mlog.info("Gear 1: handling memory pressure")
        rc, ps_out = self._run_cmd(
            "ps aux --sort=-%mem --no-headers | head -5", timeout=10
        )
        top_line = ps_out.strip().split("\n")[0] if ps_out.strip() else ""
        self._mlog.info("Top memory process: %s", top_line[:150])
        for svc in ("harv-telegram", "harv-api", "harv-whatsapp", "harv-dashboard"):
            if svc.replace("harv-", "") in top_line or svc in top_line:
                self._mlog.info("Top process is %s -- restarting", svc)
                return self._fix_restart_service(svc)
        msg = (
            f"Top memory process is not a harv service -- logged only. "
            f"Top: {top_line[:100]}"
        )
        self._mlog.warning(msg)
        return {"fixed": False, "gear_used": 1,
                "action_taken": "identified top memory process", "details": msg}

    def _fix_zombie_processes(self) -> dict:
        self._mlog.info("Gear 1: checking for zombie processes")
        rc, out = self._run_cmd(
            r"ps aux | grep -E '[Zz]ombie|defunct' | grep -i harv | awk '{print $2}'",
            timeout=10,
        )
        pids = [p.strip() for p in out.strip().split("\n") if p.strip().isdigit()]
        if not pids:
            return {"fixed": True, "gear_used": 1,
                    "action_taken": "zombie check: none found",
                    "details": "No zombie harv processes found"}
        killed = []
        for pid in pids[:10]:
            rc2, _ = self._run_cmd(f"kill -9 {pid}", timeout=5)
            if rc2 == 0:
                killed.append(pid)
        msg = f"Killed zombie PIDs: {killed}" if killed else "No zombies killable"
        self._mlog.info(msg)
        return {"fixed": bool(killed), "gear_used": 1,
                "action_taken": "killed zombie processes", "details": msg}

    def _fix_puppeteer_locks(self) -> dict:
        self._mlog.info("Gear 1: clearing Puppeteer / Chrome locks")
        actions = []

        # Remove Chrome singleton locks
        rc1, out1 = self._run_cmd(
            "rm -f /tmp/.org.chromium.Chromium.*/SingletonLock 2>/dev/null", timeout=10
        )
        actions.append("cleared singleton locks" if rc1 == 0 else "no singleton locks found")

        # Kill stale headless Chrome processes
        rc2, out2 = self._run_cmd('pkill -f "chrome.*--headless" 2>/dev/null', timeout=10)
        actions.append("killed stale headless chrome" if rc2 == 0 else "no stale chrome found")

        # Kill orphaned puppeteer processes
        rc3, out3 = self._run_cmd('pkill -f "puppeteer" 2>/dev/null', timeout=10)
        actions.append("killed puppeteer procs" if rc3 == 0 else "no puppeteer procs found")

        msg = " | ".join(actions)
        self._mlog.info("Puppeteer cleanup: %s", msg)
        return {"fixed": True, "gear_used": 1,
                "action_taken": "cleared Puppeteer locks and stale Chrome processes",
                "details": msg}

    def _fix_file_permissions(self) -> dict:
        self._mlog.info("Gear 1: fixing file permissions")
        actions = []

        rc1, _ = self._run_cmd("chown -R root:root /root/harv/logs/", timeout=10)
        actions.append("chown logs: " + ("ok" if rc1 == 0 else "failed"))

        rc2, _ = self._run_cmd(
            "find /root/harv/logs -type f -exec chmod 644 {} +", timeout=10
        )
        actions.append("chmod log files 644: " + ("ok" if rc2 == 0 else "failed"))

        rc3, _ = self._run_cmd("chmod 755 /root/harv/scripts/*.py", timeout=10)
        actions.append("chmod scripts: " + ("ok" if rc3 == 0 else "failed"))

        rc4, _ = self._run_cmd("chmod 755 /root/harv/agents/*.py", timeout=10)
        actions.append("chmod agents: " + ("ok" if rc4 == 0 else "failed"))

        msg = " | ".join(actions)
        self._mlog.info("Permission fix: %s", msg)
        return {"fixed": (rc1 == 0 and rc2 == 0), "gear_used": 1,
                "action_taken": "fixed file permissions (logs, scripts, agents)",
                "details": msg}

    # ------------------------------------------------------------------
    # Gear 2 -- LLM Debugging via OpenRouter (qwen/qwen3-8b)
    # ------------------------------------------------------------------

    def _gear2_fix(self, problem: dict) -> dict:
        """
        Ask qwen/qwen3-8b to diagnose and propose fix commands.
        Executes only if confidence >= 0.5 AND risk != high.
        """
        component = problem.get("component", "unknown")
        issue     = problem.get("issue", "")
        details   = problem.get("details", "")

        log_ctx     = self._gather_log_context(component)
        journal_ctx = self._gather_journal_context(component)

        system_prompt = (
            "You are a Linux system debugger for the Harv AI assistant running on Ubuntu 24.04. "
            "Analyze the error and respond with ONLY a JSON object: "
            '{"diagnosis": "what went wrong in one sentence", '
            '"fix_commands": ["list of bash commands to fix it"], '
            '"confidence": 0.0-1.0, '
            '"risk": "low|medium|high"}. '
            "If risk is high or confidence is below 0.5, set fix_commands to an empty array."
        )
        user_msg = (
            f"Component: {component}\n"
            f"Issue: {issue}\n"
            f"Details: {details}\n\n"
            f"Recent log output (last 100 lines):\n{log_ctx}\n\n"
            f"Journal output (last 50 lines):\n{journal_ctx}"
        )

        self._mlog.info(
            "Gear 2: calling qwen/qwen3-8b via OpenRouter for component=%r", component
        )

        try:
            import openai as _openai
            api_key = os.environ.get("OPENROUTER_API_KEY", "")
            if not api_key:
                raise RuntimeError("OPENROUTER_API_KEY not set")
            model  = "qwen/qwen3-8b"
            client = _openai.OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1")
            resp   = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_msg},
                ],
                temperature=0.1,
                max_tokens=500,
            )
            raw     = resp.choices[0].message.content if resp.choices else ""
            usage   = resp.usage or type("U", (), {"prompt_tokens": 0, "completion_tokens": 0})()
            in_tok  = getattr(usage, "prompt_tokens",    0)
            out_tok = getattr(usage, "completion_tokens", 0)
            log_api_cost(
                f"medic-gear2-{int(time.time())}", AGENT_NAME, model,
                in_tok, out_tok, task_type="gear2-debug",
            )
            self._mlog.info("Gear 2 LLM raw response: %s", raw[:500])
        except Exception as e:
            msg = f"Gear 2 LLM call failed: {e}"
            self._mlog.error(msg)
            log_error(AGENT_NAME, msg)
            return {"fixed": False, "gear_used": 2,
                    "action_taken": "LLM call failed", "details": msg}

        # Parse JSON (strip markdown fences if present)
        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                lines   = cleaned.split("\n")
                cleaned = "\n".join(lines[1:])
                if cleaned.rstrip().endswith("```"):
                    cleaned = cleaned.rstrip()[:-3]
            parsed = json.loads(cleaned.strip())
        except Exception as e:
            msg = f"Gear 2 JSON parse error: {e}. Raw: {raw[:200]}"
            self._mlog.error(msg)
            return {"fixed": False, "gear_used": 2,
                    "action_taken": "LLM diagnosis (JSON parse error)", "details": msg}

        diagnosis    = parsed.get("diagnosis",    "unknown")
        fix_commands = parsed.get("fix_commands", [])
        confidence   = float(parsed.get("confidence", 0.0))
        risk         = str(parsed.get("risk", "high")).lower()

        self._mlog.info(
            "Gear 2: diagnosis=%r confidence=%.2f risk=%r commands=%s",
            diagnosis, confidence, risk, fix_commands,
        )

        # Safety gate
        if confidence < 0.5 or risk == "high" or not fix_commands:
            msg = (
                f"Diagnosis: {diagnosis}. "
                f"Not executed (confidence={confidence:.2f}, risk={risk!r}). "
                "Manual review needed."
            )
            self._mlog.warning(msg)
            return {"fixed": False, "gear_used": 2,
                    "action_taken": f"LLM diagnosed: {diagnosis[:80]}",
                    "details": msg}

        # Validate commands
        safe_cmds = self._validate_commands(fix_commands)
        if not safe_cmds:
            msg = f"All commands blocked by safety validator. Diagnosis: {diagnosis}"
            self._mlog.error(msg)
            return {"fixed": False, "gear_used": 2,
                    "action_taken": "commands blocked by safety check", "details": msg}

        # Execute
        cmd_results = []
        all_ok      = True
        for cmd in safe_cmds[:5]:
            self._mlog.info("Gear 2 executing: %r", cmd)
            rc, out = self._run_cmd(cmd, timeout=60)
            status  = "ok" if rc == 0 else f"failed(rc={rc})"
            cmd_results.append(f"{cmd[:60]}: {status}")
            if rc != 0:
                all_ok = False
                self._mlog.warning("Command failed: %r -> %s", cmd, out[:200])
            else:
                self._mlog.info("Command ok: %r", cmd)

        details_str = (
            f"Diagnosis: {diagnosis}. "
            f"Commands: {' | '.join(cmd_results)}"
        )
        return {"fixed": all_ok, "gear_used": 2,
                "action_taken": f"LLM fix: {diagnosis[:80]}",
                "details": details_str}

    # ------------------------------------------------------------------
    # Safety validator
    # ------------------------------------------------------------------

    def _validate_commands(self, commands: list) -> list:
        safe = []
        for cmd in commands:
            cmd_lower = cmd.lower()
            blocked   = False
            for pattern in _FORBIDDEN_CMD_PATTERNS:
                if pattern.lower() in cmd_lower:
                    self._mlog.warning("BLOCKED (pattern %r): %r", pattern, cmd)
                    blocked = True
                    break
            if not blocked:
                for path in _FORBIDDEN_PATHS:
                    if path in cmd:
                        self._mlog.warning("BLOCKED (forbidden path %r): %r", path, cmd)
                        blocked = True
                        break
            if not blocked and ".py" in cmd and any(
                w in cmd for w in ("> ", ">>", "tee ", "sed -i", "awk ")
            ):
                self._mlog.warning("BLOCKED (.py write): %r", cmd)
                blocked = True
            if not blocked:
                safe.append(cmd)
        return safe

    # ------------------------------------------------------------------
    # Context gathering for Gear 2
    # ------------------------------------------------------------------

    def _gather_log_context(self, component: str) -> str:
        from datetime import datetime as _dt
        comp = component.lower()
        if "whatsapp" in comp:
            path = "/root/harv/logs/whatsapp.log"
        elif "guardian" in comp:
            path = "/root/harv/logs/guardian.log"
        elif "ollama" in comp:
            path = "/var/log/syslog"
        else:
            today = _dt.now().strftime("harv_%Y-%m-%d.log")
            path  = f"/root/harv/logs/{today}"
        rc, out = self._run_cmd(f"tail -n 100 {path} 2>/dev/null", timeout=10)
        return out[:3000] if out.strip() else "(no log available)"

    def _gather_journal_context(self, component: str) -> str:
        comp = component.lower()
        svc  = None
        for known in ("harv-telegram", "harv-api", "harv-whatsapp", "harv-dashboard", "ollama"):
            if known in comp:
                svc = known
                break
        if not svc:
            return "(not a systemd service)"
        rc, out = self._run_cmd(
            f"journalctl -u {svc} --no-pager -n 50 2>/dev/null", timeout=10
        )
        return out[:3000] if out.strip() else "(no journal entries)"

    # ------------------------------------------------------------------
    # Shell runner
    # ------------------------------------------------------------------

    def _run_cmd(self, cmd: str, timeout: int = 30):
        """Run cmd in shell. Returns (returncode, combined stdout+stderr)."""
        try:
            r = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=timeout,
            )
            return r.returncode, (r.stdout or "") + (r.stderr or "")
        except subprocess.TimeoutExpired:
            self._mlog.warning("Command timed out (%ds): %r", timeout, cmd)
            return -1, f"TIMEOUT after {timeout}s"
        except Exception as e:
            self._mlog.error("Command exception: %s", e)
            return -1, str(e)


# ---------------------------------------------------------------------------
# Standalone test entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Harv Medic Agent")
    parser.add_argument("--component", default="test-service")
    parser.add_argument("--issue",     default="service not running")
    parser.add_argument("--details",   default="simulated test")
    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv("/root/harv/.env")
    m = Medic()
    result = m.attempt_fix({
        "component": args.component,
        "issue":     args.issue,
        "details":   args.details,
        "timestamp": now_est(),
    })
    print(json.dumps(result, indent=2))
