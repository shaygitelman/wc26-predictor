from typing import Optional
from pydantic import BaseModel

from models.match import Match
from models.prediction import Prediction
from core.wc2026_config import CODE_TO_GROUP


class TeamOut(BaseModel):
    id:        str
    name:      str
    shortCode: str
    flagUrl:   Optional[str] = None
    group:     Optional[str] = None


class MatchOut(BaseModel):
    id:          str
    homeTeam:    TeamOut
    awayTeam:    TeamOut
    scheduledAt: str           # ISO 8601 UTC
    venue:       Optional[str] = None
    city:        Optional[str] = None
    round:       str
    group:       Optional[str] = None
    status:      str
    homeScore:   Optional[int] = None
    awayScore:   Optional[int] = None
    minute:      Optional[int] = None
    thumbUrl:    Optional[str] = None

    @classmethod
    def from_orm(cls, m: Match) -> "MatchOut":
        return cls(
            id          = m.id,
            homeTeam    = TeamOut(
                id        = m.home_team_code.lower(),
                name      = m.home_team_name,
                shortCode = m.home_team_code,
                flagUrl   = m.home_flag_url,
                group     = m.home_group,
            ),
            awayTeam    = TeamOut(
                id        = m.away_team_code.lower(),
                name      = m.away_team_name,
                shortCode = m.away_team_code,
                flagUrl   = m.away_flag_url,
                group     = m.away_group,
            ),
            scheduledAt = m.scheduled_at.isoformat(),
            venue       = m.venue,
            city        = m.city,
            round       = m.round,
            group       = (m.group_name or CODE_TO_GROUP.get(m.home_team_code) or CODE_TO_GROUP.get(m.away_team_code)) if m.round == "group" else None,
            status      = m.status,
            homeScore   = m.home_score,
            awayScore   = m.away_score,
            minute      = m.minute,
            thumbUrl    = m.thumb_url,
        )


# ─── League-predictions endpoint schemas ─────────────────────────────────────


class LeaguePredictionEntry(BaseModel):
    """One member's prediction inside a league group."""
    userId:        str
    username:      str
    avatarUrl:     Optional[str]  = None
    avatarId:      Optional[str]  = None
    rank:          Optional[int]  = None   # null when user hid stats
    totalPoints:   Optional[int]  = None   # null when user hid stats
    isCurrentUser: bool
    predictedHome: int
    predictedAway: int
    outcome:       Optional[str]  = None   # null before match scores
    pointsEarned:  Optional[int]  = None
    isAutoPick:    bool
    submittedAt:   str                      # ISO 8601 — when user last saved

    @classmethod
    def from_orm(
        cls,
        user_id:       str,
        username:      str,
        avatar_url:    Optional[str],
        avatar_id:     Optional[str],
        rank:          Optional[int],
        total_points:  Optional[int],
        is_current:    bool,
        pred:          Prediction,
    ) -> "LeaguePredictionEntry":
        return cls(
            userId        = user_id,
            username      = username,
            avatarUrl     = avatar_url,
            avatarId      = avatar_id,
            rank          = rank,
            totalPoints   = total_points,
            isCurrentUser = is_current,
            predictedHome = pred.predicted_home,
            predictedAway = pred.predicted_away,
            outcome       = pred.outcome,
            pointsEarned  = pred.points_earned,
            isAutoPick    = pred.is_auto_pick,
            submittedAt   = pred.updated_at.isoformat() if pred.updated_at else pred.created_at.isoformat(),
        )


class LeaguePredictionGroup(BaseModel):
    """All predictions for one league."""
    leagueId:       str
    leagueName:     str
    isDefault:      bool
    totalMembers:   int
    predictedCount: int                       # members who submitted a pick
    predictions:    list[LeaguePredictionEntry]  # empty when not yet revealed


class MatchLeaguePredictionsOut(BaseModel):
    matchStatus:      str   # "scheduled" | "live" | "finished"
    matchScheduledAt: str   # ISO 8601 — used by frontend for "X before kickoff"
    leagues:          list[LeaguePredictionGroup]
