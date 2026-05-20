from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class Team(Base):
    __tablename__ = "teams"

    id:           Mapped[str]       = mapped_column(String, primary_key=True)  # lowercase FIFA code: 'bra'
    name:         Mapped[str]       = mapped_column(String(100), nullable=False)
    short_code:   Mapped[str]       = mapped_column(String(10), nullable=False)   # uppercase: 'BRA'
    flag_url:     Mapped[str | None] = mapped_column(String, nullable=True)
    logo_url:     Mapped[str | None] = mapped_column(String, nullable=True)
    group_name:   Mapped[str | None] = mapped_column(String(5), nullable=True)    # 'A' … 'L'
    country_code: Mapped[str | None] = mapped_column(String(5), nullable=True)    # ISO 3166-1 alpha-2
    is_confirmed: Mapped[bool]       = mapped_column(Boolean, default=True, nullable=False)

    # Stores provider IDs: {"thesportsdb": "134497", "api_football": "42"}
    # New providers can be added without schema migration.
    external_ids: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
