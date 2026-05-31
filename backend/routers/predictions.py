import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.limiter import limiter
from dependencies.auth import get_current_user
from models.match import Match
from models.prediction import Prediction
from models.user import User
from schemas.prediction import PredictionCreate, PredictionOut

router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.get("/me", response_model=list[PredictionOut])
async def my_predictions(
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> list[PredictionOut]:
    result = await db.execute(
        select(Prediction)
        .where(Prediction.user_id == user.id)
        .order_by(Prediction.created_at.desc())
    )
    return [PredictionOut.from_orm(p) for p in result.scalars().all()]


@router.get("/{match_id}/me", response_model=Optional[PredictionOut])
async def my_prediction_for_match(
    match_id: str,
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> Optional[PredictionOut]:
    result = await db.execute(
        select(Prediction).where(
            Prediction.user_id  == user.id,
            Prediction.match_id == match_id,
        )
    )
    p = result.scalar_one_or_none()
    return PredictionOut.from_orm(p) if p else None


@router.post("/{match_id}", response_model=PredictionOut, status_code=status.HTTP_200_OK)
@limiter.limit("60/minute")
async def upsert_prediction(
    request:  Request,
    match_id: str,
    body:     PredictionCreate,
    user:     User = Depends(get_current_user),
    db:       AsyncSession = Depends(get_db),
) -> PredictionOut:
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    if match.status != "scheduled":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Predictions are locked for this match",
        )

    now = datetime.now(timezone.utc)
    stmt = (
        pg_insert(Prediction)
        .values(
            id             = str(uuid.uuid4()),
            user_id        = user.id,
            match_id       = match_id,
            predicted_home = body.predicted_home,
            predicted_away = body.predicted_away,
            locked_at      = None,
            outcome        = None,
            points_earned  = None,
            created_at     = now,
            updated_at     = now,
        )
        .on_conflict_do_update(
            constraint="uq_predictions_user_match",
            set_={
                "predicted_home": body.predicted_home,
                "predicted_away": body.predicted_away,
                "updated_at":     now,
            },
        )
        .returning(Prediction.id)
    )
    result = await db.execute(stmt)
    pred_id: str = result.scalar_one()
    await db.commit()

    pred = await db.get(Prediction, pred_id)
    return PredictionOut.from_orm(pred)  # type: ignore[arg-type]
