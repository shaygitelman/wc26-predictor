import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    home_team_code: Mapped[str]       = mapped_column(String(10), nullable=False)
    home_team_name: Mapped[str]       = mapped_column(String(100), nullable=False)
    home_flag_url:  Mapped[str | None] = mapped_column(String, nullable=True)
    home_group:     Mapped[str | None] = mapped_column(String(5), nullable=True)

    away_team_code: Mapped[str]       = mapped_column(String(10), nullable=False)
    away_team_name: Mapped[str]       = mapped_column(String(100), nullable=False)
    away_flag_url:  Mapped[str | None] = mapped_column(String, nullable=True)
    away_group:     Mapped[str | None] = mapped_column(String(5), nullable=True)

    scheduled_at: Mapped[datetime]    = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    venue:        Mapped[str | None]  = mapped_column(String, nullable=True)
    city:         Mapped[str | None]  = mapped_column(String, nullable=True)
    thumb_url:    Mapped[str | None]  = mapped_column(String, nullable=True)

    round:       Mapped[str]       = mapped_column(String(20), nullable=False)  # group|r32|r16|qf|sf|3rd|final
    group_name:  Mapped[str | None] = mapped_column(String(5), nullable=True)   # A … L
    external_id: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True, index=True)

    status:     Mapped[str]       = mapped_column(String(20), nullable=False, default="scheduled", index=True)
    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    minute:     Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    predictions: Mapped[list["Prediction"]] = relationship(  # noqa: F821
        "Prediction", back_populates="match", cascade="all, delete-orphan", lazy="noload"
    )
