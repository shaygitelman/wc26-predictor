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

    @classmethod
    def from_pick(
        cls,
        pick:   TournamentPick,
        scorer: Optional[ScorerOut] = None,
    ) -> "TournamentPickOut":
        return cls(
            winnerId    = pick.winner_team_code,
            topScorerId = pick.top_scorer_id,
            scorer      = scorer,
            submittedAt = pick.submitted_at.isoformat() if pick.submitted_at else None,
            isLocked    = pick.is_locked,
        )
