"""
Real historical form service — API-Football.

Fetches a national team's last N finished international matches across ALL
competitions (friendlies, qualifiers, Nations League, Copa América, etc.)
and aggregates form, goals, and tactical statistics from real API data.

Never fabricates or estimates values — everything comes from API-Football.

Falls back to empty / None gracefully when:
  - APIFOOTBALL_KEY is not configured
  - Team has no API-Football ID in external_ids
  - Any API call fails
"""
import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.team import Team
from providers.apifootball import ApiFootballProvider

log = logging.getLogger(__name__)

# ─── Finished-status codes returned by API-Football ─────────────────
_FT_STATUSES = frozenset({"FT", "AET", "PEN", "AWD", "WO"})

# ─── In-process TTL cache (1 h) ──────────────────────────────────────
# Key: "{api_id}:{last}" → (fetched_at_unix, TeamFormResult)
_FORM_CACHE: dict[str, tuple[float, "TeamFormResult"]] = {}
# Key: "h2h:{home_api_id}:{away_api_id}" → (fetched_at_unix, dict)
_H2H_CACHE:  dict[str, tuple[float, dict]]             = {}
_CACHE_TTL   = 3600  # 1 hour


# ─── Data structures ─────────────────────────────────────────────────

@dataclass
class TeamFormResult:
    """
    Aggregated recent-form data for one team.
    All numeric averages are derived from real fixture statistics — None when
    the per-fixture stats endpoint returned no data for that category.
    """
    form:           list[dict]         # RealFormResult-shaped dicts (oldest → newest)
    avg_corners:    Optional[float]
    avg_possession: Optional[float]
    avg_shots:      Optional[float]
    fixture_count:  int
    source:         str
    fetched_at:     str                # ISO 8601


# ─── Helpers ─────────────────────────────────────────────────────────

async def _get_api_football_id(team_code: str, db: AsyncSession) -> Optional[str]:
    """Return the API-Football numeric team ID from the teams table."""
    team = await db.get(Team, team_code.lower())
    if not team:
        log.debug("[TeamForm] team_code=%s not found in teams table", team_code)
        return None
    ext = team.external_ids or {}
    api_id = ext.get("api_football") or ext.get("apifootball") or ext.get("api-football")
    if not api_id:
        log.warning("[TeamForm] team_code=%s has no api_football entry in external_ids: %s", team_code, ext)
    return str(api_id) if api_id else None


def _parse_num(val: object) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        try:
            return float(val.strip().rstrip("%"))
        except ValueError:
            return None
    return None


def _stat_from_list(stats_list: list[dict], type_name: str) -> Optional[float]:
    for entry in stats_list:
        if (entry.get("type") or "").lower() == type_name.lower():
            return _parse_num(entry.get("value"))
    return None


async def _fetch_stats_for_team(
    provider: ApiFootballProvider,
    fixture_id: str,
    api_id: str,
) -> list[dict]:
    """Return the statistics list for this team from a specific fixture. Empty on failure."""
    try:
        raw = await provider.fetch_fixture_statistics(fixture_id)
        for block in raw:
            if str(block.get("team", {}).get("id", "")) == api_id:
                return block.get("statistics", [])
    except Exception as exc:
        log.debug("[TeamForm] stats fetch failed fixture=%s team=%s: %s", fixture_id, api_id, exc)
    return []


# ─── Public API ──────────────────────────────────────────────────────

async def get_team_form(
    team_code: str,
    db: AsyncSession,
    last: int = 5,
) -> Optional[TeamFormResult]:
    """
    Return the last {last} finished international fixtures for a team.
    Fetches from API-Football across ALL competitions.
    Returns None when data cannot be retrieved (no key, no ID, API error).
    """
    if not settings.apifootball_key:
        log.warning("[TeamForm] APIFOOTBALL_KEY not configured — skipping")
        return None

    api_id = await _get_api_football_id(team_code, db)
    if not api_id:
        return None

    cache_key = f"{api_id}:{last}"
    now = time.time()
    if cache_key in _FORM_CACHE:
        ts, cached = _FORM_CACHE[cache_key]
        if now - ts < _CACHE_TTL:
            log.debug("[TeamForm] cache hit team=%s", team_code)
            return cached

    provider = ApiFootballProvider(settings.apifootball_key)

    # Request more than `last` because some "last N" results may include
    # non-finished statuses (SUSP, CANC etc.) — we'll filter and take the
    # most-recent {last} finished matches.
    fetch_n = max(last * 2, 10)
    try:
        data = await provider._get("/fixtures", {"team": api_id, "last": str(fetch_n)})
    except Exception as exc:
        log.error("[TeamForm] API error for team=%s api_id=%s: %s", team_code, api_id, exc)
        return None

    all_entries = data.get("response", [])
    finished = [
        e for e in all_entries
        if e.get("fixture", {}).get("status", {}).get("short", "") in _FT_STATUSES
    ]
    # Sort newest first (API usually returns newest first, but guarantee it)
    finished.sort(
        key=lambda e: e.get("fixture", {}).get("timestamp", 0),
        reverse=True,
    )
    finished = finished[:last]

    log.info(
        "[TeamForm] team=%s api_id=%s — %d total, %d finished selected (last %d)",
        team_code, api_id, len(all_entries), len(finished), last,
    )

    if not finished:
        result = TeamFormResult(
            form=[], avg_corners=None, avg_possession=None, avg_shots=None,
            fixture_count=0,
            source=f"api-football:/fixtures?team={api_id}&last={fetch_n}",
            fetched_at=datetime.now(timezone.utc).isoformat(),
        )
        _FORM_CACHE[cache_key] = (now, result)
        return result

    # ── Build form records ────────────────────────────────────────────
    form_records: list[dict] = []
    fixture_ids:  list[str]  = []

    for entry in finished:
        fix    = entry.get("fixture", {})
        teams  = entry.get("teams", {})
        goals  = entry.get("goals", {})
        score  = entry.get("score", {})
        league = entry.get("league", {})

        home_t  = teams.get("home", {})
        away_t  = teams.get("away", {})
        home_id = str(home_t.get("id", ""))
        is_home = home_id == api_id

        hg = goals.get("home")
        ag = goals.get("away")
        if hg is None:
            hg = (score.get("fulltime") or {}).get("home")
        if ag is None:
            ag = (score.get("fulltime") or {}).get("away")

        if hg is None or ag is None:
            continue

        goals_for = int(hg) if is_home else int(ag)
        goals_agt = int(ag) if is_home else int(hg)
        opponent  = away_t.get("name", "Unknown") if is_home else home_t.get("name", "Unknown")
        r = "W" if goals_for > goals_agt else ("L" if goals_for < goals_agt else "D")

        form_records.append({
            "result":      r,
            "goalsFor":    goals_for,
            "goalsAgt":    goals_agt,
            "opponent":    opponent,
            "date":        fix.get("date", ""),
            "competition": league.get("name", ""),
        })
        fix_id = str(fix.get("id", ""))
        if fix_id:
            fixture_ids.append(fix_id)

    # ── Fetch per-fixture stats concurrently ─────────────────────────
    stats_lists: list[list[dict]] = []
    if fixture_ids:
        stats_lists = list(await asyncio.gather(*[
            _fetch_stats_for_team(provider, fix_id, api_id)
            for fix_id in fixture_ids
        ]))

    all_corners:    list[float] = []
    all_possession: list[float] = []
    all_shots:      list[float] = []

    for stats_list in stats_lists:
        v = _stat_from_list(stats_list, "Corner Kicks")
        if v is not None:
            all_corners.append(v)
        v = _stat_from_list(stats_list, "Ball Possession")
        if v is not None:
            all_possession.append(v)
        v = _stat_from_list(stats_list, "Total Shots")
        if v is not None:
            all_shots.append(v)

    def avg(vals: list[float]) -> Optional[float]:
        return round(sum(vals) / len(vals), 1) if vals else None

    # Return form oldest→newest (reverse, since we sorted newest first)
    form_records.reverse()

    result = TeamFormResult(
        form           = form_records,
        avg_corners    = avg(all_corners),
        avg_possession = avg(all_possession),
        avg_shots      = avg(all_shots),
        fixture_count  = len(form_records),
        source         = f"api-football:/fixtures?team={api_id}&last={fetch_n}",
        fetched_at     = datetime.now(timezone.utc).isoformat(),
    )

    _FORM_CACHE[cache_key] = (now, result)
    log.info(
        "[TeamForm] SUCCESS team=%s — %d matches | corners=%s poss=%s shots=%s",
        team_code, len(form_records), result.avg_corners, result.avg_possession, result.avg_shots,
    )
    return result


async def get_h2h(
    home_code: str,
    away_code: str,
    db: AsyncSession,
    last: int = 10,
) -> Optional[dict]:
    """
    Return head-to-head record from real API-Football historical fixtures.
    Counts are from the perspective of the WC match's home team.
    Returns None when data cannot be retrieved.
    """
    if not settings.apifootball_key:
        return None

    home_api_id = await _get_api_football_id(home_code, db)
    away_api_id = await _get_api_football_id(away_code, db)

    if not home_api_id or not away_api_id:
        log.warning(
            "[H2H] Missing API-Football IDs: home=%s(%s) away=%s(%s)",
            home_code, home_api_id, away_code, away_api_id,
        )
        return None

    cache_key = f"h2h:{home_api_id}:{away_api_id}"
    now = time.time()
    if cache_key in _H2H_CACHE:
        ts, cached = _H2H_CACHE[cache_key]
        if now - ts < _CACHE_TTL:
            log.debug("[H2H] cache hit %s vs %s", home_code, away_code)
            return cached

    provider = ApiFootballProvider(settings.apifootball_key)

    try:
        data = await provider._get("/fixtures/headtohead", {
            "h2h":    f"{home_api_id}-{away_api_id}",
            "status": "FT",
            "last":   str(last),
        })
    except Exception as exc:
        log.error("[H2H] API error %s vs %s: %s", home_code, away_code, exc)
        return None

    fixtures = [
        e for e in data.get("response", [])
        if e.get("fixture", {}).get("status", {}).get("short", "") in _FT_STATUSES
    ]
    # Sort newest first
    fixtures.sort(
        key=lambda e: e.get("fixture", {}).get("timestamp", 0),
        reverse=True,
    )

    log.info("[H2H] %s vs %s — %d finished fixtures", home_code, away_code, len(fixtures))

    home_wins    = 0
    away_wins    = 0
    draws        = 0
    last_meeting: Optional[dict] = None

    for entry in fixtures:
        fix    = entry.get("fixture", {})
        teams  = entry.get("teams", {})
        goals  = entry.get("goals", {})
        score  = entry.get("score", {})

        fix_home_id = str(teams.get("home", {}).get("id", ""))
        this_home_is_our_home = fix_home_id == home_api_id

        hg = goals.get("home")
        ag = goals.get("away")
        if hg is None:
            hg = (score.get("fulltime") or {}).get("home")
        if ag is None:
            ag = (score.get("fulltime") or {}).get("away")
        if hg is None or ag is None:
            continue

        # Reorient goals to WC match's home-team perspective
        our_home_goals = int(hg) if this_home_is_our_home else int(ag)
        our_away_goals = int(ag) if this_home_is_our_home else int(hg)

        if our_home_goals > our_away_goals:
            home_wins += 1
        elif our_home_goals < our_away_goals:
            away_wins += 1
        else:
            draws += 1

        if last_meeting is None:
            # Use actual fixture team names so the text reads naturally
            fix_home_name = teams.get("home", {}).get("name", "")
            fix_away_name = teams.get("away", {}).get("name", "")
            last_meeting = {
                "date":         fix.get("date", ""),
                "homeGoals":    int(hg),
                "awayGoals":    int(ag),
                "homeTeamName": fix_home_name,
                "awayTeamName": fix_away_name,
            }

    result = {
        "homeWins":     home_wins,
        "awayWins":     away_wins,
        "draws":        draws,
        "totalMatches": home_wins + away_wins + draws,
        "lastMeeting":  last_meeting,
        "source":       (
            f"api-football:/fixtures/headtohead?"
            f"h2h={home_api_id}-{away_api_id}&status=FT&last={last}"
        ),
        "fetchedAt":    datetime.now(timezone.utc).isoformat(),
    }

    _H2H_CACHE[cache_key] = (now, result)
    log.info(
        "[H2H] SUCCESS %s vs %s — %dW %dD %dL",
        home_code, away_code, home_wins, draws, away_wins,
    )
    return result
