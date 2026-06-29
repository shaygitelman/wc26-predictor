"""
Tests for knockout bracket propagation.

Covers _ko_winner (pure function) and the full Phase-A propagation logic
across all rounds (R32→R16, R16→QF, QF→SF, SF→Final, SF→3rd).
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _match(
    home_code: str = "AAA",
    away_code: str = "BBB",
    home_score: int | None = None,
    away_score: int | None = None,
    penalty_home: int | None = None,
    penalty_away: int | None = None,
    status: str = "finished",
    ext_id: str = "manual-wc2026-r32-1",
) -> MagicMock:
    m = MagicMock()
    m.home_team_code = home_code
    m.away_team_code = away_code
    m.home_team_name = home_code + " FC"
    m.away_team_name = away_code + " FC"
    m.home_flag_url = f"https://flags/{home_code.lower()}.png"
    m.away_flag_url = f"https://flags/{away_code.lower()}.png"
    m.home_score = home_score
    m.away_score = away_score
    m.penalty_home = penalty_home
    m.penalty_away = penalty_away
    m.status = status
    m.external_id = ext_id
    return m


def _placeholder(
    slot: int,
    round_code: str = "r16",
    home_code: str = "TBD",
    away_code: str = "TBD",
) -> MagicMock:
    ph = MagicMock()
    ph.id = f"ph-{round_code}-{slot}"
    ph.external_id = f"manual-wc2026-{round_code}-{slot}"
    ph.home_team_code = home_code
    ph.away_team_code = away_code
    ph.round = round_code
    return ph


# ── _ko_winner unit tests ─────────────────────────────────────────────────────

class TestKoWinner:
    """Pure-function tests — no DB, no async."""

    def _winner(self, m, want=True):
        from services.sync import _ko_winner
        return _ko_winner(m, want_winner=want)

    def test_home_wins_by_score(self):
        m = _match("BRA", "JPN", home_score=2, away_score=0)
        code, name, _ = self._winner(m)
        assert code == "BRA"

    def test_away_wins_by_score(self):
        m = _match("BRA", "JPN", home_score=0, away_score=1)
        code, name, _ = self._winner(m)
        assert code == "JPN"

    def test_loser_returned_when_want_winner_false(self):
        m = _match("BRA", "JPN", home_score=2, away_score=0)
        code, _, _ = self._winner(m, want=False)
        assert code == "JPN"  # loser

    def test_away_loser_returned(self):
        m = _match("BRA", "JPN", home_score=0, away_score=1)
        code, _, _ = self._winner(m, want=False)
        assert code == "BRA"  # loser

    def test_tied_score_no_penalty_returns_none(self):
        m = _match("BRA", "JPN", home_score=1, away_score=1)
        assert self._winner(m) is None

    def test_tied_score_penalty_home_wins(self):
        m = _match("BRA", "JPN", home_score=1, away_score=1,
                   penalty_home=4, penalty_away=3)
        code, _, _ = self._winner(m)
        assert code == "BRA"

    def test_tied_score_penalty_away_wins(self):
        m = _match("BRA", "JPN", home_score=1, away_score=1,
                   penalty_home=3, penalty_away=4)
        code, _, _ = self._winner(m)
        assert code == "JPN"

    def test_tied_score_penalty_away_wins_loser(self):
        m = _match("BRA", "JPN", home_score=1, away_score=1,
                   penalty_home=3, penalty_away=4)
        code, _, _ = self._winner(m, want=False)
        assert code == "BRA"  # loser = home

    def test_tied_penalty_scores_returns_none(self):
        m = _match("BRA", "JPN", home_score=1, away_score=1,
                   penalty_home=5, penalty_away=5)
        assert self._winner(m) is None

    def test_missing_home_score_returns_none(self):
        m = _match("BRA", "JPN", home_score=None, away_score=1)
        assert self._winner(m) is None

    def test_missing_away_score_returns_none(self):
        m = _match("BRA", "JPN", home_score=2, away_score=None)
        assert self._winner(m) is None

    def test_returns_flag_url(self):
        m = _match("BRA", "JPN", home_score=2, away_score=0)
        _, _, flag = self._winner(m)
        assert "bra" in (flag or "").lower()

    def test_away_winner_flag_url(self):
        m = _match("BRA", "JPN", home_score=0, away_score=1)
        _, _, flag = self._winner(m)
        assert "jpn" in (flag or "").lower()

    def test_3_0_home_win(self):
        m = _match("ARG", "CPV", home_score=3, away_score=0)
        code, _, _ = self._winner(m)
        assert code == "ARG"

    def test_0_0_no_penalty_none(self):
        # 0-0 after ET, penalties not yet decided
        m = _match("ESP", "AUT", home_score=0, away_score=0)
        assert self._winner(m) is None

    def test_0_0_with_penalty_winner(self):
        m = _match("ESP", "AUT", home_score=0, away_score=0,
                   penalty_home=5, penalty_away=3)
        code, _, _ = self._winner(m)
        assert code == "ESP"


# ── _BRACKET_FEEDERS structure tests ─────────────────────────────────────────

class TestBracketFeedersStructure:

    def test_r16_has_8_slots(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        assert len(_BRACKET_FEEDERS["r16"]) == 8

    def test_qf_has_4_slots(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        assert len(_BRACKET_FEEDERS["qf"]) == 4

    def test_sf_has_2_slots(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        assert len(_BRACKET_FEEDERS["sf"]) == 2

    def test_final_has_1_slot(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        assert len(_BRACKET_FEEDERS["final"]) == 1

    def test_3rd_has_1_slot(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        assert len(_BRACKET_FEEDERS["3rd"]) == 1

    def test_r16_slot1_feeds_from_r32_slots_1_and_2(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        assert _BRACKET_FEEDERS["r16"][0] == (1, 2)

    def test_r16_slot2_feeds_from_r32_slots_3_and_4(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        assert _BRACKET_FEEDERS["r16"][1] == (3, 4)

    def test_final_feeds_from_sf_1_and_2(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        assert _BRACKET_FEEDERS["final"][0] == (1, 2)

    def test_3rd_feeds_from_sf_1_and_2(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        assert _BRACKET_FEEDERS["3rd"][0] == (1, 2)

    def test_all_feeder_indices_are_valid_r32_slots(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        for h, a in _BRACKET_FEEDERS["r16"]:
            assert 1 <= h <= 16
            assert 1 <= a <= 16

    def test_qf_feeder_indices_are_valid_r16_slots(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        for h, a in _BRACKET_FEEDERS["qf"]:
            assert 1 <= h <= 8
            assert 1 <= a <= 8

    def test_prev_round_mapping_complete(self):
        from services.wc2026_seed import _PREV_ROUND
        assert _PREV_ROUND["r16"] == "r32"
        assert _PREV_ROUND["qf"] == "r16"
        assert _PREV_ROUND["sf"] == "qf"
        assert _PREV_ROUND["final"] == "sf"
        assert _PREV_ROUND["3rd"] == "sf"


# ── Bracket propagation behaviour ─────────────────────────────────────────────

class TestBracketPropagation:
    """
    Exercises _ko_winner against real _BRACKET_FEEDERS configurations to verify
    that the correct team ends up in the correct slot and position.
    """

    def _propagate_slot(self, prev_matches, home_src, away_src, next_ph,
                        use_losers=False):
        """
        Simulate what Phase A does for one slot.
        Returns (updated_home_code, updated_away_code) — None if not updated.
        """
        from services.sync import _ko_winner

        hm = prev_matches[home_src - 1]
        am = prev_matches[away_src - 1]

        h_is_tbd = (next_ph.home_team_code or "TBD").upper() in ("TBD", "", "NONE")
        a_is_tbd = (next_ph.away_team_code or "TBD").upper() in ("TBD", "", "NONE")

        new_home = None
        new_away = None

        if hm.status == "finished" and h_is_tbd:
            info = _ko_winner(hm, not use_losers)
            if info:
                new_home = info[0]

        if am.status == "finished" and a_is_tbd:
            info = _ko_winner(am, not use_losers)
            if info:
                new_away = info[0]

        return new_home, new_away

    # ── R32 → R16 ─────────────────────────────────────────────────

    def test_r32_slot1_winner_to_r16_slot1_home(self):
        """Winner of R32 slot 1 (BRA vs JPN) → R16 slot 1 as home team."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [_match("BRA", "JPN", 2, 0)] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(1, 16)]
        ph = _placeholder(1, "r16")
        h, a = _BRACKET_FEEDERS["r16"][0]  # (1, 2)
        home_code, _ = self._propagate_slot(r32, h, a, ph)
        assert home_code == "BRA"

    def test_r32_slot2_winner_to_r16_slot1_away(self):
        """Winner of R32 slot 2 → R16 slot 1 as away team."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [
            _match("BRA", "JPN", 2, 0, ext_id="manual-wc2026-r32-1"),
            _match("GER", "PAR", 1, 0, ext_id="manual-wc2026-r32-2"),
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(2, 16)]
        ph = _placeholder(1, "r16")
        h, a = _BRACKET_FEEDERS["r16"][0]  # (1, 2)
        _, away_code = self._propagate_slot(r32, h, a, ph)
        assert away_code == "GER"

    def test_only_one_feeder_done_propagates_that_team_only(self):
        """If only R32 slot 1 finished, only home is propagated; away stays None."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [
            _match("BRA", "JPN", 2, 0, status="finished"),
            _match("GER", "PAR", status="scheduled"),
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(2, 16)]
        ph = _placeholder(1, "r16")
        h, a = _BRACKET_FEEDERS["r16"][0]
        home_code, away_code = self._propagate_slot(r32, h, a, ph)
        assert home_code == "BRA"
        assert away_code is None

    def test_only_away_feeder_done_propagates_away_only(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [
            _match("BRA", "JPN", status="scheduled"),
            _match("GER", "PAR", 1, 0, status="finished"),
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(2, 16)]
        ph = _placeholder(1, "r16")
        h, a = _BRACKET_FEEDERS["r16"][0]
        home_code, away_code = self._propagate_slot(r32, h, a, ph)
        assert home_code is None
        assert away_code == "GER"

    def test_neither_feeder_done_no_propagation(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [
            _match("BRA", "JPN", status="scheduled"),
            _match("GER", "PAR", status="scheduled"),
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(2, 16)]
        ph = _placeholder(1, "r16")
        h, a = _BRACKET_FEEDERS["r16"][0]
        home_code, away_code = self._propagate_slot(r32, h, a, ph)
        assert home_code is None
        assert away_code is None

    # ── ET / Penalty winner ────────────────────────────────────────

    def test_et_winner_propagates_correctly(self):
        """Match decided in ET (2-1 after ET, so home wins)."""
        m = _match("BRA", "JPN", home_score=2, away_score=1, status="finished")
        from services.sync import _ko_winner
        code, _, _ = _ko_winner(m, want_winner=True)
        assert code == "BRA"

    def test_penalty_winner_propagates_correctly(self):
        """Match tied 1-1; Brazil wins 4-2 on penalties → Brazil to next round."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [
            _match("BRA", "JPN", 1, 1, penalty_home=4, penalty_away=2),
            _match("GER", "PAR", 2, 0),
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(2, 16)]
        ph = _placeholder(1, "r16")
        h, a = _BRACKET_FEEDERS["r16"][0]
        home_code, _ = self._propagate_slot(r32, h, a, ph)
        assert home_code == "BRA"

    def test_penalty_loser_not_propagated_as_winner(self):
        """Japan loses on penalties — must not advance as home team."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [
            _match("BRA", "JPN", 1, 1, penalty_home=4, penalty_away=2),
            _match("GER", "PAR", 2, 0),
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(2, 16)]
        ph = _placeholder(1, "r16")
        h, a = _BRACKET_FEEDERS["r16"][0]
        home_code, _ = self._propagate_slot(r32, h, a, ph)
        assert home_code != "JPN"

    def test_tied_score_no_penalty_not_propagated(self):
        """Tied score, no penalty data yet — must not propagate."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [
            _match("BRA", "JPN", 1, 1),   # no penalty data
            _match("GER", "PAR", 2, 0),
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(2, 16)]
        ph = _placeholder(1, "r16")
        h, a = _BRACKET_FEEDERS["r16"][0]
        home_code, _ = self._propagate_slot(r32, h, a, ph)
        assert home_code is None

    # ── Idempotency ────────────────────────────────────────────────

    def test_already_set_home_not_overwritten(self):
        """If home slot already has a team, do not overwrite."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [
            _match("BRA", "JPN", 2, 0),
            _match("GER", "PAR", 1, 0),
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(2, 16)]
        ph = _placeholder(1, "r16", home_code="BRA")  # already set
        h, a = _BRACKET_FEEDERS["r16"][0]
        home_code, _ = self._propagate_slot(r32, h, a, ph)
        assert home_code is None  # nothing new to write

    def test_already_set_away_not_overwritten(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [
            _match("BRA", "JPN", 2, 0),
            _match("GER", "PAR", 1, 0),
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(2, 16)]
        ph = _placeholder(1, "r16", away_code="GER")  # already set
        h, a = _BRACKET_FEEDERS["r16"][0]
        _, away_code = self._propagate_slot(r32, h, a, ph)
        assert away_code is None  # nothing new to write

    def test_half_set_slot_fills_remaining(self):
        """Home already set; away feeder now finished — only away is written."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [
            _match("BRA", "JPN", 2, 0),
            _match("GER", "PAR", 1, 0),
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(2, 16)]
        ph = _placeholder(1, "r16", home_code="BRA", away_code="TBD")
        h, a = _BRACKET_FEEDERS["r16"][0]
        home_code, away_code = self._propagate_slot(r32, h, a, ph)
        assert home_code is None   # already BRA, not re-written
        assert away_code == "GER"  # now filled

    # ── SF → 3rd place (losers) ────────────────────────────────────

    def test_sf_loser1_goes_to_3rd_home(self):
        """Loser of SF slot 1 → 3rd place home."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        sf = [
            _match("FRA", "ESP", 2, 1),  # FRA wins, ESP is loser
            _match("BRA", "ARG", 1, 0),
        ]
        ph = _placeholder(1, "3rd")
        h, a = _BRACKET_FEEDERS["3rd"][0]  # (1, 2)
        home_code, _ = self._propagate_slot(sf, h, a, ph, use_losers=True)
        assert home_code == "ESP"

    def test_sf_loser2_goes_to_3rd_away(self):
        """Loser of SF slot 2 → 3rd place away."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        sf = [
            _match("FRA", "ESP", 2, 1),
            _match("BRA", "ARG", 1, 0),  # BRA wins, ARG is loser
        ]
        ph = _placeholder(1, "3rd")
        h, a = _BRACKET_FEEDERS["3rd"][0]
        _, away_code = self._propagate_slot(sf, h, a, ph, use_losers=True)
        assert away_code == "ARG"

    def test_sf_winner_not_placed_in_3rd(self):
        """SF winner must NOT appear in the 3rd-place match."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        sf = [
            _match("FRA", "ESP", 2, 1),  # FRA wins
            _match("BRA", "ARG", 1, 0),
        ]
        ph = _placeholder(1, "3rd")
        h, a = _BRACKET_FEEDERS["3rd"][0]
        home_code, _ = self._propagate_slot(sf, h, a, ph, use_losers=True)
        assert home_code != "FRA"

    # ── SF → Final (winners) ───────────────────────────────────────

    def test_sf_winner1_goes_to_final_home(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        sf = [
            _match("FRA", "ESP", 2, 1),  # FRA wins
            _match("BRA", "ARG", 1, 0),
        ]
        ph = _placeholder(1, "final")
        h, a = _BRACKET_FEEDERS["final"][0]
        home_code, _ = self._propagate_slot(sf, h, a, ph, use_losers=False)
        assert home_code == "FRA"

    def test_sf_winner2_goes_to_final_away(self):
        from services.wc2026_seed import _BRACKET_FEEDERS
        sf = [
            _match("FRA", "ESP", 2, 1),
            _match("BRA", "ARG", 1, 0),  # BRA wins
        ]
        ph = _placeholder(1, "final")
        h, a = _BRACKET_FEEDERS["final"][0]
        _, away_code = self._propagate_slot(sf, h, a, ph, use_losers=False)
        assert away_code == "BRA"

    # ── Full bracket path ──────────────────────────────────────────

    def test_brazil_path_r32_to_r16(self):
        """BRA wins R32 slot 2 → appears in R16 slot 1 as AWAY team."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        r32 = [
            _match("RSA", "CAN", 2, 0, ext_id="manual-wc2026-r32-1"),   # slot 1: RSA wins
            _match("BRA", "JPN", 3, 0, ext_id="manual-wc2026-r32-2"),   # slot 2: BRA wins
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(3, 17)]

        ph = _placeholder(1, "r16")
        h_src, a_src = _BRACKET_FEEDERS["r16"][0]  # (1, 2)

        home_code, away_code = self._propagate_slot(r32, h_src, a_src, ph)
        assert home_code == "RSA"
        assert away_code == "BRA"

    def test_full_bracket_r16_to_qf(self):
        """QF slot 1 home comes from R16 slot 1 winner."""
        from services.wc2026_seed import _BRACKET_FEEDERS
        r16 = [
            _match("BRA", "RSA", 2, 0),  # BRA wins → QF slot 1 home
            _match("GER", "FRA", 1, 0),  # GER wins → QF slot 1 away
        ] + [_match(f"T{i}", f"U{i}", 1, 0) for i in range(3, 9)]

        ph = _placeholder(1, "qf")
        h_src, a_src = _BRACKET_FEEDERS["qf"][0]  # (1, 2)

        home_code, away_code = self._propagate_slot(r16, h_src, a_src, ph)
        assert home_code == "BRA"
        assert away_code == "GER"
