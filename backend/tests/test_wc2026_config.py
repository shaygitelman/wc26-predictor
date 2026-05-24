"""
Tests for WC 2026 configuration integrity.

Ensures the group draw, CODE_TO_GROUP lookup, and team assignments
are internally consistent — no duplicates, correct counts, all
48 teams accounted for.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from core.wc2026_config import GROUPS, CODE_TO_GROUP, GROUP_TO_CODES, APIFOOTBALL_ID_TO_CODE


class TestGroupStructure:
    def test_exactly_12_groups(self):
        assert len(GROUPS) == 12

    def test_groups_labelled_a_through_l(self):
        assert set(GROUPS.keys()) == set("ABCDEFGHIJKL")

    def test_exactly_4_teams_per_group(self):
        for g, teams in GROUPS.items():
            assert len(teams) == 4, f"Group {g} has {len(teams)} teams, expected 4"

    def test_total_48_teams(self):
        total = sum(len(t) for t in GROUPS.values())
        assert total == 48

    def test_no_duplicate_team_codes(self):
        all_codes = [code for slots in GROUPS.values() for (code, _, _) in slots]
        assert len(all_codes) == len(set(all_codes)), "Duplicate team codes in GROUPS"

    def test_no_empty_team_names(self):
        for g, slots in GROUPS.items():
            for code, name, _ in slots:
                assert name.strip(), f"Empty name for {code} in group {g}"

    def test_all_codes_are_uppercase_3_chars(self):
        for g, slots in GROUPS.items():
            for code, _, _ in slots:
                assert code == code.upper(), f"{code} in group {g} is not uppercase"
                assert 2 <= len(code) <= 4, f"{code} in group {g} has unexpected length"


class TestCodeToGroup:
    def test_covers_all_48_teams(self):
        assert len(CODE_TO_GROUP) == 48

    def test_every_code_maps_to_valid_group(self):
        valid = set("ABCDEFGHIJKL")
        for code, g in CODE_TO_GROUP.items():
            assert g in valid, f"{code} maps to invalid group '{g}'"

    def test_consistent_with_groups_dict(self):
        for g, slots in GROUPS.items():
            for code, _, _ in slots:
                assert CODE_TO_GROUP[code] == g, \
                    f"{code} should be in group {g}, got {CODE_TO_GROUP[code]}"

    def test_known_teams_in_correct_groups(self):
        assert CODE_TO_GROUP["BRA"] == "C"
        assert CODE_TO_GROUP["ENG"] == "L"
        assert CODE_TO_GROUP["FRA"] == "I"
        assert CODE_TO_GROUP["ARG"] == "J"
        assert CODE_TO_GROUP["ESP"] == "H"
        assert CODE_TO_GROUP["GER"] == "E"
        assert CODE_TO_GROUP["POR"] == "K"
        assert CODE_TO_GROUP["USA"] == "D"


class TestGroupToCodes:
    def test_reverse_maps_all_groups(self):
        assert set(GROUP_TO_CODES.keys()) == set("ABCDEFGHIJKL")

    def test_exactly_4_codes_per_group(self):
        for g, codes in GROUP_TO_CODES.items():
            assert len(codes) == 4, f"GROUP_TO_CODES[{g}] has {len(codes)} entries"

    def test_round_trip_consistency(self):
        for code, g in CODE_TO_GROUP.items():
            assert code in GROUP_TO_CODES[g], \
                f"{code} not found in GROUP_TO_CODES[{g}]"


class TestApifootballIdToCode:
    def test_all_targets_are_known_codes(self):
        for api_id, code in APIFOOTBALL_ID_TO_CODE.items():
            assert code in CODE_TO_GROUP, \
                f"APIFOOTBALL_ID_TO_CODE[{api_id}]={code} not in CODE_TO_GROUP"

    def test_no_duplicate_api_ids(self):
        ids = list(APIFOOTBALL_ID_TO_CODE.keys())
        assert len(ids) == len(set(ids)), "Duplicate API-Football IDs"

    def test_no_duplicate_target_codes(self):
        codes = list(APIFOOTBALL_ID_TO_CODE.values())
        assert len(codes) == len(set(codes)), \
            "Two API-Football IDs map to the same team code"

    def test_covers_all_48_teams(self):
        assert len(APIFOOTBALL_ID_TO_CODE) == 48, \
            f"Expected 48 mappings, got {len(APIFOOTBALL_ID_TO_CODE)}"
