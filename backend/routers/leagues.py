import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.league import League, LeagueMember
from models.match import Match
from models.prediction import Prediction
from models.user import User
from schemas.league import (
    LeagueCreate, LeagueJoin, LeagueOut, LeaguePreview, LeagueStandingOut,
    MemberPick, MemberPredictionOut,
)

router = APIRouter(prefix="/leagues", tags=["leagues"])

_ALPHABET = string.ascii_uppercase + string.digits


def _generate_invite_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(8))


@router.get("/me", response_model=list[LeagueOut])
async def my_leagues(
    user: User = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> list[LeagueOut]:
    # UserMembership filters leagues the caller belongs to.
    # LeagueMember (unfiltered) counts all members per league.
    UserMembership = aliased(LeagueMember)
    result = await db.execute(
        select(League, func.count(LeagueMember.id).label("member_count"))
        .join(UserMembership, UserMembership.league_id == League.id)
        .join(LeagueMember,   LeagueMember.league_id   == League.id)
        .where(UserMembership.user_id == user.id)
        .group_by(League.id)
        .order_by(League.created_at.desc())
    )
    return [LeagueOut.from_orm(league, count) for league, count in result.all()]


@router.post("", response_model=LeagueOut, status_code=status.HTTP_201_CREATED)
async def create_league(
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

    already = await db.scalar(
        select(LeagueMember).where(
            LeagueMember.league_id == league.id,
            LeagueMember.user_id   == user.id,
        )
    )
    if already:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member")

    db.add(LeagueMember(league_id=league.id, user_id=user.id, total_points=user.total_points))
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
        .order_by(LeagueMember.total_points.desc(), LeagueMember.joined_at)
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
        .order_by(LeagueMember.rank.nulls_last(), LeagueMember.joined_at)
    )
    rows = result.all()

    out: list[MemberPredictionOut] = []
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

        out.append(MemberPredictionOut(
            userId        = member_user.id,
            username      = member_user.username,
            avatarUrl     = member_user.avatar_url,
            avatarId      = member_user.avatar_id,
            rank          = member.rank          if show else None,
            totalPoints   = member.total_points  if show else None,
            isCurrentUser = is_own,
            prediction    = pick,
        ))

    return out


@router.delete("/{league_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_league(
    league_id: str,
    user:      User = Depends(get_current_user),
    db:        AsyncSession = Depends(get_db),
) -> None:
    league = await db.get(League, league_id)
    if not league:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="League not found")
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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this league")
