"""Unit tests for bracket repair action logic.

These tests replicate the action-determination logic of GET /admin/bracket-repair
using in-memory fake matches — no DB required.
"""
import pytest
from core.bracket import ALL_SLOTS, SLOT_ROUND, SLOT_MATCH_NO, edges_to
from services.sync import _ko_winner


# ── Fake match builder ────────────────────────────────────────────────────────

class FakeMatch:
    """Minimal Match stand-in for bracket repair tests."""
    _id_seq = 0

    def __init__(
        self,
        bracket_slot: str,
        round: str,
        status: str = "scheduled",
        home_team_code: str = "TBD",
        away_team_code: str = "TBD",
        home_team_name: str = "TBD",
        away_team_name: str = "TBD",
        home_score=None,
        away_score=None,
        penalty_home=None,
        penalty_away=None,
        home_flag_url=None,
        away_flag_url=None,
    ):
        FakeMatch._id_seq += 1
        self.id = str(FakeMatch._id_seq)
        self.bracket_slot = bracket_slot
        self.round = round
        self.status = status
        self.home_team_code = home_team_code
        self.away_team_code = away_team_code
        self.home_team_name = home_team_name
        self.away_team_name = away_team_name
        self.home_score = home_score
        self.away_score = away_score
        self.penalty_home = penalty_home
        self.penalty_away = penalty_away
        self.home_flag_url = home_flag_url
        self.away_flag_url = away_flag_url


def _finished(slot: str, home: str, away: str, hs: int, as_: int, **kw) -> FakeMatch:
    rd = SLOT_ROUND[slot]
    return FakeMatch(slot, rd, "finished", home, away, home, away, hs, as_, **kw)


def _scheduled(slot: str, home: str = "TBD", away: str = "TBD") -> FakeMatch:
    rd = SLOT_ROUND[slot]
    return FakeMatch(slot, rd, "scheduled", home, away, home, away)


# ── Pure action-determination helper (mirrors endpoint logic) ─────────────────

DEST_ROUNDS = {"r16", "qf", "sf", "3rd", "final"}


def compute_actions(slot_map: dict, pred_counts: dict) -> list[dict]:
    """
    Pure Python replica of the bracket_repair endpoint logic.
    Returns list of action dicts without any DB I/O.
    """
    actions = []
    for slot_id in ALL_SLOTS:
        if SLOT_ROUND.get(slot_id) not in DEST_ROUNDS:
            continue

        dest = slot_map.get(slot_id)
        if not dest:
            for in_edge in edges_to(slot_id):
                actions.append({
                    "dest_slot": slot_id, "dest_side": in_edge.dest_side,
                    "source_slot": in_edge.source_slot, "action": "skipped_dest_missing",
                    "current_team": None, "expected_team": None,
                })
            continue

        if dest.status in ("live", "finished"):
            for in_edge in edges_to(slot_id):
                side = in_edge.dest_side
                cur = dest.home_team_code if side == "home" else dest.away_team_code
                actions.append({
                    "dest_slot": slot_id, "dest_side": side,
                    "source_slot": in_edge.source_slot,
                    "action": "skipped_match_started_or_finished",
                    "current_team": cur, "expected_team": None,
                    "prediction_count": pred_counts.get(dest.id, 0),
                })
            continue

        pred_count = pred_counts.get(dest.id, 0)

        for in_edge in edges_to(slot_id):
            src = slot_map.get(in_edge.source_slot)
            side = in_edge.dest_side
            want_winner = (in_edge.advancement_type == "winner")

            cur_code = dest.home_team_code if side == "home" else dest.away_team_code
            is_tbd = not cur_code or cur_code.upper() in ("TBD", "", "NONE")

            expected_code = None
            if src and src.status == "finished":
                result = _ko_winner(src, want_winner)
                if result:
                    expected_code = result[0]

            if expected_code is None:
                if is_tbd:
                    action = "skipped_source_not_finished"
                elif pred_count > 0:
                    action = "blocked_due_to_predictions"
                else:
                    action = "wrong_team_source_not_finished"
            elif is_tbd:
                action = "would_set"
            elif cur_code == expected_code:
                action = "already_correct"
            else:
                action = "blocked_due_to_predictions" if pred_count > 0 else "would_replace_wrong_team"

            actions.append({
                "dest_slot": slot_id,
                "dest_side": side,
                "source_slot": in_edge.source_slot,
                "action": action,
                "current_team": cur_code if not is_tbd else "TBD",
                "expected_team": expected_code,
                "prediction_count": pred_count,
            })

    return actions


def _actions_for(slot: str, slot_map: dict, pred_counts: dict = None) -> list[dict]:
    """Filter compute_actions results to a specific destination slot."""
    all_a = compute_actions(slot_map, pred_counts or {})
    return [a for a in all_a if a["dest_slot"] == slot]


# ── Tests: already_correct ────────────────────────────────────────────────────

def test_already_correct_when_team_matches_expected():
    """r32_03 (Canada) finished, r16_02.home is already Canada."""
    r32_03 = _finished("r32_03", "CAN", "ZZZ", 2, 0)
    r32_04 = _finished("r32_04", "AAA", "BBB", 1, 0)
    r16_02 = _scheduled("r16_02", home="CAN", away="AAA")  # both correct

    slot_map = {"r32_03": r32_03, "r32_04": r32_04, "r16_02": r16_02}
    results = _actions_for("r16_02", slot_map)

    home_action = next(a for a in results if a["dest_side"] == "home")
    away_action = next(a for a in results if a["dest_side"] == "away")
    assert home_action["action"] == "already_correct"
    assert away_action["action"] == "already_correct"


# ── Tests: skipped_source_not_finished ───────────────────────────────────────

def test_skipped_source_not_finished_when_both_tbd():
    """Source not finished and side is TBD — normal pre-tournament state."""
    r32_01 = _scheduled("r32_01", "ARG", "USA")  # scheduled, not finished
    r16_01 = _scheduled("r16_01")  # TBD/TBD

    slot_map = {"r32_01": r32_01, "r16_01": r16_01}
    results = _actions_for("r16_01", slot_map)
    home = next(a for a in results if a["dest_side"] == "home")
    assert home["action"] == "skipped_source_not_finished"
    assert home["expected_team"] is None


# ── Tests: would_set ─────────────────────────────────────────────────────────

def test_would_set_when_source_finished_and_side_tbd():
    """Source finished, but normal propagation didn't fill TBD side yet."""
    r32_01 = _finished("r32_01", "ARG", "USA", 3, 0)
    r16_01 = _scheduled("r16_01", home="TBD", away="TBD")

    slot_map = {"r32_01": r32_01, "r16_01": r16_01}
    results = _actions_for("r16_01", slot_map)
    home = next(a for a in results if a["dest_side"] == "home")
    assert home["action"] == "would_set"
    assert home["expected_team"] == "ARG"  # ARG won 3-0


def test_would_set_uses_penalty_winner():
    """_ko_winner must return penalty winner when source went to penalties."""
    # Home wins on penalties (draw 1-1, penalties 4-2)
    r32_03 = FakeMatch("r32_03", "r32", "finished", "ENG", "NED", "England", "Netherlands",
                        1, 1, penalty_home=4, penalty_away=2)
    r16_02 = _scheduled("r16_02")

    slot_map = {"r32_03": r32_03, "r16_02": r16_02}
    results = _actions_for("r16_02", slot_map)
    home = next(a for a in results if a["dest_side"] == "home")
    assert home["action"] == "would_set"
    assert home["expected_team"] == "ENG"  # ENG wins on penalties


# ── Tests: would_replace_wrong_team (corruption) ──────────────────────────────

def test_would_replace_wrong_team_brazil_canada_scenario():
    """
    Reproduce the production corruption: Brazil (r32_05/M76 winner) was placed
    in r16_02.away instead of r16_03.home.
    Official bracket: r16_02 = W(r32_03)+W(r32_04), r16_03 = W(r32_05)+W(r32_06)
    """
    # r32_03 (M73): Canada won → r16_02.home (correct)
    r32_03 = _finished("r32_03", "CAN", "MAR", 2, 1)
    # r32_04 (M75): not finished yet
    r32_04 = _scheduled("r32_04", "EGY", "POL")
    # r32_05 (M76): Brazil won → should go to r16_03.home
    r32_05 = _finished("r32_05", "BRA", "CHI", 3, 0)
    # r32_06 (M78): not finished yet
    r32_06 = _scheduled("r32_06", "POR", "GHA")

    # Corruption: Brazil was wrongly placed in r16_02.away
    r16_02 = _scheduled("r16_02", home="CAN", away="BRA")  # away=BRA is WRONG
    r16_03 = _scheduled("r16_03", home="TBD", away="TBD")  # r16_03 wasn't set

    slot_map = {
        "r32_03": r32_03, "r32_04": r32_04,
        "r32_05": r32_05, "r32_06": r32_06,
        "r16_02": r16_02, "r16_03": r16_03,
    }

    results_16_02 = _actions_for("r16_02", slot_map)
    home_02 = next(a for a in results_16_02 if a["dest_side"] == "home")
    away_02 = next(a for a in results_16_02 if a["dest_side"] == "away")

    # r16_02.home = CAN is correct (r32_03 winner = CAN)
    assert home_02["action"] == "already_correct", f"Expected already_correct, got {home_02}"
    # r16_02.away = BRA is wrong (r32_04 not finished; BRA came from old positional sort)
    assert away_02["action"] == "wrong_team_source_not_finished", \
        f"Expected wrong_team_source_not_finished, got {away_02}"
    assert away_02["current_team"] == "BRA"
    assert away_02["expected_team"] is None  # r32_04 not finished

    results_16_03 = _actions_for("r16_03", slot_map)
    home_03 = next(a for a in results_16_03 if a["dest_side"] == "home")
    away_03 = next(a for a in results_16_03 if a["dest_side"] == "away")

    # r16_03.home should get BRA (r32_05 winner) but is TBD → would_set
    assert home_03["action"] == "would_set", f"Expected would_set, got {home_03}"
    assert home_03["expected_team"] == "BRA"
    # r16_03.away: r32_06 not finished → skipped
    assert away_03["action"] == "skipped_source_not_finished"


def test_would_replace_wrong_team_when_source_finished_and_different_team():
    """If source is finished but wrong team is set — reports would_replace_wrong_team."""
    r32_01 = _finished("r32_01", "ARG", "USA", 2, 0)  # ARG won
    r16_01 = _scheduled("r16_01", home="MEX", away="TBD")  # MEX is wrong, should be ARG

    slot_map = {"r32_01": r32_01, "r16_01": r16_01}
    results = _actions_for("r16_01", slot_map)
    home = next(a for a in results if a["dest_side"] == "home")
    assert home["action"] == "would_replace_wrong_team"
    assert home["current_team"] == "MEX"
    assert home["expected_team"] == "ARG"


# ── Tests: blocked_due_to_predictions ────────────────────────────────────────

def test_blocked_when_predictions_exist_on_wrong_team():
    """If wrong team is set but match has predictions → blocked."""
    r32_01 = _finished("r32_01", "ARG", "USA", 2, 0)
    r16_01 = _scheduled("r16_01", home="MEX", away="TBD")

    slot_map = {"r32_01": r32_01, "r16_01": r16_01}
    pred_counts = {r16_01.id: 5}  # 5 predictions exist
    results = _actions_for("r16_01", slot_map, pred_counts)
    home = next(a for a in results if a["dest_side"] == "home")
    assert home["action"] == "blocked_due_to_predictions"
    assert home["prediction_count"] == 5


def test_blocked_when_predictions_exist_on_wrong_team_source_not_finished():
    """If source not finished but wrong team is set and predictions exist → blocked."""
    r32_01 = _scheduled("r32_01", "ARG", "USA")  # not finished
    r16_01 = _scheduled("r16_01", home="MEX")  # MEX wrongly set

    slot_map = {"r32_01": r32_01, "r16_01": r16_01}
    pred_counts = {r16_01.id: 3}
    results = _actions_for("r16_01", slot_map, pred_counts)
    home = next(a for a in results if a["dest_side"] == "home")
    assert home["action"] == "blocked_due_to_predictions"


def test_no_block_when_would_set_with_predictions():
    """Filling a TBD slot is always safe — no prediction block for would_set."""
    r32_01 = _finished("r32_01", "ARG", "USA", 2, 0)
    r16_01 = _scheduled("r16_01")  # TBD

    slot_map = {"r32_01": r32_01, "r16_01": r16_01}
    pred_counts = {r16_01.id: 10}  # predictions exist but side is TBD
    results = _actions_for("r16_01", slot_map, pred_counts)
    home = next(a for a in results if a["dest_side"] == "home")
    assert home["action"] == "would_set"  # NOT blocked


# ── Tests: skipped_match_started_or_finished ──────────────────────────────────

def test_skipped_when_dest_match_is_live():
    """Never modify a live destination match."""
    r32_01 = _finished("r32_01", "ARG", "USA", 2, 0)
    r16_01 = FakeMatch("r16_01", "r16", "live", "MEX", "TBD")  # live, wrong team

    slot_map = {"r32_01": r32_01, "r16_01": r16_01}
    results = _actions_for("r16_01", slot_map)
    home = next(a for a in results if a["dest_side"] == "home")
    assert home["action"] == "skipped_match_started_or_finished"


def test_skipped_when_dest_match_is_finished():
    """Never modify a finished destination match."""
    r32_01 = _finished("r32_01", "ARG", "USA", 2, 0)
    r16_01 = FakeMatch("r16_01", "r16", "finished", "MEX", "BRA", home_score=1, away_score=0)

    slot_map = {"r32_01": r32_01, "r16_01": r16_01}
    results = _actions_for("r16_01", slot_map)
    assert all(a["action"] == "skipped_match_started_or_finished" for a in results)


# ── Tests: QF→SF cross-bracket is correct ────────────────────────────────────

def test_sf1_repair_uses_qf01_and_qf03_not_qf02():
    """Repair logic must wire sf_01 home=W(qf_01) away=W(qf_03), NOT qf_02."""
    qf_01 = _finished("qf_01", "ARG", "ENG", 2, 1)  # ARG wins M97
    qf_03 = _finished("qf_03", "FRA", "BRA", 1, 0)  # FRA wins M98
    sf_01  = _scheduled("sf_01")

    slot_map = {"qf_01": qf_01, "qf_03": qf_03, "sf_01": sf_01}
    results = _actions_for("sf_01", slot_map)
    home = next(a for a in results if a["dest_side"] == "home")
    away = next(a for a in results if a["dest_side"] == "away")

    assert home["source_slot"] == "qf_01"
    assert away["source_slot"] == "qf_03"
    assert home["action"] == "would_set" and home["expected_team"] == "ARG"
    assert away["action"] == "would_set" and away["expected_team"] == "FRA"


def test_sf2_repair_uses_qf02_and_qf04():
    """Repair logic must wire sf_02 home=W(qf_02) away=W(qf_04)."""
    qf_02 = _finished("qf_02", "POR", "MEX", 3, 0)  # POR wins M99
    qf_04 = _finished("qf_04", "GER", "JPN", 2, 1)  # GER wins M100
    sf_02  = _scheduled("sf_02")

    slot_map = {"qf_02": qf_02, "qf_04": qf_04, "sf_02": sf_02}
    results = _actions_for("sf_02", slot_map)
    home = next(a for a in results if a["dest_side"] == "home")
    away = next(a for a in results if a["dest_side"] == "away")

    assert home["source_slot"] == "qf_02" and home["expected_team"] == "POR"
    assert away["source_slot"] == "qf_04" and away["expected_team"] == "GER"


# ── Tests: SF → 3rd and Final ────────────────────────────────────────────────

def test_sf_loser_goes_to_third_place():
    """sf_01 loser must feed 3rd.home, not final."""
    sf_01  = _finished("sf_01", "ARG", "FRA", 1, 1, penalty_home=3, penalty_away=5)  # FRA wins
    match_3rd = _scheduled("3rd")

    slot_map = {"sf_01": sf_01, "3rd": match_3rd}
    results = _actions_for("3rd", slot_map)
    home = next(a for a in results if a["dest_side"] == "home")
    assert home["source_slot"] == "sf_01"
    assert home["expected_team"] == "ARG"  # ARG lost, goes to 3rd
    assert home["action"] == "would_set"


def test_sf_winner_goes_to_final():
    sf_02  = _finished("sf_02", "POR", "GER", 2, 0)  # POR wins
    final  = _scheduled("final")

    slot_map = {"sf_02": sf_02, "final": final}
    results = _actions_for("final", slot_map)
    away = next(a for a in results if a["dest_side"] == "away")
    assert away["source_slot"] == "sf_02"
    assert away["expected_team"] == "POR"
    assert away["action"] == "would_set"


# ── Tests: idempotency after repair ──────────────────────────────────────────

def test_idempotent_after_correct_team_set():
    """After repair sets the correct team, a second run reports already_correct."""
    r32_01 = _finished("r32_01", "ARG", "USA", 2, 0)
    # Simulate: repair already ran and fixed r16_01.home to ARG
    r16_01 = _scheduled("r16_01", home="ARG")

    slot_map = {"r32_01": r32_01, "r16_01": r16_01}
    results = _actions_for("r16_01", slot_map)
    home = next(a for a in results if a["dest_side"] == "home")
    assert home["action"] == "already_correct"


# ── Tests: R32 matches are never destination slots ────────────────────────────

def test_r32_slots_never_appear_as_dest():
    """R32 slots are source-only — repair must never flag them as destinations."""
    all_actions = compute_actions({}, {})
    r32_dest = [a for a in all_actions if a["dest_slot"].startswith("r32_")]
    assert r32_dest == [], f"R32 slots should never be repair destinations, got {r32_dest}"


# ── Tests: missing bracket_slot handled gracefully ───────────────────────────

def test_skipped_when_source_slot_missing():
    """If source match has no bracket_slot (not in slot_map), can't determine expected."""
    r16_01 = _scheduled("r16_01")
    # r32_01 and r32_02 are NOT in slot_map
    slot_map = {"r16_01": r16_01}
    results = _actions_for("r16_01", slot_map)
    for a in results:
        # Source missing means expected_code=None, side is TBD → skipped_source_not_finished
        assert a["action"] == "skipped_source_not_finished"
