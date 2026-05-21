"""
Squad availability service.

Fetches real-time player availability for one side of a match via API-Football.
Only returns data that has been validated — never fabricates names or statuses.

Data sources (in order of precedence):
  1. /injuries?fixture={fixture_id}  — primary; covers injured/suspended/doubtful
  2. Player names are validated against our own players table when possible.

Returns None when data cannot be obtained (missing API key, missing external IDs,
API errors).  The caller is responsible for returning an appropriate HTTP response
(501 Not Implemented is the correct code when data is simply not available yet).
"""
import logging
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.match import Match
from models.player import Player
from models.team import Team
from providers.apifootball import ApiFootballProvider

log = logging.getLogger(__name__)

# API-Football injury `type` → availability bucket
_TYPE_TO_STATUS: dict[str, str] = {
    "Injured":         "injured",
    "Out":             "injured",
    "Missing Fixture": "injured",
    "Suspended":       "suspended",
    "Questionable":    "doubtful",
    "Doubtful":        "doubtful",
}


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

    log.info(
        "[SquadAvailability] match=%s side=%s team=%s — fetching injuries "
        "fixture_id=%s team_ext_id=%s",
        match_id, side, team_code, fixture_id, team_ext_id,
    )

    try:
        raw_entries = await provider.fetch_injuries(fixture_id)
    except Exception as exc:
        log.error(
            "[SquadAvailability] match=%s side=%s — API-Football /injuries failed: %s",
            match_id, side, exc,
        )
        return None

    # Filter to this team only
    team_entries = [
        e for e in raw_entries
        if str(e.get("team", {}).get("id", "")) == team_ext_id
    ]

    log.info(
        "[SquadAvailability] match=%s side=%s — raw entries: total=%d, team=%d",
        match_id, side, len(raw_entries), len(team_entries),
    )

    # Load our DB roster for optional name validation
    roster_names: set[str] = set()
    db_players = await db.execute(
        select(Player.name).where(Player.team_id == team_code.lower())
    )
    for (name,) in db_players.all():
        roster_names.add(name.strip().lower())

    has_roster = len(roster_names) > 0
    log.info(
        "[SquadAvailability] match=%s side=%s — DB roster has %d players (validation %s)",
        match_id, side, len(roster_names), "enabled" if has_roster else "skipped",
    )

    # Parse + validate
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

        # If we have a roster, only accept players whose name fuzzy-matches a roster entry.
        # We use a simple substring check (last name) to handle "J. Smith" vs "John Smith".
        if has_roster:
            parts     = name_key.split()
            last_name = parts[-1] if parts else name_key
            if not any(last_name in roster_name for roster_name in roster_names):
                log.debug(
                    "[SquadAvailability] match=%s side=%s — '%s' not found in DB roster, skipping",
                    match_id, side, name,
                )
                continue

        p = PlayerEntry(name=name, detail=reason)
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
