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


# R32: 16 matches across 4 days
_R32_DATES: list[datetime] = [
    _dt(2026, 7,  4, 17), _dt(2026, 7,  4, 21),
    _dt(2026, 7,  4, 17), _dt(2026, 7,  4, 21),   # same day slots
    _dt(2026, 7,  5, 17), _dt(2026, 7,  5, 21),
    _dt(2026, 7,  5, 17), _dt(2026, 7,  5, 21),
    _dt(2026, 7,  6, 17), _dt(2026, 7,  6, 21),
    _dt(2026, 7,  6, 17), _dt(2026, 7,  6, 21),
    _dt(2026, 7,  7, 17), _dt(2026, 7,  7, 21),
    _dt(2026, 7,  7, 17), _dt(2026, 7,  7, 21),
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
# R32 bracket labels (approximate — official bracket depends on which 8 of
# 12 third-place teams qualify, determined after group stage ends).
#
# Structure:
#   Matches 1-12: group winner vs runner-up (cross-group pairings)
#   Matches 13-16: best 3rd-place vs best 3rd-place (4 matches, 8 teams)
#
# Cross-group pairing pattern (FIFA typical convention):
#   Adjacent group winners face the runner-up from the paired group.
# ---------------------------------------------------------------------------
_R32_LABELS: list[tuple[str, str]] = [
    # Winner vs runner-up pairings (12 matches, using all 12 groups)
    ("1st Group A",     "2nd Group B"),
    ("1st Group C",     "2nd Group D"),
    ("1st Group E",     "2nd Group F"),
    ("1st Group G",     "2nd Group H"),
    ("1st Group I",     "2nd Group J"),
    ("1st Group K",     "2nd Group L"),
    ("1st Group B",     "2nd Group A"),
    ("1st Group D",     "2nd Group C"),
    ("1st Group F",     "2nd Group E"),
    ("1st Group H",     "2nd Group G"),
    ("1st Group J",     "2nd Group I"),
    ("1st Group L",     "2nd Group K"),
    # Best 3rd-place slots (4 matches, determined after group stage)
    ("Best 3rd Place",  "Best 3rd Place"),
    ("Best 3rd Place",  "Best 3rd Place"),
    ("Best 3rd Place",  "Best 3rd Place"),
    ("Best 3rd Place",  "Best 3rd Place"),
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
