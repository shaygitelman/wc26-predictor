import logging
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import create_access_token
from models.league import League, LeagueMember
from models.user import User
from schemas.auth import AuthResponse, GoogleAuthRequest, UserOut

log = logging.getLogger(__name__)

_DEFAULT_LEAGUE_ID = '00000000-0000-0000-0000-000000000001'

router = APIRouter(prefix="/auth", tags=["auth"])


def _derive_username(email: str) -> str:
    prefix = re.sub(r"[^a-z0-9]", "_", email.split("@")[0].lower())
    return re.sub(r"_+", "_", prefix).strip("_")[:24]


async def _unique_username(base: str, db: AsyncSession) -> str:
    """Return base if available, otherwise base_2, base_3, …"""
    username = base
    counter = 2
    while True:
        exists = await db.scalar(select(User.id).where(User.username == username))
        if not exists:
            return username
        username = f"{base}_{counter}"
        counter += 1


@router.post("/google", response_model=AuthResponse)
async def google_auth(
    payload: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """
    Receives verified Google user info from the Next.js Route Handler.
    Finds or creates the user in PostgreSQL, then returns a signed JWT.
    The JWT is stored directly as the browser session cookie — no dual-token overhead.
    """
    user = await db.scalar(select(User).where(User.google_id == payload.google_id))

    if user is None:
        # ── New user ─────────────────────────────────────────────
        base = _derive_username(payload.email)
        username = await _unique_username(base, db)

        user = User(
            google_id=payload.google_id,
            email=payload.email,
            username=username,
            name=payload.name,
            avatar_url=payload.avatar_url,
        )
        db.add(user)
        await db.flush()  # get user.id before creating league membership

        # Auto-join the global default league
        try:
            already = await db.scalar(
                select(LeagueMember).where(
                    LeagueMember.league_id == _DEFAULT_LEAGUE_ID,
                    LeagueMember.user_id   == user.id,
                )
            )
            if not already:
                db.add(LeagueMember(league_id=_DEFAULT_LEAGUE_ID, user_id=user.id, total_points=0))
        except Exception as exc:
            log.warning("Could not auto-join default league for new user: %s", exc)
    else:
        # ── Returning user — refresh mutable fields ───────────────
        if payload.name:
            user.name = payload.name
        if payload.avatar_url:
            user.avatar_url = payload.avatar_url

    user.update_last_login()
    await db.commit()
    await db.refresh(user)

    # Include name + picture so the session JWT is self-contained
    # (Next.js proxy/middleware can read user info without a DB round-trip)
    token = create_access_token({
        "sub":                  user.id,
        "email":                user.email,
        "username":             user.username,
        "name":                 user.name,
        "picture":              user.avatar_url,
        "onboarding_completed": user.onboarding_completed,
    })

    return AuthResponse(user=UserOut.model_validate(user), access_token=token)
