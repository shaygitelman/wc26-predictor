from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.player import Player
from models.team import Team

router = APIRouter(prefix="/players", tags=["players"])

# ── Golden Boot favorites ─────────────────────────────────────────────────────
#
# Two-tier lookup so the list stays accurate across squad changes:
#
#   Tier 1 — API-Football player IDs (fast, exact).
#             IDs are verified from production photo URLs:
#             https://media.api-sports.io/football/players/{ID}.png
#
#   Tier 2 — (name_fragment, team_id, display_slot) tuples.
#             Used for players whose API-Football ID is less stable or
#             who were not in the initial favorites compile.

_FAVORITE_APIFOOTBALL_IDS: list[str] = [
    "278",    # Kylian Mbappé (FRA)        — slot 0
    "1100",   # Erling Haaland (NOR)       — slot 1
    "306",    # Mohamed Salah (EGY)        — slot 3
    "154",    # Lionel Messi (ARG)         — slot 4
    "762",    # Vinícius Júnior (BRA)      — slot 5
    "386828", # Lamine Yamal (ESP)         — slot 6
    "978",    # Kai Havertz (GER)          — slot 7
    "377122", # Endrick (BRA)              — slot 8
    "247",    # Cody Gakpo (NED)           — slot 9
    "51617",  # Darwin Núñez (URU)         — slot 10
    "2489",   # Luis Díaz (COL)            — slot 11
    "18979",  # Viktor Gyökeres (SWE)      — slot 13
    "1496",   # Raphinha (BRA)             — slot 14
]

# Slot numbers must NOT collide with _FAVORITE_ID_ORDER values above.
_FAVORITE_NAME_SLOTS: list[tuple[str, str, int]] = [
    ("Bellingham", "eng",  2),  # Jude Bellingham (ENG)  — slot 2
    ("Neymar",     "bra", 12),  # Neymar (BRA)           — slot 12
]

_FAVORITE_ID_ORDER: dict[str, int] = {
    api_id: slot
    for api_id, slot in zip(
        _FAVORITE_APIFOOTBALL_IDS,
        [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14],
    )
}


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
    """Returns ~15 star Golden Boot candidates in curated display order.

    Two-pass query:
      Pass 1 — exact API-Football player ID match (fast, stable).
      Pass 2 — name-fragment + team_id match for players whose IDs changed
               or who weren't in the initial favorites list.
    Duplicates are removed; results are sorted by display slot number.
    """
    # Pass 1: by API-Football player ID
    id_rows = (
        await db.execute(
            select(Player, Team)
            .outerjoin(Team, Team.id == Player.team_id)
            .where(
                Player.external_ids["apifootball"].as_string().in_(_FAVORITE_APIFOOTBALL_IDS)
            )
        )
    ).all()

    # Pass 2: name-based supplement (skipped if slot list is empty)
    name_rows: list = []
    if _FAVORITE_NAME_SLOTS:
        seen_ids = {p.id for p, _ in id_rows}
        conditions = [
            and_(Player.name.ilike(f"%{name}%"), Player.team_id == team_id)
            for name, team_id, _ in _FAVORITE_NAME_SLOTS
        ]
        extra_rows = (
            await db.execute(
                select(Player, Team)
                .outerjoin(Team, Team.id == Player.team_id)
                .where(or_(*conditions))
            )
        ).all()
        # Keep only the first match per slot and deduplicate against pass-1 results
        matched_slots: set[int] = set()
        for row in extra_rows:
            player, _ = row
            if player.id in seen_ids:
                continue
            name_lower = player.name.lower()
            for frag, tid, slot in _FAVORITE_NAME_SLOTS:
                if frag.lower() in name_lower and player.team_id == tid and slot not in matched_slots:
                    name_rows.append(row)
                    matched_slots.add(slot)
                    seen_ids.add(player.id)
                    break

    def _sort_key(row: tuple) -> int:
        player, _ = row
        api_id = (player.external_ids or {}).get("apifootball", "")
        slot = _FAVORITE_ID_ORDER.get(api_id)
        if slot is not None:
            return slot
        name_lower = player.name.lower()
        for frag, _, frag_slot in _FAVORITE_NAME_SLOTS:
            if frag.lower() in name_lower:
                return frag_slot
        return 999

    all_rows = sorted(id_rows + name_rows, key=_sort_key)
    return [PlayerOut.from_row(player, team) for player, team in all_rows]


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
