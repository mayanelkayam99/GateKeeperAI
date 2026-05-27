from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from backend.models import ScanStatus


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
    scanned_at: datetime
    package: PackageResponse


class ScanRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    version: str = Field(..., min_length=1, max_length=128)
    ecosystem: str = Field(default="npm", max_length=32)


class HistoryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    package_id: int
    status: ScanStatus
    cve_summary: str | None
    cvss_max_score: float | None
    license_type: str | None
    ai_explanation: str | None
    scanned_at: datetime
    package: PackageResponse
