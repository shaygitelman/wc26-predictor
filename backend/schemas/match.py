from typing import Optional
from pydantic import BaseModel

from models.match import Match
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
            group       = m.group_name or CODE_TO_GROUP.get(m.home_team_code) or CODE_TO_GROUP.get(m.away_team_code),
            status      = m.status,
            homeScore   = m.home_score,
            awayScore   = m.away_score,
            minute      = m.minute,
            thumbUrl    = m.thumb_url,
        )
