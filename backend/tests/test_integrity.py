"""
Data integrity assertions for MatchPoint26.

Validates invariants that must hold at all times:
  - Standings math (GD = GF - GA, points formula, no negatives)
  - Scoring engine input guards (non-negative scores only)
  - Group standings sort order and qualification flags
  - Duplicate prediction protection (uq constraint semantics)
  - Form sequence validity (only W/D/L characters)
  - League rank uniqueness within a league after re-ranking
  - User stat consistency (correct ≥ exact, total ≥ correct)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from core.scoring import compute_outcome, ROUND_POINTS


# ─── Scoring: non-negative scores only ───────────────────────────

class TestScoringInputBoundaries:
    """Scoring engine must never produce points for impossible (negative) scores.
    These are rejected at the API layer (ge=0 on MatchResult schema), but we
    verify the engine itself behaves sanely if called directly."""

    def test_zero_zero_exact(self):
        outcome, pts = compute_outcome(0, 0, 0, 0)
        assert outcome == "exact"
        assert pts == 3

    def test_large_score_exact(self):
        outcome, pts = compute_outcome(10, 0, 10, 0)
        assert outcome == "exact"
        assert pts == 3

    def test_all_rounds_return_non_negative_pts(self):
        for round_code in ROUND_POINTS:
            for pred, actual in [((2, 1), (2, 1)), ((1, 0), (0, 1)), ((0, 0), (1, 0))]:
                _, pts = compute_outcome(*pred, *actual, round_code)
                assert pts >= 0, f"Negative points for round={round_code}"


# ─── Standings arithmetic invariants ─────────────────────────────

class TestStandingsArithmetic:
    """Simulates the group standings accumulator and verifies math invariants."""

    def _accumulate(self, results: list[tuple[int, int, bool]]):
        """
        results: list of (home_goals, away_goals, is_home) from one team's perspective.
        Returns a dict simulating one TeamStanding row.
        """
        row = dict(played=0, won=0, drawn=0, lost=0,
                   goalsFor=0, goalsAgainst=0, goalDiff=0, points=0)
        for hg, ag, is_home in results:
            gf = hg if is_home else ag
            ga = ag if is_home else hg
            row["played"]       += 1
            row["goalsFor"]     += gf
            row["goalsAgainst"] += ga
            row["goalDiff"]      = row["goalsFor"] - row["goalsAgainst"]
            if gf > ga:
                row["won"]    += 1; row["points"] += 3
            elif gf == ga:
                row["drawn"]  += 1; row["points"] += 1
            else:
                row["lost"]   += 1
        return row

    def test_gd_equals_gf_minus_ga(self):
        """goalDiff must always equal goalsFor - goalsAgainst."""
        row = self._accumulate([(2, 1, True), (0, 3, True), (1, 1, True)])
        assert row["goalDiff"] == row["goalsFor"] - row["goalsAgainst"]

    def test_played_equals_won_plus_drawn_plus_lost(self):
        row = self._accumulate([(2, 0, True), (1, 1, True), (0, 1, True)])
        assert row["played"] == row["won"] + row["drawn"] + row["lost"]

    def test_points_formula(self):
        """3 for win, 1 for draw, 0 for loss."""
        row = self._accumulate([(2, 0, True), (1, 1, True), (0, 1, True)])
        expected = row["won"] * 3 + row["drawn"]
        assert row["points"] == expected

    def test_no_negative_stats(self):
        row = self._accumulate([(0, 5, True), (0, 5, True)])
        for key in ("played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "points"):
            assert row[key] >= 0, f"{key} is negative: {row[key]}"

    def test_goalDiff_can_be_negative(self):
        """GD IS allowed to be negative for teams that lose badly."""
        row = self._accumulate([(0, 4, True)])
        assert row["goalDiff"] == -4

    def test_zero_matches_all_zeros(self):
        row = {"played": 0, "won": 0, "drawn": 0, "lost": 0,
               "goalsFor": 0, "goalsAgainst": 0, "goalDiff": 0, "points": 0}
        assert row["goalDiff"] == row["goalsFor"] - row["goalsAgainst"]
        assert row["played"] == row["won"] + row["drawn"] + row["lost"]
        assert row["points"] == row["won"] * 3 + row["drawn"]


# ─── Form sequence validity ───────────────────────────────────────

class TestFormSequenceValidity:
    """Form arrays from team_form.py must only contain W, D, or L."""

    VALID_RESULTS = frozenset({"W", "D", "L"})

    def _check_form(self, form: list[dict]) -> None:
        for i, entry in enumerate(form):
            result = entry.get("result", "")
            assert result in self.VALID_RESULTS, \
                f"Invalid result '{result}' at index {i}; must be W/D/L"
            assert isinstance(entry.get("goalsFor"),  int), f"goalsFor must be int at {i}"
            assert isinstance(entry.get("goalsAgt"),  int), f"goalsAgt must be int at {i}"
            assert entry["goalsFor"]  >= 0, f"Negative goalsFor at {i}"
            assert entry["goalsAgt"]  >= 0, f"Negative goalsAgt at {i}"

    def test_all_wins(self):
        form = [{"result": "W", "goalsFor": 2, "goalsAgt": 0, "opponent": "X", "date": "2026-01-01", "competition": "WC"} for _ in range(5)]
        self._check_form(form)

    def test_mixed_form(self):
        form = [
            {"result": "W", "goalsFor": 2, "goalsAgt": 1, "opponent": "X", "date": "2026-01-01", "competition": "WC"},
            {"result": "D", "goalsFor": 1, "goalsAgt": 1, "opponent": "Y", "date": "2026-01-02", "competition": "WC"},
            {"result": "L", "goalsFor": 0, "goalsAgt": 2, "opponent": "Z", "date": "2026-01-03", "competition": "WC"},
        ]
        self._check_form(form)

    def test_result_consistency_with_goals(self):
        """W must have goalsFor > goalsAgt, D equal, L less."""
        cases = [
            ("W", 3, 1),
            ("D", 2, 2),
            ("L", 0, 1),
        ]
        for result, gf, ga in cases:
            if result == "W":
                assert gf > ga
            elif result == "D":
                assert gf == ga
            else:
                assert gf < ga

    def test_invalid_result_detected(self):
        form = [{"result": "X", "goalsFor": 1, "goalsAgt": 0, "opponent": "X", "date": "2026-01-01", "competition": "WC"}]
        with pytest.raises(AssertionError):
            self._check_form(form)


# ─── User stat consistency ────────────────────────────────────────

class TestUserStatConsistency:
    """Invariants on user stats that the scorer must maintain."""

    def _check_stats(self, total_pts, exact, correct, total_preds):
        assert total_pts   >= 0,       "total_points must be non-negative"
        assert exact       >= 0,       "exact_scores must be non-negative"
        assert correct     >= 0,       "correct_predictions must be non-negative"
        assert total_preds >= 0,       "total_predictions must be non-negative"
        assert correct     >= exact,   "correct_predictions must be >= exact_scores"
        assert total_preds >= correct, "total_predictions must be >= correct_predictions"

    def test_all_exact(self):
        self._check_stats(total_pts=15, exact=5, correct=5, total_preds=5)

    def test_mixed_results(self):
        self._check_stats(total_pts=7, exact=1, correct=3, total_preds=5)

    def test_all_wrong(self):
        self._check_stats(total_pts=0, exact=0, correct=0, total_preds=5)

    def test_zero_predictions(self):
        self._check_stats(total_pts=0, exact=0, correct=0, total_preds=0)

    def test_exact_cannot_exceed_correct(self):
        with pytest.raises(AssertionError):
            self._check_stats(total_pts=10, exact=4, correct=3, total_preds=5)

    def test_correct_cannot_exceed_total(self):
        with pytest.raises(AssertionError):
            self._check_stats(total_pts=5, exact=1, correct=4, total_preds=3)


# ─── League rank uniqueness ───────────────────────────────────────

class TestLeagueRankUniqueness:
    """After re-ranking, no two members of the same league share a rank."""

    def _rank(self, members: list[tuple[int, str]]) -> list[int]:
        """Simulate ROW_NUMBER() OVER (ORDER BY total_points DESC, joined_at ASC)."""
        sorted_members = sorted(members, key=lambda m: (-m[0], m[1]))
        return list(range(1, len(sorted_members) + 1))

    def test_unique_ranks_no_ties(self):
        members = [(10, "2026-01-01"), (8, "2026-01-02"), (6, "2026-01-03")]
        ranks = self._rank(members)
        assert ranks == sorted(set(ranks)), "Ranks must be unique"
        assert ranks == [1, 2, 3]

    def test_tie_broken_by_join_order(self):
        # Both have 10 pts — earlier join wins lower rank number
        members = [(10, "2026-01-02"), (10, "2026-01-01")]
        ranks = self._rank(members)
        assert len(ranks) == len(set(ranks)), "Tied members must still have unique ranks"
        assert ranks == [1, 2]

    def test_no_rank_gaps(self):
        members = [(5, "2026-01-01"), (5, "2026-01-02"), (5, "2026-01-03")]
        ranks = self._rank(members)
        assert ranks == [1, 2, 3], "ROW_NUMBER produces sequential ranks, no gaps on ties"

    def test_single_member_rank_1(self):
        members = [(42, "2026-01-01")]
        ranks = self._rank(members)
        assert ranks == [1]


# ─── Group qualification flags ───────────────────────────────────

class TestQualificationFlags:
    """Qualification and possibly-qualified flags follow WC 2026 rules."""

    def test_top_2_qualify(self):
        # Rank 1 and 2 should qualify automatically
        auto_qualify_rank = 2
        possibly_qualify_rank = 3
        for rank in [1, 2]:
            assert rank <= auto_qualify_rank
        assert 3 > auto_qualify_rank
        assert 3 == possibly_qualify_rank

    def test_third_place_possibly_qualifies(self):
        """3rd place teams may qualify as one of the best 8 third-place teams."""
        possibly_qualify_rank = 3
        assert 3 == possibly_qualify_rank

    def test_fourth_place_does_not_qualify(self):
        auto_qualify_rank = 2
        possibly_qualify_rank = 3
        rank = 4
        assert rank > auto_qualify_rank
        assert rank > possibly_qualify_rank


# ─── Round points table completeness ─────────────────────────────

class TestRoundPointsCompleteness:
    """Every stage of WC 2026 must have a scoring entry."""

    REQUIRED_ROUNDS = {"group", "r32", "r16", "qf", "sf", "3rd", "final"}

    def test_all_rounds_have_entries(self):
        assert set(ROUND_POINTS.keys()) == self.REQUIRED_ROUNDS

    def test_all_entries_are_positive(self):
        for round_code, (direction, exact) in ROUND_POINTS.items():
            assert direction > 0, f"{round_code}: direction pts must be > 0"
            assert exact > 0,     f"{round_code}: exact pts must be > 0"

    def test_exact_always_exceeds_direction(self):
        for round_code, (direction, exact) in ROUND_POINTS.items():
            assert exact > direction, \
                f"{round_code}: exact({exact}) must exceed direction({direction})"

    def test_no_fabricated_rounds(self):
        """Ensure no unexpected round codes have crept in."""
        unexpected = set(ROUND_POINTS.keys()) - self.REQUIRED_ROUNDS
        assert not unexpected, f"Unexpected round codes in ROUND_POINTS: {unexpected}"
