from typing import Optional
from pydantic import BaseModel, Field

from models.league import League, LeagueMember
from models.prediction import Prediction


class LeagueCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)


class LeagueJoin(BaseModel):
    invite_code: str


class LeagueOut(BaseModel):
    id:          str
    name:        str
    inviteCode:  str
    createdBy:   Optional[str] = None
    memberCount: int
    createdAt:   str
    isDefault:   bool = False
    isSystem:    bool = False

    @classmethod
    def from_orm(cls, league: League, member_count: int) -> "LeagueOut":
        return cls(
            id          = league.id,
            name        = league.name,
            inviteCode  = league.invite_code,
            createdBy   = league.created_by,
            memberCount = member_count,
            createdAt   = league.created_at.isoformat(),
            isDefault   = league.is_default,
            isSystem    = league.is_system,
        )


class LeagueStandingOut(BaseModel):
    userId:      str
    username:    str
    avatarUrl:   Optional[str] = None
    avatarId:    Optional[str] = None
    rank:        Optional[int] = None
    totalPoints: Optional[int] = None
    joinedAt:    str

    @classmethod
    def from_orm(
        cls,
        member: LeagueMember,
        username: str,
        rank: Optional[int],
        total_points: Optional[int],
        avatar_url: Optional[str] = None,
        avatar_id: Optional[str] = None,
    ) -> "LeagueStandingOut":
        return cls(
            userId      = member.user_id,
            username    = username,
            avatarUrl   = avatar_url,
            avatarId    = avatar_id,
            rank        = rank,
            totalPoints = total_points,
            joinedAt    = member.joined_at.isoformat(),
        )


class MemberPick(BaseModel):
    hidden:        bool
    predictedHome: Optional[int]  = None
    predictedAway: Optional[int]  = None
    outcome:       Optional[str]  = None
    pointsEarned:  Optional[int]  = None
    isAutoPick:    Optional[bool] = None
    submittedAt:   Optional[str]  = None  # ISO 8601 — when user last saved their pick

    @classmethod
    def revealed(cls, pred: Prediction) -> "MemberPick":
        return cls(
            hidden        = False,
            predictedHome = pred.predicted_home,
            predictedAway = pred.predicted_away,
            outcome       = pred.outcome,
            pointsEarned  = pred.points_earned,
            isAutoPick    = pred.is_auto_pick,
            submittedAt   = pred.updated_at.isoformat() if pred.updated_at else None,
        )

    @classmethod
    def masked(cls) -> "MemberPick":
        return cls(hidden=True)


class MemberPredictionOut(BaseModel):
    userId:        str
    username:      str
    avatarUrl:     Optional[str] = None
    avatarId:      Optional[str] = None
    rank:          Optional[int] = None
    totalPoints:   Optional[int] = None
    isCurrentUser: bool
    prediction:    Optional[MemberPick] = None


class LeaguePreview(BaseModel):
    name:            str
    memberCount:     int
    creatorUsername: str
    inviteCode:      str
