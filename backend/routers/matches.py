from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.match import Match
from schemas.match import MatchOut
from services.squad_availability import get_squad_availability
from services.match_stats import get_match_statistics

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("", response_model=list[MatchOut])
async def list_matches(
    status_filter: Optional[str] = Query(None, alias="status"),
    round_filter:  Optional[str] = Query(None, alias="round"),
    group_filter:  Optional[str] = Query(None, alias="group"),
    db: AsyncSession = Depends(get_db),
) -> list[MatchOut]:
    q = select(Match).order_by(Match.scheduled_at)
    if status_filter:
        q = q.where(Match.status == status_filter)
    if round_filter:
        q = q.where(Match.round == round_filter)
    if group_filter:
        q = q.where(Match.group_name == group_filter.upper())

    result = await db.execute(q)
    matches = result.scalars().all()
    return [MatchOut.from_orm(m) for m in matches]


@router.get("/{match_id}", response_model=MatchOut)
async def get_match(match_id: str, db: AsyncSession = Depends(get_db)) -> MatchOut:
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    return MatchOut.from_orm(match)


@router.get("/{match_id}/squad/home")
async def get_match_squad_home(match_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    availability = await get_squad_availability(match_id, "home", db)
    if availability is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Squad data not available for this match",
        )
    return availability.to_dict()


@router.get("/{match_id}/squad/away")
async def get_match_squad_away(match_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    availability = await get_squad_availability(match_id, "away", db)
    if availability is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Squad data not available for this match",
        )
    return availability.to_dict()


@router.get("/{match_id}/stats")
async def get_match_stats(match_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    """
    Returns verified live match statistics from API-Football.

    Only available for live or finished matches with a mapped fixture ID.
    Returns 501 when statistics are not yet available (scheduled match, unmapped
    fixture, or API-Football has not yet published stats for this fixture).

    Response shape:
      {
        matchId, fixtureId, source, fetchedAt, verified, confidence,
        home: { possession, totalShots, shotsOnTarget, corners, fouls,
                yellowCards, redCards, saves, offsides, passes, passAccuracy, xG },
        away: { ...same fields... }
      }

    All null fields mean the API did not return a value — never a fallback estimate.
    """
    stats = await get_match_statistics(match_id, db)
    if stats is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Match statistics not available for this fixture",
        )
    return stats.to_dict()
