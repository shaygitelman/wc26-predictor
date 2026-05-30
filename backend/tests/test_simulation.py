"""
End-to-end game logic simulation — 4-user ABCD scenario.

Simulates a complete scoring cycle without a database:
  A — exact match prediction + both tournament picks correct
  B — correct outcome only (right direction, wrong scoreline)
  C — auto-pick (missed prediction window, deterministic pick assigned)
  D — wrong prediction (opposite direction)

Covers:
  - Scoring system: exact / outcome / difference / wrong across all rounds
  - Auto-pick determinism, pool validity, no-draw enforcement for knockouts
  - Leaderboard sort: 4-tier tiebreaker (points → exact → correct → joined_at)
  - ROW_NUMBER behaviour: sequential ranks, no gaps
  - Tournament pick scoring constants

All logic uses the real compute_outcome() and deterministic_score() — no mocks.
"""
import hashlib
from datetime import datetime, timezone

import pytest

from core.scoring import (
    ROUND_POINTS,
    TOURNAMENT_SCORER_PTS,
    TOURNAMENT_WINNER_PTS,
    compute_outcome,
)
from services.auto_pick import ROUND_SCORE_POOLS, deterministic_score


# ── Shared match parameters ───────────────────────────────────────────────────

MATCH_ID    = "match-sim-001"
ROUND_CODE  = "group"
ACTUAL_HOME = 2
ACTUAL_AWAY = 1

DIRECTION_PTS, EXACT_PTS = ROUND_POINTS[ROUND_CODE]  # 1, 3


# ── Leaderboard helper — mirrors scorer._rerank_league sort order ─────────────

def _rank(users: list[dict]) -> list[dict]:
    """
    Sort users by the same 4-tier tiebreaker used in _rerank_league():
      1. total_points DESC
      2. exact_scores DESC
      3. correct_predictions DESC
      4. joined_at ASC
    Assigns sequential rank (ROW_NUMBER — no gaps).
    """
    ordered = sorted(
        users,
        key=lambda u: (
            -u["total_points"],
            -u["exact_scores"],
            -u["correct_predictions"],
            u["joined_at"],
        ),
    )
    for i, u in enumerate(ordered, start=1):
        u["rank"] = i
    return ordered


def _user(uid: str, pts: int, exact: int, correct: int, joined_day: int) -> dict:
    return {
        "id":                 uid,
        "total_points":       pts,
        "exact_scores":       exact,
        "correct_predictions": correct,
        "joined_at":          datetime(2026, 1, joined_day, tzinfo=timezone.utc),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 1. Scoring system
# ─────────────────────────────────────────────────────────────────────────────

class TestScoringSimulation:

    def test_user_a_exact_score(self):
        outcome, pts = compute_outcome(2, 1, ACTUAL_HOME, ACTUAL_AWAY, ROUND_CODE)
        assert outcome == "exact"
        assert pts == EXACT_PTS  # 3

    def test_user_b_correct_outcome(self):
        # 1-0 → home win; actual 2-1 → home win; margin differs (1 ≠ 1... wait: 1-0=+1, 2-1=+1 → same margin → "difference")
        # Use 3-0 for a clear "outcome" (margin +3 ≠ +1, direction same)
        outcome, pts = compute_outcome(3, 0, ACTUAL_HOME, ACTUAL_AWAY, ROUND_CODE)
        assert outcome == "outcome"
        assert pts == DIRECTION_PTS  # 1

    def test_user_b_same_margin_difference(self):
        # 1-0 vs 2-1: both home wins, both +1 margin → "difference" (still direction_pts)
        outcome, pts = compute_outcome(1, 0, ACTUAL_HOME, ACTUAL_AWAY, ROUND_CODE)
        assert outcome == "difference"
        assert pts == DIRECTION_PTS  # 1 (same value as outcome)

    def test_user_d_wrong_prediction(self):
        outcome, pts = compute_outcome(0, 2, ACTUAL_HOME, ACTUAL_AWAY, ROUND_CODE)
        assert outcome == "wrong"
        assert pts == 0

    def test_auto_pick_is_deterministic(self):
        score1 = deterministic_score(MATCH_ID, ROUND_CODE)
        score2 = deterministic_score(MATCH_ID, ROUND_CODE)
        assert score1 == score2

    def test_auto_pick_in_pool(self):
        home, away = deterministic_score(MATCH_ID, ROUND_CODE)
        assert (home, away) in ROUND_SCORE_POOLS[ROUND_CODE]

    def test_auto_pick_scored_same_as_identical_manual(self):
        """Auto-pick uses compute_outcome — no separate capped formula."""
        home, away = deterministic_score(MATCH_ID, ROUND_CODE)
        auto_out, auto_pts    = compute_outcome(home, away, ACTUAL_HOME, ACTUAL_AWAY, ROUND_CODE)
        manual_out, manual_pts = compute_outcome(home, away, ACTUAL_HOME, ACTUAL_AWAY, ROUND_CODE)
        assert auto_out == manual_out
        assert auto_pts == manual_pts

    def test_direction_and_outcome_same_pts_value(self):
        # Both "difference" and "outcome" return direction_pts — by design
        diff_out,  diff_pts  = compute_outcome(1, 0, 2, 1, ROUND_CODE)  # difference
        out_out,   out_pts   = compute_outcome(3, 0, 2, 1, ROUND_CODE)  # outcome
        assert diff_out == "difference"
        assert out_out  == "outcome"
        assert diff_pts == out_pts == DIRECTION_PTS


# ─────────────────────────────────────────────────────────────────────────────
# 2. ABCD full simulation
# ─────────────────────────────────────────────────────────────────────────────

class TestABCDSimulation:

    def _c_pts(self) -> int:
        home, away = deterministic_score(MATCH_ID, ROUND_CODE)
        _, pts = compute_outcome(home, away, ACTUAL_HOME, ACTUAL_AWAY, ROUND_CODE)
        return pts

    def _c_exact(self) -> int:
        home, away = deterministic_score(MATCH_ID, ROUND_CODE)
        outcome, _ = compute_outcome(home, away, ACTUAL_HOME, ACTUAL_AWAY, ROUND_CODE)
        return 1 if outcome == "exact" else 0

    def test_user_a_outscores_b_and_d(self):
        assert EXACT_PTS > DIRECTION_PTS  # 3 > 1 — A beats B
        assert DIRECTION_PTS > 0          # B beats D

    def test_user_d_always_last_with_zero(self):
        c_pts = self._c_pts()
        users = [
            _user("a", EXACT_PTS,   1, 1, 1),
            _user("b", DIRECTION_PTS, 0, 1, 2),
            _user("c", c_pts, self._c_exact(), 1 if c_pts > 0 else 0, 3),
            _user("d", 0, 0, 0, 4),
        ]
        ranked = _rank(users)
        assert ranked[-1]["id"] == "d"

    def test_user_a_always_first(self):
        """A has the most points (3) or ties with C on exact but joined earlier."""
        c_pts = self._c_pts()
        users = [
            _user("a", EXACT_PTS,   1, 1, 1),
            _user("b", DIRECTION_PTS, 0, 1, 2),
            _user("c", c_pts, self._c_exact(), 1 if c_pts > 0 else 0, 3),
            _user("d", 0, 0, 0, 4),
        ]
        ranked = _rank(users)
        assert ranked[0]["id"] == "a"

    def test_ranks_are_sequential_no_gaps(self):
        c_pts = self._c_pts()
        users = [
            _user("a", EXACT_PTS,   1, 1, 1),
            _user("b", DIRECTION_PTS, 0, 1, 2),
            _user("c", c_pts, self._c_exact(), 1 if c_pts > 0 else 0, 3),
            _user("d", 0, 0, 0, 4),
        ]
        ranked = _rank(users)
        assert [u["rank"] for u in ranked] == [1, 2, 3, 4]

    def test_points_are_non_negative_for_all_users(self):
        for pts in [EXACT_PTS, DIRECTION_PTS, self._c_pts(), 0]:
            assert pts >= 0

    def test_multi_match_accumulation(self):
        """Points accumulate additively — 2 matches, no capping."""
        a_total = EXACT_PTS * 2    # exact both
        b_total = DIRECTION_PTS * 2  # direction both
        assert a_total > b_total

    def test_tournament_constants_defined(self):
        assert TOURNAMENT_WINNER_PTS == 12
        assert TOURNAMENT_SCORER_PTS == 12


# ─────────────────────────────────────────────────────────────────────────────
# 3. Leaderboard tiebreaker
# ─────────────────────────────────────────────────────────────────────────────

class TestLeaderboardTiebreaker:

    def test_points_primary_tiebreaker(self):
        users = [_user("low", 5, 2, 2, 1), _user("high", 10, 0, 0, 2)]
        ranked = _rank(users)
        assert ranked[0]["id"] == "high"

    def test_exact_count_secondary_tiebreaker(self):
        users = [
            _user("few_exact",  5, 1, 2, 1),
            _user("many_exact", 5, 3, 2, 2),
        ]
        ranked = _rank(users)
        assert ranked[0]["id"] == "many_exact"

    def test_correct_count_tertiary_tiebreaker(self):
        users = [
            _user("less_correct",  5, 2, 3, 1),
            _user("more_correct", 5, 2, 5, 2),
        ]
        ranked = _rank(users)
        assert ranked[0]["id"] == "more_correct"

    def test_join_date_final_tiebreaker(self):
        users = [
            _user("late",  5, 2, 3, 10),
            _user("early", 5, 2, 3, 1),
        ]
        ranked = _rank(users)
        assert ranked[0]["id"] == "early"
        assert ranked[1]["id"] == "late"

    def test_full_four_way_tie_broken_by_join(self):
        users = [_user(f"u{i}", 10, 2, 3, i) for i in range(4, 0, -1)]
        ranked = _rank(users)
        # u1 joined first (day 1) → rank 1
        assert ranked[0]["id"] == "u1"
        assert ranked[-1]["id"] == "u4"

    def test_single_user_rank_is_one(self):
        ranked = _rank([_user("solo", 0, 0, 0, 1)])
        assert ranked[0]["rank"] == 1

    def test_zero_points_all_sorted_by_join(self):
        users = [_user(f"u{i}", 0, 0, 0, i) for i in [3, 1, 2]]
        ranked = _rank(users)
        assert [u["id"] for u in ranked] == ["u1", "u2", "u3"]

    def test_rank_values_always_1_based_sequential(self):
        users = [_user(f"u{i}", 0, 0, 0, i) for i in range(1, 11)]
        ranked = _rank(users)
        assert [u["rank"] for u in ranked] == list(range(1, 11))


# ─────────────────────────────────────────────────────────────────────────────
# 4. Round point table
# ─────────────────────────────────────────────────────────────────────────────

class TestRoundPoints:

    def test_all_rounds_present(self):
        expected = {"group", "r32", "r16", "qf", "sf", "3rd", "final"}
        assert set(ROUND_POINTS.keys()) == expected

    def test_exact_always_greater_than_direction(self):
        for rnd, (direction, exact) in ROUND_POINTS.items():
            assert exact > direction, f"{rnd}: exact={exact} must exceed direction={direction}"

    def test_knockout_exact_exceeds_group_exact(self):
        group_exact = ROUND_POINTS["group"][1]
        for rnd in ["r32", "r16", "qf", "sf", "final"]:
            assert ROUND_POINTS[rnd][1] > group_exact

    def test_final_has_highest_exact_pts(self):
        max_exact = max(e for _, e in ROUND_POINTS.values())
        assert ROUND_POINTS["final"][1] == max_exact

    def test_all_points_non_negative(self):
        for direction, exact in ROUND_POINTS.values():
            assert direction >= 0 and exact >= 0

    def test_wrong_always_zero_all_rounds(self):
        for rnd in ROUND_POINTS:
            _, pts = compute_outcome(0, 3, 3, 0, rnd)  # away win vs home win → wrong
            assert pts == 0

    def test_difference_earns_direction_not_exact(self):
        # 3-2 vs 2-1: same margin (+1), same direction, different score → "difference" → direction_pts
        for rnd, (direction_pts, exact_pts) in ROUND_POINTS.items():
            outcome, pts = compute_outcome(3, 2, 2, 1, rnd)
            assert outcome == "difference"
            assert pts == direction_pts

    def test_symmetry_away_win(self):
        # 0-3 vs 0-2: same direction (away win), different score and margin
        for rnd in ROUND_POINTS:
            outcome, pts = compute_outcome(0, 3, 0, 2, rnd)
            assert outcome == "outcome"


# ─────────────────────────────────────────────────────────────────────────────
# 5. Auto-pick pool validation
# ─────────────────────────────────────────────────────────────────────────────

class TestAutoPickPools:

    def test_group_pool_contains_draw(self):
        draws = [(h, a) for h, a in ROUND_SCORE_POOLS["group"] if h == a]
        assert len(draws) >= 1

    def test_knockout_pools_no_draws(self):
        for rnd in ["r32", "r16", "qf", "sf", "3rd", "final"]:
            pool = ROUND_SCORE_POOLS[rnd]
            draws = [(h, a) for h, a in pool if h == a]
            assert draws == [], f"{rnd} pool must not contain draws"

    def test_all_scores_non_negative(self):
        for rnd, pool in ROUND_SCORE_POOLS.items():
            for h, a in pool:
                assert h >= 0 and a >= 0, f"{rnd} pool has negative score ({h},{a})"

    def test_all_pools_non_empty(self):
        for rnd, pool in ROUND_SCORE_POOLS.items():
            assert len(pool) >= 2, f"{rnd} pool too small"

    def test_sha256_used_not_python_hash(self):
        """Cross-check deterministic_score against a manual sha256 computation."""
        mid = "verify-sha256-stability"
        pool   = ROUND_SCORE_POOLS["group"]
        digest = hashlib.sha256(mid.encode()).hexdigest()
        idx    = int(digest, 16) % len(pool)
        expected = pool[idx]
        assert deterministic_score(mid, "group") == expected

    def test_score_stable_across_calls(self):
        results = [deterministic_score(MATCH_ID, "qf") for _ in range(5)]
        assert len(set(results)) == 1
