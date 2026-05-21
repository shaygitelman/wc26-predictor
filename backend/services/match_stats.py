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


class StatsRejectionReason:
    """String constants used in rejection logs so they're greppable in production."""
    NO_API_KEY       = "NO_API_KEY"
    MATCH_NOT_FOUND  = "MATCH_NOT_FOUND"
    MISSING_EXT_ID   = "MISSING_EXT_ID"       # external_id is NULL
    MANUAL_EXT_ID    = "MANUAL_EXT_ID"        # external_id starts with "manual-"
    NON_NUMERIC_ID   = "NON_NUMERIC_ID"       # external_id is set but not a pure integer
    MATCH_SCHEDULED  = "MATCH_SCHEDULED"      # API returns nothing for pre-kickoff fixtures
    API_ERROR        = "API_ERROR"            # HTTP / network failure
    EMPTY_RESPONSE   = "EMPTY_RESPONSE"       # API returned < 2 team blocks


async def get_match_statistics(
    match_id: str,
    db:       AsyncSession,
) -> MatchStatistics | None:
    """
    Returns live statistics for both teams in a match.

    Every decision that prevents stats from being returned is logged with a
    structured REJECTION reason code so production logs are greppable.

    Rejection codes (see StatsRejectionReason):
      NO_API_KEY      — APIFOOTBALL_KEY env var not set
      MATCH_NOT_FOUND — match_id not in DB
      MISSING_EXT_ID  — match.external_id is NULL (fixture not yet synced)
      MANUAL_EXT_ID   — external_id like "manual-wc2026-*" (placeholder seed)
      NON_NUMERIC_ID  — external_id present but not a pure integer
      MATCH_SCHEDULED — match.status == "scheduled" (no stats before kick-off)
      API_ERROR       — API-Football call failed (timeout / HTTP error)
      EMPTY_RESPONSE  — API returned < 2 team blocks (stats not yet published)
    """
    if not settings.apifootball_key:
        log.warning(
            "[MatchStats] REJECTION=%s match=%s — APIFOOTBALL_KEY not set in environment",
            StatsRejectionReason.NO_API_KEY, match_id,
        )
        return None

    match = await db.get(Match, match_id)
    if not match:
        log.warning(
            "[MatchStats] REJECTION=%s match=%s — record not found in matches table",
            StatsRejectionReason.MATCH_NOT_FOUND, match_id,
        )
        return None

    ext = match.external_id

    # Detailed external_id classification — each case is explicitly logged
    if ext is None:
        log.info(
            "[MatchStats] REJECTION=%s match=%s status=%s — "
            "external_id is NULL; fixture has not been synced from API-Football yet "
            "(run POST /admin/sync/fixtures to map real IDs)",
            StatsRejectionReason.MISSING_EXT_ID, match_id, match.status,
        )
        return None

    if ext.startswith("manual-"):
        log.info(
            "[MatchStats] REJECTION=%s match=%s status=%s external_id=%r — "
            "manually-seeded placeholder; not a real API-Football fixture ID",
            StatsRejectionReason.MANUAL_EXT_ID, match_id, match.status, ext,
        )
        return None

    if not ext.isdigit():
        log.warning(
            "[MatchStats] REJECTION=%s match=%s status=%s external_id=%r — "
            "external_id is set but is not a pure integer (unexpected format)",
            StatsRejectionReason.NON_NUMERIC_ID, match_id, match.status, ext,
        )
        return None

    # Statistics are only populated for live/finished matches
    if match.status == "scheduled":
        log.info(
            "[MatchStats] REJECTION=%s match=%s external_id=%s — "
            "match is scheduled; API-Football only publishes statistics "
            "after kick-off (status will be 'live' or 'finished')",
            StatsRejectionReason.MATCH_SCHEDULED, match_id, ext,
        )
        return None

    fixture_id = ext
    provider   = ApiFootballProvider(settings.apifootball_key)

    log.info(
        "[MatchStats] ATTEMPT match=%s fixture_id=%s status=%s — "
        "calling GET /fixtures/statistics",
        match_id, fixture_id, match.status,
    )

    try:
        raw = await provider.fetch_fixture_statistics(fixture_id)
    except Exception as exc:
        log.error(
            "[MatchStats] REJECTION=%s match=%s fixture_id=%s — "
            "API-Football /fixtures/statistics raised: %s",
            StatsRejectionReason.API_ERROR, match_id, fixture_id, exc,
        )
        return None

    blocks = len(raw)
    log.info(
        "[MatchStats] API_RESPONSE match=%s fixture_id=%s — "
        "%d team block(s) returned",
        match_id, fixture_id, blocks,
    )

    if blocks < 2:
        log.info(
            "[MatchStats] REJECTION=%s match=%s fixture_id=%s — "
            "API returned %d block(s); statistics not yet published for this fixture "
            "(common for live matches in early minutes)",
            StatsRejectionReason.EMPTY_RESPONSE, match_id, fixture_id, blocks,
        )
        return None

    home = _parse_team(raw[0].get("statistics", []))
    away = _parse_team(raw[1].get("statistics", []))

    log.info(
        "[MatchStats] SUCCESS match=%s fixture_id=%s — "
        "home=%d/12 fields, away=%d/12 fields verified from API-Football",
        match_id, fixture_id, home.field_coverage, away.field_coverage,
    )

    return MatchStatistics(
        match_id   = match_id,
        fixture_id = fixture_id,
        fetched_at = datetime.now(timezone.utc).isoformat(),
        home       = home,
        away       = away,
    )
