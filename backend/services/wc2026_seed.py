"""
WC 2026 seed service — 12 groups of 4 teams (official FIFA format).

What this seeds
---------------
Group stage fixtures:
  With 12 groups of 4, each group plays 6 matches (round-robin).
  API-Football provides all 72 group fixtures once the season is published.
  This service does NOT seed group fixtures — they come entirely from the
  provider sync (POST /admin/sync/full → sync_fixtures). Any missing group
  fixtures represent data not yet published by the provider.

Knockout placeholders:
  R32  — 16 matches (12 group-winner vs runner-up + 4 best-3rd-place slots)
  R16  — 8 matches
  QF   — 4 matches
  SF   — 2 matches
  3rd  — 1 match
  Final — 1 match
  Total: 32 knockout placeholder matches

External IDs use the prefix "manual-wc2026-" to distinguish from real
provider IDs (all-numeric for API-Football). Running POST /admin/sync/full
after the provider publishes real knockout fixtures will overwrite
placeholders via their external_id key.

Migration from 16-group format
-------------------------------
Run `DELETE /admin/seed/wc2026` first to remove old manual-wc2026-grpM/N/O/P
and old knockout fixtures, then run `POST /admin/sync/full` to re-seed with
the correct 12-group structure.
"""
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from models.match import Match


# ---------------------------------------------------------------------------
# Official WC 2026 schedule (approximate UTC, confirmed by FIFA)
#
# Group stage: June 11 – July 2  (some groups finish as early as June 26-28)
# R32:   June 28 – July 7  (staggered; each group's R32 match ~2 days after they finish)
# R16:   July 9–12  (2 matches/day, 4 days)
# QF:    July 13–14 (2 matches/day, 2 days)
# SF:    July 17–18 (1 match/day,  2 days)
# 3rd:   July 21
# Final: July 22
# ---------------------------------------------------------------------------

def _dt(y: int, mo: int, d: int, h: int = 20) -> datetime:
    return datetime(y, mo, d, h, 0, 0, tzinfo=timezone.utc)


# R32: 16 matches.  Slots 1-9 use confirmed API-Football dates; slots 10-16
# are estimates that will be overwritten by reconcile_knockout_slots once the
# fixtures are published.
_R32_DATES: list[datetime] = [
    _dt(2026, 6, 28, 21),   # slot  1: RSA vs CAN
    _dt(2026, 6, 29, 17),   # slot  2: BRA vs JPN
    _dt(2026, 6, 29, 21),   # slot  3: GER vs PAR
    _dt(2026, 6, 30, 14),   # slot  4: NED vs MAR
    _dt(2026, 6, 30, 18),   # slot  5: CIV vs NOR
    _dt(2026, 6, 30, 21),   # slot  6: FRA vs SWE
    _dt(2026, 7,  2, 21),   # slot  7: USA vs BIH
    _dt(2026, 7,  3, 17),   # slot  8: AUS vs EGY
    _dt(2026, 7,  3, 21),   # slot  9: ARG vs CPV
    _dt(2026, 7,  1, 17),   # slot 10: ESP vs AUT (est.)
    _dt(2026, 7,  1, 21),   # slot 11: 1st K vs 2nd L (est.)
    _dt(2026, 7,  3, 18),   # slot 12: 1st L vs Best 3rd (POR vs CRO — confirmed, est. time)
    _dt(2026, 7,  4, 17),   # slot 13: MEX vs 3rd-place (est.)
    _dt(2026, 7,  4, 21),   # slot 14: SUI vs 3rd-place (est.)
    _dt(2026, 7,  5, 17),   # slot 15: BEL vs 3rd-place (est.)
    _dt(2026, 7,  5, 21),   # slot 16: 2nd K vs 2nd L (COL vs GHA — confirmed, est. time)
]

_KO_DATES: dict[str, list[datetime]] = {
    "r32": _R32_DATES,
    "r16": [
        _dt(2026, 7,  9, 17), _dt(2026, 7,  9, 21),  # slots 1-2
        _dt(2026, 7, 10, 17), _dt(2026, 7, 10, 21),  # slots 3-4
        _dt(2026, 7, 11, 17), _dt(2026, 7, 11, 21),  # slots 5-6
        _dt(2026, 7, 12, 17), _dt(2026, 7, 12, 21),  # slots 7-8
    ],
    "qf": [
        _dt(2026, 7, 13, 17), _dt(2026, 7, 13, 21),
        _dt(2026, 7, 14, 17), _dt(2026, 7, 14, 21),
    ],
    "sf": [
        _dt(2026, 7, 17, 20),
        _dt(2026, 7, 18, 20),
    ],
    "3rd":   [_dt(2026, 7, 21, 17)],
    "final": [_dt(2026, 7, 22, 20)],
}

# ---------------------------------------------------------------------------
# Real FIFA WC 2026 R32 bracket (derived from confirmed API-Football fixtures).
#
# The bracket uses three pod types:
#   A/B, D/G, E/I pods: "2nd vs 2nd" — the two runners-up play each other;
#     the two winners each play a best-3rd-place team.
#   C/F, H/J, K/L pods: "cross-pairing" — each winner plays the other group's
#     runner-up (1st X vs 2nd Y and 1st Y vs 2nd X).
#
# Slots 1-9 confirmed by API-Football; slots 10-16 inferred/estimated.
# ---------------------------------------------------------------------------
_R32_LABELS: list[tuple[str, str]] = [
    ("2nd Group A",    "2nd Group B"),     # slot  1: RSA vs CAN  (confirmed)
    ("1st Group C",    "2nd Group F"),     # slot  2: BRA vs JPN  (confirmed)
    ("1st Group E",    "Best 3rd Place"),  # slot  3: GER vs PAR  (confirmed)
    ("1st Group F",    "2nd Group C"),     # slot  4: NED vs MAR  (confirmed)
    ("2nd Group E",    "2nd Group I"),     # slot  5: CIV vs NOR  (confirmed)
    ("1st Group I",    "Best 3rd Place"),  # slot  6: FRA vs SWE  (confirmed)
    ("1st Group D",    "Best 3rd Place"),  # slot  7: USA vs BIH  (confirmed)
    ("2nd Group D",    "2nd Group G"),     # slot  8: AUS vs EGY  (confirmed)
    ("1st Group J",    "2nd Group H"),     # slot  9: ARG vs CPV  (confirmed)
    ("1st Group H",    "2nd Group J"),     # slot 10: ESP vs AUT  (est.)
    ("1st Group K",    "Best 3rd Place"),  # slot 11: ENG vs CGO  (confirmed)
    ("1st Group L",    "Best 3rd Place"),  # slot 12: POR vs CRO  (confirmed)
    ("1st Group A",    "Best 3rd Place"),  # slot 13: MEX vs 3rd-place (est.)
    ("1st Group B",    "Best 3rd Place"),  # slot 14: SUI vs 3rd-place (est.)
    ("1st Group G",    "Best 3rd Place"),  # slot 15: BEL vs 3rd-place (est.)
    ("2nd Group K",    "2nd Group L"),     # slot 16: COL vs GHA  (confirmed)
]

# Bracket progression: for each round, defines which two previous-round slots
# feed into each slot of this round as (home_src_slot, away_src_slot).
# Previous-round slots are resolved in ascending scheduled_at order (= slot order).
# "3rd" uses losers of both SF slots; all other rounds use winners.
_BRACKET_FEEDERS: dict[str, list[tuple[int, int]]] = {
    "r16":   [(1,2), (3,4), (5,6), (7,8), (9,10), (11,12), (13,14), (15,16)],
    "qf":    [(1,2), (3,4), (5,6), (7,8)],
    "sf":    [(1,2), (3,4)],
    "final": [(1,2)],
    "3rd":   [(1,2)],
}
_PREV_ROUND: dict[str, str] = {
    "r16": "r32", "qf": "r16", "sf": "qf", "final": "sf", "3rd": "sf",
}


@dataclass
class SeedResult:
    created: int = 0
    skipped: int = 0
    errors:  list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        return "error" if self.errors else "success"


class WC2026SeedService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def seed(self) -> SeedResult:
        """
        Seed knockout placeholder matches only.
        Group fixtures are not seeded — they come from the provider sync.
        """
        result = SeedResult()
        existing_ext_ids = await self._existing_external_ids()

        for round_code, dates in _KO_DATES.items():
            labels = _R32_LABELS if round_code == "r32" else [None] * len(dates)
            for slot_idx, sched in enumerate(dates):
                ext_id = f"manual-wc2026-{round_code}-{slot_idx + 1}"
                if ext_id in existing_ext_ids:
                    result.skipped += 1
                    continue

                label = labels[slot_idx] if labels[slot_idx] is not None else None
                home_name = label[0] if label else "TBD"
                away_name = label[1] if label else "TBD"

                ok = await self._insert_knockout_match(
                    ext_id     = ext_id,
                    round_code = round_code,
                    home_name  = home_name,
                    away_name  = away_name,
                    sched      = sched,
                )
                if ok:
                    result.created += 1
                else:
                    result.skipped += 1

        await self.db.commit()
        return result

    async def clean_manual(self) -> int:
        """Remove all manually-seeded fixtures (external_id starts with 'manual-wc2026-')."""
        from sqlalchemy import delete
        res = await self.db.execute(
            delete(Match).where(Match.external_id.like("manual-wc2026-%"))
        )
        await self.db.commit()
        return res.rowcount

    async def fix_r16_dates(self) -> int:
        """
        One-time fix: update R16 placeholder scheduled_at values to unique times
        (the original seed accidentally wrote duplicate times for slots 1&3 and 2&4).
        Only updates rows that still have a manual-wc2026-r16-N external_id.
        """
        from sqlalchemy import update as _upd
        r16_dates = [d for d in _KO_DATES["r16"]]
        count = 0
        for idx, sched in enumerate(r16_dates, start=1):
            ext_id = f"manual-wc2026-r16-{idx}"
            res = await self.db.execute(
                _upd(Match)
                .where(Match.external_id == ext_id)
                .values(scheduled_at=sched)
                .execution_options(synchronize_session=False)
            )
            count += res.rowcount
        await self.db.commit()
        return count

    async def fix_r32_dates(self) -> int:
        """
        One-time fix: update R32 placeholder scheduled_at values for slots 10-16
        to the correct non-duplicate estimates from _R32_DATES.
        Only updates rows that still have a manual-wc2026-r32-N external_id
        (slots 1-9 are already reconciled to real API fixtures and won't match).
        """
        from sqlalchemy import update as _upd
        count = 0
        for idx, sched in enumerate(_R32_DATES, start=1):
            ext_id = f"manual-wc2026-r32-{idx}"
            res = await self.db.execute(
                _upd(Match)
                .where(Match.external_id == ext_id)
                .values(scheduled_at=sched)
                .execution_options(synchronize_session=False)
            )
            count += res.rowcount
        await self.db.commit()
        return count

    async def fix_placeholder_dates(self) -> int:
        """
        Update scheduled_at for ALL manually-seeded knockout placeholder rows
        to the values in _KO_DATES.  Covers every round (r32 through final),
        not just R32.  Only touches rows that still carry a manual-wc2026-*
        external_id — reconciled rows (numeric external_id) are left alone.

        Use this after updating _KO_DATES estimates to correct existing DB rows
        without re-seeding from scratch.  Idempotent.
        """
        from sqlalchemy import update as _upd
        count = 0
        for round_code, dates in _KO_DATES.items():
            for idx, sched in enumerate(dates, start=1):
                ext_id = f"manual-wc2026-{round_code}-{idx}"
                res = await self.db.execute(
                    _upd(Match)
                    .where(
                        Match.external_id == ext_id,
                        Match.scheduled_at != sched,
                    )
                    .values(scheduled_at=sched)
                    .execution_options(synchronize_session=False)
                )
                count += res.rowcount
        await self.db.commit()
        return count

    async def fix_r32_placeholder_rounds(self) -> int:
        """
        Targeted one-time fix: any 'manual-wc2026-r32-*' placeholder row whose
        round column is not 'r32' (misclassified) is corrected back to 'r32'.

        Root cause: an older version of fix_knockout_rounds Strategy 2 would
        reclassify r32 placeholders as 'r16'/'qf'/etc. when their estimated
        scheduled_at dates accidentally fell inside those rounds' date windows
        (e.g., old estimates had slots 14-16 on July 9-12, inside the R16 window).
        After fix_r32_dates corrected the dates, the round column stayed wrong.

        Idempotent — safe to call multiple times.
        """
        from sqlalchemy import update as _upd
        res = await self.db.execute(
            _upd(Match)
            .where(
                Match.external_id.like("manual-wc2026-r32-%"),
                Match.round != "r32",
            )
            .values(round="r32")
            .execution_options(synchronize_session=False)
        )
        await self.db.commit()
        return res.rowcount

    async def fix_knockout_rounds(self) -> int:
        """
        Correct knockout matches that have an incorrect round code.

        Two complementary strategies run in sequence:

        1. Placeholder fix: any manual-wc2026-{round}-{slot} row whose round column
           doesn't match the round encoded in its external_id is corrected.
           Covers ALL rounds including r32 — r32 placeholders that were mis-set to
           'r16' or another value (due to date-window misclassification) are fixed
           here before Strategy 2 runs.

        2. Date-window fix: any knockout match whose scheduled_at falls inside the
           official WC 2026 window for a specific round but carries the wrong round
           code is corrected.  This catches reconciled matches whose round was
           overwritten to 'r32' by sync_fixtures when the API returned an incorrect
           round label.

        Idempotent — safe to call multiple times.
        """
        from datetime import timezone
        from sqlalchemy import update as _upd

        count = 0

        # ── Strategy 1: fix ALL manual placeholders by external_id prefix ────
        # Includes r32 — r32 placeholders with wrong rounds (e.g. 'r16' due to
        # old date estimates overlapping with the R16 window) must be fixed first.
        for round_code, dates in _KO_DATES.items():
            for slot_idx in range(len(dates)):
                ext_id = f"manual-wc2026-{round_code}-{slot_idx + 1}"
                res = await self.db.execute(
                    _upd(Match)
                    .where(
                        Match.external_id == ext_id,
                        Match.round != round_code,
                    )
                    .values(round=round_code)
                    .execution_options(synchronize_session=False)
                )
                count += res.rowcount

        # ── Strategy 2: fix by scheduled_at date window ───────────────────────
        # Each advanced KO round occupies a distinct date window in the official
        # WC 2026 schedule.  Any match in that window marked 'r32' or 'group'
        # is mis-classified and must be corrected.
        from sqlalchemy import and_

        _ko_windows = [
            # (round_code, window_start [inclusive], window_end [exclusive])
            ("r16",   _dt(2026, 7,  9,  0), _dt(2026, 7, 13,  0)),
            ("qf",    _dt(2026, 7, 13,  0), _dt(2026, 7, 15,  0)),
            ("sf",    _dt(2026, 7, 17,  0), _dt(2026, 7, 19,  0)),
            ("3rd",   _dt(2026, 7, 21,  0), _dt(2026, 7, 22,  0)),
            ("final", _dt(2026, 7, 22,  0), _dt(2026, 7, 23,  0)),
        ]
        for round_code, win_start, win_end in _ko_windows:
            res = await self.db.execute(
                _upd(Match)
                .where(
                    Match.round != round_code,
                    Match.round.in_(["r32", "group"]),
                    Match.scheduled_at >= win_start,
                    Match.scheduled_at < win_end,
                )
                .values(round=round_code)
                .execution_options(synchronize_session=False)
            )
            count += res.rowcount

        await self.db.commit()
        return count

    async def update_r32_labels(self) -> int:
        """
        In-place update of existing R32 placeholder rows to match the real
        FIFA WC 2026 bracket labels.  Safe to call even if reconciliation has
        already run for some slots (those rows will have a numeric external_id
        and won't be found by the manual-wc2026-r32-N lookup).
        """
        from sqlalchemy import update as _upd
        count = 0
        for idx, (h_name, a_name) in enumerate(_R32_LABELS, start=1):
            ext_id = f"manual-wc2026-r32-{idx}"
            res = await self.db.execute(
                _upd(Match)
                .where(Match.external_id == ext_id)
                .values(home_team_name=h_name, away_team_name=a_name)
                .execution_options(synchronize_session=False)
            )
            count += res.rowcount
        await self.db.commit()
        return count

    # ── Helpers ──────────────────────────────────────────────────

    async def _existing_external_ids(self) -> set[str]:
        rows = (await self.db.execute(
            select(Match.external_id).where(Match.external_id.is_not(None))
        )).scalars().all()
        return set(rows)

    async def _insert_knockout_match(
        self,
        ext_id:     str,
        round_code: str,
        home_name:  str,
        away_name:  str,
        sched:      datetime,
    ) -> bool:
        try:
            await self.db.execute(
                pg_insert(Match)
                .values(
                    id             = str(uuid.uuid4()),
                    external_id    = ext_id,
                    home_team_code = "TBD",
                    home_team_name = home_name,
                    home_flag_url  = None,
                    away_team_code = "TBD",
                    away_team_name = away_name,
                    away_flag_url  = None,
                    scheduled_at   = sched,
                    round          = round_code,
                    group_name     = None,
                    status         = "scheduled",
                )
                .on_conflict_do_nothing(index_elements=["external_id"])
            )
            return True
        except Exception:
            return False
