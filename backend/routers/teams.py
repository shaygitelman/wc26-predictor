from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.team import Team

router = APIRouter(prefix="/teams", tags=["teams"])


class TeamOut(BaseModel):
    id:          str
    name:        str
    shortCode:   str
    flagUrl:     str | None
    logoUrl:     str | None
    groupName:   str | None
    countryCode: str | None

    @classmethod
    def from_orm(cls, t: Team) -> "TeamOut":
        return cls(
            id          = t.id,
            name        = t.name,
            shortCode   = t.short_code,
            flagUrl     = t.flag_url,
            logoUrl     = t.logo_url,
            groupName   = t.group_name,
            countryCode = t.country_code,
        )


@router.get("", response_model=list[TeamOut])
async def list_teams(db: AsyncSession = Depends(get_db)) -> list[TeamOut]:
    teams = (await db.execute(select(Team).order_by(Team.name))).scalars().all()
    return [TeamOut.from_orm(t) for t in teams]
