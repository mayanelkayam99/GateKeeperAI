from __future__ import annotations

from pathlib import Path
import stat

HOOK_CONTENT = """#!/usr/bin/env bash
set -euo pipefail

API_URL="${AI_GATEKEEPER_API_URL:-http://localhost:8000/api/scan/pre-push/}"
UI_URL_BASE="${AI_GATEKEEPER_UI_URL:-http://localhost:5173}"
PACKAGE_JSON_PATH="package.json"

if [[ ! -f "$PACKAGE_JSON_PATH" ]]; then
  echo "[AI Security Gatekeeper] package.json not found, skipping security pre-push scan."
  exit 0
fi

RESPONSE=$(curl -sS -X POST "$API_URL" \\
  -H "Content-Type: application/json" \\
  --data-binary "@$PACKAGE_JSON_PATH")

PARSED=$(python - <<'PY' "$RESPONSE"
import json
import sys

raw = sys.argv[1]
try:
    payload = json.loads(raw)
except json.JSONDecodeError:
    print("ERROR||Invalid response from AI Gatekeeper endpoint")
    raise SystemExit(0)

status = str(payload.get("status", "WARNING")).upper()
scan_id = payload.get("scan_id", "")
summary = str(payload.get("summary", "No summary provided."))
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
  echo -e "\\033[1;31m[AI Security Gatekeeper] PUSH BLOCKED!\\033[0m"
  echo "$SUMMARY"
  echo "View full analysis and AI recommendations here: $UI_URL_BASE/?scanId=$SCAN_ID"
  exit 1
fi

echo "[AI Security Gatekeeper] Push approved ($STATUS)."
exit 0
"""


def main() -> None:
    repo_root = Path(__file__).resolve().parent
    git_dir = repo_root / ".git"
    hooks_dir = git_dir / "hooks"
    pre_push_path = hooks_dir / "pre-push"

    if not git_dir.exists():
        raise SystemExit("Could not find .git directory. Run this script from your repository root.")

    hooks_dir.mkdir(parents=True, exist_ok=True)
    pre_push_path.write_text(HOOK_CONTENT, encoding="utf-8")

    current_mode = pre_push_path.stat().st_mode
    pre_push_path.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    print(f"Pre-push hook installed at: {pre_push_path}")
    print("It will call AI Security Gatekeeper before each push.")


if __name__ == "__main__":
    main()
