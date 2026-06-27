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
# Group stage: June 11 – July 2
# R32:   July 4–7   (4 matches/day, 4 days)
# R16:   July 9–10  (4 matches/day, 2 days)
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
    _dt(2026, 7,  4, 17),   # slot 10: ESP vs AUT (est.)
    _dt(2026, 7,  4, 21),   # slot 11: 1st K vs 2nd L (est.)
    _dt(2026, 7,  5, 17),   # slot 12: 1st L vs 2nd K (est.)
    _dt(2026, 7,  5, 21),   # slot 13: MEX vs 3rd-place (est.)
    _dt(2026, 7,  6, 17),   # slot 14: SUI vs 3rd-place (est.)
    _dt(2026, 7,  6, 21),   # slot 15: BEL vs 3rd-place (est.)
    _dt(2026, 7,  7, 17),   # slot 16: 3rd vs 3rd (est.)
]

_KO_DATES: dict[str, list[datetime]] = {
    "r32": _R32_DATES,
    "r16": [
        _dt(2026, 7,  9, 17), _dt(2026, 7,  9, 21),
        _dt(2026, 7,  9, 17), _dt(2026, 7,  9, 21),
        _dt(2026, 7, 10, 17), _dt(2026, 7, 10, 21),
        _dt(2026, 7, 10, 17), _dt(2026, 7, 10, 21),
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
    ("1st Group K",    "2nd Group L"),     # slot 11: 1st K vs 2nd L (est.)
    ("1st Group L",    "2nd Group K"),     # slot 12: 1st L vs 2nd K (est.)
    ("1st Group A",    "Best 3rd Place"),  # slot 13: MEX vs 3rd-place (est.)
    ("1st Group B",    "Best 3rd Place"),  # slot 14: SUI vs 3rd-place (est.)
    ("1st Group G",    "Best 3rd Place"),  # slot 15: BEL vs 3rd-place (est.)
    ("Best 3rd Place", "Best 3rd Place"),  # slot 16: 3rd vs 3rd (est.)
]


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
