from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.match import Match
from schemas.match import MatchOut

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
