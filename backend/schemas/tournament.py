from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel

from models.tournament_pick import TournamentPick


class TournamentPickUpdate(BaseModel):
    winner_team_code: Optional[str] = None
    top_scorer_id:    Optional[str] = None


class ScorerOut(BaseModel):
    id:            str
    name:          str
    photoUrl:      Optional[str] = None
    teamName:      Optional[str] = None
    teamShortCode: Optional[str] = None
    teamFlagUrl:   Optional[str] = None


class TournamentPickOut(BaseModel):
    winnerId:    Optional[str] = None
    topScorerId: Optional[str] = None
    scorer:      Optional[ScorerOut] = None
    submittedAt: Optional[str] = None
    isLocked:    bool
    lockTime:    Optional[str] = None  # ISO-8601 UTC — when picks locked / will lock

    @classmethod
    def from_pick(
        cls,
        pick:      TournamentPick,
        scorer:    Optional[ScorerOut] = None,
        lock_time: Optional[datetime]  = None,
    ) -> "TournamentPickOut":
        # Effective lock = DB flag (manual override) OR time-based lock
        time_locked      = lock_time is not None and datetime.now(timezone.utc) >= lock_time
        effective_locked = pick.is_locked or time_locked
        return cls(
            winnerId    = pick.winner_team_code,
            topScorerId = pick.top_scorer_id,
            scorer      = scorer,
            submittedAt = pick.submitted_at.isoformat() if pick.submitted_at else None,
            isLocked    = effective_locked,
            lockTime    = lock_time.isoformat() if lock_time else None,
        )
