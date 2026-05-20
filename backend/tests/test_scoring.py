"""
Deterministic tests for the scoring engine.

Covers every outcome branch, every round, all edge cases, and
validates that the backend ROUND_POINTS table exactly matches the
frontend constants (lib/constants.ts).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from core.scoring import compute_outcome, ROUND_POINTS


# ─── Helpers ─────────────────────────────────────────────────────

def score(ph, pa, ah, aa, round_code="group"):
    return compute_outcome(ph, pa, ah, aa, round_code)


# ─── ROUND_POINTS table integrity ────────────────────────────────

class TestRoundPointsTable:
    """Backend table must exactly match frontend lib/constants.ts ROUND_POINTS."""

    FRONTEND = {
        "group": {"direction": 1,  "exact": 3 },
        "r32":   {"direction": 2,  "exact": 5 },
        "r16":   {"direction": 2,  "exact": 5 },
        "qf":    {"direction": 4,  "exact": 8 },
        "sf":    {"direction": 5,  "exact": 10},
        "3rd":   {"direction": 5,  "exact": 10},
        "final": {"direction": 8,  "exact": 15},
    }

    def test_all_rounds_present(self):
        assert set(ROUND_POINTS.keys()) == set(self.FRONTEND.keys()), \
            f"Round keys differ: backend={set(ROUND_POINTS)}, frontend={set(self.FRONTEND)}"

    @pytest.mark.parametrize("round_code", ["group", "r32", "r16", "qf", "sf", "3rd", "final"])
    def test_direction_pts_match_frontend(self, round_code):
        direction_pts, _ = ROUND_POINTS[round_code]
        assert direction_pts == self.FRONTEND[round_code]["direction"], \
            f"{round_code}: backend direction={direction_pts}, frontend={self.FRONTEND[round_code]['direction']}"

    @pytest.mark.parametrize("round_code", ["group", "r32", "r16", "qf", "sf", "3rd", "final"])
    def test_exact_pts_match_frontend(self, round_code):
        _, exact_pts = ROUND_POINTS[round_code]
        assert exact_pts == self.FRONTEND[round_code]["exact"], \
            f"{round_code}: backend exact={exact_pts}, frontend={self.FRONTEND[round_code]['exact']}"

    def test_exact_always_greater_than_direction(self):
        for round_code, (d, e) in ROUND_POINTS.items():
            assert e > d, f"{round_code}: exact({e}) should be > direction({d})"

    def test_points_increase_with_round_importance(self):
        # group < r32/r16 < qf < sf/3rd < final (direction pts)
        assert ROUND_POINTS["group"][0]  < ROUND_POINTS["r16"][0]
        assert ROUND_POINTS["r16"][0]   == ROUND_POINTS["r32"][0]
        assert ROUND_POINTS["r16"][0]    < ROUND_POINTS["qf"][0]
        assert ROUND_POINTS["qf"][0]     < ROUND_POINTS["sf"][0]
        assert ROUND_POINTS["sf"][0]    == ROUND_POINTS["3rd"][0]
        assert ROUND_POINTS["sf"][0]     < ROUND_POINTS["final"][0]


# ─── Exact score ─────────────────────────────────────────────────

class TestExactScore:
    def test_home_win_exact(self):
        outcome, pts = score(2, 1, 2, 1)
        assert outcome == "exact"
        assert pts == 3

    def test_away_win_exact(self):
        outcome, pts = score(0, 2, 0, 2)
        assert outcome == "exact"
        assert pts == 3

    def test_draw_exact(self):
        outcome, pts = score(1, 1, 1, 1)
        assert outcome == "exact"
        assert pts == 3

    def test_goalless_draw_exact(self):
        outcome, pts = score(0, 0, 0, 0)
        assert outcome == "exact"
        assert pts == 3

    def test_high_scoring_exact(self):
        outcome, pts = score(5, 3, 5, 3)
        assert outcome == "exact"
        assert pts == 3

    def test_exact_in_final_gives_max_pts(self):
        outcome, pts = score(2, 1, 2, 1, "final")
        assert outcome == "exact"
        assert pts == 15

    def test_exact_in_qf(self):
        outcome, pts = score(1, 0, 1, 0, "qf")
        assert outcome == "exact"
        assert pts == 8


# ─── Same goal difference (not exact) ───────────────────────────

class TestSameDifference:
    """Same goal difference as actual but different scoreline → 'difference'."""

    def test_home_win_same_diff(self):
        # predicted +2 (3-1), actual +2 (2-0) — both home win by 2
        outcome, pts = score(3, 1, 2, 0)
        assert outcome == "difference"
        assert pts == 1

    def test_away_win_same_diff(self):
        # predicted -2 (0-2), actual -2 (1-3)
        outcome, pts = score(0, 2, 1, 3)
        assert outcome == "difference"
        assert pts == 1

    def test_draw_same_diff(self):
        # predicted 2-2 (diff=0), actual 3-3 (diff=0)
        outcome, pts = score(2, 2, 3, 3)
        assert outcome == "difference"
        assert pts == 1

    def test_large_diff_same(self):
        # predicted 4-1 (+3), actual 3-0 (+3)
        outcome, pts = score(4, 1, 3, 0)
        assert outcome == "difference"
        assert pts == 1

    def test_same_diff_in_final(self):
        outcome, pts = score(3, 1, 2, 0, "final")
        assert outcome == "difference"
        assert pts == 8

    def test_same_diff_in_qf(self):
        outcome, pts = score(3, 1, 2, 0, "qf")
        assert outcome == "difference"
        assert pts == 4


# ─── Correct outcome only (sign match, not same diff) ───────────

class TestCorrectOutcome:
    """Correct W/D/L direction but different goal difference → 'outcome'."""

    def test_home_win_different_margin(self):
        # predicted home win by 1, actual home win by 2
        outcome, pts = score(2, 1, 3, 1)
        assert outcome == "outcome"
        assert pts == 1

    def test_away_win_different_margin(self):
        outcome, pts = score(0, 1, 0, 3)
        assert outcome == "outcome"
        assert pts == 1

    def test_home_win_vs_big_win(self):
        outcome, pts = score(1, 0, 4, 0)
        assert outcome == "outcome"
        assert pts == 1

    def test_correct_outcome_in_r16(self):
        outcome, pts = score(1, 0, 2, 0, "r16")
        assert outcome == "outcome"
        assert pts == 2

    def test_correct_outcome_in_sf(self):
        outcome, pts = score(1, 0, 2, 0, "sf")
        assert outcome == "outcome"
        assert pts == 5


# ─── Wrong prediction ────────────────────────────────────────────

class TestWrong:
    def test_predicted_home_got_away(self):
        outcome, pts = score(2, 1, 1, 2)
        assert outcome == "wrong"
        assert pts == 0

    def test_predicted_home_got_draw(self):
        outcome, pts = score(2, 1, 1, 1)
        assert outcome == "wrong"
        assert pts == 0

    def test_predicted_draw_got_home(self):
        outcome, pts = score(1, 1, 2, 0)
        assert outcome == "wrong"
        assert pts == 0

    def test_predicted_draw_got_away(self):
        outcome, pts = score(0, 0, 0, 1)
        assert outcome == "wrong"
        assert pts == 0

    def test_predicted_away_got_home(self):
        outcome, pts = score(0, 2, 1, 0)
        assert outcome == "wrong"
        assert pts == 0

    def test_predicted_away_got_draw(self):
        outcome, pts = score(0, 2, 2, 2)
        assert outcome == "wrong"
        assert pts == 0

    def test_wrong_in_final_still_zero(self):
        outcome, pts = score(1, 2, 2, 1, "final")
        assert outcome == "wrong"
        assert pts == 0


# ─── Exact score takes priority over difference ──────────────────

class TestExactPriority:
    """Exact score must not fall through to 'difference' or 'outcome'."""

    def test_exact_not_difference(self):
        # 1-1: diff=0. Must be "exact", not "difference"
        outcome, pts = score(1, 1, 1, 1)
        assert outcome == "exact"

    def test_exact_home_win_not_outcome(self):
        # 2-0: diff=+2, home win. Must be "exact"
        outcome, pts = score(2, 0, 2, 0)
        assert outcome == "exact"


# ─── Boundary cases ──────────────────────────────────────────────

class TestEdgeCases:
    def test_unknown_round_defaults_to_group(self):
        # Unknown round_code should fall back to group points (1, 3)
        outcome, pts = score(2, 1, 2, 1, "group_x")
        assert outcome == "exact"
        assert pts == 3  # group exact pts

    def test_unknown_round_wrong_gives_zero(self):
        outcome, pts = score(1, 0, 0, 1, "group_x")
        assert outcome == "wrong"
        assert pts == 0

    def test_zero_zero_is_draw(self):
        outcome, pts = score(0, 0, 1, 1)
        assert outcome == "difference"  # both diff=0
        assert pts == 1

    def test_symmetric_mismatch(self):
        # 1-0 vs 0-1 — completely opposite
        outcome, pts = score(1, 0, 0, 1)
        assert outcome == "wrong"
        assert pts == 0

    def test_large_scores_exact(self):
        outcome, pts = score(10, 8, 10, 8)
        assert outcome == "exact"
        assert pts == 3

    def test_large_scores_same_diff(self):
        # predicted 10-7 (+3), actual 5-2 (+3)
        outcome, pts = score(10, 7, 5, 2)
        assert outcome == "difference"
        assert pts == 1

    def test_draw_prediction_exact_draw_result(self):
        # any draw vs any other draw → "difference"
        outcome, pts = score(0, 0, 2, 2)
        assert outcome == "difference"
        assert pts == 1

    def test_draw_prediction_vs_home_win(self):
        outcome, pts = score(0, 0, 1, 0)
        assert outcome == "wrong"
        assert pts == 0


# ─── All rounds — exact and direction pts ────────────────────────

class TestAllRounds:
    @pytest.mark.parametrize("round_code,expected_exact,expected_direction", [
        ("group", 3,  1),
        ("r32",   5,  2),
        ("r16",   5,  2),
        ("qf",    8,  4),
        ("sf",    10, 5),
        ("3rd",   10, 5),
        ("final", 15, 8),
    ])
    def test_exact_pts_per_round(self, round_code, expected_exact, expected_direction):
        _, pts = score(2, 1, 2, 1, round_code)
        assert pts == expected_exact

    @pytest.mark.parametrize("round_code,expected_exact,expected_direction", [
        ("group", 3,  1),
        ("r32",   5,  2),
        ("r16",   5,  2),
        ("qf",    8,  4),
        ("sf",    10, 5),
        ("3rd",   10, 5),
        ("final", 15, 8),
    ])
    def test_direction_pts_per_round(self, round_code, expected_exact, expected_direction):
        # Same outcome, different score → direction pts
        _, pts = score(2, 0, 3, 0, round_code)
        assert pts == expected_direction

    @pytest.mark.parametrize("round_code", ["group", "r32", "r16", "qf", "sf", "3rd", "final"])
    def test_wrong_always_zero_across_rounds(self, round_code):
        _, pts = score(1, 0, 0, 1, round_code)
        assert pts == 0


# ─── Outcome ordering invariants ────────────────────────────────

class TestOutcomeOrdering:
    """exact > direction/outcome > wrong, always."""

    @pytest.mark.parametrize("round_code", ["group", "r32", "r16", "qf", "sf", "3rd", "final"])
    def test_exact_beats_direction(self, round_code):
        _, exact_pts     = score(2, 1, 2, 1, round_code)
        _, direction_pts = score(3, 2, 2, 1, round_code)  # same margin, different score
        assert exact_pts > direction_pts

    @pytest.mark.parametrize("round_code", ["group", "r32", "r16", "qf", "sf", "3rd", "final"])
    def test_direction_beats_wrong(self, round_code):
        _, direction_pts = score(3, 2, 2, 1, round_code)
        _, wrong_pts     = score(0, 1, 1, 0, round_code)
        assert direction_pts > wrong_pts

    @pytest.mark.parametrize("round_code", ["group", "r32", "r16", "qf", "sf", "3rd", "final"])
    def test_outcome_beats_wrong(self, round_code):
        _, outcome_pts = score(1, 0, 3, 0, round_code)
        _, wrong_pts   = score(0, 1, 1, 0, round_code)
        assert outcome_pts > wrong_pts

    @pytest.mark.parametrize("round_code", ["group", "r32", "r16", "qf", "sf", "3rd", "final"])
    def test_direction_equals_outcome_pts(self, round_code):
        # Both 'difference' and 'outcome' award direction_pts
        _, diff_pts    = score(3, 1, 2, 0, round_code)   # same diff
        _, outcome_pts = score(1, 0, 3, 0, round_code)   # same sign
        assert diff_pts == outcome_pts


# ─── Realistic match simulations ────────────────────────────────

class TestRealisticSimulations:
    """Full match-day scenarios verifying the complete scoring matrix."""

    def test_world_cup_final_scenario(self):
        # Predicted Brazil 2-1 France, Actual Brazil 3-0 France
        # → home win correct, diff=+1 vs +3 → outcome
        outcome, pts = score(2, 1, 3, 0, "final")
        assert outcome == "outcome"
        assert pts == 8

    def test_world_cup_final_exact_bonanza(self):
        # Predicted 2-1, Actual 2-1
        outcome, pts = score(2, 1, 2, 1, "final")
        assert outcome == "exact"
        assert pts == 15

    def test_group_stage_draw_correct(self):
        outcome, pts = score(1, 1, 0, 0)  # group, draw vs draw
        assert outcome == "difference"
        assert pts == 1

    def test_group_stage_completely_wrong(self):
        outcome, pts = score(3, 0, 0, 1)  # home landslide vs away win
        assert outcome == "wrong"
        assert pts == 0

    def test_qf_exact_score(self):
        outcome, pts = score(1, 1, 1, 1, "qf")
        assert outcome == "exact"
        assert pts == 8

    def test_r16_exact_away_win(self):
        outcome, pts = score(0, 1, 0, 1, "r16")
        assert outcome == "exact"
        assert pts == 5

    def test_sf_correct_direction(self):
        # Predicted home win by 1, actual home win by 3
        outcome, pts = score(1, 0, 3, 0, "sf")
        assert outcome == "outcome"
        assert pts == 5

    def test_prediction_edit_before_lock(self):
        # User first predicts 1-0 (wrong), then edits to 2-1 (also wrong for 3-2).
        # Final edit 3-2 is exact. Only the last prediction matters.
        outcome, pts = score(3, 2, 3, 2)
        assert outcome == "exact"
        assert pts == 3

    def test_penalties_treated_as_reported_score(self):
        # If provider reports 1-1 after extra time (AET), and user predicted 1-1,
        # that is an exact hit regardless of penalties — scoring uses reported score.
        outcome, pts = score(1, 1, 1, 1, "r16")
        assert outcome == "exact"
        assert pts == 5
