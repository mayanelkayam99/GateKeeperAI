from dataclasses import dataclass
from functools import lru_cache

import requests

OSV_QUERY_URL = "https://api.osv.dev/v1/query"
REQUEST_TIMEOUT_SECONDS = 30

_ECOSYSTEM_TO_OSV: dict[str, str] = {
    "npm": "npm",
    "pypi": "PyPI",
    "PyPI": "PyPI",
    "NuGet": "NuGet",
    "nuget": "NuGet",
    "Go": "Go",
    "go": "Go",
    "crates.io": "crates.io",
    "cargo": "crates.io",
}


@dataclass(frozen=True)
class OsvCheckResult:
    """Parsed OSV query outcome used by the scan pipeline."""

    summary: str
    cvss_max_score: float | None


def _normalize_ecosystem(ecosystem: str) -> str:
    normalized = ecosystem.strip()
    return _ECOSYSTEM_TO_OSV.get(normalized, _ECOSYSTEM_TO_OSV.get(normalized.lower(), normalized))


def _extract_cvss_scores(vuln: dict) -> list[float]:
    scores: list[float] = []
    for entry in vuln.get("severity") or []:
        if not isinstance(entry, dict):
            continue
        score_value = entry.get("score")
        if score_value is None:
            continue
        try:
            scores.append(float(score_value))
        except (TypeError, ValueError):
            continue
    database_specific = vuln.get("database_specific") or {}
    if isinstance(database_specific, dict):
        for key in ("cvss_score", "max_severity_score"):
            raw = database_specific.get(key)
            if raw is not None:
                try:
                    scores.append(float(raw))
                except (TypeError, ValueError):
                    continue
    return scores


def _build_summary(vulns: list[dict]) -> tuple[str, float | None]:
    if not vulns:
        return "No known vulnerabilities found.", None

    lines: list[str] = []
    all_cvss: list[float] = []

    for vuln in vulns:
        vuln_id = vuln.get("id", "UNKNOWN")
        summary = vuln.get("summary") or vuln.get("details") or "No summary provided"
        lines.append(f"- {vuln_id}: {summary}")
        all_cvss.extend(_extract_cvss_scores(vuln))

    summary_text = f"Found {len(vulns)} vulnerability/vulnerabilities:\n" + "\n".join(lines)
    cvss_max = max(all_cvss) if all_cvss else None
    return summary_text, cvss_max


def _query_osv(package_name: str, version: str, ecosystem: str) -> OsvCheckResult:
    osv_ecosystem = _normalize_ecosystem(ecosystem)
    payload = {
        "version": version,
        "package": {"name": package_name, "ecosystem": osv_ecosystem},
    }

    response = requests.post(
        OSV_QUERY_URL,
        json=payload,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    vulns = data.get("vulns") or []
    summary, cvss_max = _build_summary(vulns)
    return OsvCheckResult(summary=summary, cvss_max_score=cvss_max)


@lru_cache(maxsize=128)
def _cached_osv_lookup(
    package_name: str,
    version: str,
    ecosystem: str,
) -> OsvCheckResult:
    try:
        return _query_osv(package_name, version, ecosystem)
    except requests.RequestException as exc:
        return OsvCheckResult(summary=f"OSV lookup failed: {exc}", cvss_max_score=None)


def query_osv(
    package_name: str,
    version: str,
    ecosystem: str = "PyPI",
) -> OsvCheckResult:
    """Query OSV and return structured results including CVSS metadata."""
    osv_ecosystem = _normalize_ecosystem(ecosystem)
    return _cached_osv_lookup(package_name, version, osv_ecosystem)


def check_osv_vulnerabilities(
    package_name: str,
    version: str,
    ecosystem: str = "PyPI",
) -> str:
    """
    Query OSV for known vulnerabilities and return a human-readable summary string.
    """
    return query_osv(package_name, version, ecosystem).summary
