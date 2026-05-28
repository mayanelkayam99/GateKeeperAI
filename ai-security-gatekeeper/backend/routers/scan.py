import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

from backend.agents.orchestrator import SecurityOrchestrator, SecurityOrchestratorError
from backend.database import get_db
from backend.models import Package, ScanResult, ScanStatus
from backend.schemas import ScanRequest, ScanResultResponse, SimpleScanRequest, ScanResponse
from backend.services.legal_agent import analyze_license
from backend.services.npm import get_npm_license
from backend.services.osv import check_osv_vulnerabilities, query_osv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scan", tags=["scan"])

_RECOMMENDATION_SEP = "\n\n===RECOMMENDATION===\n\n"

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
    source: str = "manual",          # ← NEW: "manual" | "pre-push"
) -> ScanResult:
    explanation = analysis["ai_explanation"]
    recommendation = analysis.get("recommendation", "").strip()
    stored_explanation = (
        f"{explanation}{_RECOMMENDATION_SEP}{recommendation}"
        if recommendation
        else explanation
    )
    scan_result = ScanResult(
        package_id=package.id,
        status=_map_llm_status(analysis["status"]),
        cve_summary=analysis["cve_summary"],
        cvss_max_score=cvss_max_score,
        license_type=analysis["license_type"],
        ai_explanation=stored_explanation,
        source=source,                # ← NEW
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


@router.get("/{scan_id}", response_model=ScanResultResponse)
def get_scan(scan_id: int, db: Session = Depends(get_db)) -> ScanResult:
    result = (
        db.query(ScanResult)
        .options(joinedload(ScanResult.package))
        .filter(ScanResult.id == scan_id)
        .first()
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scan {scan_id} not found.",
        )
    return result


def _apply_legal_check(package_name: str, analysis: dict[str, str], license_data: str, db: Session) -> dict[str, str]:
    legal = analyze_license(package_name, license_data, db)
    if legal["status"] != "BLOCKED":
        return analysis

    updated = dict(analysis)
    updated["status"] = "BLOCKED"
    risk = legal["risk_level"].capitalize()

    legal_reason = f"License compliance issue ({risk} risk): {legal['reason']}"
    existing_explanation = updated.get("ai_explanation", "").strip()
    updated["ai_explanation"] = (
        f"{legal_reason}\n\n{existing_explanation}" if existing_explanation else legal_reason
    )

    alt = legal.get("suggested_alternative", "").strip()
    if alt:
        updated["recommendation"] = f"Replace with a permissively licensed alternative: {alt}"
    elif not updated.get("recommendation", "").strip():
        updated["recommendation"] = (
            "Replace with a dependency using an approved SPDX license "
            "(MIT, Apache-2.0, BSD-2-Clause, or ISC)."
        )

    return updated


@router.post("", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
def scan_package(
    payload: SimpleScanRequest,
    db: Session = Depends(get_db),
) -> ScanResponse:
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

    analysis = _apply_legal_check(payload.package_name, analysis, license_data, db)

    _create_scan_result_record(
        db=db,
        package=package,
        analysis=analysis,
        cvss_max_score=osv_check.cvss_max_score,
        source="manual",              # ← manual scan
    )

    explanation = analysis.get("ai_explanation") or ""
    recommendation = analysis.get("recommendation") or ""

    if recommendation and _RECOMMENDATION_SEP not in explanation:
        explanation = f"{explanation}{_RECOMMENDATION_SEP}{recommendation}"

    return ScanResponse(
        status=_map_llm_status(analysis["status"]).value,
        license_type=analysis.get("license_type") or "Unknown",
        cve_summary=analysis.get("cve_summary") or "",
        ai_explanation=explanation,
        recommendation=recommendation,
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

    analysis = _apply_legal_check(payload.name, analysis, license_data, db)

    return _create_scan_result_record(
        db=db,
        package=package,
        analysis=analysis,
        cvss_max_score=osv_check.cvss_max_score,
        source="manual",              # ← manual scan
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

    top_dependencies = list(dependencies.items())[:3]

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
    failures: list[dict[str, Any]] = []

    for package_name, package_version in top_dependencies:
        pkg_license_data = get_npm_license(package_name)
        pkg_osv_summary = check_osv_vulnerabilities(
            package_name=package_name,
            version=package_version,
            ecosystem="npm",
        )
        pkg_osv_check = query_osv(
            package_name=package_name,
            version=package_version,
            ecosystem="npm",
        )
        pkg_analysis = orchestrator.analyze_package(
            package_name=package_name,
            version=package_version,
            license_data=pkg_license_data,
            osv_results=pkg_osv_summary,
        )
        pkg_analysis = _apply_legal_check(package_name, pkg_analysis, pkg_license_data, db)
        status_value = str(pkg_analysis.get("status", "")).strip().upper()

        if status_value == "BLOCKED":
            blocked_count += 1
        elif status_value == "WARNING":
            warning_count += 1

        if status_value in ("BLOCKED", "WARNING"):
            failures.append({
                "package": package_name,
                "version": package_version,
                "status": status_value,
                "reason": pkg_analysis.get("ai_explanation", "").strip(),
                "recommendation": pkg_analysis.get("recommendation", "").strip(),
            })

        per_package_summaries.append(
            f"{package_name}@{package_version}: {pkg_analysis['status']}"
        )

        pkg_explanation = pkg_analysis.get("ai_explanation", "")
        pkg_recommendation = pkg_analysis.get("recommendation", "").strip()
        section = f"{package_name}@{package_version}\n{pkg_explanation}"
        if pkg_recommendation:
            section += f"{_RECOMMENDATION_SEP}{pkg_recommendation}"
        ai_notes.append(section)

        if pkg_osv_check.cvss_max_score is not None:
            if max_cvss_score is None:
                max_cvss_score = pkg_osv_check.cvss_max_score
            else:
                max_cvss_score = max(max_cvss_score, pkg_osv_check.cvss_max_score)

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
        "recommendation": "",
    }
    # בדיקה: האם הסריקה האחרונה של אותן חבילות כבר OVERRIDDEN?
    if final_status == "BLOCKED":
        last_scan = (
            db.query(ScanResult)
            .join(Package)
            .filter(
                Package.name == "pre-push dependency batch",
                ScanResult.source == "pre-push",
                ScanResult.status == "OVERRIDDEN",
            )
            .order_by(ScanResult.scanned_at.desc())
            .first()
        )
        if last_scan:
            return {
                "status": "APPROVED",
                "scan_id": last_scan.id,
                "summary": "Previously overridden — push allowed.",
                "failures": [],
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
        source="pre-push",            # ← pre-push scan
    )

    return {
        "status": stored_scan.status.value,
        "scan_id": stored_scan.id,
        "summary": short_summary,
        "failures": failures,
    }