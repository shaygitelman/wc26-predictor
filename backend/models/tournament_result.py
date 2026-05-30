import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class TournamentResult(Base):
    """
    Official tournament outcome — the single source of truth for scoring.

    There can be multiple rows (one per scoring/correction run), but only
    the most-recent by set_at is the active one. The scoring service always
    reads the latest row and applies it.
    """
    __tablename__ = "tournament_results"

    id:               Mapped[str]      = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    winner_team_code: Mapped[str|None] = mapped_column(String(10), nullable=True)
    top_scorer_id:    Mapped[str|None] = mapped_column(String(36), nullable=True)
    set_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    set_by:  Mapped[str|None]      = mapped_column(String(255), nullable=True)
    notes:   Mapped[str|None]      = mapped_column(String(500), nullable=True)
