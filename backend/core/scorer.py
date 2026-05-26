"""
Scoring engine: called once when a match result is finalized.

Single transaction: score predictions → recompute user totals →
sync league_members.total_points → re-rank every affected league.
All updates are bulk SQL — no per-row round trips.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.scoring import ROUND_POINTS, compute_outcome
from models.league import LeagueMember
from models.match import Match
from models.prediction import Prediction
from models.user import User

log = logging.getLogger(__name__)


async def score_match(
    match_id: str,
    home_score: int,
    away_score: int,
    db: AsyncSession,
) -> Match:
    match = await db.get(Match, match_id)
    if not match:
        raise ValueError(f"Match {match_id} not found")

    # ── Backstop: fill auto-picks for any user who missed the live trigger ──
    # Only fires if auto_picks were never generated (flag is False), which
    # means the match went from scheduled → finished without going through live.
    if not match.auto_picks_generated:
        try:
            from services.auto_pick import generate_auto_picks
            n = await generate_auto_picks(match.id, match.round, db)
            log.info("[Scorer] BACKSTOP match=%s — inserted %d auto-picks", match.id, n)
            # Mark generated so we don't retry on re-score
            match.auto_picks_generated = True
        except Exception as backstop_exc:
            log.warning(
                "[Scorer] BACKSTOP FAIL match=%s: %s — continuing with scoring",
                match.id, backstop_exc,
            )

    # ── Idempotency guard ─────────────────────────────────────────
    # If the match was already scored with the same result, return early.
    # If it was scored with a different result, allow the re-score (admin
    # correction path) but log a warning so it's visible in production logs.
    if match.status == "finished":
        if match.home_score == home_score and match.away_score == away_score:
            log.info(
                "[Scorer] SKIP match=%s — already finished %d-%d (same score)",
                match_id, home_score, away_score,
            )
            return match
        log.warning(
            "[Scorer] RE-SCORE match=%s — was %s-%s, now %d-%d (admin correction)",
            match_id, match.home_score, match.away_score, home_score, away_score,
        )

    log.info(
        "[Scorer] START match=%s round=%s score=%d-%d",
        match_id, match.round, home_score, away_score,
    )

    # ── 1. Finalise match ─────────────────────────────────────────
    match.home_score = home_score
    match.away_score = away_score
    match.status = "finished"

    # ── 2. Load + score all predictions for this match ────────────
    preds_result = await db.execute(
        select(Prediction).where(Prediction.match_id == match_id)
    )
    predictions = preds_result.scalars().all()

    if not predictions:
        await db.commit()
        await db.refresh(match)
        return match

    now_utc = datetime.now(timezone.utc)
    affected_user_ids: list[str] = []
    for pred in predictions:
        outcome, points = compute_outcome(
            pred.predicted_home, pred.predicted_away,
            home_score, away_score,
            match.round,
        )
        # Auto-picks cannot earn "exact" points — cap at direction pts ("outcome")
        if pred.is_auto_pick and outcome == "exact":
            direction_pts, _ = ROUND_POINTS.get(match.round, ROUND_POINTS["group"])
            outcome = "outcome"
            points  = direction_pts
        pred.outcome = outcome
        pred.points_earned = points
        if pred.locked_at is None:
            pred.locked_at = now_utc
        affected_user_ids.append(pred.user_id)

    affected_user_ids = list(set(affected_user_ids))
    await db.flush()  # write prediction rows before aggregating

    # ── 3. Recompute user stats from ALL their predictions ─────────
    # Single UPDATE ... FROM (SELECT agg ...) — one round-trip.
    agg = (
        select(
            Prediction.user_id.label("uid"),
            func.coalesce(func.sum(Prediction.points_earned), 0).label("total_pts"),
            func.count(Prediction.id)
                .filter(Prediction.outcome == "exact").label("exact_cnt"),
            func.count(Prediction.id)
                .filter(Prediction.outcome.in_(["exact", "outcome", "difference"])).label("correct_cnt"),
            func.count(Prediction.id).label("pred_cnt"),
        )
        .where(Prediction.user_id.in_(affected_user_ids))
        .group_by(Prediction.user_id)
        .subquery("agg")
    )

    await db.execute(
        update(User)
        .where(User.id == agg.c.uid)
        .values(
            total_points        = agg.c.total_pts,
            exact_scores        = agg.c.exact_cnt,
            correct_predictions = agg.c.correct_cnt,
            total_predictions   = agg.c.pred_cnt,
        )
        .execution_options(synchronize_session=False)
    )

    # ── 4. Sync league_members.total_points from users ────────────
    # Correlated subquery — PostgreSQL resolves it efficiently.
    await db.execute(
        update(LeagueMember)
        .where(LeagueMember.user_id.in_(affected_user_ids))
        .values(
            total_points=(
                select(User.total_points)
                .where(User.id == LeagueMember.user_id)
                .scalar_subquery()
            )
        )
        .execution_options(synchronize_session=False)
    )

    # ── 5. Re-rank every league that has at least one affected user ─
    league_ids_result = await db.execute(
        select(LeagueMember.league_id)
        .distinct()
        .where(LeagueMember.user_id.in_(affected_user_ids))
    )
    affected_league_ids = [lid for (lid,) in league_ids_result.all()]
    for league_id in affected_league_ids:
        await _rerank_league(league_id, db)

    await db.commit()
    await db.refresh(match)

    log.info(
        "[Scorer] DONE match=%s — scored %d predictions across %d users, "
        "re-ranked %d leagues",
        match_id, len(predictions), len(affected_user_ids), len(affected_league_ids),
    )
    return match


async def _rerank_league(league_id: str, db: AsyncSession) -> None:
    """
    Assign sequential rank to all members of a league, ordered by
    total_points DESC then joined_at ASC (earlier join wins ties).
    ROW_NUMBER produces 1,2,3,… (no gaps on ties — consistent with
    what the standings endpoint shows via enumerate()).
    """
    await db.execute(
        text("""
            UPDATE league_members lm
            SET    rank = ranked.rk
            FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           ORDER BY total_points DESC, joined_at ASC
                       ) AS rk
                FROM   league_members
                WHERE  league_id = :league_id
            ) ranked
            WHERE lm.id = ranked.id
        """),
        {"league_id": league_id},
    )
