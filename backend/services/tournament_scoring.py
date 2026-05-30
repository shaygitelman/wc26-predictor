"""
Tournament Pick Scoring Service.

Scores tournament winner and Golden Boot (top scorer) picks after the
World Cup ends. Designed with the same guarantees as match scoring:

  Idempotency   — running N times produces the same final state as running once.
  Correction    — changing winner from ARG → BRA reverses old awards and
                  applies new ones atomically; no orphaned points.
  Auditability  — every apply() call writes an immutable TournamentScoringRun row.
  Atomicity     — all point deltas, pick updates, and league re-rankings happen
                  inside a single db.commit().

Design: delta-based idempotency
  Each TournamentPick row carries winner_points_awarded and scorer_points_awarded
  (NULL = never scored, 0 = scored-wrong, 12 = scored-correct).
  On every apply() call:
    new_winner_pts  = TOURNAMENT_WINNER_PTS  if pick matches actual winner else 0
    delta_winner    = new_winner_pts - (pick.winner_points_awarded or 0)
    apply delta to user.total_points
    write new_winner_pts back to pick.winner_points_awarded
  Same logic for scorer pts.
  When delta == 0, the user is untouched — idempotent for unchanged results,
  and correct for corrections (negative delta subtracts old pts, positive adds new).
"""
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.scoring import TOURNAMENT_SCORER_PTS, TOURNAMENT_WINNER_PTS
from models.league import LeagueMember
from models.tournament_pick import TournamentPick
from models.tournament_result import TournamentResult
from models.tournament_scoring_run import TournamentScoringRun
from models.user import User

log = logging.getLogger(__name__)


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class UserScoringPreview:
    user_id:             str
    winner_pick:         str | None
    scorer_pick:         str | None
    winner_pts_current:  int          # what is currently in the DB
    scorer_pts_current:  int
    winner_pts_new:      int          # what would be written
    scorer_pts_new:      int
    winner_delta:        int          # net change to user.total_points
    scorer_delta:        int

    @property
    def total_delta(self) -> int:
        return self.winner_delta + self.scorer_delta


@dataclass
class ScoringPreview:
    actual_winner_code: str | None
    actual_scorer_id:   str | None
    users:              list[UserScoringPreview] = field(default_factory=list)
    is_first_run:       bool = True   # False if any pick has been scored before

    @property
    def users_affected_winner(self) -> int:
        return sum(1 for u in self.users if u.winner_delta != 0)

    @property
    def users_affected_scorer(self) -> int:
        return sum(1 for u in self.users if u.scorer_delta != 0)

    @property
    def winner_pts_total_delta(self) -> int:
        return sum(u.winner_delta for u in self.users)

    @property
    def scorer_pts_total_delta(self) -> int:
        return sum(u.scorer_delta for u in self.users)

    @property
    def users_winning_winner(self) -> int:
        return sum(1 for u in self.users if u.winner_pts_new == TOURNAMENT_WINNER_PTS)

    @property
    def users_winning_scorer(self) -> int:
        return sum(1 for u in self.users if u.scorer_pts_new == TOURNAMENT_SCORER_PTS)


@dataclass
class ScoringResult:
    run_id:                 str
    run_at:                 datetime
    actual_winner_code:     str | None
    actual_scorer_id:       str | None
    winner_pts_delta:       int
    scorer_pts_delta:       int
    users_affected_winner:  int
    users_affected_scorer:  int
    is_correction:          bool
    leagues_reranked:       int


# ── Internal helpers ──────────────────────────────────────────────────────────

def _compute_winner_pts(pick: TournamentPick, actual_winner_code: str | None) -> int:
    """Return 0 or TOURNAMENT_WINNER_PTS based on pick vs. actual."""
    if not actual_winner_code or not pick.winner_team_code:
        return 0
    return TOURNAMENT_WINNER_PTS if pick.winner_team_code == actual_winner_code.lower() else 0


def _compute_scorer_pts(pick: TournamentPick, actual_scorer_id: str | None) -> int:
    """Return 0 or TOURNAMENT_SCORER_PTS based on pick vs. actual."""
    if not actual_scorer_id or not pick.top_scorer_id:
        return 0
    return TOURNAMENT_SCORER_PTS if pick.top_scorer_id == actual_scorer_id else 0


async def _load_all_picks(db: AsyncSession) -> list[TournamentPick]:
    result = await db.execute(select(TournamentPick))
    return list(result.scalars().all())


async def _rerank_league(league_id: str, db: AsyncSession) -> None:
    """Same 4-tier ROW_NUMBER rerank as core/scorer.py._rerank_league()."""
    await db.execute(
        text("""
            UPDATE league_members lm
            SET    rank = ranked.rk
            FROM (
                SELECT lm2.id,
                       ROW_NUMBER() OVER (
                           ORDER BY
                               lm2.total_points      DESC,
                               u.exact_scores        DESC,
                               u.correct_predictions DESC,
                               lm2.joined_at         ASC
                       ) AS rk
                FROM   league_members lm2
                JOIN   users u ON u.id = lm2.user_id
                WHERE  lm2.league_id = :league_id
            ) ranked
            WHERE lm.id = ranked.id
        """),
        {"league_id": league_id},
    )


# ── Public API ────────────────────────────────────────────────────────────────

async def get_current_result(db: AsyncSession) -> TournamentResult | None:
    """Return the most-recent official result, or None if never set."""
    return await db.scalar(
        select(TournamentResult).order_by(TournamentResult.set_at.desc()).limit(1)
    )


async def set_official_result(
    winner_team_code: str | None,
    top_scorer_id:    str | None,
    db:               AsyncSession,
    set_by:           str | None = None,
    notes:            str | None = None,
) -> TournamentResult:
    """
    Record the official tournament result (winner + Golden Boot).

    Does NOT trigger scoring — call apply_tournament_scoring() separately.
    Inserting a new row (rather than updating) preserves the full history.
    """
    result = TournamentResult(
        id               = str(uuid.uuid4()),
        winner_team_code = (winner_team_code or "").lower() or None,
        top_scorer_id    = top_scorer_id or None,
        set_at           = datetime.now(timezone.utc),
        set_by           = set_by,
        notes            = notes,
    )
    db.add(result)
    await db.commit()
    await db.refresh(result)
    log.info(
        "[TournamentScoring] result set: winner=%r scorer=%r by=%r",
        result.winner_team_code, result.top_scorer_id, set_by,
    )
    return result


async def preview_tournament_scoring(
    winner_team_code: str | None,
    top_scorer_id:    str | None,
    db:               AsyncSession,
) -> ScoringPreview:
    """
    Compute what apply_tournament_scoring() WOULD do — no writes.

    Returns per-user deltas so the admin can review before committing.
    """
    actual_winner = (winner_team_code or "").lower() or None
    actual_scorer = top_scorer_id or None

    picks        = await _load_all_picks(db)
    is_first_run = all(p.winner_points_awarded is None and p.scorer_points_awarded is None for p in picks)

    user_previews: list[UserScoringPreview] = []
    for pick in picks:
        w_current = pick.winner_points_awarded if pick.winner_points_awarded is not None else 0
        s_current = pick.scorer_points_awarded  if pick.scorer_points_awarded  is not None else 0
        w_new     = _compute_winner_pts(pick, actual_winner)
        s_new     = _compute_scorer_pts(pick, actual_scorer)
        user_previews.append(UserScoringPreview(
            user_id            = pick.user_id,
            winner_pick        = pick.winner_team_code,
            scorer_pick        = pick.top_scorer_id,
            winner_pts_current = w_current,
            scorer_pts_current = s_current,
            winner_pts_new     = w_new,
            scorer_pts_new     = s_new,
            winner_delta       = w_new - w_current,
            scorer_delta       = s_new - s_current,
        ))

    return ScoringPreview(
        actual_winner_code = actual_winner,
        actual_scorer_id   = actual_scorer,
        users              = user_previews,
        is_first_run       = is_first_run,
    )


async def apply_tournament_scoring(
    winner_team_code: str | None,
    top_scorer_id:    str | None,
    db:               AsyncSession,
    notes:            str | None = None,
) -> ScoringResult:
    """
    Apply (or re-apply) tournament scoring atomically.

    Algorithm:
      1. Load all TournamentPick rows.
      2. For each pick, compute delta = new_pts - currently_awarded_pts.
      3. Accumulate per-user net delta (winner_delta + scorer_delta).
      4. Bulk-UPDATE users.total_points += net_delta WHERE delta != 0.
      5. Sync league_members.total_points from users.
      6. Re-rank all affected leagues.
      7. Write new awarded pts back to each pick.
      8. Insert a TournamentScoringRun audit row.
      9. db.commit().

    Idempotency: if winner/scorer unchanged → all deltas = 0 → no-op.
    Correction:  if winner changed ARG→BRA → ARG picks get delta=-12,
                 BRA picks get delta=+12. All others: 0.
    """
    actual_winner = (winner_team_code or "").lower() or None
    actual_scorer = top_scorer_id or None

    picks = await _load_all_picks(db)

    # Determine if this is a correction (any pick already has awarded pts from a prior run)
    is_correction = any(
        p.winner_points_awarded is not None or p.scorer_points_awarded is not None
        for p in picks
    )

    # ── Per-pick deltas ───────────────────────────────────────────────────────
    # user_id → net delta to add to total_points
    net_deltas:         dict[str, int] = {}
    winner_pts_delta_total = 0
    scorer_pts_delta_total  = 0
    users_affected_winner  = 0
    users_affected_scorer  = 0

    for pick in picks:
        w_old = pick.winner_points_awarded if pick.winner_points_awarded is not None else 0
        s_old = pick.scorer_points_awarded  if pick.scorer_points_awarded  is not None else 0
        w_new = _compute_winner_pts(pick, actual_winner)
        s_new = _compute_scorer_pts(pick, actual_scorer)

        w_delta = w_new - w_old
        s_delta = s_new - s_old

        if w_delta != 0:
            users_affected_winner  += 1
            winner_pts_delta_total += w_delta
        if s_delta != 0:
            users_affected_scorer  += 1
            scorer_pts_delta_total += s_delta

        net = w_delta + s_delta
        if net != 0:
            net_deltas[pick.user_id] = net_deltas.get(pick.user_id, 0) + net

        # Stage pick update (committed at end of transaction)
        pick.winner_points_awarded = w_new
        pick.scorer_points_awarded  = s_new

    log.info(
        "[TournamentScoring] APPLY winner=%r scorer=%r correction=%s "
        "users_w=%d users_s=%d w_delta=%d s_delta=%d",
        actual_winner, actual_scorer, is_correction,
        users_affected_winner, users_affected_scorer,
        winner_pts_delta_total, scorer_pts_delta_total,
    )

    # ── 4. Bulk-UPDATE users.total_points ─────────────────────────────────────
    if net_deltas:
        # Build VALUES list for a single UPDATE … FROM (VALUES …) statement
        values_sql = ", ".join(
            f"('{uid}'::text, {delta}::int)"
            for uid, delta in net_deltas.items()
        )
        await db.execute(text(f"""
            UPDATE users u
            SET    total_points = u.total_points + v.delta
            FROM   (VALUES {values_sql}) AS v(uid, delta)
            WHERE  u.id = v.uid
        """))

        # ── 5. Sync league_members.total_points ───────────────────────────────
        affected_user_ids = list(net_deltas.keys())
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

        # ── 6. Re-rank all affected leagues ───────────────────────────────────
        league_ids_result = await db.execute(
            select(LeagueMember.league_id)
            .distinct()
            .where(LeagueMember.user_id.in_(affected_user_ids))
        )
        affected_league_ids = [lid for (lid,) in league_ids_result.all()]
        for lid in affected_league_ids:
            await _rerank_league(lid, db)
    else:
        affected_league_ids = []

    # ── 8. Audit row ──────────────────────────────────────────────────────────
    run = TournamentScoringRun(
        id                    = str(uuid.uuid4()),
        run_at                = datetime.now(timezone.utc),
        winner_team_code      = actual_winner,
        top_scorer_id         = actual_scorer,
        winner_pts_delta      = winner_pts_delta_total,
        scorer_pts_delta      = scorer_pts_delta_total,
        users_affected_winner = users_affected_winner,
        users_affected_scorer = users_affected_scorer,
        is_correction         = is_correction,
        notes                 = notes,
    )
    db.add(run)

    # ── 9. Commit everything atomically ───────────────────────────────────────
    await db.commit()
    await db.refresh(run)

    log.info(
        "[TournamentScoring] DONE run=%s leagues_reranked=%d",
        run.id, len(affected_league_ids),
    )

    return ScoringResult(
        run_id                = run.id,
        run_at                = run.run_at,
        actual_winner_code    = actual_winner,
        actual_scorer_id      = actual_scorer,
        winner_pts_delta      = winner_pts_delta_total,
        scorer_pts_delta      = scorer_pts_delta_total,
        users_affected_winner = users_affected_winner,
        users_affected_scorer = users_affected_scorer,
        is_correction         = is_correction,
        leagues_reranked      = len(affected_league_ids),
    )


async def rebuild_tournament_standings(db: AsyncSession) -> ScoringResult:
    """
    Rebuild tournament scoring from the most-recent official result.

    Equivalent to: get current result → apply it. Useful after a manual
    database correction or for disaster recovery. Raises ValueError if no
    official result has been recorded yet.
    """
    current = await get_current_result(db)
    if current is None:
        raise ValueError("No official tournament result found — call set_official_result() first")

    log.info(
        "[TournamentScoring] REBUILD from stored result: winner=%r scorer=%r set_at=%s",
        current.winner_team_code, current.top_scorer_id, current.set_at.isoformat(),
    )
    return await apply_tournament_scoring(
        winner_team_code = current.winner_team_code,
        top_scorer_id    = current.top_scorer_id,
        db               = db,
        notes            = f"rebuild from result id={current.id} set_at={current.set_at.isoformat()}",
    )


async def list_scoring_runs(
    db: AsyncSession,
    limit: int = 50,
) -> list[TournamentScoringRun]:
    """Return the N most-recent scoring run audit records."""
    result = await db.execute(
        select(TournamentScoringRun)
        .order_by(TournamentScoringRun.run_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
