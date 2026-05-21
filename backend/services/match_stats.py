"""
Match statistics service.

Fetches live match statistics from API-Football (/fixtures/statistics) for a
specific fixture. Only returns data that was directly returned by the API —
never fabricates, estimates, or falls back to hardcoded values.

Returns None when:
- APIFOOTBALL_KEY is not configured
- The match has no numeric external_id (not yet mapped to a real fixture)
- The match is scheduled (statistics don't exist before kick-off)
- The API call fails or times out
- The API returns fewer than 2 team blocks (stats not yet available)
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.match import Match
from providers.apifootball import ApiFootballProvider

log = logging.getLogger(__name__)

# ─── Stat-value parser ────────────────────────────────────────────────────────


def _parse_num(val: object) -> Optional[float]:
    """Parse a value that may be int, float, '55%', '1.85', null, or None."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        cleaned = val.strip().rstrip("%")
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _stat(stats_list: list[dict], stat_type: str) -> Optional[float]:
    """Return the parsed value for the first statistics entry matching stat_type."""
    for entry in stats_list:
        if (entry.get("type") or "").lower() == stat_type.lower():
            return _parse_num(entry.get("value"))
    return None


# ─── Data classes ─────────────────────────────────────────────────────────────


@dataclass
class TeamMatchStats:
    possession:      Optional[float]  # 0–100 (%)
    total_shots:     Optional[int]
    shots_on_target: Optional[int]
    corners:         Optional[int]
    fouls:           Optional[int]
    yellow_cards:    Optional[int]
    red_cards:       Optional[int]
    saves:           Optional[int]
    offsides:        Optional[int]
    passes:          Optional[int]
    pass_accuracy:   Optional[float]  # 0–100 (%)
    xg:              Optional[float]

    # How many of the 12 fields are non-null — logged for coverage instrumentation
    @property
    def field_coverage(self) -> int:
        return sum(1 for v in (
            self.possession, self.total_shots, self.shots_on_target,
            self.corners, self.fouls, self.yellow_cards, self.red_cards,
            self.saves, self.offsides, self.passes, self.pass_accuracy, self.xg,
        ) if v is not None)

    def to_dict(self) -> dict:
        return {
            "possession":    self.possession,
            "totalShots":    self.total_shots,
            "shotsOnTarget": self.shots_on_target,
            "corners":       self.corners,
            "fouls":         self.fouls,
            "yellowCards":   self.yellow_cards,
            "redCards":      self.red_cards,
            "saves":         self.saves,
            "offsides":      self.offsides,
            "passes":        self.passes,
            "passAccuracy":  self.pass_accuracy,
            "xG":            self.xg,
        }


@dataclass
class MatchStatistics:
    match_id:   str
    fixture_id: str
    fetched_at: str   # ISO 8601
    home:       TeamMatchStats
    away:       TeamMatchStats

    def to_dict(self) -> dict:
        return {
            "matchId":    self.match_id,
            "fixtureId":  self.fixture_id,
            "source":     "api-football:/fixtures/statistics",
            "fetchedAt":  self.fetched_at,
            "verified":   True,
            "confidence": "high",
            "home":       self.home.to_dict(),
            "away":       self.away.to_dict(),
        }


# ─── Parser ───────────────────────────────────────────────────────────────────


def _parse_team(stats_list: list[dict]) -> TeamMatchStats:
    raw_poss  = _stat(stats_list, "Ball Possession")
    raw_total = _stat(stats_list, "Total Shots")
    raw_on    = _stat(stats_list, "Shots on Goal")
    raw_corn  = _stat(stats_list, "Corner Kicks")
    raw_fouls = _stat(stats_list, "Fouls")
    raw_yc    = _stat(stats_list, "Yellow Cards")
    raw_rc    = _stat(stats_list, "Red Cards")
    raw_saves = _stat(stats_list, "Goalkeeper Saves")
    raw_offs  = _stat(stats_list, "Offsides")
    raw_pass  = _stat(stats_list, "Total passes")
    raw_pacc  = _stat(stats_list, "Passes %")
    raw_xg    = _stat(stats_list, "expected_goals")

    def to_int(v: Optional[float]) -> Optional[int]:
        return int(v) if v is not None else None

    return TeamMatchStats(
        possession      = raw_poss,
        total_shots     = to_int(raw_total),
        shots_on_target = to_int(raw_on),
        corners         = to_int(raw_corn),
        fouls           = to_int(raw_fouls),
        yellow_cards    = to_int(raw_yc),
        red_cards       = to_int(raw_rc),
        saves           = to_int(raw_saves),
        offsides        = to_int(raw_offs),
        passes          = to_int(raw_pass),
        pass_accuracy   = raw_pacc,
        xg              = raw_xg,
    )


# ─── Public API ───────────────────────────────────────────────────────────────


async def get_match_statistics(
    match_id: str,
    db:       AsyncSession,
) -> MatchStatistics | None:
    """
    Returns live statistics for both teams in a match.

    Logs every decision point — endpoint called, HTTP status, field coverage,
    and reason for returning None — so that absence of data is always traceable.
    """
    if not settings.apifootball_key:
        log.warning(
            "[MatchStats] match=%s — APIFOOTBALL_KEY not configured; stats unavailable",
            match_id,
        )
        return None

    match = await db.get(Match, match_id)
    if not match:
        log.warning("[MatchStats] match=%s — not found in DB", match_id)
        return None

    # API-Football fixture IDs are numeric. Manual seeds and test fixtures are excluded.
    if not match.external_id or not match.external_id.isdigit():
        log.info(
            "[MatchStats] match=%s — external_id=%r is not a numeric API-Football ID; "
            "statistics not available (fixture not yet mapped)",
            match_id, match.external_id,
        )
        return None

    # Statistics endpoint only returns data for live/finished matches
    if match.status == "scheduled":
        log.info(
            "[MatchStats] match=%s — status=scheduled; "
            "API-Football only returns statistics for live or finished matches",
            match_id,
        )
        return None

    fixture_id = match.external_id
    provider   = ApiFootballProvider(settings.apifootball_key)

    log.info(
        "[MatchStats] match=%s fixture_id=%s status=%s — "
        "calling GET /fixtures/statistics",
        match_id, fixture_id, match.status,
    )

    try:
        raw = await provider.fetch_fixture_statistics(fixture_id)
    except Exception as exc:
        log.error(
            "[MatchStats] match=%s fixture_id=%s — "
            "API-Football /fixtures/statistics failed: %s",
            match_id, fixture_id, exc,
        )
        return None

    log.info(
        "[MatchStats] match=%s fixture_id=%s — "
        "API response: %d team block(s) returned",
        match_id, fixture_id, len(raw),
    )

    if len(raw) < 2:
        log.info(
            "[MatchStats] match=%s fixture_id=%s — "
            "fewer than 2 team blocks (got %d); statistics not yet published for this fixture",
            match_id, fixture_id, len(raw),
        )
        return None

    home = _parse_team(raw[0].get("statistics", []))
    away = _parse_team(raw[1].get("statistics", []))

    log.info(
        "[MatchStats] match=%s fixture_id=%s — "
        "parsed: home=%d/12 fields verified, away=%d/12 fields verified",
        match_id, fixture_id, home.field_coverage, away.field_coverage,
    )

    return MatchStatistics(
        match_id   = match_id,
        fixture_id = fixture_id,
        fetched_at = datetime.now(timezone.utc).isoformat(),
        home       = home,
        away       = away,
    )
