from datetime import datetime
from typing import List

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.models import ScanStatus

# Must match the constant in backend/routers/scan.py
_RECOMMENDATION_SEP = "\n\n===RECOMMENDATION===\n\n"


class PackageCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    version: str = Field(..., min_length=1, max_length=128)
    ecosystem: str = Field(default="npm", max_length=32)


class PackageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    version: str
    ecosystem: str
    created_at: datetime


class ScanResultCreate(BaseModel):
    package_id: int
    status: ScanStatus = ScanStatus.PENDING
    cve_summary: str | None = None
    cvss_max_score: float | None = None
    license_type: str | None = None
    ai_explanation: str | None = None


class ScanResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    package_id: int
    status: ScanStatus
    cve_summary: str | None
    cvss_max_score: float | None
    license_type: str | None
    ai_explanation: str | None
    recommendation: str | None = None
    scanned_at: datetime
    package: PackageResponse
    source: str = "manual"            # ← NEW: "manual" | "pre-push"

    @model_validator(mode="after")
    def split_recommendation(self) -> "ScanResultResponse":
        if self.license_type == "Mixed":
            return self
        if self.ai_explanation and _RECOMMENDATION_SEP in self.ai_explanation:
            parts = self.ai_explanation.split(_RECOMMENDATION_SEP, 1)
            self.ai_explanation = parts[0].strip() or None
            self.recommendation = parts[1].strip() or None
        return self


class ScanRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    version: str = Field(..., min_length=1, max_length=128)
    ecosystem: str = Field(default="npm", max_length=32)


class SimpleScanRequest(BaseModel):
    package_name: str = Field(..., min_length=1, max_length=255)


class ScanResponse(BaseModel):
    status: str
    license_type: str
    cve_summary: str
    ai_explanation: str
    recommendation: str = ""
    alternatives: list[str]


class HistoryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    package_id: int
    status: ScanStatus
    cve_summary: str | None
    cvss_max_score: float | None
    license_type: str | None
    ai_explanation: str | None
    recommendation: str | None = None
    scanned_at: datetime
    package: PackageResponse
    source: str = "manual"            # ← NEW: "manual" | "pre-push"

    @model_validator(mode="after")
    def split_recommendation(self) -> "HistoryItemResponse":
        if self.license_type == "Mixed":
            return self
        if self.ai_explanation and _RECOMMENDATION_SEP in self.ai_explanation:
            parts = self.ai_explanation.split(_RECOMMENDATION_SEP, 1)
            self.ai_explanation = parts[0].strip() or None
            self.recommendation = parts[1].strip() or None
        return self


class PolicyBase(BaseModel):
    context: str
    allowed_licenses: List[str]
    blocked_licenses: List[str]


class PolicyCreate(PolicyBase):
    pass


class PolicyResponse(PolicyBase):
    id: int

    class Config:
        from_attributes = True