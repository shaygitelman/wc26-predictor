"""
Tests for WC 2026 match schedule correctness.

Validates:
  - _parse_round correctly maps all API-Football round strings to int_round values
  - _ROUND_MAP maps all int_round values to the correct round codes
  - No advanced knockout round (R16/QF/SF/Final) can be mis-mapped to 'r32'
  - All KO placeholder dates are unique across all rounds
  - Each round has the correct number of matches
  - Matches within a round are scheduled in ascending order
  - R32 ends before R16 starts, R16 before QF, etc.
  - Bracket feeders reference valid slot numbers
  - The full sync pipeline (API string → int_round → round code) produces
    the correct round code for every stage
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import datetime, timezone

import pytest

from providers.apifootball import _parse_round
from services.sync import _ROUND_MAP
from services.wc2026_seed import (
    _BRACKET_FEEDERS,
    _KO_DATES,
    _PREV_ROUND,
    _R32_DATES,
    _R32_LABELS,
)

VALID_ROUND_CODES = {"group", "r32", "r16", "qf", "sf", "3rd", "final"}
ADVANCED_ROUNDS   = {"r16", "qf", "sf", "3rd", "final"}


# ─────────────────────────────────────────────────────────────────────────────
# 1. _parse_round — API string → int_round
# ─────────────────────────────────────────────────────────────────────────────

class TestParseRound:
    """_parse_round must map every API-Football round string to the right int."""

    def test_group_stage_matchday_1(self):
        assert _parse_round("Group Stage - 1") == 1

    def test_group_stage_matchday_2(self):
        assert _parse_round("Group Stage - 2") == 2

    def test_group_stage_matchday_3(self):
        assert _parse_round("Group Stage - 3") == 3

    def test_round_of_32(self):
        assert _parse_round("Round of 32") == 4

    def test_round_of_16(self):
        assert _parse_round("Round of 16") == 5

    def test_quarter_finals(self):
        assert _parse_round("Quarter-finals") == 6

    def test_semi_finals(self):
        assert _parse_round("Semi-finals") == 7

    def test_third_place_final(self):
        assert _parse_round("3rd Place Final") == 8

    def test_final(self):
        assert _parse_round("Final") == 9

    def test_case_insensitive_round_of_16(self):
        assert _parse_round("round of 16") == 5

    def test_case_insensitive_quarter_finals(self):
        assert _parse_round("QUARTER-FINALS") == 6

    def test_group_stage_without_matchday_defaults_to_1(self):
        assert _parse_round("Group Stage") == 1

    def test_unknown_string_does_not_return_r32_int(self):
        # Unknown round strings fall back to 1, not 4 (r32)
        assert _parse_round("Unknown Stage") != 4

    def test_round_of_32_and_round_of_16_produce_different_ints(self):
        r32_int = _parse_round("Round of 32")
        r16_int = _parse_round("Round of 16")
        assert r32_int != r16_int
        assert r32_int == 4
        assert r16_int == 5

    def test_final_not_confused_with_3rd_place_final(self):
        # "Final" alone → 9; "3rd Place Final" → 8
        assert _parse_round("Final") == 9
        assert _parse_round("3rd Place Final") == 8


# ─────────────────────────────────────────────────────────────────────────────
# 2. _ROUND_MAP — int_round → round code
# ─────────────────────────────────────────────────────────────────────────────

class TestRoundMap:
    """_ROUND_MAP must map every int_round to the correct round code."""

    def test_group_rounds_map_to_group(self):
        assert _ROUND_MAP[1] == "group"
        assert _ROUND_MAP[2] == "group"
        assert _ROUND_MAP[3] == "group"

    def test_knockout_int_rounds_map_correctly(self):
        assert _ROUND_MAP[4] == "r32"
        assert _ROUND_MAP[5] == "r16"
        assert _ROUND_MAP[6] == "qf"
        assert _ROUND_MAP[7] == "sf"
        assert _ROUND_MAP[8] == "3rd"
        assert _ROUND_MAP[9] == "final"

    def test_all_target_codes_are_valid(self):
        for int_round, code in _ROUND_MAP.items():
            assert code in VALID_ROUND_CODES, \
                f"int_round={int_round} maps to unknown code '{code}'"

    def test_no_advanced_int_round_maps_to_r32(self):
        # int_rounds 5-9 must NEVER map to 'r32'
        for int_round in range(5, 10):
            assert _ROUND_MAP.get(int_round) != "r32", \
                f"int_round={int_round} (advanced round) incorrectly maps to 'r32'"


# ─────────────────────────────────────────────────────────────────────────────
# 3. Full sync pipeline — API string → round code (end-to-end)
# ─────────────────────────────────────────────────────────────────────────────

class TestFullSyncPipeline:
    """The complete _parse_round + _ROUND_MAP pipeline must return the right code."""

    @pytest.mark.parametrize("api_str,expected_code", [
        ("Group Stage - 1",  "group"),
        ("Group Stage - 2",  "group"),
        ("Group Stage - 3",  "group"),
        ("Round of 32",      "r32"),
        ("Round of 16",      "r16"),
        ("Quarter-finals",   "qf"),
        ("Semi-finals",      "sf"),
        ("3rd Place Final",  "3rd"),
        ("Final",            "final"),
    ])
    def test_api_string_to_round_code(self, api_str: str, expected_code: str):
        int_round  = _parse_round(api_str)
        round_code = _ROUND_MAP.get(int_round, "group")
        assert round_code == expected_code, \
            f"'{api_str}' → int={int_round} → '{round_code}', expected '{expected_code}'"

    def test_round_of_16_never_produces_r32(self):
        assert _ROUND_MAP.get(_parse_round("Round of 16")) != "r32"

    def test_quarter_finals_never_produces_r32(self):
        assert _ROUND_MAP.get(_parse_round("Quarter-finals")) != "r32"

    def test_semi_finals_never_produces_r32(self):
        assert _ROUND_MAP.get(_parse_round("Semi-finals")) != "r32"

    def test_3rd_place_final_never_produces_r32(self):
        assert _ROUND_MAP.get(_parse_round("3rd Place Final")) != "r32"

    def test_final_never_produces_r32(self):
        assert _ROUND_MAP.get(_parse_round("Final")) != "r32"


# ─────────────────────────────────────────────────────────────────────────────
# 4. KO date uniqueness — no duplicates within or across rounds
# ─────────────────────────────────────────────────────────────────────────────

class TestKODatesUniqueness:
    """All KO placeholder scheduled_at values must be distinct."""

    def test_r32_dates_all_unique(self):
        assert len(_R32_DATES) == len(set(_R32_DATES)), \
            "R32 has duplicate scheduled_at values"

    def test_r16_dates_all_unique(self):
        dates = _KO_DATES["r16"]
        assert len(dates) == len(set(dates)), "R16 has duplicate scheduled_at values"

    def test_qf_dates_all_unique(self):
        dates = _KO_DATES["qf"]
        assert len(dates) == len(set(dates)), "QF has duplicate scheduled_at values"

    def test_sf_dates_all_unique(self):
        dates = _KO_DATES["sf"]
        assert len(dates) == len(set(dates)), "SF has duplicate scheduled_at values"

    def test_all_ko_dates_globally_unique(self):
        all_dates: list[datetime] = []
        for dates in _KO_DATES.values():
            all_dates.extend(dates)
        assert len(all_dates) == len(set(all_dates)), \
            "Duplicate scheduled_at found across knockout rounds"

    def test_ko_dates_r32_matches_r32_dates_constant(self):
        assert _KO_DATES["r32"] == _R32_DATES, \
            "_KO_DATES['r32'] must be identical to the _R32_DATES list"


# ─────────────────────────────────────────────────────────────────────────────
# 5. KO match counts — exactly the right number of matches per round
# ─────────────────────────────────────────────────────────────────────────────

class TestKORoundCounts:
    """Each knockout round must have the correct match count."""

    def test_r32_has_16_matches(self):
        assert len(_KO_DATES["r32"]) == 16

    def test_r16_has_8_matches(self):
        assert len(_KO_DATES["r16"]) == 8

    def test_qf_has_4_matches(self):
        assert len(_KO_DATES["qf"]) == 4

    def test_sf_has_2_matches(self):
        assert len(_KO_DATES["sf"]) == 2

    def test_3rd_has_1_match(self):
        assert len(_KO_DATES["3rd"]) == 1

    def test_final_has_1_match(self):
        assert len(_KO_DATES["final"]) == 1

    def test_total_ko_matches_is_32(self):
        total = sum(len(v) for v in _KO_DATES.values())
        assert total == 32, f"Expected 32 total KO matches, got {total}"

    def test_r32_labels_count_matches_r32_dates(self):
        assert len(_R32_LABELS) == len(_KO_DATES["r32"]), \
            "_R32_LABELS length must equal number of R32 match slots"

    def test_all_ko_rounds_present(self):
        expected = {"r32", "r16", "qf", "sf", "3rd", "final"}
        assert set(_KO_DATES.keys()) == expected, \
            f"_KO_DATES keys {set(_KO_DATES.keys())} != expected {expected}"


# ─────────────────────────────────────────────────────────────────────────────
# 6. Advanced KO rounds must NOT be labeled as r32
# ─────────────────────────────────────────────────────────────────────────────

class TestNoAdvancedRoundAsR32:
    """R16/QF/SF/3rd/Final rounds must never share the 'r32' round code."""

    def test_r16_external_ids_encode_r16_not_r32(self):
        for slot_idx in range(len(_KO_DATES["r16"])):
            ext_id = f"manual-wc2026-r16-{slot_idx + 1}"
            assert "r32" not in ext_id, \
                f"R16 placeholder external_id '{ext_id}' contains 'r32'"

    def test_qf_external_ids_encode_qf_not_r32(self):
        for slot_idx in range(len(_KO_DATES["qf"])):
            ext_id = f"manual-wc2026-qf-{slot_idx + 1}"
            assert "r32" not in ext_id

    def test_sf_external_ids_encode_sf_not_r32(self):
        for slot_idx in range(len(_KO_DATES["sf"])):
            ext_id = f"manual-wc2026-sf-{slot_idx + 1}"
            assert "r32" not in ext_id

    def test_advanced_round_dates_not_in_r32_range(self):
        """R16/QF/SF/3rd/Final dates must all be strictly after the last R32 date."""
        last_r32 = max(_KO_DATES["r32"])
        for round_code in ADVANCED_ROUNDS:
            for dt in _KO_DATES[round_code]:
                assert dt > last_r32, \
                    f"{round_code} match at {dt} is not after last R32 match at {last_r32}"

    def test_each_round_key_is_correct_not_r32(self):
        for round_code in ADVANCED_ROUNDS:
            assert round_code in _KO_DATES, f"'{round_code}' missing from _KO_DATES"
            assert round_code != "r32"


# ─────────────────────────────────────────────────────────────────────────────
# 7. Chronological ordering — rounds must not overlap
# ─────────────────────────────────────────────────────────────────────────────

class TestKOChronologicalOrder:
    """Within each round dates are ascending; rounds do not overlap."""

    def test_r32_dates_ascending(self):
        dates = _KO_DATES["r32"]
        assert dates == sorted(dates), "R32 dates are not in ascending order"

    def test_r16_dates_ascending(self):
        dates = _KO_DATES["r16"]
        assert dates == sorted(dates), "R16 dates are not in ascending order"

    def test_qf_dates_ascending(self):
        dates = _KO_DATES["qf"]
        assert dates == sorted(dates), "QF dates are not in ascending order"

    def test_sf_dates_ascending(self):
        dates = _KO_DATES["sf"]
        assert dates == sorted(dates), "SF dates are not in ascending order"

    def test_r32_ends_before_r16_starts(self):
        assert max(_KO_DATES["r32"]) < min(_KO_DATES["r16"]), \
            "R32 overlaps with R16"

    def test_r16_ends_before_qf_starts(self):
        assert max(_KO_DATES["r16"]) < min(_KO_DATES["qf"]), \
            "R16 overlaps with QF"

    def test_qf_ends_before_sf_starts(self):
        assert max(_KO_DATES["qf"]) < min(_KO_DATES["sf"]), \
            "QF overlaps with SF"

    def test_sf_ends_before_3rd_starts(self):
        assert max(_KO_DATES["sf"]) < _KO_DATES["3rd"][0], \
            "SF overlaps with 3rd Place"

    def test_3rd_before_final(self):
        assert _KO_DATES["3rd"][0] < _KO_DATES["final"][0], \
            "3rd Place match is not before the Final"

    def test_r32_starts_on_or_after_june_28(self):
        first_r32 = min(_KO_DATES["r32"])
        earliest = datetime(2026, 6, 28, tzinfo=timezone.utc)
        assert first_r32 >= earliest, \
            f"First R32 match {first_r32} is before June 28 2026"

    def test_final_is_the_last_match_of_the_tournament(self):
        final_dt = _KO_DATES["final"][0]
        for round_code, dates in _KO_DATES.items():
            if round_code == "final":
                continue
            for dt in dates:
                assert dt < final_dt, \
                    f"{round_code} match at {dt} is scheduled after the Final at {final_dt}"

    def test_all_ko_dates_in_2026(self):
        for round_code, dates in _KO_DATES.items():
            for dt in dates:
                assert dt.year == 2026, \
                    f"{round_code} match has year {dt.year}, expected 2026"


# ─────────────────────────────────────────────────────────────────────────────
# 8. Bracket feeders — slot references are in-range and logically consistent
# ─────────────────────────────────────────────────────────────────────────────

class TestBracketFeeders:
    """Bracket feeder tuples must reference valid slot numbers for their source round."""

    def test_r16_feeders_reference_valid_r32_slots(self):
        r32_count = len(_KO_DATES["r32"])
        for home_src, away_src in _BRACKET_FEEDERS["r16"]:
            assert 1 <= home_src <= r32_count, \
                f"R16 home_src={home_src} out of range [1, {r32_count}]"
            assert 1 <= away_src <= r32_count, \
                f"R16 away_src={away_src} out of range [1, {r32_count}]"

    def test_qf_feeders_reference_valid_r16_slots(self):
        r16_count = len(_KO_DATES["r16"])
        for home_src, away_src in _BRACKET_FEEDERS["qf"]:
            assert 1 <= home_src <= r16_count
            assert 1 <= away_src <= r16_count

    def test_sf_feeders_reference_valid_qf_slots(self):
        qf_count = len(_KO_DATES["qf"])
        for home_src, away_src in _BRACKET_FEEDERS["sf"]:
            assert 1 <= home_src <= qf_count
            assert 1 <= away_src <= qf_count

    def test_final_feeder_references_valid_sf_slots(self):
        sf_count = len(_KO_DATES["sf"])
        for home_src, away_src in _BRACKET_FEEDERS["final"]:
            assert 1 <= home_src <= sf_count
            assert 1 <= away_src <= sf_count

    def test_3rd_feeder_references_valid_sf_slots(self):
        sf_count = len(_KO_DATES["sf"])
        for home_src, away_src in _BRACKET_FEEDERS["3rd"]:
            assert 1 <= home_src <= sf_count
            assert 1 <= away_src <= sf_count

    def test_r16_feeder_count_matches_r16_match_count(self):
        assert len(_BRACKET_FEEDERS["r16"]) == len(_KO_DATES["r16"])

    def test_qf_feeder_count_matches_qf_match_count(self):
        assert len(_BRACKET_FEEDERS["qf"]) == len(_KO_DATES["qf"])

    def test_prev_round_chain_is_correct(self):
        assert _PREV_ROUND["r16"]   == "r32"
        assert _PREV_ROUND["qf"]    == "r16"
        assert _PREV_ROUND["sf"]    == "qf"
        assert _PREV_ROUND["final"] == "sf"
        assert _PREV_ROUND["3rd"]   == "sf"

    def test_all_feeder_keys_are_non_r32_rounds(self):
        """Bracket feeders only apply to rounds after R32."""
        for round_code in _BRACKET_FEEDERS:
            assert round_code in ADVANCED_ROUNDS, \
                f"Unexpected feeder round '{round_code}' — expected one of {ADVANCED_ROUNDS}"

    def test_3rd_and_final_both_feed_from_sf(self):
        assert _PREV_ROUND["3rd"]   == "sf"
        assert _PREV_ROUND["final"] == "sf"
