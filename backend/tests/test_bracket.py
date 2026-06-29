"""Tests for the official WC 2026 bracket structure and propagation."""
import pytest
from core.bracket import (
    BRACKET_EDGES, ALL_SLOTS, SLOT_ROUND, SLOT_MATCH_NO, edges_from, edges_to,
    bracket_slot_from_ext_id,
)

# ── Static bracket structure tests ────────────────────────────────────────────

def test_r32_maps_to_r16_slots():
    r32_edges = [e for e in BRACKET_EDGES if e.source_round == 'r32']
    dest_slots = set(e.dest_slot for e in r32_edges)
    assert dest_slots == {f'r16_{i:02d}' for i in range(1, 9)}, "16 R32 slots should map to 8 R16 slots"

def test_each_r16_slot_receives_exactly_two_feeders():
    for i in range(1, 9):
        slot = f'r16_{i:02d}'
        feeders = edges_to(slot)
        assert len(feeders) == 2, f"{slot} should have exactly 2 feeders, got {len(feeders)}"
        sides = {e.dest_side for e in feeders}
        assert sides == {'home', 'away'}, f"{slot} must have one home and one away feeder"

def test_r16_maps_to_qf_slots():
    r16_edges = [e for e in BRACKET_EDGES if e.source_round == 'r16']
    dest_slots = set(e.dest_slot for e in r16_edges)
    assert dest_slots == {f'qf_{i:02d}' for i in range(1, 5)}, "8 R16 slots should map to 4 QF slots"

def test_each_qf_slot_receives_exactly_two_feeders():
    for i in range(1, 5):
        slot = f'qf_{i:02d}'
        feeders = edges_to(slot)
        assert len(feeders) == 2
        assert {e.dest_side for e in feeders} == {'home', 'away'}

def test_qf_maps_to_sf_slots():
    qf_edges = [e for e in BRACKET_EDGES if e.source_round == 'qf']
    dest_slots = set(e.dest_slot for e in qf_edges)
    assert dest_slots == {'sf_01', 'sf_02'}

def test_each_sf_slot_receives_exactly_two_feeders():
    for slot in ('sf_01', 'sf_02'):
        feeders = edges_to(slot)
        assert len(feeders) == 2
        assert {e.dest_side for e in feeders} == {'home', 'away'}

def test_sf_winners_go_to_final():
    winner_edges = [e for e in BRACKET_EDGES if e.source_round == 'sf' and e.advancement_type == 'winner']
    assert len(winner_edges) == 2
    assert all(e.dest_slot == 'final' for e in winner_edges)
    assert {e.dest_side for e in winner_edges} == {'home', 'away'}

def test_sf_losers_go_to_third_place():
    loser_edges = [e for e in BRACKET_EDGES if e.source_round == 'sf' and e.advancement_type == 'loser']
    assert len(loser_edges) == 2
    assert all(e.dest_slot == '3rd' for e in loser_edges)
    assert {e.dest_side for e in loser_edges} == {'home', 'away'}

def test_no_duplicate_dest_side_per_slot():
    """Each destination slot+side combo appears at most once."""
    seen = set()
    for e in BRACKET_EDGES:
        key = (e.dest_slot, e.dest_side, e.advancement_type)
        assert key not in seen, f"Duplicate dest: {key}"
        seen.add(key)

def test_all_slots_have_correct_round():
    for slot, round_code in SLOT_ROUND.items():
        assert slot in ALL_SLOTS, f"{slot} not in ALL_SLOTS"
        if slot.startswith('r32'):
            assert round_code == 'r32'
        elif slot.startswith('r16'):
            assert round_code == 'r16'
        elif slot.startswith('qf'):
            assert round_code == 'qf'
        elif slot.startswith('sf'):
            assert round_code == 'sf'
        elif slot == '3rd':
            assert round_code == '3rd'
        elif slot == 'final':
            assert round_code == 'final'

def test_bracket_slot_from_ext_id():
    assert bracket_slot_from_ext_id('manual-wc2026-r32-1')   == 'r32_01'
    assert bracket_slot_from_ext_id('manual-wc2026-r32-16')  == 'r32_16'
    assert bracket_slot_from_ext_id('manual-wc2026-r16-3')   == 'r16_03'
    assert bracket_slot_from_ext_id('manual-wc2026-qf-2')    == 'qf_02'
    assert bracket_slot_from_ext_id('manual-wc2026-sf-1')    == 'sf_01'
    assert bracket_slot_from_ext_id('manual-wc2026-3rd-1')   == '3rd'
    assert bracket_slot_from_ext_id('manual-wc2026-final-1') == 'final'
    assert bracket_slot_from_ext_id('1234567')               is None
    assert bracket_slot_from_ext_id('')                      is None

# ── _ko_winner unit tests (penalty and ET handling) ───────────────────────────

class _FakeMatch:
    def __init__(self, hs, as_, ph=None, pa=None, hn='HOME', an='AWAY', hf=None, af=None):
        self.home_score = hs; self.away_score = as_
        self.penalty_home = ph; self.penalty_away = pa
        self.home_team_code = hn; self.home_team_name = hn
        self.away_team_code = an; self.away_team_name = an
        self.home_flag_url = hf; self.away_flag_url = af

from services.sync import _ko_winner

def test_ko_winner_normal_time():
    m = _FakeMatch(2, 1)
    assert _ko_winner(m, True)[0]  == 'HOME'   # winner
    assert _ko_winner(m, False)[0] == 'AWAY'   # loser

def test_ko_winner_away_wins():
    m = _FakeMatch(0, 3)
    assert _ko_winner(m, True)[0]  == 'AWAY'
    assert _ko_winner(m, False)[0] == 'HOME'

def test_ko_winner_penalties():
    m = _FakeMatch(1, 1, ph=4, pa=3)           # draw, home wins on penalties
    assert _ko_winner(m, True)[0]  == 'HOME'
    assert _ko_winner(m, False)[0] == 'AWAY'

def test_ko_winner_away_wins_penalties():
    m = _FakeMatch(2, 2, ph=2, pa=4)
    assert _ko_winner(m, True)[0]  == 'AWAY'

def test_ko_winner_unknown_when_no_penalty_data():
    m = _FakeMatch(1, 1)                       # draw, no penalty data yet
    assert _ko_winner(m, True) is None

def test_ko_winner_none_when_no_scores():
    m = _FakeMatch(None, None)
    assert _ko_winner(m, True) is None

def test_wrong_chronological_order_does_not_affect_bracket():
    """BRACKET_EDGES uses slot IDs, not date order — verify no positional dependency."""
    edges_r32_01 = edges_from('r32_01')
    assert any(e.dest_slot == 'r16_01' and e.dest_side == 'home' for e in edges_r32_01)
    edges_r32_16 = edges_from('r32_16')
    assert any(e.dest_slot == 'r16_08' and e.dest_side == 'away' for e in edges_r32_16)


# ── Official FIFA match number tests ──────────────────────────────────────────

def test_slot_match_no_covers_all_32_slots():
    assert set(SLOT_MATCH_NO.keys()) == set(ALL_SLOTS), "SLOT_MATCH_NO must cover all 32 slots"


def test_r32_match_numbers_cover_73_to_88():
    r32_nums = sorted(SLOT_MATCH_NO[f'r32_{i:02d}'] for i in range(1, 17))
    assert r32_nums == list(range(73, 89)), "R32 must cover exactly matches 73–88"


def test_r16_match_numbers_are_89_to_96():
    r16_nums = sorted(SLOT_MATCH_NO[f'r16_{i:02d}'] for i in range(1, 9))
    assert r16_nums == list(range(89, 97))


def test_qf_match_numbers_are_97_to_100():
    qf_nums = sorted(SLOT_MATCH_NO[f'qf_{i:02d}'] for i in range(1, 5))
    assert qf_nums == list(range(97, 101))


def test_qf_match_numbers_are_not_sequential_by_slot():
    """qf_02=M99, qf_03=M98 — the bracket crosses, not consecutive."""
    assert SLOT_MATCH_NO['qf_02'] == 99
    assert SLOT_MATCH_NO['qf_03'] == 98


def test_sf_3rd_final_match_numbers():
    assert SLOT_MATCH_NO['sf_01'] == 101
    assert SLOT_MATCH_NO['sf_02'] == 102
    assert SLOT_MATCH_NO['3rd']   == 103
    assert SLOT_MATCH_NO['final'] == 104


def _src_slots_for(dest_slot: str, dest_side: str) -> set[str]:
    return {e.source_slot for e in edges_to(dest_slot) if e.dest_side == dest_side}

def _match_no(slot: str) -> int:
    return SLOT_MATCH_NO[slot]


def test_r32_slots_assigned_correct_match_numbers():
    """Validate all 16 R32 slot → match number assignments."""
    expected = {
        'r32_01': 74, 'r32_02': 77, 'r32_03': 73, 'r32_04': 75,
        'r32_05': 76, 'r32_06': 78, 'r32_07': 79, 'r32_08': 80,
        'r32_09': 83, 'r32_10': 84, 'r32_11': 81, 'r32_12': 82,
        'r32_13': 86, 'r32_14': 88, 'r32_15': 85, 'r32_16': 87,
    }
    for slot, mn in expected.items():
        assert SLOT_MATCH_NO[slot] == mn, f"{slot} should be M{mn}, got M{SLOT_MATCH_NO[slot]}"


def test_r16_pairings_by_match_number():
    """Official R16 pairings: W74+W77→M89, W73+W75→M90, …"""
    # (r16_slot, expected_home_r32_match_no, expected_away_r32_match_no, r16_match_no)
    cases = [
        ('r16_01', 74, 77, 89),
        ('r16_02', 73, 75, 90),
        ('r16_03', 76, 78, 91),
        ('r16_04', 79, 80, 92),
        ('r16_05', 83, 84, 93),
        ('r16_06', 81, 82, 94),
        ('r16_07', 86, 88, 95),
        ('r16_08', 85, 87, 96),
    ]
    for r16_slot, home_mn, away_mn, r16_mn in cases:
        assert _match_no(r16_slot) == r16_mn, f"{r16_slot} should be M{r16_mn}"
        home_src = _src_slots_for(r16_slot, 'home')
        away_src = _src_slots_for(r16_slot, 'away')
        assert len(home_src) == 1 and len(away_src) == 1
        assert _match_no(next(iter(home_src))) == home_mn, \
            f"{r16_slot} home should be M{home_mn}"
        assert _match_no(next(iter(away_src))) == away_mn, \
            f"{r16_slot} away should be M{away_mn}"


def test_qf_pairings_by_match_number():
    """Official QF pairings: W89+W90→M97, W93+W94→M98, W91+W92→M99, W95+W96→M100"""
    cases = [
        ('qf_01', 89, 90, 97),
        ('qf_03', 93, 94, 98),   # qf_03=M98 (not qf_02!)
        ('qf_02', 91, 92, 99),   # qf_02=M99 (not qf_03!)
        ('qf_04', 95, 96, 100),
    ]
    for qf_slot, home_mn, away_mn, qf_mn in cases:
        assert _match_no(qf_slot) == qf_mn, f"{qf_slot} should be M{qf_mn}"
        home_src = _src_slots_for(qf_slot, 'home')
        away_src = _src_slots_for(qf_slot, 'away')
        assert _match_no(next(iter(home_src))) == home_mn, \
            f"{qf_slot} home should be M{home_mn}"
        assert _match_no(next(iter(away_src))) == away_mn, \
            f"{qf_slot} away should be M{away_mn}"


def test_sf_pairings_by_match_number():
    """SF1=W97+W98, SF2=W99+W100 — cross-bracket, not consecutive by slot."""
    # sf_01 must be fed by qf_01 (M97) and qf_03 (M98)
    sf1_home = _src_slots_for('sf_01', 'home')
    sf1_away = _src_slots_for('sf_01', 'away')
    assert sf1_home == {'qf_01'}, f"sf_01 home should come from qf_01 (M97), got {sf1_home}"
    assert sf1_away == {'qf_03'}, f"sf_01 away should come from qf_03 (M98), got {sf1_away}"
    assert _match_no('qf_01') == 97 and _match_no('qf_03') == 98

    # sf_02 must be fed by qf_02 (M99) and qf_04 (M100)
    sf2_home = _src_slots_for('sf_02', 'home')
    sf2_away = _src_slots_for('sf_02', 'away')
    assert sf2_home == {'qf_02'}, f"sf_02 home should come from qf_02 (M99), got {sf2_home}"
    assert sf2_away == {'qf_04'}, f"sf_02 away should come from qf_04 (M100), got {sf2_away}"
    assert _match_no('qf_02') == 99 and _match_no('qf_04') == 100

    assert _match_no('sf_01') == 101
    assert _match_no('sf_02') == 102


def test_sf_was_not_using_wrong_consecutive_pairs():
    """Regression: sf_01 must NOT be fed by qf_02 (M99) — that was the old bug."""
    sf1_sources = {e.source_slot for e in edges_to('sf_01')}
    assert 'qf_02' not in sf1_sources, \
        "BUG: qf_02 (M99) must NOT feed sf_01 — sf_01 = W97+W98 = W(qf_01)+W(qf_03)"
    assert 'qf_03' in sf1_sources, \
        "qf_03 (M98) must feed sf_01 — confirmed by official M101 = W97+W98"


def test_final_and_third_pairings():
    """Final=W101+W102, Third=L101+L102"""
    final_home = _src_slots_for('final', 'home')
    final_away = _src_slots_for('final', 'away')
    assert final_home == {'sf_01'} and final_away == {'sf_02'}

    third_home = _src_slots_for('3rd', 'home')
    third_away = _src_slots_for('3rd', 'away')
    assert third_home == {'sf_01'} and third_away == {'sf_02'}

    # sf_01 loser → 3rd, sf_01 winner → final
    from core.bracket import BRACKET_EDGES as BE
    sf1_edges = {(e.dest_slot, e.dest_side): e.advancement_type
                 for e in BE if e.source_slot == 'sf_01'}
    assert sf1_edges[('final', 'home')] == 'winner'
    assert sf1_edges[('3rd',   'home')] == 'loser'
