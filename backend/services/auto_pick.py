"""
Auto Prediction Safety Net.

Generates automatic predictions for users who have not submitted a prediction
when a match goes live (with a 60-second buffer after scheduled kick-off).

Design invariants:
- Score is deterministic: pool[sha256(match_id) % len(pool)] — same pick every
  time for the same match, stable across restarts/deploys (unlike Python hash()).
- ON CONFLICT DO NOTHING: a concurrent manual submission always wins.
- Auto-picks are scored identically to manual predictions — exact scores earn full points.
- Test accounts (email *@test.wc26, google_id google-test-*) are excluded.
"""
import hashlib
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from models.prediction import Prediction
from models.user import User

log = logging.getLogger(__name__)

# Round-aware score pools. Index = sha256(match_id) % len(pool).
# Scores are realistic and round-appropriate. The same scoreline is assigned to
# all absentees for a given match, so any exact-score luck is shared equally.
ROUND_SCORE_POOLS: dict[str, list[tuple[int, int]]] = {
    "group": [(1, 0), (0, 1), (1, 1), (2, 1), (1, 2)],
    "r32":   [(1, 0), (0, 1), (2, 1), (1, 2)],
    "r16":   [(1, 0), (0, 1), (2, 1), (1, 2)],
    "qf":    [(1, 0), (0, 1), (2, 1), (1, 2)],
    "sf":    [(1, 0), (0, 1), (2, 1), (1, 2)],
    "3rd":   [(2, 1), (1, 2), (2, 0), (0, 2)],
    "final": [(1, 0), (0, 1)],
}
_DEFAULT_POOL: list[tuple[int, int]] = [(1, 0), (0, 1), (1, 1)]


def deterministic_score(match_id: str, round_code: str) -> tuple[int, int]:
    """Return the auto-pick scoreline for this match — stable across calls and restarts."""
    pool = ROUND_SCORE_POOLS.get(round_code, _DEFAULT_POOL)
    # sha256 is stable across process restarts unlike Python's randomised hash().
    idx  = int(hashlib.sha256(match_id.encode()).hexdigest(), 16) % len(pool)
    return pool[idx]


async def generate_auto_picks(
    match_id:   str,
    round_code: str,
    db:         AsyncSession,
) -> int:
    """
    Insert auto-picks for every real user without a prediction for match_id.

    Returns the number of rows actually inserted (0 if everyone already
    has a pick, -1 on a hard error).

    The caller is responsible for:
    - Checking the 60-second buffer before calling.
    - Marking match.auto_picks_generated = True after a successful call.
    """
    predicted_home, predicted_away = deterministic_score(match_id, round_code)

    # Fetch user IDs that have no prediction for this match (excluding test accounts)
    try:
        user_ids_result = await db.execute(
            select(User.id)
            .where(
                ~User.email.ilike('%@test.wc26'),
                ~User.google_id.ilike('google-test-%'),
            )
            .where(
                ~User.id.in_(
                    select(Prediction.user_id)
                    .where(Prediction.match_id == match_id)
                )
            )
        )
        user_ids: list[str] = [row[0] for row in user_ids_result.all()]
    except Exception as exc:
        log.error("[AutoPick] Failed to query users for match=%s: %s", match_id, exc)
        return -1

    if not user_ids:
        log.info("[AutoPick] match=%s — all users have predictions, nothing to do", match_id)
        return 0

    now_utc = datetime.now(timezone.utc)
    inserted_user_ids: list[str] = []

    for user_id in user_ids:
        try:
            result = await db.execute(
                pg_insert(Prediction)
                .values(
                    id             = str(uuid.uuid4()),
                    user_id        = user_id,
                    match_id       = match_id,
                    predicted_home = predicted_home,
                    predicted_away = predicted_away,
                    is_auto_pick   = True,
                    locked_at      = now_utc,
                    created_at     = now_utc,
                    updated_at     = now_utc,
                )
                .on_conflict_do_nothing(constraint="uq_predictions_user_match")
            )
            if result.rowcount > 0:
                inserted_user_ids.append(user_id)
        except Exception as exc:
            log.error(
                "[AutoPick] Insert failed user=%s match=%s: %s",
                user_id, match_id, exc,
            )

    # Increment auto_picks_used counter only for users who actually got a pick
    if inserted_user_ids:
        try:
            await db.execute(
                update(User)
                .where(User.id.in_(inserted_user_ids))
                .values(auto_picks_used=User.auto_picks_used + 1)
                .execution_options(synchronize_session=False)
            )
        except Exception as exc:
            log.error("[AutoPick] Failed to increment auto_picks_used: %s", exc)

    log.info(
        "[AutoPick] match=%s round=%s pick=%d-%d — inserted %d/%d auto-picks",
        match_id, round_code, predicted_home, predicted_away,
        len(inserted_user_ids), len(user_ids),
    )
    return len(inserted_user_ids)
