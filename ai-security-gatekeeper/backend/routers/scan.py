import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

from backend.agents.orchestrator import SecurityOrchestrator, SecurityOrchestratorError
from backend.database import get_db
from backend.models import Package, ScanResult, ScanStatus
from backend.schemas import ScanRequest, ScanResultResponse, SimpleScanRequest, ScanResponse
from backend.services.legal_agent import DEFAULT_PROJECT_POLICY, analyze_license
from backend.services.npm import get_npm_license
from backend.services.osv import check_osv_vulnerabilities, query_osv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scan", tags=["scan"])

_LLM_STATUS_TO_DB: dict[str, ScanStatus] = {
    "APPROVE": ScanStatus.APPROVED,
    "APPROVED": ScanStatus.APPROVED,
    "WARNING": ScanStatus.WARNING,
    "BLOCKED": ScanStatus.BLOCKED,
}


def _map_llm_status(llm_status: str) -> ScanStatus:
    normalized = llm_status.strip().upper()
    return _LLM_STATUS_TO_DB.get(normalized, ScanStatus.WARNING)


def _create_scan_result_record(
    db: Session,
    package: Package,
    analysis: dict[str, str],
    cvss_max_score: float | None = None,
) -> ScanResult:
    scan_result = ScanResult(
        package_id=package.id,
        status=_map_llm_status(analysis["status"]),
        cve_summary=analysis["cve_summary"],
        cvss_max_score=cvss_max_score,
        license_type=analysis["license_type"],
        ai_explanation=analysis["ai_explanation"],
    )
    db.add(scan_result)
    db.commit()

    return (
        db.query(ScanResult)
        .options(joinedload(ScanResult.package))
        .filter(ScanResult.id == scan_result.id)
        .one()
    )


def _get_or_create_package(db: Session, payload: ScanRequest) -> Package:
    package = (
        db.query(Package)
        .filter(
            Package.name == payload.name,
            Package.version == payload.version,
            Package.ecosystem == payload.ecosystem,
        )
        .first()
    )

    if package is None:
        package = Package(
            name=payload.name,
            version=payload.version,
            ecosystem=payload.ecosystem,
        )
        db.add(package)
        db.flush()

    return package


def _apply_legal_check(analysis: dict[str, str], license_data: str) -> dict[str, str]:
    """Run the legal agent and escalate the result to BLOCKED when the license is non-compliant.

    Returns a (possibly updated) copy of *analysis* — the original dict is never mutated.
    """
    legal = analyze_license(license_data, DEFAULT_PROJECT_POLICY)
    if legal["status"] != "BLOCKED":
        return analysis

    updated = dict(analysis)
    updated["status"] = "BLOCKED"
    legal_note = f"[Legal Agent — {legal['risk_level'].upper()} risk] {legal['reason']}"
    existing = updated.get("ai_explanation", "").strip()
    updated["ai_explanation"] = f"{legal_note} | {existing}" if existing else legal_note
    return updated


@router.post("", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
def scan_package(
    payload: SimpleScanRequest,
    db: Session = Depends(get_db),
) -> ScanResponse:
    """Simplified scan endpoint — accepts only a package name, defaults to npm/latest."""
    scan_req = ScanRequest(name=payload.package_name, version="*", ecosystem="npm")
    package = _get_or_create_package(db, scan_req)

    osv_summary = check_osv_vulnerabilities(
        package_name=payload.package_name,
        version="*",
        ecosystem="npm",
    )
    osv_check = query_osv(
        package_name=payload.package_name,
        version="*",
        ecosystem="npm",
    )

    try:
        orchestrator = SecurityOrchestrator()
        license_data = get_npm_license(payload.package_name)
        analysis = orchestrator.analyze_package(
            package_name=payload.package_name,
            version="*",
            license_data=license_data,
            osv_results=osv_summary,
        )
    except SecurityOrchestratorError as exc:
        logger.error("Security orchestrator unavailable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    analysis = _apply_legal_check(analysis, license_data)

    _create_scan_result_record(
        db=db,
        package=package,
        analysis=analysis,
        cvss_max_score=osv_check.cvss_max_score,
    )

    return ScanResponse(
        status=_map_llm_status(analysis["status"]).value,
        license_type=analysis.get("license_type") or "Unknown",
        cve_summary=analysis.get("cve_summary") or "",
        ai_explanation=analysis.get("ai_explanation") or "",
        alternatives=[],
    )


@router.post("/", response_model=ScanResultResponse, status_code=status.HTTP_201_CREATED)
def create_scan(
    payload: ScanRequest,
    db: Session = Depends(get_db),
) -> ScanResult:
    package = _get_or_create_package(db, payload)

    osv_summary = check_osv_vulnerabilities(
        package_name=payload.name,
        version=payload.version,
        ecosystem=payload.ecosystem,
    )
    osv_check = query_osv(
        package_name=payload.name,
        version=payload.version,
        ecosystem=payload.ecosystem,
    )

    try:
        orchestrator = SecurityOrchestrator()
        license_data = (
            get_npm_license(payload.name)
            if payload.ecosystem.strip().lower() == "npm"
            else "Unknown"
        )
        analysis = orchestrator.analyze_package(
            package_name=payload.name,
            version=payload.version,
            license_data=license_data,
            osv_results=osv_summary,
        )
    except SecurityOrchestratorError as exc:
        logger.error("Security orchestrator unavailable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    analysis = _apply_legal_check(analysis, license_data)

    return _create_scan_result_record(
        db=db,
        package=package,
        analysis=analysis,
        cvss_max_score=osv_check.cvss_max_score,
    )


def _extract_dependencies_from_payload(payload: dict[str, Any]) -> dict[str, str]:
    package_json_payload = payload.get("package_json")
    dependencies_payload = payload.get("dependencies")

    package_json: dict[str, Any] | None = None
    if isinstance(package_json_payload, str):
        package_json = json.loads(package_json_payload)
    elif isinstance(package_json_payload, dict):
        package_json = package_json_payload
    elif isinstance(payload, dict):
        package_json = payload

    if isinstance(dependencies_payload, dict):
        return {str(name): str(version) for name, version in dependencies_payload.items()}

    if isinstance(package_json, dict):
        dependencies = package_json.get("dependencies")
        if isinstance(dependencies, dict):
            return {str(name): str(version) for name, version in dependencies.items()}

    return {}


@router.post("/pre-push/")
async def pre_push_scan(
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    payload = await request.json()
    try:
        dependencies = _extract_dependencies_from_payload(payload if isinstance(payload, dict) else {})
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid package_json JSON: {exc}",
        ) from exc

    if not dependencies:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No dependencies found in request payload.",
        )

    top_dependencies = list(dependencies.items())[:10]

    try:
        orchestrator = SecurityOrchestrator()
    except SecurityOrchestratorError as exc:
        logger.error("Security orchestrator unavailable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    blocked_count = 0
    warning_count = 0
    per_package_summaries: list[str] = []
    ai_notes: list[str] = []
    max_cvss_score: float | None = None

    for package_name, package_version in top_dependencies:
        license_data = get_npm_license(package_name)
        osv_summary = check_osv_vulnerabilities(
            package_name=package_name,
            version=package_version,
            ecosystem="npm",
        )
        osv_check = query_osv(
            package_name=package_name,
            version=package_version,
            ecosystem="npm",
        )
        analysis = orchestrator.analyze_package(
            package_name=package_name,
            version=package_version,
            license_data=license_data,
            osv_results=osv_summary,
        )
        analysis = _apply_legal_check(analysis, license_data)
        status_value = str(analysis.get("status", "")).strip().upper()

        if status_value == "BLOCKED":
            blocked_count += 1
        elif status_value == "WARNING":
            warning_count += 1

        per_package_summaries.append(f"{package_name}@{package_version}: {analysis['status']}")
        ai_notes.append(f"{package_name}@{package_version}\n{analysis['ai_explanation']}")
        if osv_check.cvss_max_score is not None:
            if max_cvss_score is None:
                max_cvss_score = osv_check.cvss_max_score
            else:
                max_cvss_score = max(max_cvss_score, osv_check.cvss_max_score)

    if blocked_count > 0:
        final_status = "BLOCKED"
    elif warning_count > 0:
        final_status = "WARNING"
    else:
        final_status = "APPROVE"

    short_summary = (
        f"Scanned {len(top_dependencies)} deps: {blocked_count} blocked, {warning_count} warning."
    )
    combined_analysis = {
        "status": final_status,
        "cve_summary": "\n".join(per_package_summaries),
        "license_type": "Mixed",
        "ai_explanation": "\n\n---\n\n".join(ai_notes),
    }
    aggregate_scan_request = ScanRequest(
        name="pre-push dependency batch",
        version=f"count-{len(top_dependencies)}",
        ecosystem="npm",
    )
    aggregate_package = _get_or_create_package(db, aggregate_scan_request)
    stored_scan = _create_scan_result_record(
        db=db,
        package=aggregate_package,
        analysis=combined_analysis,
        cvss_max_score=max_cvss_score,
    )

    return {
        "status": stored_scan.status.value,
        "scan_id": stored_scan.id,
        "summary": short_summary,
    }
