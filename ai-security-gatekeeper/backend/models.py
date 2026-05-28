import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, Float, ForeignKey, String, Text, Column, Integer, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class ScanStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    WARNING = "WARNING"
    BLOCKED = "BLOCKED"
    OVERRIDDEN = "OVERRIDDEN"

class Package(Base):
    __tablename__ = "packages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(128), nullable=False)
    ecosystem: Mapped[str] = mapped_column(String(32), nullable=False, default="npm")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    scan_results: Mapped[list["ScanResult"]] = relationship(
        "ScanResult",
        back_populates="package",
        cascade="all, delete-orphan",
    )


class ScanResult(Base):
    __tablename__ = "scan_results"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    package_id: Mapped[int] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[ScanStatus] = mapped_column(
        Enum(ScanStatus, name="scan_status", native_enum=False),
        nullable=False,
        default=ScanStatus.PENDING,
    )
    cve_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    cvss_max_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    license_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ai_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    scanned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    source: Mapped[str] = mapped_column(
        String(32), nullable=False, default="manual"
    )
    

    package: Mapped["Package"] = relationship("Package", back_populates="scan_results")


class CompanyPolicy(Base):
    __tablename__ = "company_policies"

    id = Column(Integer, primary_key=True, index=True)
    context = Column(Text, nullable=False, default="")          # ← היה company_context
    allowed_licenses = Column(JSON, nullable=False, default=list)
    blocked_licenses = Column(JSON, nullable=False, default=list)