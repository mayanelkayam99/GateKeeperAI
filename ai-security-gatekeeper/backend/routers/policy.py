from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import CompanyPolicy
from backend.schemas import PolicyCreate, PolicyResponse

router = APIRouter(prefix="/api/policy", tags=["Policy"])

@router.get("/", response_model=PolicyResponse)
@router.get("", response_model=PolicyResponse)
def get_policy(db: Session = Depends(get_db)):
    policy = db.query(CompanyPolicy).first()
    if not policy:
        return {"id": 0, "context": "", "allowed_licenses": [], "blocked_licenses": []}
    return {
        "id": policy.id,
        "context": policy.context,
        "allowed_licenses": policy.allowed_licenses or [],
        "blocked_licenses": policy.blocked_licenses or []
    }

@router.post("/", response_model=PolicyResponse)
@router.post("", response_model=PolicyResponse)
def update_policy(policy_data: PolicyCreate, db: Session = Depends(get_db)):
    try:
        db_policy = db.query(CompanyPolicy).first()
        if db_policy:
            db_policy.context = policy_data.context
            db_policy.allowed_licenses = policy_data.allowed_licenses
            db_policy.blocked_licenses = policy_data.blocked_licenses
        else:
            db_policy = CompanyPolicy(
                context=policy_data.context,
                allowed_licenses=policy_data.allowed_licenses,
                blocked_licenses=policy_data.blocked_licenses
            )
            db.add(db_policy)
        db.commit()
        db.refresh(db_policy)
        return {
            "id": db_policy.id,
            "context": db_policy.context,
            "allowed_licenses": db_policy.allowed_licenses or [],
            "blocked_licenses": db_policy.blocked_licenses or []
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")