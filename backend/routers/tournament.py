import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.limiter import limiter
from core.security import create_access_token
from core.wc2026_config import GROUPS
from dependencies.auth import get_current_user
from models.player import Player
from models.team import Team
from models.tournament_pick import TournamentPick
from models.user import User
from schemas.tournament import ScorerOut, TournamentPickOut, TournamentPickUpdate
from services.tournament_lock import get_lock_time, is_tournament_locked

log = logging.getLogger(__name__)

router = APIRouter(prefix="/tournament", tags=["tournament"])


class TeamOut(BaseModel):
    code:    str
    name:    str
    flagUrl: str | None
    group:   str


class OnboardingCompleteResponse(BaseModel):
    access_token: str


# ── Public: team list ─────────────────────────────────────────────────────────

@router.get("/teams", response_model=list[TeamOut])
async def list_teams() -> list[TeamOut]:
    """All 48 WC2026 teams from config. No auth required."""
    teams = [
        TeamOut(code=code, name=name, flagUrl=flag_url, group=group)
        for group, entries in GROUPS.items()
        for code, name, flag_url in entries
    ]
    return sorted(teams, key=lambda t: (t.group, t.name))


# ── Public: lock status ───────────────────────────────────────────────────────

@router.get("/lock-status")
async def tournament_lock_status(db: AsyncSession = Depends(get_db)) -> dict:
    """
    Return the tournament picks lock time and whether it has passed.
    No auth required — used by the frontend to show countdowns/banners.
    """
    lock_time = await get_lock_time(db)
    locked    = datetime.now(timezone.utc) >= lock_time
    return {
        "isLocked": locked,
        "lockTime": lock_time.isoformat(),
    }


# ── Onboarding ────────────────────────────────────────────────────────────────

@router.post("/onboarding/complete", response_model=OnboardingCompleteResponse)
async def complete_onboarding(
    body: TournamentPickUpdate,
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> OnboardingCompleteResponse:
    """
    Save tournament picks, mark onboarding done, return a refreshed JWT.

    Allowed even after the tournament lock — this is the user's *first*
    submission during sign-up, not an edit. Picks are immediately marked
    is_locked=True if the tournament has already started so the user
    cannot change them afterward.
    """
    pick = await _get_or_create_pick(user.id, db)

    # Normalize winner_team_code to lowercase to match team.id in the DB
    pick.winner_team_code = (body.winner_team_code or "").lower() or None
    pick.top_scorer_id    = body.top_scorer_id or None
    if pick.winner_team_code or pick.top_scorer_id:
        pick.submitted_at = datetime.now(timezone.utc)

    # If the tournament has already started, lock the pick immediately —
    # onboarding picks submitted after kickoff cannot be changed later.
    already_locked = await is_tournament_locked(db)
    if already_locked:
        pick.is_locked = True
        log.info(
            "[Onboarding] tournament already started — picks immediately locked for user=%s",
            user.id,
        )

    # Use a direct SQL UPDATE for onboarding_completed so the change is written
    # regardless of ORM session state (the session may have been expired by an
    # earlier commit inside _get_or_create_pick for first-time users).
    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(onboarding_completed=True)
    )
    await db.commit()

    # Re-read the user to build a fully current JWT (confirms the DB write worked).
    await db.refresh(user)
    if not user.onboarding_completed:
        log.error(
            "onboarding_completed was not persisted for user %s — possible DB issue", user.id
        )

    new_token = create_access_token({
        "sub":                  user.id,
        "email":                user.email,
        "username":             user.username,
        "name":                 user.name,
        "picture":              user.avatar_url,
        "onboarding_completed": True,
    })
    log.info("onboarding complete for user %s (picks_locked=%s)", user.id, already_locked)
    return OnboardingCompleteResponse(access_token=new_token)


# ── Authenticated pick endpoints ──────────────────────────────────────────────

@router.get("/picks/me", response_model=TournamentPickOut)
async def my_tournament_pick(
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> TournamentPickOut:
    pick      = await _get_or_create_pick(user.id, db)
    scorer    = await _load_scorer(pick, db)
    lock_time = await get_lock_time(db)
    return TournamentPickOut.from_pick(pick, scorer, lock_time)


@router.put("/picks/me", response_model=TournamentPickOut)
@limiter.limit("20/minute")
async def upsert_tournament_pick(
    request: Request,
    body: TournamentPickUpdate,
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> TournamentPickOut:
    """
    Update tournament winner / top-scorer picks.

    Rejected with 423 Locked once the tournament has started (time-based),
    or if the pick has been manually locked via is_locked=True (admin override).
    Both conditions are irrevocable — no way to unlock through this API.
    """
    lock_time = await get_lock_time(db)
    pick      = await _get_or_create_pick(user.id, db)

    # ── Lock check (two independent sources) ──────────────────────────────
    time_locked = datetime.now(timezone.utc) >= lock_time
    if time_locked or pick.is_locked:
        log.info(
            "[Tournament] PUT rejected — locked (time=%s db=%s) user=%s",
            time_locked, pick.is_locked, user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=(
                f"Tournament picks are locked — editing closed at "
                f"{lock_time.isoformat()} UTC"
            ),
        )

    log.info(
        "tournament pick save: user=%s winner_team_code=%r top_scorer_id=%r",
        user.id, body.winner_team_code, body.top_scorer_id,
    )

    # Always update both fields so clearing (sending null) works correctly.
    # Normalize to lowercase to match team.id (DB primary key is lowercase code).
    pick.winner_team_code = (body.winner_team_code or "").lower() or None
    pick.top_scorer_id    = body.top_scorer_id or None

    if pick.winner_team_code or pick.top_scorer_id:
        pick.submitted_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(pick)
    log.info(
        "tournament pick saved: user=%s winner=%r scorer=%r",
        user.id, pick.winner_team_code, pick.top_scorer_id,
    )
    scorer = await _load_scorer(pick, db)
    return TournamentPickOut.from_pick(pick, scorer, lock_time)


# ── Internal helpers ──────────────────────────────────────────────────────────

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


async def _get_or_create_pick(user_id: str, db: AsyncSession) -> TournamentPick:
    """
    Fetch or create a TournamentPick for user_id.

    Race-safe: if a concurrent request already inserted the row between our
    SELECT and INSERT, catches the IntegrityError and re-fetches instead of
    returning a 500.
    """
    pick = await db.scalar(select(TournamentPick).where(TournamentPick.user_id == user_id))
    if pick:
        return pick

    try:
        pick = TournamentPick(user_id=user_id)
        db.add(pick)
        await db.commit()
        await db.refresh(pick)
        return pick
    except Exception:
        # Unique constraint fired — a concurrent request won the race.
        await db.rollback()
        pick = await db.scalar(select(TournamentPick).where(TournamentPick.user_id == user_id))
        if pick:
            return pick
        raise  # genuine error, not a race condition
