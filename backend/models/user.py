import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base

if TYPE_CHECKING:
    from .prediction import Prediction
    from .tournament_pick import TournamentPick


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    google_id:  Mapped[str]       = mapped_column(String, unique=True, nullable=False, index=True)
    email:      Mapped[str]       = mapped_column(String, unique=True, nullable=False, index=True)
    username:   Mapped[str]       = mapped_column(String, unique=True, nullable=False)
    name:       Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_id:  Mapped[str | None] = mapped_column(String(50),  nullable=True)
    bio:        Mapped[str | None] = mapped_column(String(160), nullable=True)

    total_points:        Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    exact_scores:        Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    correct_predictions: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    total_predictions:   Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    # ── Avatar preference ─────────────────────────────────────────
    # False = user explicitly reset to default; auth will not restore Google avatar on login
    use_google_avatar: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    # ── Privacy settings ──────────────────────────────────────────
    hide_picks_until_kickoff: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    profile_public:           Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    show_stats:               Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    show_activity:            Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    show_favorite_team:       Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    allow_league_invites:     Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    created_at: Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    predictions:     Mapped[list["Prediction"]]        = relationship(
        "Prediction", back_populates="user", cascade="all, delete-orphan", lazy="noload"
    )
    tournament_pick: Mapped["TournamentPick | None"]   = relationship(
        "TournamentPick", back_populates="user", cascade="all, delete-orphan", uselist=False, lazy="noload"
    )

    def update_last_login(self) -> None:
        self.last_login = datetime.now(timezone.utc)
