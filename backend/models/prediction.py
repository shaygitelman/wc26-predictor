import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class Prediction(Base):
    __tablename__ = "predictions"
    __table_args__ = (
        UniqueConstraint("user_id", "match_id", name="uq_predictions_user_match"),
    )

    id:      Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    match_id: Mapped[str] = mapped_column(
        String, ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True
    )

    predicted_home: Mapped[int] = mapped_column(Integer, nullable=False)
    predicted_away: Mapped[int] = mapped_column(Integer, nullable=False)

    locked_at:     Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    outcome:       Mapped[str | None]      = mapped_column(String(20), nullable=True)
    points_earned: Mapped[int | None]      = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user:  Mapped["User"]  = relationship("User",  back_populates="predictions", lazy="noload")  # noqa: F821
    match: Mapped["Match"] = relationship("Match", back_populates="predictions", lazy="noload")
