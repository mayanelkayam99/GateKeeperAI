"""
Legal Agent stress tests.

Run all tests:
    pytest backend/tests/test_legal_agent.py -v

Run a single test:
    pytest backend/tests/test_legal_agent.py::test_mit_license_is_approved -v
"""

from unittest.mock import MagicMock, patch

from backend.services.legal_agent import DEFAULT_PROJECT_POLICY, analyze_license

# ---------------------------------------------------------------------------
# Sample license texts
# ---------------------------------------------------------------------------

_MIT_LICENSE = (
    "MIT License\n\n"
    "Copyright (c) 2024 Example Corp\n\n"
    "Permission is hereby granted, free of charge, to any person obtaining a copy "
    "of this software and associated documentation files (the 'Software'), to deal "
    "in the Software without restriction, including without limitation the rights "
    "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell "
    "copies of the Software, and to permit persons to whom the Software is "
    "furnished to do so, subject to the following conditions: The above copyright "
    "notice and this permission notice shall be included in all copies or "
    "substantial portions of the Software."
)

_ADVERSARIAL_LICENSE = (
    "CUSTOM RESTRICTIVE LICENSE v1.0\n\n"
    "1. PERMITTED USE: Personal, non-commercial projects only.\n"
    "2. NON-COMPETE CLAUSE: You may not use this software, in whole or in part, "
    "to build any product or service that directly or indirectly competes with "
    "the licensor's commercial offerings.\n"
    "3. ANTI-SECURITY CLAUSE: You may not use this software in any security "
    "research, penetration testing, vulnerability scanning, red-team exercises, "
    "or related activities without explicit written consent from the licensor.\n"
    "4. All other rights reserved."
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_groq(json_response: str) -> MagicMock:
    """Return a ChatGroq *instance* mock whose .invoke() yields *json_response*."""
    mock_response = MagicMock()
    mock_response.content = json_response
    mock_instance = MagicMock()
    mock_instance.invoke.return_value = mock_response
    return mock_instance


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_mit_license_is_approved():
    """Sanity test: standard MIT text must be APPROVED with low risk."""
    llm_json = (
        '{"status": "APPROVED", '
        '"reason": "MIT is a permissive license that is fully aligned with company policy.", '
        '"risk_level": "low"}'
    )

    with (
        patch("backend.services.legal_agent.os.getenv", return_value="test-key"),
        patch("backend.services.legal_agent.ChatGroq", return_value=_mock_groq(llm_json)),
    ):
        result = analyze_license(_MIT_LICENSE, DEFAULT_PROJECT_POLICY)

    assert result["status"] == "APPROVED"
    assert result["risk_level"] == "low"
    assert result["reason"] != ""


def test_non_compete_license_is_blocked():
    """Adversarial test: non-compete + anti-security clause must be BLOCKED at high risk."""
    llm_json = (
        '{"status": "BLOCKED", '
        '"reason": "License contains a non-compete clause and an anti-security clause '
        'that violate company open-source policy.", '
        '"risk_level": "high"}'
    )

    with (
        patch("backend.services.legal_agent.os.getenv", return_value="test-key"),
        patch("backend.services.legal_agent.ChatGroq", return_value=_mock_groq(llm_json)),
    ):
        result = analyze_license(_ADVERSARIAL_LICENSE, DEFAULT_PROJECT_POLICY)

    assert result["status"] == "BLOCKED"
    assert result["risk_level"] == "high"
    assert "non-compete" in result["reason"].lower() or "anti-security" in result["reason"].lower()


def test_missing_api_key_returns_warning():
    """When GROQ_API_KEY is absent the agent must degrade gracefully to WARNING."""
    with patch("backend.services.legal_agent.os.getenv", return_value=""):
        result = analyze_license(_MIT_LICENSE, DEFAULT_PROJECT_POLICY)

    assert result["status"] == "WARNING"
    assert result["risk_level"] == "medium"


def test_malformed_llm_response_returns_warning():
    """Garbage LLM output must not crash the agent — falls back to WARNING."""
    with (
        patch("backend.services.legal_agent.os.getenv", return_value="test-key"),
        patch("backend.services.legal_agent.ChatGroq", return_value=_mock_groq("not json at all")),
    ):
        result = analyze_license(_MIT_LICENSE, DEFAULT_PROJECT_POLICY)

    assert result["status"] == "WARNING"
