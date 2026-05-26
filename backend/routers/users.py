import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.prediction import Prediction
from models.user import User
from schemas.user import LeaderboardEntry, PrivacySettingsIn, PrivacySettingsOut, UserProfileOut, UserStatsOut, UserUpdateIn

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
    if "bio" in body.model_fields_set:
        user.bio = body.bio  # validator already strips and coerces "" → None

    # ── Avatar ───────────────────────────────────────────────
    # Use model_fields_set so avatarId: null explicitly clears the field
    # (vs. the field simply not being present in the request).
    if "avatarId" in body.model_fields_set:
        user.avatar_id = body.avatarId  # validator already coerces "" → None
    if body.clearAvatarUrl:
        user.avatar_url = None

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
    rank, total_users, pred_count = await asyncio.gather(
        db.scalar(select(func.count()).where(
            User.total_points > user.total_points,
            ~User.email.ilike('%@test.wc26'),
            ~User.google_id.ilike('google-test-%'),
        )),
        db.scalar(select(func.count(User.id)).where(
            ~User.email.ilike('%@test.wc26'),
            ~User.google_id.ilike('google-test-%'),
        )),
        db.scalar(select(func.count(Prediction.id)).where(Prediction.user_id == user.id)),
    )

    return UserStatsOut(
        totalPoints        = user.total_points,
        globalRank         = (rank or 0) + 1,
        totalUsers         = total_users or 1,
        exactScores        = user.exact_scores,
        correctPredictions = user.correct_predictions,
        totalPredictions   = pred_count or 0,
    )


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    user: User         = Depends(get_current_user),
    db:   AsyncSession = Depends(get_db),
) -> list[LeaderboardEntry]:
    users = (
        await db.execute(
            select(User)
            .where(
                ~User.email.ilike('%@test.wc26'),
                ~User.google_id.ilike('google-test-%'),
            )
            .order_by(User.total_points.desc(), User.created_at.asc())
        )
    ).scalars().all()

    return [
        LeaderboardEntry(
            rank        = i + 1,
            userId      = u.id,
            username    = u.username,
            avatarId    = u.avatar_id,
            avatarUrl   = u.avatar_url,
            totalPoints = u.total_points,
            isMe        = u.id == user.id,
        )
        for i, u in enumerate(users)
    ]
