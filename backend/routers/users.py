import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.user import User
from schemas.user import PrivacySettingsIn, PrivacySettingsOut, UserProfileOut, UserStatsOut, UserUpdateIn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfileOut)
async def get_me(user: User = Depends(get_current_user)) -> UserProfileOut:
    return UserProfileOut.from_orm(user)


@router.patch("/me", response_model=UserProfileOut)
async def update_me(
    body:   UserUpdateIn,
    user:   User         = Depends(get_current_user),
    db:     AsyncSession = Depends(get_db),
) -> UserProfileOut:
    logger.info("PATCH /users/me — user=%s fields=%s", user.id, body.model_fields_set)

    # ── Username ─────────────────────────────────────────────
    if body.username is not None:
        new_username = body.username  # already stripped + validated by schema
        if new_username != user.username:
            # Uniqueness check
            conflict = await db.scalar(
                select(User).where(User.username == new_username)
            )
            if conflict is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Username is already taken",
                )
            logger.info("Updating username %s → %s for user %s", user.username, new_username, user.id)
            user.username = new_username

    # ── Bio ──────────────────────────────────────────────────
    if body.bio is not None:
        user.bio = body.bio or None  # schema validator already strips; None collapses empty str

    # ── Avatar ───────────────────────────────────────────────
    if body.avatarId is not None:
        user.avatar_id = body.avatarId or None

    # ── Persist ──────────────────────────────────────────────
    try:
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info("Profile updated successfully for user %s", user.id)
    except Exception as exc:
        await db.rollback()
        logger.error("Failed to persist profile update for user %s: %s", user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save profile changes",
        ) from exc

    return UserProfileOut.from_orm(user)


@router.get("/me/privacy", response_model=PrivacySettingsOut)
async def get_my_privacy(user: User = Depends(get_current_user)) -> PrivacySettingsOut:
    return PrivacySettingsOut.from_orm(user)


@router.patch("/me/privacy", response_model=PrivacySettingsOut)
async def update_my_privacy(
    body: PrivacySettingsIn,
    user: User         = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> PrivacySettingsOut:
    if body.hidePicksUntilKickoff is not None:
        user.hide_picks_until_kickoff = body.hidePicksUntilKickoff
    if body.profilePublic is not None:
        user.profile_public = body.profilePublic
    if body.showStats is not None:
        user.show_stats = body.showStats
    if body.showActivity is not None:
        user.show_activity = body.showActivity
    if body.showFavoriteTeam is not None:
        user.show_favorite_team = body.showFavoriteTeam
    if body.allowLeagueInvites is not None:
        user.allow_league_invites = body.allowLeagueInvites

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return PrivacySettingsOut.from_orm(user)


@router.get("/me/stats", response_model=UserStatsOut)
async def my_stats(
    user: User         = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> UserStatsOut:
    rank = await db.scalar(
        select(func.count()).where(User.total_points > user.total_points)
    ) or 0

    total_users = await db.scalar(select(func.count(User.id))) or 1

    return UserStatsOut(
        totalPoints        = user.total_points,
        globalRank         = rank + 1,
        totalUsers         = total_users,
        exactScores        = user.exact_scores,
        correctPredictions = user.correct_predictions,
        totalPredictions   = user.total_predictions,
    )
