from __future__ import annotations

from pathlib import Path
import stat

HOOK_CONTENT = """#!/usr/bin/env bash
set -euo pipefail

API_URL="${AI_GATEKEEPER_API_URL:-http://127.0.0.1:8000/api/scan/pre-push/}"
UI_URL_BASE="${AI_GATEKEEPER_UI_URL:-http://localhost:5173}"
PACKAGE_JSON_PATH="frontend/package.json"
PYTHON_BIN="python"

if [[ ! -f "$PACKAGE_JSON_PATH" ]]; then
  echo "[AI Security Gatekeeper] package.json not found, skipping security pre-push scan."
  exit 0
fi

DEVELOPER_NAME=$(git config user.name 2>/dev/null || echo "unknown")

PACKAGE_JSON_CONTENT=$(cat "$PACKAGE_JSON_PATH")
PAYLOAD=$("$PYTHON_BIN" -c "
import json, sys
try:
    pkg = json.loads(sys.argv[1])
except Exception:
    pkg = {}
pkg['developer_name'] = sys.argv[2]
print(json.dumps(pkg))
" "$PACKAGE_JSON_CONTENT" "$DEVELOPER_NAME")

RESPONSE=$(curl -sS -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")


PARSED=$("$PYTHON_BIN" - <<'PY' "$RESPONSE"
import json
import sys

raw = sys.argv[1]
try:
    payload = json.loads(raw)
except json.JSONDecodeError:
    print("ERROR||Invalid response from AI Gatekeeper endpoint")
    raise SystemExit(0)

if "detail" in payload or "status" not in payload:
    detail = payload.get("detail", "No scan status returned from server")
    print(f"ERROR||{detail}")
    raise SystemExit(0)

status = str(payload.get("status", "WARNING")).upper()
scan_id = payload.get("scan_id", "")
summary = str(payload.get("summary", "No summary provided."))
failures = payload.get("failures", [])

if failures:
    sys.stderr.write("\\n\\033[1;33m[AI Security Gatekeeper] Blocked/Warning Dependencies:\\033[0m\\n")
    for f in failures:
        pkg = f.get("package", "unknown")
        ver = f.get("version", "")
        pkg_status = f.get("status", "BLOCKED")
        reason = f.get("reason", "No reason provided.")
        rec = f.get("recommendation", "No recommendation provided.")
        
        # Color coding for status
        color = "\\033[1;31m" if pkg_status == "BLOCKED" else "\\033[1;33m"
        
        sys.stderr.write(f"\\n--------------------------------------------------\\n")
        sys.stderr.write(f"📦  \\033[1m{pkg}@{ver}\\033[0m ({color}{pkg_status}\\033[0m)\\n")
        sys.stderr.write(f"❓  \\033[1mWhy flagged:\\033[0m {reason}\\n")
        sys.stderr.write(f"💡  \\033[1;32mRecommended Fix:\\033[0m {rec}\\n")
    sys.stderr.write(f"--------------------------------------------------\\n\\n")

print(f"{status}|{scan_id}|{summary}")
PY
)

STATUS="${PARSED%%|*}"
REST="${PARSED#*|}"
SCAN_ID="${REST%%|*}"
SUMMARY="${REST#*|}"

if [[ "$STATUS" == "ERROR" ]]; then
  echo "[AI Security Gatekeeper] Could not parse scan response: $SUMMARY"
  exit 1
fi

if [[ "$STATUS" == "BLOCKED" ]]; then
  echo -e "\033[1;31m[AI Security Gatekeeper] PUSH BLOCKED!\033[0m"
  echo "$SUMMARY"
  echo "View full analysis and AI recommendations here: $UI_URL_BASE/?scanId=$SCAN_ID"
  exit 1
fi

echo "[AI Security Gatekeeper] Push approved ($STATUS)."
exit 0
"""


def main() -> None:
    import sys

    # 1. Search upward for the .git directory
    start_dir = Path(__file__).resolve().parent
    repo_root = start_dir
    while repo_root != repo_root.parent:
        if (repo_root / ".git").exists():
            break
        repo_root = repo_root.parent
    else:
        # Fallback if not found
        repo_root = start_dir

    git_dir = repo_root / ".git"
    hooks_dir = git_dir / "hooks"
    pre_push_path = hooks_dir / "pre-push"

    if not git_dir.exists():
        raise SystemExit(f"Could not find .git directory. Tried path: {git_dir}")

    # 2. Determine package.json relative path from git repo root
    package_json_abs = start_dir / "frontend" / "package.json"
    if not package_json_abs.exists():
        package_json_abs = start_dir / "package.json"
    
    try:
        relative_package_json = package_json_abs.relative_to(repo_root).as_posix()
    except ValueError:
        relative_package_json = "package.json"

    # 3. Format the hook content (replace CRLF and inject correct package.json path)
    formatted_content = HOOK_CONTENT.replace("\r\n", "\n")
    formatted_content = formatted_content.replace(
        'PACKAGE_JSON_PATH="package.json"',
        f'PACKAGE_JSON_PATH="{relative_package_json}"'
    )

    # 4. Inject the active python executable path
    current_python = Path(sys.executable).as_posix()
    formatted_content = formatted_content.replace(
        'PYTHON_BIN="python"',
        f'PYTHON_BIN="${{AI_GATEKEEPER_PYTHON_BIN:-{current_python}}}"'
    )

    hooks_dir.mkdir(parents=True, exist_ok=True)
    with open(pre_push_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(formatted_content)

    current_mode = pre_push_path.stat().st_mode
    pre_push_path.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    print(f"Pre-push hook installed at: {pre_push_path}")
    print(f"Target package.json path set to: {relative_package_json}")
    print(f"Target Python binary set to: {current_python}")
    print("It will call AI Security Gatekeeper before each push.")


if __name__ == "__main__":
    main()
