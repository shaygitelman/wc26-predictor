"""
Tests for _group_for_match — the function that maps a match to its
WC 2026 group letter. This is the critical path for the Groups tab
in the matches page: if a match lands in the wrong group (or none),
the standings filter shows wrong or missing data.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dataclasses import dataclass
from typing import Optional
from routers.groups import _group_for_match


@dataclass
class M:
    home_team_code: str
    away_team_code: str
    group_name:     Optional[str] = None


class TestGroupForMatchViaConfig:
    """CODE_TO_GROUP is authoritative — should work regardless of group_name in DB."""

    def test_home_code_known(self):
        assert _group_for_match(M("BRA", "TBD")) == "C"

    def test_away_code_known(self):
        assert _group_for_match(M("TBD", "MAR")) == "C"

    def test_both_known_same_group(self):
        assert _group_for_match(M("BRA", "SCO")) == "C"

    def test_config_beats_wrong_db_group(self):
        # DB says group Z (invalid/wrong), config says C — config wins
        assert _group_for_match(M("BRA", "MAR", group_name="Z")) == "C"

    def test_all_group_c_teams(self):
        for code in ["SCO", "BRA", "HAI", "MAR"]:
            assert _group_for_match(M(code, "TBD")) == "C", f"{code} should be group C"

    def test_group_a_teams(self):
        for code in ["CZE", "MEX", "RSA", "KOR"]:
            assert _group_for_match(M(code, "TBD")) == "A", f"{code} should be group A"

    def test_group_l_teams(self):
        for code in ["CRO", "ENG", "GHA", "PAN"]:
            assert _group_for_match(M(code, "TBD")) == "L", f"{code} should be group L"

    def test_all_48_teams_resolve_to_a_group(self):
        from core.wc2026_config import CODE_TO_GROUP
        for code in CODE_TO_GROUP:
            result = _group_for_match(M(code, "TBD"))
            assert result is not None, f"{code} returned None"
            assert result in set("ABCDEFGHIJKL"), f"{code} returned invalid group {result}"


class TestGroupForMatchFallback:
    """Falls back to DB group_name only for valid single-letter groups."""

    def test_unknown_code_with_valid_db_group(self):
        # Team code not in config but DB has a valid group letter
        assert _group_for_match(M("XXX", "YYY", group_name="B")) == "B"

    def test_unknown_code_without_db_group_returns_none(self):
        assert _group_for_match(M("XXX", "YYY")) is None

    def test_multi_char_db_group_ignored(self):
        # "Group A" or "GA" is not a valid single-letter group
        assert _group_for_match(M("XXX", "YYY", group_name="Group A")) is None

    def test_lowercase_db_group_normalised(self):
        # DB might store "a" — should still resolve
        assert _group_for_match(M("XXX", "YYY", group_name="a")) == "A"

    def test_both_tbd_with_valid_db_group(self):
        assert _group_for_match(M("TBD", "TBD", group_name="F")) == "F"

    def test_both_tbd_no_db_group_returns_none(self):
        assert _group_for_match(M("TBD", "TBD")) is None


class TestGroupForMatchKnockoutRound:
    """Knockout matches don't belong to a group — should return None."""

    def test_known_team_codes_but_not_wc_config(self):
        # If we made up codes not in CODE_TO_GROUP and no valid group_name
        assert _group_for_match(M("WIN_A", "WIN_B")) is None
