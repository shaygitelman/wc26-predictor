"""
Squad availability service.

Fetches real-time player availability for one side of a match via API-Football.
Only returns data that has been validated — never fabricates names or statuses.

Data sources (two-tier):
  1. /injuries?fixture={id}  — fixture-specific report (most accurate; published ~24-48h before KO)
  2. /injuries?team={id}&league=1&season=2026  — WC-wide injury list; used when fixture
     report isn't published yet. Carries forward ongoing injuries from the team's most
     recent past WC match.

Returns None only when both tiers are empty (no data available at all).
The caller is responsible for returning HTTP 501 when None is returned.
"""
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.match import Match
from models.team import Team
from providers.apifootball import ApiFootballProvider

log = logging.getLogger(__name__)

# Injury data is slow-changing — cache for 6 hours.
_INJURIES_CACHE: dict[str, tuple[float, list[dict]]] = {}
_INJURIES_CACHE_TTL = 6 * 3600

# API-Football injury `type` → availability bucket.
# API v3 may return either the detailed form ("Injured", "Out", …) or the
# broad-category form ("Injury", "Suspension") — both are handled here.
_TYPE_TO_STATUS: dict[str, str] = {
    # Detailed types (most common in fixture-scoped responses)
    "Injured":         "injured",
    "Out":             "injured",
    "Missing Fixture": "injured",
    "Suspended":       "suspended",
    "Questionable":    "doubtful",
    "Doubtful":        "doubtful",
    # Broad-category types (observed in some API responses / league-scoped queries)
    "Injury":          "injured",
    "Suspension":      "suspended",
}

# Types considered "ongoing" injuries that survive across fixtures
# (as opposed to per-fixture suspensions or "questionable" fitness doubts)
_ONGOING_INJURY_TYPES: frozenset[str] = frozenset({
    "Injured", "Injury", "Out", "Missing Fixture",
})


@dataclass
class PlayerEntry:
    name:   str
    detail: str | None


@dataclass
class SquadAvailability:
    injured:   list[PlayerEntry] = field(default_factory=list)
    suspended: list[PlayerEntry] = field(default_factory=list)
    doubtful:  list[PlayerEntry] = field(default_factory=list)

    def to_dict(self) -> dict:
        def fmt(entries: list[PlayerEntry]) -> list[dict]:
            return [
                {"name": e.name, **( {"detail": e.detail} if e.detail else {})}
                for e in entries
            ]
        return {
            "injured":   fmt(self.injured),
            "suspended": fmt(self.suspended),
            "doubtful":  fmt(self.doubtful),
        }


def _parse_fixture_dt(entry: dict) -> Optional[datetime]:
    """Parse the fixture.date field from an injury entry into a UTC datetime."""
    raw = entry.get("fixture", {}).get("date", "")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def _select_tournament_entries(
    team_raw: list[dict],
    fixture_id: str,
    match_dt: datetime,
) -> tuple[list[dict], bool]:
    """
    From a team+league+season injury response, pick the most useful entries for
    the given match.

    Returns (entries, is_tournament_fallback):
      - entries: filtered list to parse
      - is_tournament_fallback: True when entries are from a past fixture (not
        the exact upcoming one), which means the detail note should flag this
    """
    # Best case: API has already published the fixture-specific report
    exact = [
        e for e in team_raw
        if str(e.get("fixture", {}).get("id", "")) == fixture_id
    ]
    if exact:
        log.debug("[SquadAvailability] team-scope has %d exact-fixture entries", len(exact))
        return exact, False

    # Fall back: find the team's most recent PAST WC match and carry forward
    # ongoing (non-suspension) injuries from that fixture.
    most_recent_fixture_id: Optional[str] = None
    most_recent_dt:         Optional[datetime] = None

    for e in team_raw:
        fix_dt = _parse_fixture_dt(e)
        if fix_dt is None or fix_dt >= match_dt:
            continue
        if most_recent_dt is None or fix_dt > most_recent_dt:
            most_recent_dt = fix_dt
            most_recent_fixture_id = str(e.get("fixture", {}).get("id", ""))

    if most_recent_fixture_id is None:
        return [], False

    # Ongoing injuries only (no suspensions — those are per-fixture)
    ongoing = [
        e for e in team_raw
        if (
            str(e.get("fixture", {}).get("id", "")) == most_recent_fixture_id
            and (e.get("type") or "").strip() in _ONGOING_INJURY_TYPES
        )
    ]

    log.info(
        "[SquadAvailability] tournament fallback: most recent past fixture=%s "
        "ongoing injuries=%d",
        most_recent_fixture_id, len(ongoing),
    )
    return ongoing, True


async def get_squad_availability(
    match_id: str,
    side:     Literal["home", "away"],
    db:       AsyncSession,
) -> SquadAvailability | None:
    """
    Returns validated squad availability for one side of a match.

    Returns None when:
    - APIFOOTBALL_KEY is not configured
    - The match record has no external_id (fixture not yet mapped)
    - The team has no apifootball external ID
    - The API call fails with a hard error
    - Both fixture-scoped and team-scoped queries return zero entries
    - No past WC fixture exists to derive ongoing injuries from
    """
    if not settings.apifootball_key:
        log.warning(
            "[SquadAvailability] match=%s side=%s — APIFOOTBALL_KEY not set; returning no-data",
            match_id, side,
        )
        return None

    match = await db.get(Match, match_id)
    if not match:
        log.warning("[SquadAvailability] match=%s — not found in DB", match_id)
        return None

    # Require a numeric external_id — API-Football uses integer fixture IDs.
    # Manual-seed ("manual-wc2026-*") and test ("test-e2e-*") IDs are excluded.
    if not match.external_id or not match.external_id.isdigit():
        log.info(
            "[SquadAvailability] match=%s — external_id=%r is not a real "
            "API-Football fixture ID; squad data not available yet",
            match_id, match.external_id,
        )
        return None

    team_code = match.home_team_code if side == "home" else match.away_team_code

    # Resolve the API-Football team ID
    result = await db.execute(select(Team).where(Team.short_code == team_code))
    team = result.scalar_one_or_none()

    if not team or not team.external_ids:
        log.info(
            "[SquadAvailability] match=%s side=%s — team %s not found or has no external_ids",
            match_id, side, team_code,
        )
        return None

    team_ext_id: str | None = team.external_ids.get("apifootball")
    if not team_ext_id:
        log.info(
            "[SquadAvailability] match=%s side=%s — team %s has no apifootball ID",
            match_id, side, team_code,
        )
        return None

    fixture_id = match.external_id
    provider   = ApiFootballProvider(settings.apifootball_key)
    now        = time.time()

    log.info(
        "[SquadAvailability] match=%s side=%s team=%s — fetching injuries "
        "fixture_id=%s team_ext_id=%s",
        match_id, side, team_code, fixture_id, team_ext_id,
    )

    # ── Tier 1: fixture-scoped ────────────────────────────────────────────────
    _t1_key = f"fixture:{fixture_id}"
    _t1_cached = _INJURIES_CACHE.get(_t1_key)
    if _t1_cached and now - _t1_cached[0] < _INJURIES_CACHE_TTL:
        log.debug("[SquadAvailability] cache hit fixture=%s", fixture_id)
        raw_entries = _t1_cached[1]
    else:
        try:
            raw_entries = await provider.fetch_injuries(fixture_id)
            _INJURIES_CACHE[_t1_key] = (now, raw_entries)
        except Exception as exc:
            log.error(
                "[SquadAvailability] match=%s side=%s — API-Football /injuries fixture-scope failed: %s",
                match_id, side, exc,
            )
            raw_entries = []

    using_tournament_fallback = False

    if not raw_entries:
        # ── Tier 2: team + tournament scope ──────────────────────────────────
        log.info(
            "[SquadAvailability] match=%s side=%s — fixture-scope empty; "
            "trying team+tournament scope (team=%s league=1 season=2026)",
            match_id, side, team_ext_id,
        )
        _t2_key = f"team:{team_ext_id}"
        _t2_cached = _INJURIES_CACHE.get(_t2_key)
        if _t2_cached and now - _t2_cached[0] < _INJURIES_CACHE_TTL:
            log.debug("[SquadAvailability] cache hit team=%s", team_ext_id)
            team_raw = _t2_cached[1]
        else:
            try:
                team_raw = await provider.fetch_injuries_by_team(team_ext_id)
                _INJURIES_CACHE[_t2_key] = (now, team_raw)
            except Exception as exc:
                log.error(
                    "[SquadAvailability] match=%s side=%s — team-scope /injuries failed: %s",
                    match_id, side, exc,
                )
                team_raw = []

        if not team_raw:
            log.info(
                "[SquadAvailability] match=%s side=%s — team-scope also empty; no injury data available",
                match_id, side,
            )
            return None

        match_dt = match.scheduled_at
        if match_dt.tzinfo is None:
            match_dt = match_dt.replace(tzinfo=timezone.utc)

        raw_entries, using_tournament_fallback = _select_tournament_entries(
            team_raw, fixture_id, match_dt,
        )

        if not raw_entries:
            log.info(
                "[SquadAvailability] match=%s side=%s — no usable entries from team-scope; no-data",
                match_id, side,
            )
            return None

    # Filter to this team only (fixture-scope returns both teams; team-scope already filtered)
    team_entries = [
        e for e in raw_entries
        if str(e.get("team", {}).get("id", "")) == team_ext_id
    ]

    log.info(
        "[SquadAvailability] match=%s side=%s — entries: total=%d team=%d "
        "tournament_fallback=%s",
        match_id, side, len(raw_entries), len(team_entries), using_tournament_fallback,
    )

    # ── Parse + validate ──────────────────────────────────────────────────────
    result_data = SquadAvailability()
    seen_names: set[str] = set()

    for entry in team_entries:
        player      = entry.get("player", {})
        name        = (player.get("name") or "").strip()
        injury_type = (entry.get("type") or "").strip()
        reason      = (entry.get("reason") or "").strip() or None

        if not name or len(name) < 2:
            log.debug(
                "[SquadAvailability] match=%s side=%s — entry with empty name skipped",
                match_id, side,
            )
            continue

        name_key = name.lower()

        if name_key in seen_names:
            log.debug(
                "[SquadAvailability] match=%s side=%s — duplicate '%s' skipped",
                match_id, side, name,
            )
            continue
        seen_names.add(name_key)

        status = _TYPE_TO_STATUS.get(injury_type)
        if not status:
            log.debug(
                "[SquadAvailability] match=%s side=%s — unknown type '%s' for '%s', skipping",
                match_id, side, injury_type, name,
            )
            continue

        # For tournament-fallback entries, annotate the detail so the frontend can
        # show "WC status" context instead of implying match-confirmed absence.
        if using_tournament_fallback:
            detail = (f"{reason} · WC status" if reason else "WC status")
        else:
            detail = reason

        p = PlayerEntry(name=name, detail=detail)
        if status == "injured":
            result_data.injured.append(p)
        elif status == "suspended":
            result_data.suspended.append(p)
        elif status == "doubtful":
            result_data.doubtful.append(p)

    total = (
        len(result_data.injured) + len(result_data.suspended) + len(result_data.doubtful)
    )
    log.info(
        "[SquadAvailability] match=%s side=%s team=%s — done: "
        "injured=%d suspended=%d doubtful=%d total=%d",
        match_id, side, team_code,
        len(result_data.injured), len(result_data.suspended), len(result_data.doubtful),
        total,
    )

    return result_data
