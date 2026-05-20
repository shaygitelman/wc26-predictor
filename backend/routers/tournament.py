import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.player import Player
from models.team import Team
from models.tournament_pick import TournamentPick
from models.user import User
from schemas.tournament import ScorerOut, TournamentPickOut, TournamentPickUpdate

log = logging.getLogger(__name__)

router = APIRouter(prefix="/tournament", tags=["tournament"])


async def _load_scorer(pick: TournamentPick, db: AsyncSession) -> ScorerOut | None:
    if not pick.top_scorer_id:
        return None
    row = (
        await db.execute(
            select(Player, Team)
            .outerjoin(Team, Team.id == Player.team_id)
            .where(Player.id == pick.top_scorer_id)
        )
    ).one_or_none()
    if not row:
        log.warning("tournament pick scorer %r not found in players table", pick.top_scorer_id)
        return None
    player, team = row
    return ScorerOut(
        id            = player.id,
        name          = player.name,
        photoUrl      = player.photo_url,
        teamName      = team.name       if team else None,
        teamShortCode = team.short_code if team else None,
        teamFlagUrl   = team.flag_url   if team else None,
    )


@router.get("/picks/me", response_model=TournamentPickOut)
async def my_tournament_pick(
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> TournamentPickOut:
    pick   = await _get_or_create_pick(user.id, db)
    scorer = await _load_scorer(pick, db)
    return TournamentPickOut.from_pick(pick, scorer)


@router.put("/picks/me", response_model=TournamentPickOut)
async def upsert_tournament_pick(
    body: TournamentPickUpdate,
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> TournamentPickOut:
    pick = await _get_or_create_pick(user.id, db)

    if pick.is_locked:
        log.info("tournament pick save blocked — pick is locked for user %s", user.id)
        scorer = await _load_scorer(pick, db)
        return TournamentPickOut.from_pick(pick, scorer)

    log.info(
        "tournament pick save: user=%s winner_team_code=%r top_scorer_id=%r",
        user.id, body.winner_team_code, body.top_scorer_id,
    )

    # Always update both fields so clearing (sending null) works correctly.
    # `or None` converts empty string "" to None as well.
    pick.winner_team_code = body.winner_team_code or None
    pick.top_scorer_id    = body.top_scorer_id    or None

    if pick.winner_team_code or pick.top_scorer_id:
        pick.submitted_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(pick)
    log.info(
        "tournament pick saved: user=%s winner=%r scorer=%r",
        user.id, pick.winner_team_code, pick.top_scorer_id,
    )
    scorer = await _load_scorer(pick, db)
    return TournamentPickOut.from_pick(pick, scorer)


async def _get_or_create_pick(user_id: str, db: AsyncSession) -> TournamentPick:
    pick = await db.scalar(select(TournamentPick).where(TournamentPick.user_id == user_id))
    if not pick:
        pick = TournamentPick(user_id=user_id)
        db.add(pick)
        await db.commit()
        await db.refresh(pick)
    return pick
