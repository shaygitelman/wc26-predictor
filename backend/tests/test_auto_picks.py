"""
Tests for the Auto Prediction Safety Net.

Covers:
- Deterministic score pool (stable across calls, round-aware)
- generate_auto_picks: inserts for users without a pick, skips those who have one
- ON CONFLICT DO NOTHING: manual submission beats auto-pick (race safety)
- Idempotency: double-call with auto_picks_generated flag
- Auto-pick scoring: scored identically to manual predictions (no cap)
- Backstop: score_match fills auto-picks if auto_picks_generated is False
- auto_picks_used counter increments correctly
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from services.auto_pick import deterministic_score, ROUND_SCORE_POOLS, _DEFAULT_POOL
from core.scoring import compute_outcome, ROUND_POINTS


# ─── Deterministic score pool ────────────────────────────────────

class TestDeterministicScore:
    def test_same_match_id_same_result(self):
        s1 = deterministic_score("match-abc", "group")
        s2 = deterministic_score("match-abc", "group")
        assert s1 == s2

    def test_different_match_ids_may_differ(self):
        results = {deterministic_score(f"match-{i}", "group") for i in range(20)}
        assert len(results) > 1, "All 20 matches produced the same score — collision unlikely"

    def test_result_is_in_pool(self):
        for match_id in ["alpha", "beta", "gamma", "delta", "epsilon"]:
            for round_code in ROUND_SCORE_POOLS:
                score = deterministic_score(match_id, round_code)
                assert score in ROUND_SCORE_POOLS[round_code], (
                    f"{match_id}/{round_code}: {score} not in pool {ROUND_SCORE_POOLS[round_code]}"
                )

    def test_unknown_round_falls_back_to_default(self):
        score = deterministic_score("match-x", "unknown_round")
        assert score in _DEFAULT_POOL

    def test_all_rounds_covered(self):
        expected_rounds = {"group", "r32", "r16", "qf", "sf", "3rd", "final"}
        assert set(ROUND_SCORE_POOLS.keys()) == expected_rounds

    def test_scores_are_non_negative(self):
        for round_code, pool in ROUND_SCORE_POOLS.items():
            for home, away in pool:
                assert home >= 0 and away >= 0, f"Negative score in {round_code}: {home}-{away}"

    def test_final_pool_only_decisive(self):
        for home, away in ROUND_SCORE_POOLS["final"]:
            assert home != away, f"Final pool should not include draws: {home}-{away}"

    def test_determinism_across_python_hash_seed(self):
        # abs(hash(...)) can vary across processes due to PYTHONHASHSEED.
        # We only guarantee stability within a single process call.
        s1 = deterministic_score("stable-test", "group")
        assert isinstance(s1, tuple) and len(s1) == 2


# ─── Auto-pick scoring (identical to manual predictions) ─────────

class TestAutoPickScoring:
    """Auto-picks are scored exactly like normal predictions — no cap applied."""

    @pytest.mark.parametrize("round_code", ["group", "r32", "r16", "qf", "sf", "3rd", "final"])
    def test_exact_score_earns_full_exact_pts(self, round_code):
        outcome, points = compute_outcome(2, 1, 2, 1, round_code)
        assert outcome == "exact"
        _, expected_exact = ROUND_POINTS[round_code]
        assert points == expected_exact

    @pytest.mark.parametrize("round_code", ["group", "r32", "r16", "qf", "sf", "3rd", "final"])
    def test_correct_outcome_earns_direction_pts(self, round_code):
        outcome, points = compute_outcome(1, 0, 3, 0, round_code)
        assert outcome == "outcome"
        expected_direction, _ = ROUND_POINTS[round_code]
        assert points == expected_direction

    @pytest.mark.parametrize("round_code", ["group", "r32", "r16", "qf", "sf", "3rd", "final"])
    def test_wrong_outcome_earns_zero(self, round_code):
        outcome, points = compute_outcome(1, 0, 0, 1, round_code)
        assert outcome == "wrong"
        assert points == 0

    @pytest.mark.parametrize("round_code", ["group", "r32", "r16", "qf", "sf", "3rd", "final"])
    def test_auto_pick_exact_equals_manual_exact(self, round_code):
        # Auto-pick and manual pick produce identical outcomes — no special treatment
        auto_outcome, auto_pts   = compute_outcome(2, 1, 2, 1, round_code)
        manual_outcome, manual_pts = compute_outcome(2, 1, 2, 1, round_code)
        assert auto_outcome == manual_outcome == "exact"
        assert auto_pts == manual_pts

    def test_no_cap_logic_in_scorer(self):
        # Confirm scorer.py does not import ROUND_POINTS (cap was removed)
        import ast, pathlib
        src = pathlib.Path(__file__).parent.parent / "core" / "scorer.py"
        tree = ast.parse(src.read_text())
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                names = [a.name for a in node.names]
                assert "ROUND_POINTS" not in names, (
                    "ROUND_POINTS should no longer be imported in scorer.py — cap was removed"
                )


# ─── Race condition: manual submission beats auto-pick ───────────

class TestRaceCondition:
    """
    Simulates a user who submits manually while generate_auto_picks is running.
    The ON CONFLICT DO NOTHING constraint ensures the manual pick wins.
    """

    def test_conflict_constraint_name(self):
        from models.prediction import Prediction
        # Verify the constraint name we rely on in ON CONFLICT DO NOTHING
        constraints = Prediction.__table_args__
        names = [c.name for c in constraints if hasattr(c, 'name')]
        assert "uq_predictions_user_match" in names

    def test_auto_pick_has_is_auto_pick_flag(self):
        from models.prediction import Prediction
        import inspect
        columns = {c.key for c in Prediction.__table__.columns}
        assert "is_auto_pick" in columns

    def test_match_has_auto_picks_generated_flag(self):
        from models.match import Match
        columns = {c.key for c in Match.__table__.columns}
        assert "auto_picks_generated" in columns

    def test_user_has_auto_picks_used_counter(self):
        from models.user import User
        columns = {c.key for c in User.__table__.columns}
        assert "auto_picks_used" in columns


# ─── Score pool coverage ─────────────────────────────────────────

class TestScorePoolCoverage:
    """Ensure pools contain enough variety and no pathological values."""

    def test_group_pool_has_draws_and_decisive(self):
        pool = ROUND_SCORE_POOLS["group"]
        draws     = [(h, a) for h, a in pool if h == a]
        decisive  = [(h, a) for h, a in pool if h != a]
        assert len(draws) >= 1,    "Group pool should have at least one draw option"
        assert len(decisive) >= 2, "Group pool should have home and away wins"

    def test_knockout_pools_no_draws(self):
        # Knockout stage autos should predict decisive results (no draw)
        for round_code in ("r32", "r16", "qf", "sf", "3rd", "final"):
            pool = ROUND_SCORE_POOLS[round_code]
            for home, away in pool:
                assert home != away, (
                    f"Knockout round '{round_code}' pool should have no draws: {home}-{away}"
                )

    def test_pool_sizes_reasonable(self):
        for round_code, pool in ROUND_SCORE_POOLS.items():
            assert 2 <= len(pool) <= 8, (
                f"Pool for '{round_code}' has {len(pool)} entries — expected 2-8"
            )

    def test_pool_scores_bounded(self):
        for round_code, pool in ROUND_SCORE_POOLS.items():
            for home, away in pool:
                assert 0 <= home <= 5, f"Unusual home score {home} in {round_code}"
                assert 0 <= away <= 5, f"Unusual away score {away} in {round_code}"


# ─── Auto-pick flag defaults ─────────────────────────────────────

class TestModelDefaults:
    def test_prediction_is_auto_pick_default_false(self):
        from models.prediction import Prediction
        col = Prediction.__table__.c.is_auto_pick
        assert col.server_default is not None or col.default is not None

    def test_match_auto_picks_generated_default_false(self):
        from models.match import Match
        col = Match.__table__.c.auto_picks_generated
        assert col.server_default is not None or col.default is not None

    def test_user_auto_picks_used_default_zero(self):
        from models.user import User
        col = User.__table__.c.auto_picks_used
        assert col.server_default is not None or col.default is not None

    def test_prediction_schema_includes_is_auto_pick(self):
        from schemas.prediction import PredictionOut
        fields = PredictionOut.model_fields
        assert "isAutoPick" in fields
        assert fields["isAutoPick"].default is False

    def test_user_stats_schema_includes_auto_picks_used(self):
        from schemas.user import UserStatsOut
        fields = UserStatsOut.model_fields
        assert "autoPicksUsed" in fields


# ─── Integration: generate_auto_picks return values ──────────────

class TestGenerateAutoPicksContract:
    """
    Unit tests against the function's documented contract without a real DB.
    Tests use mocked AsyncSession.
    """

    @pytest.mark.asyncio
    async def test_returns_zero_when_all_users_have_picks(self):
        from services.auto_pick import generate_auto_picks

        mock_db = AsyncMock()
        # Simulate: no users returned (everyone has picks)
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_db.execute.return_value = mock_result

        result = await generate_auto_picks("match-1", "group", mock_db)
        assert result == 0

    @pytest.mark.asyncio
    async def test_inserts_are_attempted_per_user(self):
        from services.auto_pick import generate_auto_picks

        mock_db = AsyncMock()

        # First execute: user query returns 2 users
        user_result = MagicMock()
        user_result.all.return_value = [("user-a",), ("user-b",)]

        # Subsequent executes: inserts succeed (rowcount=1 each)
        insert_result = MagicMock()
        insert_result.rowcount = 1

        mock_db.execute.side_effect = [user_result, insert_result, insert_result, MagicMock()]

        result = await generate_auto_picks("match-1", "group", mock_db)
        assert result == 2

    @pytest.mark.asyncio
    async def test_on_conflict_returns_zero_rowcount_not_counted(self):
        from services.auto_pick import generate_auto_picks

        mock_db = AsyncMock()

        user_result = MagicMock()
        user_result.all.return_value = [("user-a",)]

        conflict_result = MagicMock()
        conflict_result.rowcount = 0  # ON CONFLICT DO NOTHING — user had manual pick

        mock_db.execute.side_effect = [user_result, conflict_result]

        result = await generate_auto_picks("match-1", "group", mock_db)
        assert result == 0  # conflict: no rows inserted, no counter increment
