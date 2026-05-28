# backend/routers/override.py
# ─────────────────────────────────────────────────────────────────────────────
# Risk Acceptance Override endpoint
# Allows a developer to manually override a BLOCKED scan result.
# Updates status to OVERRIDDEN and logs the developer's reason.
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from backend.models import ScanStatus


from backend.database import get_db
from backend.models import ScanResult

router = APIRouter(prefix="/api/override", tags=["override"])


class OverrideRequest(BaseModel):
    scan_id: int
    reason: str = Field(..., min_length=10, max_length=500)
    developer: str = Field(default="dashboard-user", max_length=100)


class OverrideResponse(BaseModel):
    scan_id: int
    new_status: str
    reason: str
    overridden_at: str
    message: str


@router.post("/", response_model=OverrideResponse)
def override_scan(req: OverrideRequest, db: Session = Depends(get_db)):
    """
    Override a BLOCKED scan result.
    Sets status to OVERRIDDEN so the pre-push hook allows the next push.
    Appends the override reason + timestamp to ai_explanation for audit trail.
    """
    scan = db.query(ScanResult).filter(ScanResult.id == req.scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan #{req.scan_id} not found.")

    if scan.status not in ("BLOCKED", "WARNING"):
        raise HTTPException(
            status_code=400,
            detail=f"Scan #{req.scan_id} has status '{scan.status}' — only BLOCKED or WARNING scans can be overridden.",
        )

    now = datetime.now(timezone.utc).isoformat()

    # Append override audit trail to ai_explanation (preserves ===RECOMMENDATION=== separator)
    override_note = (
        f"\n\n─── RISK ACCEPTANCE OVERRIDE ───\n"
        f"Status changed: {scan.status} → OVERRIDDEN\n"
        f"Timestamp:  {now}\n"
        f"Developer:  {req.developer}\n"
        f"Reason:     {req.reason}\n"
        f"────────────────────────────────"
    )

    parts = (scan.ai_explanation or "").split("===RECOMMENDATION===")
    explanation_part    = parts[0].rstrip()
    recommendation_part = parts[1] if len(parts) > 1 else ""

    scan.ai_explanation = (
        explanation_part + override_note
        + ("===RECOMMENDATION===" + recommendation_part if recommendation_part else "")
    )
    scan.status = ScanStatus.OVERRIDDEN

    db.commit()
    db.refresh(scan)

    return OverrideResponse(
        scan_id=scan.id,
        new_status="OVERRIDDEN",
        reason=req.reason,
        overridden_at=now,
        message=f"Scan #{scan.id} overridden. The next git push will be allowed.",
    )