import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class SyncLog(Base):
    __tablename__ = "sync_log"

    id:               Mapped[str]       = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    provider:         Mapped[str]       = mapped_column(String(50), nullable=False, index=True)
    entity_type:      Mapped[str]       = mapped_column(String(50), nullable=False)  # fixtures|teams|players
    status:           Mapped[str]       = mapped_column(String(20), nullable=False)  # success|error|partial
    records_affected: Mapped[int]       = mapped_column(Integer, default=0, nullable=False)
    error_message:    Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at:       Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    finished_at:      Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
