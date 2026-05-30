import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class TournamentPick(Base):
    __tablename__ = "tournament_picks"

    id:      Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )

    winner_team_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    top_scorer_id:    Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Points awarded after tournament ends. NULL = not yet scored; 0 = wrong; 12 = correct.
    winner_points_awarded: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scorer_points_awarded: Mapped[int | None] = mapped_column(Integer, nullable=True)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_locked:    Mapped[bool]            = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship("User", back_populates="tournament_pick", lazy="noload")  # noqa: F821
