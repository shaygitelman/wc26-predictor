"""
API-Football provider (api-sports.io).

WC 2026:
  league_id = "1"
  season    = "2026"

Rate limit: ~100 req/min on paid plan.
We sleep 0.2 s between requests (≤300/min burst headroom).
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from core.wc2026_config import (
    APIFOOTBALL_ID_TO_CODE,
    CODE_TO_FLAG,
    CODE_TO_GROUP,
    CODE_TO_NAME,
    WC2026_VENUE_CITY_MAP,
)
from providers.base import FootballDataProvider, ProviderFixture, ProviderPlayer, ProviderTeam

log = logging.getLogger(__name__)

_BASE = "https://v3.football.api-sports.io"

# Fallback name→code map for teams not in APIFOOTBALL_ID_TO_CODE.
# (Should never be needed for WC 2026, but kept as a safety net.)
_NAME_TO_CODE: dict[str, str] = {
    "Bosnia & Herzegovina": "BIH",
    "Cape Verde Islands":   "CPV",
    "Congo DR":             "COD",
}

# Round strings from API-Football → (int_round, round_code)
# "Group Stage - 1" / "Group Stage - 2" / "Group Stage - 3"
# "Round of 32" / "Round of 16" / "Quarter-finals" / "Semi-finals"
# "3rd Place Final" / "Final"
def _parse_round(round_str: str) -> int:
    r = round_str.strip()
    if r.startswith("Group Stage"):
        try:
            return int(r.split("-")[-1].strip())
        except ValueError:
            return 1
    mapping = {
        "Round of 32":    4,
        "Round of 16":    5,
        "Quarter-finals": 6,
        "Semi-finals":    7,
        "3rd Place Final": 8,
        "Final":          9,
    }
    for key, val in mapping.items():
        if key.lower() in r.lower():
            return val
    return 1


_STATUS_MAP: dict[str, str] = {
    "NS":   "scheduled",
    "TBD":  "scheduled",
    "1H":   "live",
    "2H":   "live",
    "HT":   "live",
    "ET":   "live",
    "BT":   "live",
    "P":    "live",
    "SUSP": "live",
    "INT":  "live",
    "LIVE": "live",
    "FT":   "finished",
    "AET":  "finished",
    "PEN":  "finished",
    "PST":  "scheduled",
    "CANC": "scheduled",
    "ABD":  "scheduled",
    "AWD":  "finished",
    "WO":   "finished",
}


class ApiFootballProvider(FootballDataProvider):
    provider_key = "apifootball"

    def __init__(self, api_key: str):
        self._key = api_key

    # ── Internal HTTP ─────────────────────────────────────────────

    async def _get(self, path: str, params: dict | None = None) -> dict:
        headers = {"x-apisports-key": self._key}
        async with httpx.AsyncClient(timeout=30) as client:
            attempt = 0
            while True:
                res = await client.get(f"{_BASE}{path}", headers=headers, params=params or {})
                if res.status_code == 429:
                    wait = 2 ** attempt
                    log.warning("API-Football 429 — sleeping %ss", wait)
                    await asyncio.sleep(wait)
                    attempt += 1
                    if attempt > 4:
                        res.raise_for_status()
                    continue
                res.raise_for_status()
                data = res.json()
                # API-Football returns HTTP 200 even when rate-limited or quota-exceeded;
                # the error is buried in the JSON body. Raise so callers see it.
                errors = data.get("errors")
                if errors:
                    msg = str(errors)
                    log.error("API-Football error for %s %s: %s", path, params, msg)
                    raise RuntimeError(f"API-Football error: {msg}")
                return data

    # ── Teams ─────────────────────────────────────────────────────

    async def fetch_teams(self, league_id: str) -> list[ProviderTeam]:
        data = await self._get("/teams", {"league": league_id, "season": "2026"})
        await asyncio.sleep(0.2)

        result: list[ProviderTeam] = []
        for entry in data.get("response", []):
            t = entry.get("team", {})
            ext_id = str(t.get("id", ""))
            name   = t.get("name", "")
            logo   = t.get("logo")

            # Canonical code: ID map → name fallback → API code → first 3 chars
            code = (
                APIFOOTBALL_ID_TO_CODE.get(ext_id)
                or _NAME_TO_CODE.get(name)
                or (t.get("code") or name[:3]).upper()
            )
            # Use config display name if we recognise the team
            display_name = CODE_TO_NAME.get(code, name)
            flag_url     = CODE_TO_FLAG.get(code)
            group_name   = CODE_TO_GROUP.get(code)

            result.append(ProviderTeam(
                external_id  = ext_id,
                name         = display_name,
                short_code   = code.upper(),
                flag_url     = flag_url,
                logo_url     = logo,
                group_name   = group_name,
                country_code = None,
            ))
        return result

    # ── Fixtures ──────────────────────────────────────────────────

    async def fetch_fixtures(self, league_id: str, season: str) -> list[ProviderFixture]:
        data = await self._get("/fixtures", {"league": league_id, "season": season})
        await asyncio.sleep(0.2)
        return self._parse_fixtures(data)

    async def fetch_live(self, league_id: str) -> list[ProviderFixture]:
        # Use "live=all" to fetch all live fixtures across every competition.
        # We then filter in-DB by external_id, so only WC2026 matches are affected.
        # "live=<league_id>" is the league-scoped variant, but API-Football's live
        # index sometimes lags behind the full feed — "live=all" is more reliable.
        data = await self._get("/fixtures", {"live": "all"})
        await asyncio.sleep(0.2)
        return self._parse_fixtures(data)

    async def fetch_by_id(self, fixture_id: str) -> Optional[ProviderFixture]:
        """Fetch a single fixture by its API-Football ID."""
        data = await self._get("/fixtures", {"id": fixture_id})
        await asyncio.sleep(0.2)
        fixtures = self._parse_fixtures(data)
        return fixtures[0] if fixtures else None

    def _parse_fixtures(self, data: dict) -> list[ProviderFixture]:
        result: list[ProviderFixture] = []
        for entry in data.get("response", []):
            fix      = entry.get("fixture", {})
            league   = entry.get("league", {})
            teams    = entry.get("teams", {})
            goals    = entry.get("goals", {})
            score    = entry.get("score", {})
            status   = fix.get("status", {})

            ext_id   = str(fix.get("id", ""))
            dt_str   = fix.get("date", "")
            try:
                scheduled = datetime.fromisoformat(dt_str.replace("Z", "+00:00")).astimezone(timezone.utc)
            except Exception:
                scheduled = datetime.now(timezone.utc)

            home_t    = teams.get("home", {})
            away_t    = teams.get("away", {})
            home_id   = str(home_t.get("id", ""))
            away_id   = str(away_t.get("id", ""))
            home_name = home_t.get("name", "TBD")
            away_name = away_t.get("name", "TBD")

            # Canonical codes via ID map — eliminates AUS/AUS and IRA/IRA collisions
            home_code = (
                APIFOOTBALL_ID_TO_CODE.get(home_id)
                or _NAME_TO_CODE.get(home_name)
                or (home_t.get("code") or home_name[:3])
            ).upper()
            away_code = (
                APIFOOTBALL_ID_TO_CODE.get(away_id)
                or _NAME_TO_CODE.get(away_name)
                or (away_t.get("code") or away_name[:3])
            ).upper()

            # Canonical display names
            home_name = CODE_TO_NAME.get(home_code, home_name)
            away_name = CODE_TO_NAME.get(away_code, away_name)

            raw_status = status.get("short", "NS")
            fx_status  = _STATUS_MAP.get(raw_status, "scheduled")

            # Live minute
            minute: Optional[int] = None
            if fx_status == "live":
                raw_min = status.get("elapsed")
                if raw_min is not None:
                    try:
                        minute = int(raw_min)
                    except (TypeError, ValueError):
                        pass

            # Goals: use full-time from score if goals is null mid-match
            home_score: Optional[int] = goals.get("home")
            away_score: Optional[int] = goals.get("away")
            if home_score is None and fx_status == "finished":
                home_score = (score.get("fulltime") or {}).get("home")
            if away_score is None and fx_status == "finished":
                away_score = (score.get("fulltime") or {}).get("away")

            round_str  = league.get("round", "")
            int_round  = _parse_round(round_str)

            # Group letter — API-Football often omits league.group, so fall back
            # to our config's CODE_TO_GROUP using the canonical team codes.
            group_raw  = league.get("group", "")
            group_name: Optional[str] = None
            if group_raw and "Group" in group_raw:
                parts = group_raw.split()
                if len(parts) >= 2:
                    group_name = parts[-1].upper()
            if not group_name:
                group_name = CODE_TO_GROUP.get(home_code) or CODE_TO_GROUP.get(away_code)

            venue_obj  = fix.get("venue", {})
            venue      = venue_obj.get("name") or None
            city       = venue_obj.get("city") or None

            # When the API supplies a stadium name but omits the city, recover it
            # from the authoritative WC 2026 host-venue map.
            if venue and not city:
                city = WC2026_VENUE_CITY_MAP.get(venue.lower())

            result.append(ProviderFixture(
                external_id      = ext_id,
                home_external_id = home_id,
                away_external_id = away_id,
                home_team_code   = home_code,
                away_team_code   = away_code,
                home_team_name   = home_name,
                away_team_name   = away_name,
                scheduled_at     = scheduled,
                int_round        = int_round,
                home_flag_url    = CODE_TO_FLAG.get(home_code),
                away_flag_url    = CODE_TO_FLAG.get(away_code),
                home_logo_url    = home_t.get("logo"),
                away_logo_url    = away_t.get("logo"),
                venue            = venue,
                city             = city,
                status           = fx_status,
                home_score       = home_score,
                away_score       = away_score,
                thumb_url        = None,
                group_name       = group_name,
                minute           = minute,
            ))
        return result

    # ── Players ───────────────────────────────────────────────────

    async def fetch_players(self, team_external_id: str) -> list[ProviderPlayer]:
        result: list[ProviderPlayer] = []
        page = 1
        while True:
            data = await self._get("/players/squads", {"team": team_external_id})
            await asyncio.sleep(0.2)

            for entry in data.get("response", []):
                for p in entry.get("players", []):
                    pos_raw  = p.get("position", "")
                    pos_map  = {"Goalkeeper": "GK", "Defender": "DEF", "Midfielder": "MID", "Attacker": "FWD"}
                    position = pos_map.get(pos_raw, pos_raw[:3].upper() if pos_raw else None)

                    result.append(ProviderPlayer(
                        external_id      = str(p.get("id", "")),
                        team_external_id = team_external_id,
                        name             = p.get("name", ""),
                        position         = position,
                        shirt_number     = p.get("number"),
                        photo_url        = p.get("photo"),
                        date_of_birth    = None,   # squads endpoint omits DOB
                    ))
            # /players/squads is not paginated — single response
            break

        return result

    # ── Injuries ─────────────────────────────────────────────────

    async def fetch_injuries(self, fixture_id: str) -> list[dict]:
        """Fixture-scoped injuries — returns entries for both teams in a fixture."""
        data = await self._get("/injuries", {"fixture": fixture_id})
        await asyncio.sleep(0.2)
        return data.get("response", [])

    async def fetch_injuries_by_team(
        self,
        team_ext_id: str,
        league_id:   str = "1",
        season:      str = "2026",
    ) -> list[dict]:
        """Team+league+season scoped injuries — returns all WC injury entries for a team.

        Useful as a fallback when the fixture-level report hasn't been published yet.
        Each entry carries a fixture reference so callers can filter to upcoming matches.
        """
        data = await self._get("/injuries", {
            "team":   team_ext_id,
            "league": league_id,
            "season": season,
        })
        await asyncio.sleep(0.2)
        return data.get("response", [])

    # ── Fixture statistics ────────────────────────────────────────

    async def fetch_fixture_statistics(self, fixture_id: str) -> list[dict]:
        """Returns raw API-Football statistics blocks for a fixture.

        Each block is one team: { team: {...}, statistics: [{type, value}, ...] }.
        Only populated for live or finished matches — returns [] for scheduled ones.
        """
        data = await self._get("/fixtures/statistics", {"fixture": fixture_id})
        await asyncio.sleep(0.2)
        return data.get("response", [])

    # ── Lineups ───────────────────────────────────────────────────

    async def fetch_lineups(self, fixture_id: str) -> list[dict]:
        """Returns raw API-Football lineup entries for a fixture."""
        data = await self._get("/fixtures/lineups", {"fixture": fixture_id})
        await asyncio.sleep(0.2)
        return data.get("response", [])

    # ── Fixture events (cards, goals, substitutions) ─────────────

    async def fetch_fixture_events(self, fixture_id: str) -> list[dict]:
        """Returns raw API-Football event entries for a fixture.

        Each entry has: time, team, player, assist, type, detail, comments.
        Available for live and finished matches only.
        """
        data = await self._get("/fixtures/events", {"fixture": fixture_id})
        await asyncio.sleep(0.2)
        return data.get("response", [])

    # ── Standings (group letters) ──────────────────────────────────

    async def fetch_standings(self, league_id: str, season: str) -> dict[str, str]:
        """Returns {team_ext_id: group_letter}."""
        data = await self._get("/standings", {"league": league_id, "season": season})
        await asyncio.sleep(0.2)

        mapping: dict[str, str] = {}
        for league_block in data.get("response", []):
            for group_list in league_block.get("league", {}).get("standings", []):
                for row in group_list:
                    team_id    = str(row.get("team", {}).get("id", ""))
                    group_desc = row.get("group", "")  # "Group A", "Group B", …
                    if team_id and "Group" in group_desc:
                        parts = group_desc.split()
                        mapping[team_id] = parts[-1].upper()
        return mapping
