"""
Official WC 2026 knockout bracket — single source of truth.
Slot IDs: r32_01…r32_16, r16_01…r16_08, qf_01…qf_04, sf_01, sf_02, 3rd, final

Official FIFA match numbers (73–104):
  R32: r32_01=M74, r32_02=M77, r32_03=M73, r32_04=M75, r32_05=M76, r32_06=M78,
       r32_07=M79, r32_08=M80, r32_09=M83, r32_10=M84, r32_11=M81, r32_12=M82,
       r32_13=M86, r32_14=M88, r32_15=M85, r32_16=M87
  R16: r16_01=M89 (W74+W77), r16_02=M90 (W73+W75), r16_03=M91 (W76+W78),
       r16_04=M92 (W79+W80), r16_05=M93 (W83+W84), r16_06=M94 (W81+W82),
       r16_07=M95 (W86+W88), r16_08=M96 (W85+W87)
  QF:  qf_01=M97 (W89+W90), qf_02=M99 (W91+W92), qf_03=M98 (W93+W94), qf_04=M100 (W95+W96)
  SF:  sf_01=M101 (W97+W98), sf_02=M102 (W99+W100)
  3rd: M103 (L101+L102)  Final: M104 (W101+W102)

Note: QF match numbers are not sequential by slot (qf_02=M99, qf_03=M98) because the
official WC 2026 bracket uses cross-bracket seeding: SF1=W97+W98, SF2=W99+W100.
"""
from dataclasses import dataclass
from typing import Literal

AdvType = Literal["winner", "loser"]
Side    = Literal["home", "away"]

@dataclass(frozen=True)
class BracketEdge:
    source_slot:      str   # e.g. "r32_01"
    advancement_type: AdvType
    dest_slot:        str   # e.g. "r16_01"
    dest_side:        Side
    source_round:     str   # e.g. "r32"
    dest_round:       str   # e.g. "r16"

def _slot(r: str, n: int) -> str:
    return f"{r}_{n:02d}"

# Official bracket tree — 32 edges total
# R32→R16: consecutive pairs (r32_01+r32_02→r16_01, r32_03+r32_04→r16_02, ...)
# R16→QF:  consecutive pairs (r16_01+r16_02→qf_01, r16_03+r16_04→qf_02, ...)
# QF→SF:   CROSS-BRACKET — qf_01+qf_03→sf_01, qf_02+qf_04→sf_02
#           (because SF1=W97+W98=W(qf_01)+W(qf_03), SF2=W99+W100=W(qf_02)+W(qf_04))
# SF→Final: winners; SF→3rd: losers
BRACKET_EDGES: list[BracketEdge] = [
    # R32 → R16
    *[BracketEdge(_slot('r32', 2*i-1), 'winner', _slot('r16', i), 'home', 'r32', 'r16') for i in range(1,9)],
    *[BracketEdge(_slot('r32', 2*i),   'winner', _slot('r16', i), 'away', 'r32', 'r16') for i in range(1,9)],
    # R16 → QF
    *[BracketEdge(_slot('r16', 2*i-1), 'winner', _slot('qf', i), 'home', 'r16', 'qf') for i in range(1,5)],
    *[BracketEdge(_slot('r16', 2*i),   'winner', _slot('qf', i), 'away', 'r16', 'qf') for i in range(1,5)],
    # QF → SF (cross-bracket: qf_01+qf_03→sf_01, qf_02+qf_04→sf_02)
    BracketEdge('qf_01', 'winner', 'sf_01', 'home', 'qf', 'sf'),
    BracketEdge('qf_03', 'winner', 'sf_01', 'away', 'qf', 'sf'),  # M98 winner → SF1 away
    BracketEdge('qf_02', 'winner', 'sf_02', 'home', 'qf', 'sf'),  # M99 winner → SF2 home
    BracketEdge('qf_04', 'winner', 'sf_02', 'away', 'qf', 'sf'),
    # SF → Final (winners)
    BracketEdge('sf_01', 'winner', 'final', 'home', 'sf', 'final'),
    BracketEdge('sf_02', 'winner', 'final', 'away', 'sf', 'final'),
    # SF → 3rd Place (losers)
    BracketEdge('sf_01', 'loser', '3rd', 'home', 'sf', '3rd'),
    BracketEdge('sf_02', 'loser', '3rd', 'away', 'sf', '3rd'),
]

# Official FIFA match numbers for each bracket slot (73–104).
# Keyed by bracket_slot; use this for display — never derive from external_id.
SLOT_MATCH_NO: dict[str, int] = {
    # R32 (matches 73–88) — non-sequential by slot due to bracket grouping
    'r32_01': 74, 'r32_02': 77,   # → r16_01 (M89): W74 vs W77
    'r32_03': 73, 'r32_04': 75,   # → r16_02 (M90): W73 vs W75
    'r32_05': 76, 'r32_06': 78,   # → r16_03 (M91): W76 vs W78
    'r32_07': 79, 'r32_08': 80,   # → r16_04 (M92): W79 vs W80
    'r32_09': 83, 'r32_10': 84,   # → r16_05 (M93): W83 vs W84
    'r32_11': 81, 'r32_12': 82,   # → r16_06 (M94): W81 vs W82
    'r32_13': 86, 'r32_14': 88,   # → r16_07 (M95): W86 vs W88
    'r32_15': 85, 'r32_16': 87,   # → r16_08 (M96): W85 vs W87
    # R16 (matches 89–96)
    'r16_01': 89, 'r16_02': 90, 'r16_03': 91, 'r16_04': 92,
    'r16_05': 93, 'r16_06': 94, 'r16_07': 95, 'r16_08': 96,
    # QF (matches 97–100) — qf_02=M99, qf_03=M98 (note cross-order)
    'qf_01': 97, 'qf_02': 99, 'qf_03': 98, 'qf_04': 100,
    # SF, 3rd, Final
    'sf_01': 101, 'sf_02': 102, '3rd': 103, 'final': 104,
}

# Lookup dictionaries
_BY_SOURCE: dict[str, list[BracketEdge]] = {}
for _e in BRACKET_EDGES:
    _BY_SOURCE.setdefault(_e.source_slot, []).append(_e)

_BY_DEST: dict[str, list[BracketEdge]] = {}
for _e in BRACKET_EDGES:
    _BY_DEST.setdefault(_e.dest_slot, []).append(_e)

def edges_from(slot: str) -> list[BracketEdge]: return _BY_SOURCE.get(slot, [])
def edges_to(slot: str) -> list[BracketEdge]:   return _BY_DEST.get(slot, [])

ALL_SLOTS: list[str] = (
    [_slot('r32', i) for i in range(1, 17)] +
    [_slot('r16', i) for i in range(1, 9)] +
    [_slot('qf',  i) for i in range(1, 5)] +
    ['sf_01', 'sf_02', '3rd', 'final']
)

SLOT_ROUND: dict[str, str] = {
    **{_slot('r32', i): 'r32'   for i in range(1, 17)},
    **{_slot('r16', i): 'r16'   for i in range(1, 9)},
    **{_slot('qf',  i): 'qf'    for i in range(1, 5)},
    'sf_01': 'sf', 'sf_02': 'sf', '3rd': '3rd', 'final': 'final',
}

def bracket_slot_from_ext_id(ext_id: str) -> "str | None":
    """
    'manual-wc2026-r32-3' → 'r32_03'
    'manual-wc2026-final-1' → 'final'
    'manual-wc2026-3rd-1' → '3rd'
    Returns None for numeric (reconciled) external_ids.
    """
    if not ext_id or not ext_id.startswith('manual-wc2026-'):
        return None
    parts = ext_id.split('-')  # ['manual','wc2026','r32','3']
    if len(parts) < 4:
        return None
    round_code = parts[2]
    if round_code in ('3rd', 'final'):
        return round_code
    try:
        n = int(parts[3])
        return f'{round_code}_{n:02d}'
    except ValueError:
        return None
