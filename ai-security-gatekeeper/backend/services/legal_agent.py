import json
import logging
import os
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt — Universal Legal Agent (No hardcoded company info)
# ---------------------------------------------------------------------------
_LEGAL_SYSTEM_PROMPT = (
    "You are an expert legal compliance officer evaluating open-source software licenses. "
    "Analyze the license text strictly against the specific 'Company policy' provided by the user. "
    "If the license contains any clauses that violate the provided Company policy, you MUST return a BLOCKED status.\n"
    "Return a JSON object with exactly these fields:\n"
    '  "status": "APPROVED" or "BLOCKED"\n'
    '  "reason": concise one-sentence explanation of the compliance decision\n'
    '  "risk_level": "low", "medium", or "high"\n'
    '  "suggested_alternative": if status is BLOCKED, you MUST explicitly name 1-2 specific, real open-source packages '
    'that provide the exact same functionality but under a permissive license (like MIT). DO NOT give generic advice. Set to null if status is APPROVED.\n'
    "Do not add any conversational text outside the JSON."
)

# ---------------------------------------------------------------------------
# Default policy (Simulating what an Admin would configure in the UI/DB)
# ---------------------------------------------------------------------------
DEFAULT_PROJECT_POLICY = (
    "Approved SPDX identifiers: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Unlicense. "
    "Blocked identifiers: GPL-2.0, GPL-3.0, AGPL-3.0, LGPL-2.1, LGPL-3.0, SSPL, Commons Clause. "
    "Unknown or unlicensed packages must be BLOCKED pending legal review. "
    "CRITICAL CONTEXT: We are a Cybersecurity Enterprise. You MUST carefully read the actual license text and BLOCK any license "
    "that contains special clauses restricting or prohibiting use by cybersecurity companies, vulnerability scanners, or commercial entities."
)

# Returned when the LLM is unavailable or returns unparseable output.
_FALLBACK_RESULT: dict[str, str] = {
    "status": "WARNING",
    "reason": "Legal analysis unavailable; manual review required.",
    "risk_level": "medium",
    "suggested_alternative": "",
}


def analyze_license(license_text: str, project_policy: str) -> dict[str, str]:
    """Evaluate *license_text* against *project_policy* using a Groq LLM.

    Returns a dict with:
      - ``status``     — ``"APPROVED"`` or ``"BLOCKED"``
      - ``reason``     — concise explanation
      - ``risk_level`` — ``"low"``, ``"medium"``, or ``"high"``

    Falls back to a WARNING/medium result if the LLM is unavailable or
    returns malformed JSON.
    """
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        logger.warning("GROQ_API_KEY not set — legal analysis skipped")
        return _FALLBACK_RESULT.copy()

    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        groq_api_key=key,
        temperature=0,
    )

    user_prompt = (
        f"License text: {license_text}\n\n"
        f"Company policy: {project_policy}"
    )

    try:
        response = llm.invoke(
            [
                SystemMessage(content=_LEGAL_SYSTEM_PROMPT),
                HumanMessage(content=user_prompt),
            ]
        )
    except Exception as exc:
        logger.warning("Legal agent LLM call failed: %s", exc)
        return _FALLBACK_RESULT.copy()

    raw = response.content if isinstance(response.content, str) else str(response.content)
    print(f"[LegalAgent] raw LLM response → {raw}")  # dev-time visibility; remove before prod
    return _parse_legal_response(raw)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_legal_response(raw: str) -> dict[str, str]:
    try:
        data = _extract_json(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Legal agent: could not parse LLM JSON: %s", exc)
        return _FALLBACK_RESULT.copy()

    status = str(data.get("status", "")).strip().upper()
    if status not in {"APPROVED", "BLOCKED"}:
        logger.warning("Legal agent: unexpected status %r — falling back to WARNING", status)
        return _FALLBACK_RESULT.copy()

    risk_level = str(data.get("risk_level", "medium")).strip().lower()
    if risk_level not in {"low", "medium", "high"}:
        risk_level = "medium"

    # suggested_alternative may be null / absent — normalise to empty string.
    raw_alt = data.get("suggested_alternative") or ""
    suggested_alternative = str(raw_alt).strip() if raw_alt else ""

    return {
        "status": status,
        "reason": str(data.get("reason", "No reason provided.")).strip(),
        "risk_level": risk_level,
        "suggested_alternative": suggested_alternative,
    }


def _extract_json(text: str) -> dict[str, Any]:
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
        raise ValueError("LLM output is not a JSON object")
    return data
