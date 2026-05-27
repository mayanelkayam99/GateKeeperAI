from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models import ScanResult
from backend.schemas import HistoryItemResponse

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/", response_model=list[HistoryItemResponse])
def get_scan_history(db: Session = Depends(get_db)) -> list[ScanResult]:
    return (
        db.query(ScanResult)
        .options(joinedload(ScanResult.package))
        .order_by(ScanResult.scanned_at.desc())
        .all()
    )


@router.get("/{scan_id}", response_model=HistoryItemResponse)
def get_scan_by_id(scan_id: int, db: Session = Depends(get_db)) -> ScanResult:
    result = (
        db.query(ScanResult)
        .options(joinedload(ScanResult.package))
        .filter(ScanResult.id == scan_id)
        .first()
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scan result {scan_id} was not found",
        )
    return result
