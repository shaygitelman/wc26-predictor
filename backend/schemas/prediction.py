from typing import Optional
from pydantic import BaseModel, Field

from models.prediction import Prediction


class PredictionCreate(BaseModel):
    predicted_home: int = Field(..., ge=0, le=30)
    predicted_away: int = Field(..., ge=0, le=30)


class PredictionOut(BaseModel):
    id:            str
    userId:        str
    matchId:       str
    predictedHome: int
    predictedAway: int
    outcome:       Optional[str] = None
    pointsEarned:  Optional[int] = None
    lockedAt:      Optional[str] = None
    createdAt:     str

    @classmethod
    def from_orm(cls, p: Prediction) -> "PredictionOut":
        return cls(
            id            = p.id,
            userId        = p.user_id,
            matchId       = p.match_id,
            predictedHome = p.predicted_home,
            predictedAway = p.predicted_away,
            outcome       = p.outcome,
            pointsEarned  = p.points_earned,
            lockedAt      = p.locked_at.isoformat() if p.locked_at else None,
            createdAt     = p.created_at.isoformat(),
        )
