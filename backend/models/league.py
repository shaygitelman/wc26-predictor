import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class League(Base):
    __tablename__ = "leagues"

    id:          Mapped[str]       = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name:        Mapped[str]       = mapped_column(String(100), nullable=False)
    invite_code: Mapped[str]       = mapped_column(String(20), unique=True, nullable=False, index=True)
    created_by:  Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    members: Mapped[list["LeagueMember"]] = relationship(
        "LeagueMember", back_populates="league", cascade="all, delete-orphan", lazy="noload"
    )
    owner: Mapped["User | None"] = relationship(  # noqa: F821
        "User", foreign_keys=[created_by], lazy="noload"
    )


class LeagueMember(Base):
    __tablename__ = "league_members"
    __table_args__ = (
        UniqueConstraint("league_id", "user_id", name="uq_league_members_league_user"),
    )

    id:        Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    league_id: Mapped[str] = mapped_column(
        String, ForeignKey("leagues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    joined_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    total_points: Mapped[int]      = mapped_column(Integer, default=0, nullable=False)
    rank:         Mapped[int | None] = mapped_column(Integer, nullable=True)

    league: Mapped["League"] = relationship("League", back_populates="members", lazy="noload")
    user:   Mapped["User"]   = relationship("User", foreign_keys=[user_id], lazy="noload")  # noqa: F821
