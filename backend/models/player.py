import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class Player(Base):
    __tablename__ = "players"

    id:           Mapped[str]       = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id:      Mapped[str | None] = mapped_column(
        String, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name:         Mapped[str]       = mapped_column(String(100), nullable=False)
    position:     Mapped[str | None] = mapped_column(String(20), nullable=True)   # GK DEF MID FWD
    shirt_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    photo_url:    Mapped[str | None] = mapped_column(String, nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Stores provider IDs: {"thesportsdb": "34154692"}
    external_ids: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
