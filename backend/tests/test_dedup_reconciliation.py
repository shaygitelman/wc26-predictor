"""
Unit tests for the knockout-match duplicate/missing-fixture fix.

Covers the two root causes behind "Norway vs England duplicated" /
"Spain vs Switzerland missing" in reconcile_knockout_slots:

  1. Phase B (R16+) used to match real fixtures to placeholders purely by
     chronological position, ignoring team identity Phase A had already
     resolved — so a real fixture could land on the wrong placeholder,
     producing two rows for the same match. _split_ko_placeholders_by_identity
     fixes this by matching on team codes first, falling back to position
     only for placeholders with no known teams yet.

  2. merge_duplicate_matches (admin cleanup for rows already duplicated by
     the bug above) groups by (round, team pair) and prefers the row with a
     real external_id as the keeper.

No DB required — these are pure functions operating on plain objects, same
convention as _ko_winner in test_bracket_repair.py.
"""
from datetime import datetime, timezone

import pytest

from core.ordering import MATCH_ORDER_BY
from models.match import Match
from providers.base import ProviderFixture
from services.sync import _fixture_to_new_match_values, _split_ko_placeholders_by_identity
from services.wc2026_seed import group_duplicate_matches, pick_duplicate_keeper


# ── Fake match builder (mirrors test_bracket_repair.py's FakeMatch) ───────────

class FakeMatch:
    _id_seq = 0

    def __init__(
        self,
        round: str,
        home_team_code: str = "TBD",
        away_team_code: str = "TBD",
        external_id: str | None = None,
        created_at: datetime | None = None,
        scheduled_at: datetime | None = None,
        **extra,
    ):
        FakeMatch._id_seq += 1
        self.id = f"m{FakeMatch._id_seq}"
        self.round = round
        self.home_team_code = home_team_code
        self.away_team_code = away_team_code
        self.external_id = external_id
        self.created_at = created_at or datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.scheduled_at = scheduled_at
        for k, v in extra.items():
            setattr(self, k, v)


# ── _split_ko_placeholders_by_identity ────────────────────────────────────────

class TestSplitPlaceholdersByIdentity:
    def test_resolved_placeholder_goes_to_identity_map_both_orders(self):
        ph = FakeMatch("r16", home_team_code="NOR", away_team_code="SWE",
                        external_id="manual-wc2026-r16-3")
        by_codes, tbd = _split_ko_placeholders_by_identity([ph])
        assert by_codes[("NOR", "SWE")] is ph
        assert by_codes[("SWE", "NOR")] is ph
        assert tbd == []

    def test_unresolved_placeholder_goes_to_tbd_list(self):
        ph = FakeMatch("r16", home_team_code="TBD", away_team_code="TBD",
                        external_id="manual-wc2026-r16-1")
        by_codes, tbd = _split_ko_placeholders_by_identity([ph])
        assert by_codes == {}
        assert tbd == [ph]

    def test_partially_tbd_counts_as_unresolved(self):
        ph = FakeMatch("r16", home_team_code="ENG", away_team_code="TBD",
                        external_id="manual-wc2026-r16-6")
        by_codes, tbd = _split_ko_placeholders_by_identity([ph])
        assert by_codes == {}
        assert tbd == [ph]

    def test_norway_england_regression(self):
        """
        Reproduces the exact duplicate mechanism: Phase A has already written
        Norway/Sweden onto slot r16_03 and Portugal/England onto slot r16_06.
        A real "Norway vs England" API fixture must NOT be positionally
        misassigned to whichever slot sorts first among still-TBD placeholders
        (there shouldn't even be a real "Norway vs England" match in this
        bracket) — but more importantly, if the *real* Norway/Sweden or
        Portugal/England fixture arrives, it must resolve to its own
        already-correct slot by identity, not to some other still-open slot.
        """
        r16_03 = FakeMatch("r16", home_team_code="NOR", away_team_code="SWE",
                            external_id="manual-wc2026-r16-3")
        r16_06 = FakeMatch("r16", home_team_code="POR", away_team_code="ENG",
                            external_id="manual-wc2026-r16-6")
        r16_01 = FakeMatch("r16", home_team_code="TBD", away_team_code="TBD",
                            external_id="manual-wc2026-r16-1")

        by_codes, tbd = _split_ko_placeholders_by_identity([r16_01, r16_03, r16_06])

        # The real "Norway vs Sweden" fixture must resolve to r16_03 (identity),
        # never to r16_01 (position) even though r16_01 sorts first.
        fx_pair = ("NOR", "SWE")
        matched = by_codes.get(fx_pair)
        assert matched is r16_03

        # Only genuinely-unresolved slots are eligible for positional fallback.
        assert tbd == [r16_01]


# ── group_duplicate_matches / pick_duplicate_keeper ──────────────────────────

class TestMergeDuplicateMatches:
    def test_two_rows_same_round_same_teams_are_grouped(self):
        a = FakeMatch("r16", "NOR", "ENG", external_id="manual-wc2026-r16-1")
        b = FakeMatch("r16", "ENG", "NOR", external_id="55512")  # home/away swapped, still a dup
        groups = group_duplicate_matches([a, b])
        assert len(groups) == 1
        (key, members), = groups.items()
        assert key == ("r16", "ENG", "NOR")
        assert set(members) == {a, b}

    def test_tbd_rows_never_grouped_together(self):
        a = FakeMatch("r16", "TBD", "TBD", external_id="manual-wc2026-r16-1")
        b = FakeMatch("r16", "TBD", "TBD", external_id="manual-wc2026-r16-2")
        groups = group_duplicate_matches([a, b])
        assert groups == {}

    def test_different_rounds_not_grouped(self):
        a = FakeMatch("r16", "NOR", "ENG", external_id="1")
        b = FakeMatch("qf", "NOR", "ENG", external_id="2")
        groups = group_duplicate_matches([a, b])
        assert len(groups) == 2

    def test_single_row_is_not_a_duplicate_group(self):
        a = FakeMatch("r16", "NOR", "ENG", external_id="1")
        groups = group_duplicate_matches([a])
        assert len(groups[("r16", "ENG", "NOR")]) == 1  # present, but caller checks len>1

    def test_keeper_prefers_real_external_id_over_placeholder(self):
        placeholder = FakeMatch("r16", "NOR", "ENG", external_id="manual-wc2026-r16-1",
                                 created_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
        real = FakeMatch("r16", "NOR", "ENG", external_id="98765",
                          created_at=datetime(2026, 7, 5, tzinfo=timezone.utc))
        keeper, losers = pick_duplicate_keeper([placeholder, real])
        assert keeper is real
        assert losers == [placeholder]

    def test_keeper_falls_back_to_older_row_when_both_real_or_both_placeholder(self):
        older = FakeMatch("r16", "NOR", "ENG", external_id="111",
                           created_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
        newer = FakeMatch("r16", "NOR", "ENG", external_id="222",
                           created_at=datetime(2026, 7, 5, tzinfo=timezone.utc))
        keeper, losers = pick_duplicate_keeper([newer, older])
        assert keeper is older
        assert losers == [newer]

    def test_norway_england_end_to_end_grouping_and_keeper(self):
        """The exact user-reported scenario: two Norway vs England rows, one
        real (confirmed date), one a leftover placeholder (estimated date)."""
        placeholder = FakeMatch(
            "r16", "NOR", "ENG", external_id="manual-wc2026-r16-3",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            scheduled_at=datetime(2026, 7, 9, 17, 0, tzinfo=timezone.utc),  # estimate
        )
        real = FakeMatch(
            "r16", "ENG", "NOR", external_id="443201",
            created_at=datetime(2026, 7, 6, tzinfo=timezone.utc),
            scheduled_at=datetime(2026, 7, 10, 21, 0, tzinfo=timezone.utc),  # confirmed
        )
        groups = group_duplicate_matches([placeholder, real])
        assert len(groups) == 1
        dup_ms = next(iter(groups.values()))
        assert len(dup_ms) == 2

        keeper, losers = pick_duplicate_keeper(dup_ms)
        assert keeper is real
        assert keeper.scheduled_at == datetime(2026, 7, 10, 21, 0, tzinfo=timezone.utc)
        assert losers == [placeholder]


# ── _fixture_to_new_match_values (Spain vs Switzerland regression) ──────────

def _fixture(**overrides) -> ProviderFixture:
    defaults = dict(
        external_id      = "778899",
        home_external_id = "9",
        away_external_id = "15",
        home_team_code   = "ESP",
        away_team_code   = "SUI",
        home_team_name   = "Spain",
        away_team_name   = "Switzerland",
        scheduled_at     = datetime(2026, 7, 3, 21, 0, tzinfo=timezone.utc),
        status           = "scheduled",
    )
    defaults.update(overrides)
    return ProviderFixture(**defaults)


class TestFixtureToNewMatchValues:
    def test_real_unmatched_fixture_becomes_insertable_row(self):
        """
        Reproduces "Spain vs Switzerland is missing": a real R32 fixture whose
        team-group labels don't match any hand-picked guess in _R32_LABELS
        used to be dropped (logged as an error, never inserted). This is the
        fallback insert that replaces the drop.
        """
        fx = _fixture()
        values = _fixture_to_new_match_values(fx, "r32")

        assert values["home_team_code"] == "ESP"
        assert values["away_team_code"] == "SUI"
        assert values["home_team_name"] == "Spain"
        assert values["away_team_name"] == "Switzerland"
        assert values["round"] == "r32"
        assert values["external_id"] == "778899"
        assert values["scheduled_at"] == datetime(2026, 7, 3, 21, 0, tzinfo=timezone.utc)
        assert values["status"] == "scheduled"
        # No bracket_slot key — the guess table couldn't place it, so it's
        # intentionally left out (defaults to NULL) rather than guessed.
        assert "bracket_slot" not in values

    def test_each_call_gets_a_fresh_id(self):
        fx = _fixture()
        v1 = _fixture_to_new_match_values(fx, "r32")
        v2 = _fixture_to_new_match_values(fx, "r32")
        assert v1["id"] != v2["id"]

    def test_preserves_scores_for_already_finished_fixture(self):
        fx = _fixture(status="finished", home_score=1, away_score=0)
        values = _fixture_to_new_match_values(fx, "r32")
        assert values["status"] == "finished"
        assert values["home_score"] == 1
        assert values["away_score"] == 0


# ── MATCH_ORDER_BY — shared ordering used by every match-list endpoint ──────

class TestMatchOrderBy:
    """
    matches.py, groups.py, and admin.py all order_by(*MATCH_ORDER_BY) instead
    of repeating their own ORDER BY clause, so the schedule can't drift out of
    sync between the matches page, group/bracket views, and admin schedule
    audits. Sorting by scheduled_at alone left ties (including duplicate rows
    for the same fixture) in non-deterministic order.
    """

    def test_orders_by_scheduled_at_then_id(self):
        assert len(MATCH_ORDER_BY) == 2
        assert MATCH_ORDER_BY[0] is Match.scheduled_at
        assert MATCH_ORDER_BY[1] is Match.id

    def test_compiled_order_by_includes_both_columns_in_order(self):
        from sqlalchemy import select
        stmt = select(Match).order_by(*MATCH_ORDER_BY)
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        order_clause = compiled.split("ORDER BY")[1]
        assert order_clause.index("scheduled_at") < order_clause.index("id")
