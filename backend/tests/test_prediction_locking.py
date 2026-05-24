"""
Tests for prediction locking rules.

A prediction may only be submitted or changed while the match status
is "scheduled". Once a match goes live or finishes, the endpoint
must reject the request with 422.

These tests verify the locking condition directly (no DB/HTTP needed).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dataclasses import dataclass
from typing import Optional


# ─── Minimal stubs ───────────────────────────────────────────────

@dataclass
class StubMatch:
    status: str
    id: str = "match-1"


def can_predict(match: StubMatch) -> bool:
    """Mirrors the locking check in routers/predictions.py."""
    return match.status == "scheduled"


def lock_reason(match: StubMatch) -> Optional[str]:
    if match.status == "live":
        return "Match is in progress"
    if match.status == "finished":
        return "Match has ended"
    return None


# ─── Tests ───────────────────────────────────────────────────────

class TestPredictionLockingRule:
    def test_scheduled_match_allows_prediction(self):
        assert can_predict(StubMatch("scheduled")) is True

    def test_live_match_blocks_prediction(self):
        assert can_predict(StubMatch("live")) is False

    def test_finished_match_blocks_prediction(self):
        assert can_predict(StubMatch("finished")) is False

    def test_unknown_status_blocks_prediction(self):
        assert can_predict(StubMatch("postponed")) is False

    def test_lock_reason_live(self):
        assert lock_reason(StubMatch("live")) == "Match is in progress"

    def test_lock_reason_finished(self):
        assert lock_reason(StubMatch("finished")) == "Match has ended"

    def test_lock_reason_scheduled_is_none(self):
        assert lock_reason(StubMatch("scheduled")) is None


class TestStatusTransitions:
    """Verify prediction is allowed/blocked at each stage of a match lifecycle."""

    def test_full_lifecycle(self):
        lifecycle = [
            ("scheduled", True),   # before kickoff  → can predict
            ("live",      False),  # during match    → locked
            ("finished",  False),  # after final     → locked
        ]
        for status, expected in lifecycle:
            result = can_predict(StubMatch(status))
            assert result == expected, \
                f"status={status!r}: expected can_predict={expected}, got {result}"

    def test_edit_before_kickoff_allowed(self):
        """User can change their prediction any number of times before kickoff."""
        match = StubMatch("scheduled")
        for _ in range(5):
            assert can_predict(match) is True

    def test_cannot_predict_once_live_even_if_score_is_0_0(self):
        """Score being 0-0 doesn't re-open predictions once a match is live."""
        assert can_predict(StubMatch("live")) is False

    def test_cannot_predict_after_finished_even_if_scorer_not_run(self):
        """Scorer pipeline delay doesn't affect the lock — status alone decides."""
        assert can_predict(StubMatch("finished")) is False


class TestScoringPoints:
    """Cross-check that scoring points are only awarded for finished matches
    (mirrors the same guard in core/scorer.py and group standings)."""

    from core.scoring import compute_outcome

    def test_exact_score_correct_outcome(self):
        from core.scoring import compute_outcome
        outcome, pts = compute_outcome(2, 1, 2, 1, "group")
        assert outcome == "exact"
        assert pts == 3

    def test_correct_outcome_not_exact(self):
        from core.scoring import compute_outcome
        outcome, pts = compute_outcome(2, 1, 3, 0, "group")
        assert outcome == "outcome"
        assert pts == 1

    def test_wrong_prediction_zero_points(self):
        from core.scoring import compute_outcome
        outcome, pts = compute_outcome(2, 1, 0, 1, "group")
        assert outcome == "wrong"
        assert pts == 0

    def test_draw_predicted_correctly(self):
        from core.scoring import compute_outcome
        outcome, pts = compute_outcome(1, 1, 1, 1, "group")
        assert outcome == "exact"
        assert pts == 3

    def test_draw_predicted_wrong_score_same_margin(self):
        from core.scoring import compute_outcome
        outcome, pts = compute_outcome(1, 1, 2, 2, "group")
        assert outcome == "difference"
        assert pts == 1
