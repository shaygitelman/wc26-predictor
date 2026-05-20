from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.player import Player
from models.team import Team

router = APIRouter(prefix="/players", tags=["players"])

# API-Football IDs for ~15 likely top-scorer candidates at WC 2026
_FAVORITE_APIFOOTBALL_IDS = [
    "278",    # Mbappé (FRA)
    "1100",   # Haaland (NOR)
    "184",    # Kane (ENG)
    "874",    # Cristiano Ronaldo (POR)
    "154",    # Messi (ARG)
    "762",    # Vinícius Júnior (BRA)
    "386828", # Lamine Yamal (ESP)
    "978",    # Kai Havertz (GER)
    "2864",   # Alexander Isak (SWE)
    "247",    # Cody Gakpo (NED)
    "51617",  # Darwin Núñez (URU)
    "2489",   # Luis Díaz (COL)
    "10009",  # Rodrygo (BRA)
    "18979",  # Viktor Gyökeres (SWE)
    "1496",   # Raphinha (BRA)
]

# Display order for favorites (same as list above)
_FAVORITE_ORDER = {api_id: i for i, api_id in enumerate(_FAVORITE_APIFOOTBALL_IDS)}


class PlayerOut(BaseModel):
    id:            str
    teamId:        Optional[str]
    teamName:      Optional[str]
    teamShortCode: Optional[str]
    teamFlagUrl:   Optional[str]
    name:          str
    position:      Optional[str]   # GK | DEF | MID | FWD
    shirtNumber:   Optional[int]
    photoUrl:      Optional[str]
    dateOfBirth:   Optional[str]   # YYYY-MM-DD

    @classmethod
    def from_row(cls, p: Player, t: Optional[Team]) -> "PlayerOut":
        return cls(
            id            = p.id,
            teamId        = p.team_id,
            teamName      = t.name if t else None,
            teamShortCode = t.short_code if t else None,
            teamFlagUrl   = t.flag_url if t else None,
            name          = p.name,
            position      = p.position,
            shirtNumber   = p.shirt_number,
            photoUrl      = p.photo_url,
            dateOfBirth   = p.date_of_birth.isoformat() if p.date_of_birth else None,
        )


@router.get("/favorites", response_model=list[PlayerOut])
async def list_favorites(db: AsyncSession = Depends(get_db)) -> list[PlayerOut]:
    """Returns the ~15 star players likely to contend for Golden Boot, in curated order."""
    rows = (
        await db.execute(
            select(Player, Team)
            .outerjoin(Team, Team.id == Player.team_id)
            .where(
                Player.external_ids["apifootball"].as_string().in_(_FAVORITE_APIFOOTBALL_IDS)
            )
        )
    ).all()

    def sort_key(row: tuple) -> int:
        player, _ = row
        ext_id = (player.external_ids or {}).get("apifootball", "")
        return _FAVORITE_ORDER.get(ext_id, 999)

    rows_sorted = sorted(rows, key=sort_key)
    return [PlayerOut.from_row(player, team) for player, team in rows_sorted]


@router.get("", response_model=list[PlayerOut])
async def list_players(
    team_id:  Optional[str] = Query(None, alias="team"),
    position: Optional[str] = Query(None),
    search:   Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[PlayerOut]:
    q = (
        select(Player, Team)
        .outerjoin(Team, Team.id == Player.team_id)
        .order_by(Player.shirt_number.nulls_last(), Player.name)
    )
    if team_id:
        q = q.where(Player.team_id == team_id.lower())
    if position:
        q = q.where(Player.position == position.upper())
    if search:
        q = q.where(Player.name.ilike(f"%{search}%"))

    rows = (await db.execute(q)).all()
    return [PlayerOut.from_row(player, team) for player, team in rows]
