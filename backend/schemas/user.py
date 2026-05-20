import re
import logging

from pydantic import BaseModel, field_validator

from models.user import User

logger = logging.getLogger(__name__)

_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_.]+$')


class UserProfileOut(BaseModel):
    id:        str
    username:  str
    name:      str | None
    avatarUrl: str | None
    avatarId:  str | None
    bio:       str | None
    createdAt: str

    @classmethod
    def from_orm(cls, user: User) -> "UserProfileOut":
        return cls(
            id        = user.id,
            username  = user.username,
            name      = user.name,
            avatarUrl = user.avatar_url,
            avatarId  = user.avatar_id,
            bio       = user.bio,
            createdAt = user.created_at.isoformat(),
        )


class UserUpdateIn(BaseModel):
    username: str | None = None
    bio:      str | None = None
    avatarId: str | None = None  # camelCase matches frontend JSON key

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Username must be at least 2 characters")
        if len(v) > 30:
            raise ValueError("Username must be at most 30 characters")
        if not _USERNAME_RE.match(v):
            raise ValueError("Username may only contain letters, numbers, dots, and underscores")
        return v

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 160:
            raise ValueError("Bio must be at most 160 characters")
        return v or None  # coerce empty string to None

    @field_validator("avatarId")
    @classmethod
    def validate_avatar_id(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 50:
            raise ValueError("Invalid avatarId")
        return v or None


class UserStatsOut(BaseModel):
    totalPoints:        int
    globalRank:         int
    totalUsers:         int
    exactScores:        int
    correctPredictions: int
    totalPredictions:   int


class PrivacySettingsOut(BaseModel):
    hidePicksUntilKickoff: bool
    profilePublic:         bool
    showStats:             bool
    showActivity:          bool
    showFavoriteTeam:      bool
    allowLeagueInvites:    bool

    @classmethod
    def from_orm(cls, user: User) -> "PrivacySettingsOut":
        return cls(
            hidePicksUntilKickoff = user.hide_picks_until_kickoff,
            profilePublic         = user.profile_public,
            showStats             = user.show_stats,
            showActivity          = user.show_activity,
            showFavoriteTeam      = user.show_favorite_team,
            allowLeagueInvites    = user.allow_league_invites,
        )


class PrivacySettingsIn(BaseModel):
    hidePicksUntilKickoff: bool | None = None
    profilePublic:         bool | None = None
    showStats:             bool | None = None
    showActivity:          bool | None = None
    showFavoriteTeam:      bool | None = None
    allowLeagueInvites:    bool | None = None
