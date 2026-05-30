import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class TournamentScoringRun(Base):
    """
    Immutable audit log — one row per call to apply_tournament_scoring().

    Records what was applied, how many users were affected, and the net
    point deltas written in that run. Never updated after insert.
    """
    __tablename__ = "tournament_scoring_runs"

    id:     Mapped[str]      = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    winner_team_code: Mapped[str|None] = mapped_column(String(10), nullable=True)
    top_scorer_id:    Mapped[str|None] = mapped_column(String(36), nullable=True)

    # Net point change written to users.total_points in this run (can be negative on correction)
    winner_pts_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    scorer_pts_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # How many users had their winner/scorer pts changed (delta != 0)
    users_affected_winner: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    users_affected_scorer: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # True when this run corrected a previously applied result
    is_correction: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    notes: Mapped[str|None] = mapped_column(String(500), nullable=True)
