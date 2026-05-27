"""
Tournament Picks Lock Service.

The lock is TIME-BASED, derived from the earliest match scheduled_at in the
database. No admin action is needed — picks become read-only the instant
UTC wall-clock time reaches the first match kickoff.

Lock rules (either condition makes the pick locked):
  1. datetime.now(UTC) >= first_match_scheduled_at   ← automatic, time-based
  2. TournamentPick.is_locked == True                 ← manual admin override

Caching strategy:
  - Before lock: re-query every call so admin sync updates are picked up.
  - After lock:  cache forever — lock time never changes once the tournament
                 has started.

Fallback: if the matches table is empty or unreachable, LOCK_TIME_FALLBACK
is used so the system is never in an indeterminate state.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.match import Match

log = logging.getLogger(__name__)

# Safety-net: June 11 2026 at 22:00 UTC ≈ first WC2026 match kickoff.
# Only used when the matches table is empty or unreachable.
LOCK_TIME_FALLBACK = datetime(2026, 6, 11, 22, 0, 0, tzinfo=timezone.utc)

# In-process cache — set permanently once tournament is locked.
_cached_lock_time: datetime | None = None


async def get_lock_time(db: AsyncSession) -> datetime:
    """Return the first match scheduled_at — the tournament lock time.

    Re-queries before lock so admin-synced match times are always current.
    Caches permanently once we are past the lock time (it cannot decrease).
    """
    global _cached_lock_time

    # If already locked and cached, return immediately — no DB round-trip.
    if _cached_lock_time is not None and datetime.now(timezone.utc) >= _cached_lock_time:
        return _cached_lock_time

    try:
        earliest = await db.scalar(select(func.min(Match.scheduled_at)))
        if earliest is not None:
            if earliest.tzinfo is None:
                earliest = earliest.replace(tzinfo=timezone.utc)
            _cached_lock_time = earliest
            return _cached_lock_time
    except Exception as exc:
        log.warning("[TournamentLock] DB query failed, using fallback: %s", exc)

    log.warning("[TournamentLock] using LOCK_TIME_FALLBACK=%s", LOCK_TIME_FALLBACK.isoformat())
    return LOCK_TIME_FALLBACK


async def is_tournament_locked(db: AsyncSession) -> bool:
    """Return True if UTC now >= first match kickoff."""
    lock_time = await get_lock_time(db)
    return datetime.now(timezone.utc) >= lock_time


def reset_cache() -> None:
    """Reset the in-process cache. Only needed in tests."""
    global _cached_lock_time
    _cached_lock_time = None
