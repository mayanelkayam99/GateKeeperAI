import base64
import json
import logging
import os
from typing import Any

import requests
from fastapi import APIRouter, BackgroundTasks, Request

from backend.agents.orchestrator import SecurityOrchestrator, SecurityOrchestratorError
from backend.services.npm import get_npm_license
from backend.services.osv import check_osv_vulnerabilities

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhook", tags=["Webhook"])

GITHUB_API_BASE_URL = "https://api.github.com"
STATUS_CONTEXT = "AI Gatekeeper"
REQUEST_TIMEOUT_SECONDS = 20


def _post_commit_status(
    repo_full_name: str,
    sha: str,
    state: str,
    description: str,
    github_token: str | None,
) -> None:
    if not github_token:
        logger.warning("GITHUB_TOKEN is not configured; skipping commit status update")
        return

    url = f"{GITHUB_API_BASE_URL}/repos/{repo_full_name}/statuses/{sha}"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
    }
    payload = {
        "state": state,
        "description": description[:140],
        "context": STATUS_CONTEXT,
    }

    response = requests.post(
        url,
        json=payload,
        headers=headers,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()


def _fetch_package_json(
    repo_full_name: str,
    sha: str,
    github_token: str | None,
) -> dict[str, Any] | None:
    url = f"{GITHUB_API_BASE_URL}/repos/{repo_full_name}/contents/package.json"
    headers = {"Accept": "application/vnd.github+json"}
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"

    response = requests.get(
        url,
        params={"ref": sha},
        headers=headers,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    if response.status_code == 404:
        return None

    response.raise_for_status()
    content_payload = response.json()
    encoded_content = content_payload.get("content")
    if not encoded_content:
        return None

    normalized_content = str(encoded_content).replace("\n", "")
    decoded_content = base64.b64decode(normalized_content)
    return json.loads(decoded_content.decode("utf-8"))


def process_github_webhook(repo_full_name: str, sha: str) -> None:
    github_token = os.getenv("GITHUB_TOKEN")
    blocked_count = 0

    try:
        _post_commit_status(
            repo_full_name=repo_full_name,
            sha=sha,
            state="pending",
            description="AI Security Gatekeeper is scanning dependencies...",
            github_token=github_token,
        )

        package_json = _fetch_package_json(
            repo_full_name=repo_full_name,
            sha=sha,
            github_token=github_token,
        )
        if not package_json:
            _post_commit_status(
                repo_full_name=repo_full_name,
                sha=sha,
                state="success",
                description="No package.json found for this commit.",
                github_token=github_token,
            )
            return

        dependencies = package_json.get("dependencies") or {}
        if not isinstance(dependencies, dict) or not dependencies:
            _post_commit_status(
                repo_full_name=repo_full_name,
                sha=sha,
                state="success",
                description="No dependencies found to scan.",
                github_token=github_token,
            )
            return

        top_dependencies = list(dependencies.items())[:3]

        orchestrator = SecurityOrchestrator()
        for package_name, version in top_dependencies:
            license_data = get_npm_license(package_name)
            osv_results = check_osv_vulnerabilities(
                package_name=package_name,
                version=str(version),
                ecosystem="npm",
            )
            analysis = orchestrator.analyze_package(
                package_name=package_name,
                version=str(version),
                license_data=license_data,
                osv_results=osv_results,
            )
            if str(analysis.get("status", "")).strip().upper() == "BLOCKED":
                blocked_count += 1

        state = "failure" if blocked_count > 0 else "success"
        description = (
            f"Found {blocked_count} blocked dependenc{'y' if blocked_count == 1 else 'ies'}."
            if blocked_count > 0
            else f"Scanned {len(top_dependencies)} dependencies with no blockers."
        )
        _post_commit_status(
            repo_full_name=repo_full_name,
            sha=sha,
            state=state,
            description=description,
            github_token=github_token,
        )
    except SecurityOrchestratorError as exc:
        logger.exception("Security orchestrator unavailable during webhook processing: %s", exc)
        try:
            _post_commit_status(
                repo_full_name=repo_full_name,
                sha=sha,
                state="failure",
                description="Security orchestrator unavailable.",
                github_token=github_token,
            )
        except Exception:
            logger.exception("Failed reporting orchestrator error to GitHub")
    except Exception as exc:
        logger.exception("Webhook processing failed for %s@%s: %s", repo_full_name, sha, exc)
        try:
            _post_commit_status(
                repo_full_name=repo_full_name,
                sha=sha,
                state="failure",
                description="Dependency scan failed unexpectedly.",
                github_token=github_token,
            )
        except Exception:
            logger.exception("Failed reporting webhook failure to GitHub")


@router.post("/github")
async def github_webhook(request: Request, background_tasks: BackgroundTasks) -> dict[str, str]:
    payload = await request.json()
    repository = (payload.get("repository") or {}).get("full_name")
    head_commit = payload.get("head_commit") or {}
    sha = head_commit.get("id") or head_commit.get("sha")

    if not sha or not repository:
        return {"status": "ignored"}

    background_tasks.add_task(process_github_webhook, repository, sha)
    return {"status": "processing"}
