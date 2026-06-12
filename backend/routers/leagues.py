import logging
import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.limiter import limiter
from dependencies.auth import get_current_user
from models.league import League, LeagueMember
from models.match import Match
from models.prediction import Prediction
from models.user import User
from schemas.league import (
    LeagueCreate, LeagueJoin, LeagueOut, LeaguePreview, LeagueStandingOut,
    MemberPick, MemberPredictionOut,
    LeagueMemberTournamentPickOut, LeagueTournamentPicksOut, MostPickedOut,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/leagues", tags=["leagues"])

_ALPHABET = string.ascii_uppercase + string.digits

def _generate_invite_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(8))


async def _get_default_league_id(db: AsyncSession) -> str | None:
    """Return the ID of the platform default league (is_default=TRUE), or None if not yet seeded."""
    return await db.scalar(select(League.id).where(League.is_default == True).limit(1))


async def _ensure_default_membership(user_id: str, user_points: int, db: AsyncSession) -> None:
    """Idempotently enroll the user in the global default league.

    Uses ON CONFLICT DO NOTHING so concurrent calls are safe — the DB
    unique constraint guarantees no duplicate rows regardless of race timing.
    """
    try:
        default_id = await _get_default_league_id(db)
        if not default_id:
            log.warning("Default league not found — bootstrap may not have run yet")
            return

        await db.execute(
            pg_insert(LeagueMember)
            .values(
                league_id    = default_id,
                user_id      = user_id,
                total_points = user_points,
            )
            .on_conflict_do_nothing(constraint="uq_league_members_league_user")
        )
        await db.commit()
        log.debug("Ensured default league membership for user %s", user_id)
    except Exception as exc:
        await db.rollback()
        log.warning("Could not ensure default league membership for user %s: %s", user_id, exc)


@router.get("/me", response_model=list[LeagueOut])
async def my_leagues(
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> list[LeagueOut]:
    # Lazily enroll the user in the global league if the migration backfill
    # missed them (e.g. user predates the feature, or gen_random_uuid failed).
    await _ensure_default_membership(user.id, user.total_points, db)

    # UserMembership filters leagues the caller belongs to.
    # LeagueMember (unfiltered) counts all members per league.
    UserMembership = aliased(LeagueMember)
    try:
        result = await db.execute(
            select(League, func.count(LeagueMember.id).label("member_count"))
            .join(UserMembership, UserMembership.league_id == League.id)
            .join(LeagueMember,   LeagueMember.league_id   == League.id)
            .where(UserMembership.user_id == user.id)
            .group_by(League.id)
            .order_by(League.is_default.desc(), League.created_at.desc())
        )
        return [LeagueOut.from_orm(league, count) for league, count in result.all()]
    except Exception as exc:
        log.error("my_leagues query error for user ...%s: %s — %s",
                  user.id[-6:], type(exc).__name__, exc)
        raise


@router.post("", response_model=LeagueOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_league(
    request: Request,
    body: LeagueCreate,
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> LeagueOut:
    invite_code = _generate_invite_code()
    league = League(name=body.name, invite_code=invite_code, created_by=user.id)
    db.add(league)
    await db.flush()  # get league.id before adding member

    member = LeagueMember(league_id=league.id, user_id=user.id)
    db.add(member)
    await db.commit()
    await db.refresh(league)
    return LeagueOut.from_orm(league, member_count=1)


@router.post("/join", response_model=LeagueOut)
async def join_league(
    body: LeagueJoin,
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> LeagueOut:
    league = await db.scalar(
        select(League).where(League.invite_code == body.invite_code.strip().upper())
    )
    if not league:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite code")

    # ON CONFLICT DO NOTHING is race-safe — concurrent joins for the same
    # user+league are silently deduplicated by the DB unique constraint
    # (uq_league_members_league_user), so we never get duplicate rows even
    # under concurrent requests.
    await db.execute(
        pg_insert(LeagueMember)
        .values(
            league_id    = league.id,
            user_id      = user.id,
            total_points = user.total_points,
        )
        .on_conflict_do_nothing(constraint="uq_league_members_league_user")
    )
    await db.commit()

    count = await db.scalar(
        select(func.count()).where(LeagueMember.league_id == league.id)
    )
    return LeagueOut.from_orm(league, member_count=count or 0)


@router.get("/preview/{invite_code}", response_model=LeaguePreview)
async def preview_league(
    invite_code: str,
    db: AsyncSession = Depends(get_db),
) -> LeaguePreview:
    """Public endpoint — no auth required. Returns basic info so guests can preview before joining."""
    code = invite_code.strip().upper()
    league = await db.scalar(select(League).where(League.invite_code == code))
    if not league:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite code")

    count = await db.scalar(select(func.count()).where(LeagueMember.league_id == league.id))
    creator = await db.get(User, league.created_by)
    creator_username = creator.username if creator else "Unknown"

    return LeaguePreview(
        name            = league.name,
        memberCount     = count or 0,
        creatorUsername = creator_username,
        inviteCode      = league.invite_code,
    )


@router.get("/{league_id}", response_model=LeagueOut)
async def get_league(
    league_id: str,
    user:      User = Depends(get_current_user),
    db:        AsyncSession = Depends(get_db),
) -> LeagueOut:
    await _require_member(league_id, user.id, db)
    league = await db.get(League, league_id)
    if not league:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="League not found")
    count = await db.scalar(
        select(func.count()).where(LeagueMember.league_id == league_id)
    )
    return LeagueOut.from_orm(league, member_count=count or 0)


@router.get("/{league_id}/standings", response_model=list[LeagueStandingOut])
async def league_standings(
    league_id: str,
    user:      User = Depends(get_current_user),
    db:        AsyncSession = Depends(get_db),
) -> list[LeagueStandingOut]:
    await _require_member(league_id, user.id, db)

    result = await db.execute(
        select(LeagueMember, User.username, User.avatar_url, User.avatar_id, User.show_stats)
        .join(User, User.id == LeagueMember.user_id)
        .where(LeagueMember.league_id == league_id)
        .where(~User.email.ilike('%@test.wc26'))
        .where(~User.google_id.ilike('google-test-%'))
        .order_by(
            LeagueMember.total_points.desc(),
            User.exact_scores.desc(),
            User.correct_predictions.desc(),
            LeagueMember.joined_at.asc(),
        )
    )
    rows = result.all()
    return [
        LeagueStandingOut.from_orm(
            member,
            username=username,
            # Always expose own stats; hide others' if they opted out
            rank=rank + 1 if (show_stats or member.user_id == user.id) else None,
            total_points=member.total_points if (show_stats or member.user_id == user.id) else None,
            avatar_url=avatar_url,
            avatar_id=avatar_id,
        )
        for rank, (member, username, avatar_url, avatar_id, show_stats) in enumerate(rows)
    ]


@router.get(
    "/{league_id}/matches/{match_id}/predictions",
    response_model=list[MemberPredictionOut],
)
async def league_match_predictions(
    league_id: str,
    match_id:  str,
    user:      User = Depends(get_current_user),
    db:        AsyncSession = Depends(get_db),
) -> list[MemberPredictionOut]:
    """
    Return all league members' predictions for a match.

    Privacy rule:
    - If match.status == 'scheduled': return the current user's prediction in
      full; all other members' predictions are masked (hidden=True, scores null).
    - If match.status is 'live' or 'finished': all predictions are revealed.

    This is enforced server-side — masked responses never carry score data.
    """
    await _require_member(league_id, user.id, db)

    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    revealed = match.status != "scheduled"

    result = await db.execute(
        select(LeagueMember, User, Prediction)
        .join(User, User.id == LeagueMember.user_id)
        .outerjoin(
            Prediction,
            (Prediction.user_id == User.id) & (Prediction.match_id == match_id),
        )
        .where(LeagueMember.league_id == league_id)
    )
    rows = result.all()

    # outcome priority for finished matches: exact > correct_direction > wrong > pending/none
    _OUTCOME_ORDER: dict[str, int] = {
        "exact":      0,
        "difference": 1,
        "outcome":    1,
        "wrong":      2,
        "pending":    3,
    }

    items: list[tuple[MemberPredictionOut, object]] = []
    for member, member_user, pred in rows:
        is_own = member_user.id == user.id

        # Prediction visibility:
        # - Own prediction is always visible.
        # - Once a match is live/finished (revealed=True), all predictions are shown — universal reveal.
        # - hide_picks_until_kickoff=False → member opted in to showing picks even before kickoff.
        # - Otherwise (scheduled + default setting) → masked until kickoff.
        if pred is None:
            pick = None
        elif is_own or revealed or not member_user.hide_picks_until_kickoff:
            pick = MemberPick.revealed(pred)
        else:
            pick = MemberPick.masked()

        # Stats visibility: always expose to the owner; hide from others if opted out.
        show = is_own or member_user.show_stats

        out_item = MemberPredictionOut(
            userId        = member_user.id,
            username      = member_user.username,
            avatarUrl     = member_user.avatar_url,
            avatarId      = member_user.avatar_id,
            rank          = member.rank          if show else None,
            totalPoints   = member.total_points  if show else None,
            isCurrentUser = is_own,
            prediction    = pick,
        )

        # Sort key —
        # finished:          exact → correct_direction → wrong → pending → no pick
        # live / scheduled:  submission time ascending, no pick last
        _NO_TS = "9999-12-31T23:59:59"
        if match.status == "finished":
            if pred is None:
                sort_key: object = (4, _NO_TS)
            else:
                order = _OUTCOME_ORDER.get(pred.outcome or "", 3)
                ts    = pred.updated_at.isoformat() if pred.updated_at else _NO_TS
                sort_key = (order, ts)
        else:
            if pred is None:
                sort_key = _NO_TS
            else:
                sort_key = pred.updated_at.isoformat() if pred.updated_at else "0001-01-01T00:00:00"

        items.append((out_item, sort_key))

    items.sort(key=lambda x: x[1])
    return [item for item, _ in items]


@router.get("/{league_id}/tournament-picks", response_model=LeagueTournamentPicksOut)
async def league_tournament_picks(
    league_id: str,
    user:      User = Depends(get_current_user),
    db:        AsyncSession = Depends(get_db),
) -> LeagueTournamentPicksOut:
    """Return all league members' tournament winner + top-scorer picks.

    Individual picks are always visible (aggregate insights are shown before lock;
    individual picks are shown after lock).  Aggregate insights (most picked winner /
    scorer) are always computed from the full member set.
    """
    await _require_member(league_id, user.id, db)

    from models.tournament_pick import TournamentPick as TPickModel
    from models.team import Team
    from models.player import Player
    from services.tournament_lock import is_tournament_locked

    locked = await is_tournament_locked(db)

    rows = (await db.execute(
        select(
            User.id,
            User.username,
            User.avatar_url,
            User.avatar_id,
            TPickModel.winner_team_code,
            TPickModel.top_scorer_id,
        )
        .join(LeagueMember, LeagueMember.user_id == User.id)
        .outerjoin(TPickModel, TPickModel.user_id == User.id)
        .where(LeagueMember.league_id == league_id)
        .where(~User.email.ilike('%@test.wc26'))
        .order_by(User.username)
    )).all()

    teams: dict[str, Team] = {
        t.id: t for t in (await db.execute(select(Team))).scalars().all()
    }

    scorer_ids = {r[5] for r in rows if r[5]}
    players: dict[str, Player] = {}
    if scorer_ids:
        players = {
            p.id: p
            for p in (await db.execute(
                select(Player).where(Player.id.in_(scorer_ids))
            )).scalars().all()
        }

    winner_counts: dict[str, int] = {}
    scorer_counts: dict[str, int] = {}
    picks: list[LeagueMemberTournamentPickOut] = []

    for uid, username, avatar_url, avatar_id, winner_code, scorer_id in rows:
        if winner_code:
            winner_counts[winner_code] = winner_counts.get(winner_code, 0) + 1
        if scorer_id:
            scorer_counts[scorer_id] = scorer_counts.get(scorer_id, 0) + 1

        team   = teams.get(winner_code) if winner_code else None
        player = players.get(scorer_id) if scorer_id else None
        s_team = teams.get(player.team_id) if player else None

        picks.append(LeagueMemberTournamentPickOut(
            userId         = uid,
            username       = username,
            avatarUrl      = avatar_url,
            avatarId       = avatar_id,
            winnerId       = winner_code,
            winnerName     = team.name if team else None,
            winnerFlagUrl  = team.flag_url if team else None,
            topScorerId    = scorer_id,
            scorerName     = player.name if player else None,
            scorerPhotoUrl = player.photo_url if player else None,
            scorerTeamFlag = s_team.flag_url if s_team else None,
            scorerTeamCode = s_team.short_code if s_team else None,
        ))

    most_winner: MostPickedOut | None = None
    if winner_counts:
        top_code = max(winner_counts, key=lambda k: winner_counts[k])
        top_team = teams.get(top_code)
        if top_team:
            most_winner = MostPickedOut(
                id=top_code, name=top_team.name,
                flagUrl=top_team.flag_url, count=winner_counts[top_code],
            )

    most_scorer: MostPickedOut | None = None
    if scorer_counts:
        top_id  = max(scorer_counts, key=lambda k: scorer_counts[k])
        top_pl  = players.get(top_id)
        if top_pl:
            tp_team = teams.get(top_pl.team_id)
            most_scorer = MostPickedOut(
                id=top_id, name=top_pl.name,
                photoUrl=top_pl.photo_url,
                teamFlagUrl=tp_team.flag_url if tp_team else None,
                teamCode=tp_team.short_code if tp_team else None,
                count=scorer_counts[top_id],
            )

    return LeagueTournamentPicksOut(
        isLocked=locked,
        picks=picks,
        mostPickedWinner=most_winner,
        mostPickedScorer=most_scorer,
    )


@router.delete("/{league_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_league(
    league_id: str,
    user:      User = Depends(get_current_user),
    db:        AsyncSession = Depends(get_db),
) -> None:
    league = await db.get(League, league_id)
    if not league:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="League not found")
    if league.is_system:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The global league cannot be deleted")
    if league.created_by != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the league owner can delete it")
    await db.delete(league)
    await db.commit()


@router.delete("/{league_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_league(
    league_id: str,
    user:      User = Depends(get_current_user),
    db:        AsyncSession = Depends(get_db),
) -> None:
    league = await db.get(League, league_id)
    if not league:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="League not found")
    if league.is_default:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot leave the global league")
    if league.created_by == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are the owner — delete the league instead of leaving",
        )
    member = await db.scalar(
        select(LeagueMember).where(
            LeagueMember.league_id == league_id,
            LeagueMember.user_id   == user.id,
        )
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this league")
    await db.delete(member)
    await db.commit()


async def _require_member(league_id: str, user_id: str, db: AsyncSession) -> None:
    exists = await db.scalar(
        select(LeagueMember).where(
            LeagueMember.league_id == league_id,
            LeagueMember.user_id   == user_id,
        )
    )
    if not exists:
        # The global default league is open to every authenticated user — auto-join
        # instead of rejecting (handles direct URL navigation before /leagues/me runs).
        default_id = await _get_default_league_id(db)
        if default_id and league_id == default_id:
            user = await db.get(User, user_id)
            await _ensure_default_membership(user_id, user.total_points if user else 0, db)
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this league")
