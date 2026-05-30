"""
Tournament Scoring tests — comprehensive coverage.

All tests run against the pure Python logic in services/tournament_scoring.py
and the helper functions there. No database required — models are built as
plain Python objects (no ORM session).

Coverage:
  - _compute_winner_pts / _compute_scorer_pts: correct / wrong / no-pick / None actual
  - preview_tournament_scoring: correct users, first-run flag, delta aggregates
  - apply_tournament_scoring: first run, idempotent re-run, correction flows
  - rebuild_tournament_standings: requires existing result
  - User ABCD simulation: A(both), B(winner only), C(scorer only), D(neither)
  - Leaderboard re-ranking after scoring
  - Partial picks (winner only, scorer only, neither submitted)
  - Edge cases: empty pick table, null actual, both null
  - Audit run counts
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.scoring import TOURNAMENT_SCORER_PTS, TOURNAMENT_WINNER_PTS
from services.tournament_scoring import (
    ScoringPreview,
    ScoringResult,
    UserScoringPreview,
    _compute_scorer_pts,
    _compute_winner_pts,
    preview_tournament_scoring,
    apply_tournament_scoring,
)


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures & helpers
# ─────────────────────────────────────────────────────────────────────────────

WINNER_PTS = TOURNAMENT_WINNER_PTS   # 12
SCORER_PTS = TOURNAMENT_SCORER_PTS   # 12

ACTUAL_WINNER = "bra"
ACTUAL_SCORER = "player-uuid-mbappé"


def _pick(
    user_id: str,
    winner: str | None = None,
    scorer: str | None = None,
    winner_awarded: int | None = None,
    scorer_awarded: int | None = None,
) -> SimpleNamespace:
    """Minimal TournamentPick stand-in."""
    return SimpleNamespace(
        user_id                = user_id,
        winner_team_code       = winner,
        top_scorer_id          = scorer,
        winner_points_awarded  = winner_awarded,
        scorer_points_awarded  = scorer_awarded,
    )


def _preview_from_picks(
    picks: list,
    actual_winner: str | None,
    actual_scorer: str | None,
) -> ScoringPreview:
    """
    Build a ScoringPreview without a DB — mirrors the logic in
    services/tournament_scoring.preview_tournament_scoring().
    """
    actual_w = (actual_winner or "").lower() or None
    actual_s = actual_scorer or None
    is_first_run = all(
        p.winner_points_awarded is None and p.scorer_points_awarded is None
        for p in picks
    )
    users: list[UserScoringPreview] = []
    for p in picks:
        w_cur = p.winner_points_awarded if p.winner_points_awarded is not None else 0
        s_cur = p.scorer_points_awarded  if p.scorer_points_awarded  is not None else 0
        w_new = _compute_winner_pts(p, actual_w)
        s_new = _compute_scorer_pts(p, actual_s)
        users.append(UserScoringPreview(
            user_id            = p.user_id,
            winner_pick        = p.winner_team_code,
            scorer_pick        = p.top_scorer_id,
            winner_pts_current = w_cur,
            scorer_pts_current = s_cur,
            winner_pts_new     = w_new,
            scorer_pts_new     = s_new,
            winner_delta       = w_new - w_cur,
            scorer_delta       = s_new - s_cur,
        ))
    return ScoringPreview(
        actual_winner_code = actual_w,
        actual_scorer_id   = actual_s,
        users              = users,
        is_first_run       = is_first_run,
    )


def _apply_from_picks(
    picks: list,
    actual_winner: str | None,
    actual_scorer: str | None,
) -> dict[str, tuple[int, int, int]]:
    """
    Simulate apply_tournament_scoring() without a DB.

    Returns dict[user_id] → (winner_awarded, scorer_awarded, net_delta).
    Also mutates pick.winner_points_awarded and pick.scorer_points_awarded.
    """
    actual_w = (actual_winner or "").lower() or None
    actual_s = actual_scorer or None
    results: dict[str, tuple[int, int, int]] = {}
    for p in picks:
        w_old = p.winner_points_awarded if p.winner_points_awarded is not None else 0
        s_old = p.scorer_points_awarded  if p.scorer_points_awarded  is not None else 0
        w_new = _compute_winner_pts(p, actual_w)
        s_new = _compute_scorer_pts(p, actual_s)
        net   = (w_new - w_old) + (s_new - s_old)
        p.winner_points_awarded = w_new
        p.scorer_points_awarded = s_new
        results[p.user_id] = (w_new, s_new, net)
    return results


# ─────────────────────────────────────────────────────────────────────────────
# 1. Point computation — _compute_winner_pts / _compute_scorer_pts
# ─────────────────────────────────────────────────────────────────────────────

class TestComputeWinnerPts:

    def test_correct_pick_earns_full_pts(self):
        p = _pick("u1", winner="bra")
        assert _compute_winner_pts(p, "bra") == WINNER_PTS

    def test_correct_pick_case_insensitive(self):
        p = _pick("u1", winner="bra")
        assert _compute_winner_pts(p, "BRA") == WINNER_PTS  # actual is uppercased by caller

    def test_wrong_pick_earns_zero(self):
        p = _pick("u1", winner="arg")
        assert _compute_winner_pts(p, "bra") == 0

    def test_no_pick_earns_zero(self):
        p = _pick("u1", winner=None)
        assert _compute_winner_pts(p, "bra") == 0

    def test_no_actual_earns_zero(self):
        p = _pick("u1", winner="bra")
        assert _compute_winner_pts(p, None) == 0

    def test_both_none_earns_zero(self):
        p = _pick("u1", winner=None)
        assert _compute_winner_pts(p, None) == 0

    def test_empty_actual_earns_zero(self):
        p = _pick("u1", winner="bra")
        assert _compute_winner_pts(p, "") == 0


class TestComputeScorerPts:

    def test_correct_pick_earns_full_pts(self):
        p = _pick("u1", scorer=ACTUAL_SCORER)
        assert _compute_scorer_pts(p, ACTUAL_SCORER) == SCORER_PTS

    def test_wrong_pick_earns_zero(self):
        p = _pick("u1", scorer="player-wrong")
        assert _compute_scorer_pts(p, ACTUAL_SCORER) == 0

    def test_no_pick_earns_zero(self):
        p = _pick("u1", scorer=None)
        assert _compute_scorer_pts(p, ACTUAL_SCORER) == 0

    def test_no_actual_earns_zero(self):
        p = _pick("u1", scorer=ACTUAL_SCORER)
        assert _compute_scorer_pts(p, None) == 0

    def test_both_none_earns_zero(self):
        p = _pick("u1", scorer=None)
        assert _compute_scorer_pts(p, None) == 0


# ─────────────────────────────────────────────────────────────────────────────
# 2. Preview logic
# ─────────────────────────────────────────────────────────────────────────────

class TestPreviewLogic:

    def _abcd(self) -> list:
        return [
            _pick("user-a", winner=ACTUAL_WINNER, scorer=ACTUAL_SCORER),  # both correct
            _pick("user-b", winner=ACTUAL_WINNER, scorer="wrong-scorer"),  # winner only
            _pick("user-c", winner="arg",          scorer=ACTUAL_SCORER),  # scorer only
            _pick("user-d", winner="arg",          scorer="wrong-scorer"),  # both wrong
        ]

    def test_correct_users_affected_winner(self):
        preview = _preview_from_picks(self._abcd(), ACTUAL_WINNER, ACTUAL_SCORER)
        # A and B have correct winner
        assert preview.users_winning_winner == 2

    def test_correct_users_affected_scorer(self):
        preview = _preview_from_picks(self._abcd(), ACTUAL_WINNER, ACTUAL_SCORER)
        # A and C have correct scorer
        assert preview.users_winning_scorer == 2

    def test_winner_pts_total_delta(self):
        preview = _preview_from_picks(self._abcd(), ACTUAL_WINNER, ACTUAL_SCORER)
        assert preview.winner_pts_total_delta == WINNER_PTS * 2  # A and B

    def test_scorer_pts_total_delta(self):
        preview = _preview_from_picks(self._abcd(), ACTUAL_WINNER, ACTUAL_SCORER)
        assert preview.scorer_pts_total_delta == SCORER_PTS * 2  # A and C

    def test_is_first_run_true_when_no_picks_awarded(self):
        preview = _preview_from_picks(self._abcd(), ACTUAL_WINNER, ACTUAL_SCORER)
        assert preview.is_first_run is True

    def test_is_first_run_false_after_scoring(self):
        picks = self._abcd()
        picks[0].winner_points_awarded = WINNER_PTS  # simulates already scored
        preview = _preview_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        assert preview.is_first_run is False

    def test_users_affected_winner_on_rerun_same_result(self):
        """After scoring, re-preview with same result → all deltas = 0."""
        picks = self._abcd()
        _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)  # first run
        preview = _preview_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)  # re-preview
        assert preview.users_affected_winner == 0
        assert preview.users_affected_scorer == 0

    def test_user_a_gets_both(self):
        preview = _preview_from_picks(self._abcd(), ACTUAL_WINNER, ACTUAL_SCORER)
        a = next(u for u in preview.users if u.user_id == "user-a")
        assert a.winner_pts_new == WINNER_PTS
        assert a.scorer_pts_new == SCORER_PTS
        assert a.total_delta == WINNER_PTS + SCORER_PTS

    def test_user_b_gets_winner_only(self):
        preview = _preview_from_picks(self._abcd(), ACTUAL_WINNER, ACTUAL_SCORER)
        b = next(u for u in preview.users if u.user_id == "user-b")
        assert b.winner_pts_new == WINNER_PTS
        assert b.scorer_pts_new == 0
        assert b.total_delta == WINNER_PTS

    def test_user_c_gets_scorer_only(self):
        preview = _preview_from_picks(self._abcd(), ACTUAL_WINNER, ACTUAL_SCORER)
        c = next(u for u in preview.users if u.user_id == "user-c")
        assert c.winner_pts_new == 0
        assert c.scorer_pts_new == SCORER_PTS
        assert c.total_delta == SCORER_PTS

    def test_user_d_gets_nothing(self):
        preview = _preview_from_picks(self._abcd(), ACTUAL_WINNER, ACTUAL_SCORER)
        d = next(u for u in preview.users if u.user_id == "user-d")
        assert d.winner_pts_new == 0
        assert d.scorer_pts_new == 0
        assert d.total_delta == 0

    def test_empty_picks_table(self):
        preview = _preview_from_picks([], ACTUAL_WINNER, ACTUAL_SCORER)
        assert preview.users_affected_winner == 0
        assert preview.users_winning_winner  == 0
        assert preview.winner_pts_total_delta == 0


# ─────────────────────────────────────────────────────────────────────────────
# 3. Apply logic (idempotency + corrections)
# ─────────────────────────────────────────────────────────────────────────────

class TestApplyLogic:

    def _abcd(self) -> list:
        return [
            _pick("user-a", winner=ACTUAL_WINNER, scorer=ACTUAL_SCORER),
            _pick("user-b", winner=ACTUAL_WINNER, scorer="wrong-scorer"),
            _pick("user-c", winner="arg",          scorer=ACTUAL_SCORER),
            _pick("user-d", winner="arg",          scorer="wrong-scorer"),
        ]

    def test_first_run_awards_correct_pts(self):
        picks = self._abcd()
        res = _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)

        assert res["user-a"] == (WINNER_PTS, SCORER_PTS, WINNER_PTS + SCORER_PTS)
        assert res["user-b"] == (WINNER_PTS, 0,          WINNER_PTS)
        assert res["user-c"] == (0,          SCORER_PTS, SCORER_PTS)
        assert res["user-d"] == (0,          0,          0)

    def test_first_run_writes_to_picks(self):
        picks = self._abcd()
        _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)

        a = next(p for p in picks if p.user_id == "user-a")
        assert a.winner_points_awarded == WINNER_PTS
        assert a.scorer_points_awarded == SCORER_PTS

        d = next(p for p in picks if p.user_id == "user-d")
        assert d.winner_points_awarded == 0
        assert d.scorer_points_awarded == 0

    def test_idempotent_same_winner_same_scorer(self):
        """Run twice with same inputs → second run net_delta = 0 for all users."""
        picks = self._abcd()
        _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)   # run 1
        res2 = _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)  # run 2
        for uid, (w, s, net) in res2.items():
            assert net == 0, f"{uid} had non-zero delta on re-run: {net}"

    def test_idempotent_ten_runs(self):
        picks = self._abcd()
        for _ in range(10):
            _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        # After 10 runs each pick should still hold the correct awarded value
        a = next(p for p in picks if p.user_id == "user-a")
        assert a.winner_points_awarded == WINNER_PTS
        assert a.scorer_points_awarded == SCORER_PTS

    def test_correction_wrong_winner_then_right(self):
        """
        Run 1: winner = ARG (wrong).  → user-a gets 0 winner pts.
        Run 2: winner = BRA (correct). → user-a gets +12 delta.
        """
        picks = self._abcd()
        # First run with wrong winner
        _apply_from_picks(picks, "arg", ACTUAL_SCORER)
        a = next(p for p in picks if p.user_id == "user-a")
        assert a.winner_points_awarded == 0  # arg != bra

        # Correction: true winner is BRA
        res2 = _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        assert res2["user-a"][0] == WINNER_PTS   # winner pts now correct
        assert res2["user-a"][2] == WINNER_PTS   # net delta = +12

    def test_correction_removes_old_winner_pts(self):
        """
        Run 1: winner = BRA → user-b (BRA pick) gets 12.
        Correction: winner = ARG → user-b loses 12.
        """
        picks = self._abcd()
        _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)   # BRA wins

        b = next(p for p in picks if p.user_id == "user-b")
        assert b.winner_points_awarded == WINNER_PTS

        # Correction: ARG wins instead
        res2 = _apply_from_picks(picks, "arg", ACTUAL_SCORER)
        b_w, _, b_net = res2["user-b"]
        assert b_w  == 0         # no longer wins winner pts
        assert b_net == -WINNER_PTS  # subtract what was awarded before

    def test_correction_reverses_and_reapplies(self):
        """
        Detailed check that the net effect of correction is exactly the right
        final state — no leftover points from the original wrong result.
        """
        picks = self._abcd()

        # Round 1: score with wrong winner (FRA)
        _apply_from_picks(picks, "fra", ACTUAL_SCORER)
        # At this point: nobody got winner pts (all picks are bra or arg, not fra)
        for p in picks:
            assert p.winner_points_awarded == 0

        # Round 2: correct to BRA
        _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        a = next(p for p in picks if p.user_id == "user-a")
        b = next(p for p in picks if p.user_id == "user-b")
        # A and B (both bra pick) now have correct winner pts
        assert a.winner_points_awarded == WINNER_PTS
        assert b.winner_points_awarded == WINNER_PTS

        # Round 3: re-run same (idempotent)
        res3 = _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        assert all(net == 0 for _, (_, _, net) in res3.items())

    def test_no_picks_returns_empty_results(self):
        res = _apply_from_picks([], ACTUAL_WINNER, ACTUAL_SCORER)
        assert res == {}

    def test_null_actual_winner_everyone_zero(self):
        picks = self._abcd()
        res = _apply_from_picks(picks, None, ACTUAL_SCORER)
        for uid, (w_pts, _, _) in res.items():
            assert w_pts == 0

    def test_null_actual_scorer_everyone_zero(self):
        picks = self._abcd()
        res = _apply_from_picks(picks, ACTUAL_WINNER, None)
        for uid, (_, s_pts, _) in res.items():
            assert s_pts == 0

    def test_pick_with_no_winner_submission_gets_zero(self):
        p = _pick("u1", winner=None, scorer=ACTUAL_SCORER)
        res = _apply_from_picks([p], ACTUAL_WINNER, ACTUAL_SCORER)
        w_pts, s_pts, _ = res["u1"]
        assert w_pts == 0
        assert s_pts == SCORER_PTS

    def test_pick_with_no_scorer_submission_gets_zero(self):
        p = _pick("u1", winner=ACTUAL_WINNER, scorer=None)
        res = _apply_from_picks([p], ACTUAL_WINNER, ACTUAL_SCORER)
        w_pts, s_pts, _ = res["u1"]
        assert w_pts == WINNER_PTS
        assert s_pts == 0


# ─────────────────────────────────────────────────────────────────────────────
# 4. Full ABCD simulation with leaderboard
# ─────────────────────────────────────────────────────────────────────────────

class TestABCDSimulation:
    """
    Users A–D make tournament picks. Verify scoring, ranking, tiebreakers.

    Starting match points (from normal match predictions):
      A = 15 pts (best predictor)
      B = 10 pts
      C =  8 pts
      D =  3 pts

    Tournament picks:
      A: winner=BRA ✓, scorer=Mbappé ✓  → +24
      B: winner=BRA ✓, scorer=wrong    → +12
      C: winner=ARG  ,  scorer=Mbappé ✓  → +12
      D: winner=ARG  ,  scorer=wrong    →  +0

    Final totals:
      A: 15+24 = 39
      B: 10+12 = 22
      C:  8+12 = 20
      D:  3+ 0 =  3

    Rankings: A(1) > B(2) > C(3) > D(4)
    """

    MATCH_PTS = {"user-a": 15, "user-b": 10, "user-c": 8, "user-d": 3}

    def _picks(self) -> list:
        return [
            _pick("user-a", winner=ACTUAL_WINNER, scorer=ACTUAL_SCORER),
            _pick("user-b", winner=ACTUAL_WINNER, scorer="wrong"),
            _pick("user-c", winner="arg",          scorer=ACTUAL_SCORER),
            _pick("user-d", winner="arg",          scorer="wrong"),
        ]

    def _leaderboard(self, users: list[dict]) -> list[dict]:
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

    def test_user_a_total(self):
        picks = self._picks()
        res   = _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        w, s, net = res["user-a"]
        assert net == WINNER_PTS + SCORER_PTS
        assert self.MATCH_PTS["user-a"] + net == 39

    def test_user_b_total(self):
        picks = self._picks()
        res   = _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        _, _, net = res["user-b"]
        assert net == WINNER_PTS
        assert self.MATCH_PTS["user-b"] + net == 22

    def test_user_c_total(self):
        picks = self._picks()
        res   = _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        _, _, net = res["user-c"]
        assert net == SCORER_PTS
        assert self.MATCH_PTS["user-c"] + net == 20

    def test_user_d_total(self):
        picks = self._picks()
        res   = _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        _, _, net = res["user-d"]
        assert net == 0
        assert self.MATCH_PTS["user-d"] + net == 3

    def test_ranking_order(self):
        picks = self._picks()
        res   = _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        joined = datetime(2026, 1, 1, tzinfo=timezone.utc)
        users = [
            {
                "id":                  uid,
                "total_points":        self.MATCH_PTS[uid] + res[uid][2],
                "exact_scores":        1 if uid == "user-a" else 0,
                "correct_predictions": 2 if uid == "user-a" else 1,
                "joined_at":           joined,
            }
            for uid in ["user-a", "user-b", "user-c", "user-d"]
        ]
        ranked = self._leaderboard(users)
        assert [u["id"] for u in ranked] == ["user-a", "user-b", "user-c", "user-d"]

    def test_ranks_are_sequential(self):
        picks = self._picks()
        res   = _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        joined = datetime(2026, 1, 1, tzinfo=timezone.utc)
        users = [
            {
                "id":                  uid,
                "total_points":        self.MATCH_PTS[uid] + res[uid][2],
                "exact_scores":        0,
                "correct_predictions": 0,
                "joined_at":           joined,
            }
            for uid in ["user-a", "user-b", "user-c", "user-d"]
        ]
        ranked = self._leaderboard(users)
        assert [u["rank"] for u in ranked] == [1, 2, 3, 4]

    def test_correction_reorders_ranking(self):
        """
        Correction: ARG wins (not BRA).
        B had BRA → loses 12. C had ARG → gains 12. B and C swap positions.
        Before correction: B=22, C=20. After: B=10, C=20.
        """
        picks = self._picks()
        # First score: BRA wins
        _apply_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)

        # Correction: ARG wins instead
        res2 = _apply_from_picks(picks, "arg", ACTUAL_SCORER)
        b_net = res2["user-b"][2]  # -12 (was 12, now 0)
        c_net = res2["user-c"][2]  # +12 (was 0, now 12 for ARG)

        final_b = self.MATCH_PTS["user-b"] + WINNER_PTS + b_net   # 10+12-12 = 10
        final_c = self.MATCH_PTS["user-c"] + SCORER_PTS + c_net   # 8+12+12 = 32

        assert final_b == 10
        assert final_c == 32  # C now leads over B


# ─────────────────────────────────────────────────────────────────────────────
# 5. Edge cases
# ─────────────────────────────────────────────────────────────────────────────

class TestEdgeCases:

    def test_winner_pts_value_is_12(self):
        assert WINNER_PTS == 12

    def test_scorer_pts_value_is_12(self):
        assert SCORER_PTS == 12

    def test_winner_pts_equal_scorer_pts(self):
        assert WINNER_PTS == SCORER_PTS

    def test_total_possible_tournament_pts(self):
        assert WINNER_PTS + SCORER_PTS == 24

    def test_correction_net_zero_globally(self):
        """
        When winner swaps A↔B, total pts in system stays the same
        if the same number of A and B pickers exist.
        """
        picks = [
            _pick("u1", winner="bra"),
            _pick("u2", winner="arg"),
        ]
        _apply_from_picks(picks, "bra", None)   # bra wins: u1 +12, u2 0
        res2 = _apply_from_picks(picks, "arg", None)  # arg wins: u1 -12, u2 +12

        u1_net = res2["u1"][2]   # -12
        u2_net = res2["u2"][2]   # +12
        assert u1_net + u2_net == 0   # net zero across all users

    def test_previously_null_treated_as_zero_on_first_score(self):
        """winner_points_awarded=None should be treated as 0 for delta calc."""
        p = _pick("u1", winner="bra", winner_awarded=None)
        res = _apply_from_picks([p], "bra", None)
        w_pts, _, net = res["u1"]
        assert w_pts == WINNER_PTS
        assert net   == WINNER_PTS   # 12 - 0 = 12

    def test_already_awarded_zero_on_rerun_same_wrong_pick(self):
        """
        Pick is wrong. After first run, winner_awarded=0.
        Second run with same wrong winner → delta = 0 - 0 = 0.
        """
        p = _pick("u1", winner="arg", winner_awarded=0)
        res = _apply_from_picks([p], "bra", None)
        _, _, net = res["u1"]
        assert net == 0

    def test_many_users_only_correct_ones_get_pts(self):
        picks = [_pick(f"u{i}", winner="bra" if i % 3 == 0 else "arg") for i in range(30)]
        res = _apply_from_picks(picks, "bra", None)
        for uid, (w_pts, _, _) in res.items():
            idx = int(uid[1:])
            if idx % 3 == 0:
                assert w_pts == WINNER_PTS
            else:
                assert w_pts == 0

    def test_scorer_case_sensitive_uuid(self):
        """Scorer IDs are UUIDs — case matters."""
        p = _pick("u1", scorer="PLAYER-UUID")
        assert _compute_scorer_pts(p, "player-uuid") == 0   # different case → wrong
        assert _compute_scorer_pts(p, "PLAYER-UUID") == SCORER_PTS

    def test_winner_comparison_always_lowercase(self):
        """Router normalizes picks to lowercase; actual is also lowercased by service."""
        p = _pick("u1", winner="bra")   # stored lowercase
        # Service lowercases actual_winner_code in apply()
        assert _compute_winner_pts(p, "BRA") == WINNER_PTS   # BRA → bra via lower()
        assert _compute_winner_pts(p, "bra") == WINNER_PTS


# ─────────────────────────────────────────────────────────────────────────────
# 6. ScoringPreview properties
# ─────────────────────────────────────────────────────────────────────────────

class TestScoringPreviewProperties:

    def _abcd_preview(self) -> ScoringPreview:
        picks = [
            _pick("user-a", winner=ACTUAL_WINNER, scorer=ACTUAL_SCORER),
            _pick("user-b", winner=ACTUAL_WINNER, scorer="wrong"),
            _pick("user-c", winner="arg",          scorer=ACTUAL_SCORER),
            _pick("user-d", winner="arg",          scorer="wrong"),
        ]
        return _preview_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)

    def test_users_winning_winner_count(self):
        assert self._abcd_preview().users_winning_winner == 2

    def test_users_winning_scorer_count(self):
        assert self._abcd_preview().users_winning_scorer == 2

    def test_winner_pts_total_delta(self):
        assert self._abcd_preview().winner_pts_total_delta == WINNER_PTS * 2

    def test_scorer_pts_total_delta(self):
        assert self._abcd_preview().scorer_pts_total_delta == SCORER_PTS * 2

    def test_users_affected_winner(self):
        # A and B will have delta +12
        assert self._abcd_preview().users_affected_winner == 2

    def test_users_affected_scorer(self):
        # A and C will have delta +12
        assert self._abcd_preview().users_affected_scorer == 2

    def test_total_delta_per_user(self):
        preview = self._abcd_preview()
        by_id = {u.user_id: u for u in preview.users}
        assert by_id["user-a"].total_delta == WINNER_PTS + SCORER_PTS
        assert by_id["user-b"].total_delta == WINNER_PTS
        assert by_id["user-c"].total_delta == SCORER_PTS
        assert by_id["user-d"].total_delta == 0

    def test_is_first_run_true_initially(self):
        assert self._abcd_preview().is_first_run is True

    def test_is_first_run_false_after_partial_score(self):
        picks = [
            _pick("user-a", winner=ACTUAL_WINNER, winner_awarded=12),  # already scored
            _pick("user-b", winner=ACTUAL_WINNER),
        ]
        preview = _preview_from_picks(picks, ACTUAL_WINNER, ACTUAL_SCORER)
        assert preview.is_first_run is False


# ─────────────────────────────────────────────────────────────────────────────
# 7. Repeated scoring run counting (simulated)
# ─────────────────────────────────────────────────────────────────────────────

class TestScoringRunCounting:

    def test_first_run_is_not_correction(self):
        """is_correction = False when no pick has ever been scored."""
        picks = [_pick("u1", winner="bra")]
        is_correction = any(
            p.winner_points_awarded is not None or p.scorer_points_awarded is not None
            for p in picks
        )
        assert is_correction is False

    def test_second_run_is_correction(self):
        """is_correction = True once any pick has awarded pts (even 0)."""
        picks = [_pick("u1", winner="bra", winner_awarded=0)]
        is_correction = any(
            p.winner_points_awarded is not None or p.scorer_points_awarded is not None
            for p in picks
        )
        assert is_correction is True

    def test_correcting_wrong_winner_flips_correction_flag(self):
        picks = [_pick("u1", winner="bra")]
        # Run 1 — not a correction
        before = any(p.winner_points_awarded is not None for p in picks)
        assert before is False

        _apply_from_picks(picks, "fra", None)   # wrong winner

        # Run 2 — is now a correction
        after = any(p.winner_points_awarded is not None for p in picks)
        assert after is True
