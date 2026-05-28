import json
import logging
import os
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

logger = logging.getLogger(__name__)

VALID_LLM_STATUSES = frozenset({"APPROVE", "APPROVED", "WARNING", "BLOCKED"})
REQUIRED_JSON_KEYS = ("status", "cve_summary", "license_type", "ai_explanation")

SYSTEM_PROMPT = """You are an Enterprise AppSec Orchestrator. Your role is to classify and evaluate dependencies based on risk categories:
- CRITICAL_EXECUTION (RCE, Code Injection, Remote Command Execution)
- DATA_INTEGRITY (Prototype Pollution, SQL Injection, Data Exposure)
- COMPLIANCE (GPL/AGPL/Unknown/Restrictive Licenses)
- OPERATIONAL (Utility packages accessing network/filesystem without reason, or High CVSS vulnerabilities)

DECISION ENGINE:
- Any vulnerability categorized as CRITICAL_EXECUTION or DATA_INTEGRITY must result in 'BLOCKED'.
- Any COMPLIANCE violation must result in 'BLOCKED'.
- Severity > 7.0 (CVSS) is an automatic 'BLOCKED'.
- Always output a valid JSON with exactly these keys: 'status', 'cve_summary', 'license_type', 'ai_explanation', 'recommendation'.
- The 'ai_explanation' field must contain ONLY the risk description: concise plain-English prose (2–3 sentences) explaining what the vulnerability is and why it matters. Do NOT include any fix suggestions or package alternatives in this field.
- The 'recommendation' field must contain ONLY the actionable fix. When status is 'BLOCKED', name 1–2 real, installable npm packages or native Node.js/browser APIs (e.g. "Replace with validator.js for input sanitisation" or "Use Node's built-in crypto module instead"). When status is 'WARNING', suggest an upgrade command or audit step. When status is 'APPROVE', set this to an empty string.

ANTI-HALLUCINATION:
Do not guess or infer licenses. Use the explicit 'License found in registry' provided in the user prompt. If the license is 'Unknown', state 'Unknown' and base your policy decision purely on vulnerabilities."""


class SecurityOrchestratorError(Exception):
    pass


class SecurityOrchestrator:
    def __init__(self, api_key: str | None = None) -> None:
        key = api_key or os.getenv("GROQ_API_KEY", "").strip()
        if not key:
            raise SecurityOrchestratorError("GROQ_API_KEY environment variable is not set")

        self.llm = ChatGroq(
            model="llama-3.3-70b-versatile",
            groq_api_key=key,
            temperature=0,
        )

    def analyze_package(
        self,
        package_name: str,
        version: str,
        license_data: str,
        osv_results: str,
    ) -> dict[str, str]:
        user_prompt = (
            f"Package: {package_name}\n"
            f"Version: {version}\n"
            f"License found in registry: {license_data}\n\n"
            f"OSV vulnerability findings:\n{osv_results}\n\n"
            "Respond with JSON only."
        )

        try:
            response = self.llm.invoke(
                [
                    SystemMessage(content=SYSTEM_PROMPT),
                    HumanMessage(content=user_prompt),
                ]
            )
        except Exception as exc:
            logger.warning("Groq LLM invocation failed: %s", exc)
            return _fallback_analysis(
                osv_results=osv_results,
                reason=f"AI service error: {exc}",
            )

        raw_content = response.content if isinstance(response.content, str) else str(response.content)
        analysis = self._parse_llm_json(raw_content, osv_results=osv_results)
        return _apply_enterprise_policy(
            package_name=package_name,
            osv_results=osv_results,
            analysis=analysis,
        )

    def _parse_llm_json(self, raw_content: str, osv_results: str) -> dict[str, str]:
        try:
            payload = _extract_json_object(raw_content)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("Failed to parse LLM JSON: %s", exc)
            return _fallback_analysis(
                osv_results=osv_results,
                reason=f"AI response was not valid JSON: {exc}",
            )

        try:
            return _validate_analysis_payload(payload, osv_results=osv_results)
        except ValueError as exc:
            logger.warning("Invalid LLM analysis payload: %s", exc)
            return _fallback_analysis(osv_results=osv_results, reason=str(exc))


def _extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```\s*$", "", cleaned)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise
        data = json.loads(match.group())

    if not isinstance(data, dict):
        raise ValueError("LLM output must be a JSON object")
    return data


def _validate_analysis_payload(payload: dict[str, Any], osv_results: str) -> dict[str, str]:
    missing = [key for key in REQUIRED_JSON_KEYS if key not in payload]
    if missing:
        raise ValueError(f"Missing required keys: {', '.join(missing)}")

    status = str(payload["status"]).strip().upper()
    if status not in VALID_LLM_STATUSES:
        raise ValueError(f"Invalid status '{payload['status']}'. Expected APPROVE/APPROVED, WARNING, or BLOCKED")

    if status == "APPROVED":
        status = "APPROVE"

    return {
        "status": status,
        "cve_summary": str(payload["cve_summary"]).strip() or osv_results,
        "license_type": str(payload["license_type"]).strip() or "Unknown",
        "ai_explanation": str(payload["ai_explanation"]).strip()
        or "Analysis completed without a detailed explanation.",
        "recommendation": str(payload.get("recommendation", "")).strip(),
    }


def _fallback_analysis(osv_results: str, reason: str) -> dict[str, str]:
    fallback = {
        "status": "WARNING",
        "cve_summary": osv_results,
        "license_type": "Unknown",
        "ai_explanation": (
            f"Automated analysis unavailable — manual review recommended.\n\n"
            f"Details: {reason}"
        ),
        "recommendation": "Run npm audit to identify issues and apply available patches.",
    }
    return _apply_enterprise_policy(
        package_name="unknown-package",
        osv_results=osv_results,
        analysis=fallback,
    )


def _apply_enterprise_policy(
    package_name: str,
    osv_results: str,
    analysis: dict[str, str],
) -> dict[str, str]:
    _ = package_name  # Reserved for future policy extensions.
    ai_status = str(analysis.get("status", "")).strip().upper()
    if ai_status == "APPROVED":
        ai_status = "APPROVE"
    if ai_status not in VALID_LLM_STATUSES:
        ai_status = "WARNING"

    status = ai_status
    existing_explanation = str(analysis.get("ai_explanation", "")).strip()
    # Strip any previously-injected policy prefixes to avoid duplication on re-runs.
    cleaned_explanation = re.sub(
        r"(?im)^\s*(enterprise policy decision:.*|force blocked:.*)\s*$",
        "",
        existing_explanation,
    ).strip()

    # Default: use the LLM's own explanation — no redundant status prefix.
    concise_explanation = cleaned_explanation or "No further details available."
    recommendation = str(analysis.get("recommendation", "")).strip()

    osv_text = osv_results.lower()
    has_rce_keyword = any(
        keyword in osv_text
        for keyword in (
            "rce",
            "remote code execution",
            "code injection",
            "remote command execution",
        )
    )
    cvss_matches = re.findall(r"cvss[^0-9]{0,12}([0-9](?:\.\d+)?)", osv_text)
    has_cvss_critical = any(float(score) >= 7.0 for score in cvss_matches)

    if has_rce_keyword or has_cvss_critical:
        status = "BLOCKED"
        bullets: list[str] = []
        if has_rce_keyword:
            bullets.append("· Remote code execution (RCE) indicators detected")
        if has_cvss_critical:
            bullets.append("· CVSS score ≥ 7.0 — severity threshold exceeded")
        policy_block = "Critical vulnerability signals detected by OSV:\n" + "\n".join(bullets)
        concise_explanation = (
            f"{policy_block}\n\n{cleaned_explanation}"
            if cleaned_explanation
            else policy_block
        )
        # Only override recommendation if the LLM didn't provide one
        if not recommendation:
            recommendation = (
                "Upgrade to the latest patched version immediately. "
                "Run `npm audit fix` to apply automatic patches, or check the package's "
                "GitHub security advisories for the minimum safe version."
            )

    return {
        "status": status,
        "cve_summary": str(analysis.get("cve_summary", "")).strip() or osv_results,
        "license_type": str(analysis.get("license_type", "")).strip() or "Unknown",
        "ai_explanation": concise_explanation,
        "recommendation": recommendation,
    }
