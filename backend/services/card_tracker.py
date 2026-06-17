"""
Card Tracker Service.

Computes suspension status, at-risk players, and recent injury substitution
events for an upcoming WC match using only existing data sources:
  - MatchPoint26 DB (completed match records)
  - API-Football /fixtures/events (card and substitution events)

Rules (WC 2026 / FIFA standard):
  - Group stage through QF: 2 yellow cards = 1-match suspension
  - Straight red card = 1-match ban
  - "Yellow Card/Red Card" (2nd yellow) = 1-match ban (treated as red)
  - After serving a ban, yellow-card tally resets to 0
  - After the QF, all yellow-card accumulations reset (not relevant here yet)
"""
import asyncio
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import timezone
from typing import Literal

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.match import Match
from models.team import Team
from providers.apifootball import ApiFootballProvider
from services import api_stats

log = logging.getLogger(__name__)

# WC 2026: yellow card threshold per accumulation window (same as WC 2022)
YELLOW_THRESHOLD = 2

# Fixture events for finished matches never change — cache for 6 hours.
_EVENTS_CACHE: dict[str, tuple[float, list[dict]]] = {}
_EVENTS_CACHE_TTL = 6 * 3600


@dataclass
class SuspendedEntry:
    name:   str
    reason: str  # "Red Card" | "Yellow Card Accumulation"


@dataclass
class AtRiskEntry:
    name:        str
    yellow_cards: int
    threshold:   int


@dataclass
class InjuryEventEntry:
    player_name: str
    match_label: str


@dataclass
class CardTrackingResult:
    suspended:            list[SuspendedEntry]  = field(default_factory=list)
    at_risk:              list[AtRiskEntry]     = field(default_factory=list)
    injury_events:        list[InjuryEventEntry] = field(default_factory=list)
    yellow_threshold:     int                   = YELLOW_THRESHOLD
    card_data_available:  bool                  = False

    def to_dict(self) -> dict:
        return {
            "suspended": [
                {"name": s.name, "reason": s.reason}
                for s in self.suspended
            ],
            "atRisk": [
                {"name": a.name, "yellowCards": a.yellow_cards, "threshold": a.threshold}
                for a in self.at_risk
            ],
            "injuryEvents": [
                {"playerName": e.player_name, "matchLabel": e.match_label}
                for e in self.injury_events
            ],
            "yellowThreshold": self.yellow_threshold,
            "cardDataAvailable": self.card_data_available,
        }


def _format_match_label(match: Match, team_code: str) -> str:
    """Short label like 'vs RSA (Jun 11)'."""
    opponent = match.away_team_code if match.home_team_code == team_code else match.home_team_code
    dt = match.scheduled_at
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return f"vs {opponent} ({dt.strftime('%b %-d')})"


def _process_events(
    all_match_events: list[tuple[Match, list[dict]]],
    team_ext_id:      str,
    team_code:        str,
) -> CardTrackingResult:
    """
    Walk completed matches oldest→newest, applying yellow-card accumulation rules.
    Returns the resulting CardTrackingResult.
    """
    # yellow_count[player_name] → running tally (resets after serving a ban)
    yellow_count: dict[str, int] = defaultdict(int)
    # players currently suspended (awaiting their next match to serve the ban)
    pending_bans: dict[str, str] = {}  # name → reason

    injury_events: list[InjuryEventEntry] = []

    for i, (match, events) in enumerate(all_match_events):
        # Players who were banned before this match serve the ban now → reset them
        for player in list(pending_bans.keys()):
            yellow_count[player] = 0
        pending_bans.clear()

        team_events = [
            e for e in events
            if str(e.get("team", {}).get("id", "")) == team_ext_id
        ]

        for event in team_events:
            ev_type   = (event.get("type")   or "").strip()
            ev_detail = (event.get("detail") or "").strip()
            player    = event.get("player") or {}
            name      = (player.get("name") or "").strip()
            if not name or len(name) < 2:
                continue

            if ev_type == "Card":
                detail_lower = ev_detail.lower()
                if "red" in detail_lower:
                    # Straight red OR second yellow treated as a 1-match ban
                    pending_bans[name] = "Red Card"
                    # Second yellow also increments yellow tally but we ban regardless
                elif "yellow" in detail_lower:
                    yellow_count[name] += 1
                    if yellow_count[name] >= YELLOW_THRESHOLD:
                        pending_bans[name] = "Yellow Card Accumulation"

            elif ev_type == "subst":
                detail_lower = ev_detail.lower()
                if "injury" in detail_lower:
                    label = _format_match_label(match, team_code)
                    injury_events.append(InjuryEventEntry(
                        player_name = name,
                        match_label = label,
                    ))

    # What remains in pending_bans after the last match = current suspensions
    suspended = [
        SuspendedEntry(name=name, reason=reason)
        for name, reason in sorted(pending_bans.items())
    ]

    # At-risk: players with at least 1 yellow but NOT (yet) banned
    at_risk = [
        AtRiskEntry(name=name, yellow_cards=count, threshold=YELLOW_THRESHOLD)
        for name, count in sorted(yellow_count.items())
        if 0 < count < YELLOW_THRESHOLD and name not in pending_bans
    ]

    return CardTrackingResult(
        suspended           = suspended,
        at_risk             = at_risk,
        injury_events       = injury_events,
        yellow_threshold    = YELLOW_THRESHOLD,
        card_data_available = True,
    )


async def get_card_tracking(
    match_id: str,
    side:     Literal["home", "away"],
    db:       AsyncSession,
) -> CardTrackingResult | None:
    """
    Returns card-derived suspension/at-risk data for one side of an upcoming match.

    Returns None when:
    - APIFOOTBALL_KEY is not configured
    - Match not found
    - Team has no apifootball external ID
    - Team has played zero completed WC matches before this one (nothing to analyse)
    """
    if not settings.apifootball_key:
        log.warning("[CardTracker] match=%s side=%s — APIFOOTBALL_KEY not set", match_id, side)
        return None

    match = await db.get(Match, match_id)
    if not match:
        log.warning("[CardTracker] match=%s — not found", match_id)
        return None

    team_code = match.home_team_code if side == "home" else match.away_team_code

    # Resolve apifootball team ID
    result = await db.execute(select(Team).where(Team.short_code == team_code))
    team = result.scalar_one_or_none()
    if not team or not team.external_ids:
        log.info("[CardTracker] match=%s side=%s — team %s not found or no external_ids", match_id, side, team_code)
        return None

    team_ext_id: str | None = team.external_ids.get("apifootball")
    if not team_ext_id:
        log.info("[CardTracker] match=%s side=%s — team %s has no apifootball ID", match_id, side, team_code)
        return None

    # Find completed WC matches for this team that happened before the upcoming match
    match_dt = match.scheduled_at
    if match_dt.tzinfo is None:
        match_dt = match_dt.replace(tzinfo=timezone.utc)

    prior_q = (
        select(Match)
        .where(
            and_(
                Match.status == "finished",
                or_(
                    Match.home_team_code == team_code,
                    Match.away_team_code == team_code,
                ),
                Match.scheduled_at < match_dt,
                Match.id != match_id,
            )
        )
        .order_by(Match.scheduled_at.asc())
    )
    prior_result = await db.execute(prior_q)
    completed_matches = prior_result.scalars().all()

    if not completed_matches:
        log.info(
            "[CardTracker] match=%s side=%s — team %s has no prior completed WC matches",
            match_id, side, team_code,
        )
        return CardTrackingResult(card_data_available=False)

    # Fetch events for each completed match (only those with numeric external_ids)
    provider = ApiFootballProvider(settings.apifootball_key)
    match_events_list: list[tuple[Match, list[dict]]] = []

    now = time.time()
    for m in completed_matches:
        if not m.external_id or not m.external_id.isdigit():
            log.debug("[CardTracker] match=%s — skipping %s (no numeric external_id)", match_id, m.id)
            continue
        cached = _EVENTS_CACHE.get(m.external_id)
        if cached and now - cached[0] < _EVENTS_CACHE_TTL:
            log.debug("[CardTracker] cache hit fixture=%s", m.external_id)
            api_stats.record_cache_hit("events")
            match_events_list.append((m, cached[1]))
            continue
        api_stats.record_cache_miss("events")
        try:
            events = await provider.fetch_fixture_events(m.external_id)
            _EVENTS_CACHE[m.external_id] = (now, events)
            match_events_list.append((m, events))
            log.debug(
                "[CardTracker] match=%s — fetched %d events for fixture=%s",
                match_id, len(events), m.external_id,
            )
        except Exception as exc:
            log.warning(
                "[CardTracker] match=%s — failed to fetch events for fixture=%s: %s",
                match_id, m.external_id, exc,
            )

    if not match_events_list:
        log.info(
            "[CardTracker] match=%s side=%s — no event data available (all fixtures lack numeric IDs or API failed)",
            match_id, side,
        )
        return CardTrackingResult(card_data_available=False)

    result_data = _process_events(match_events_list, team_ext_id, team_code)

    log.info(
        "[CardTracker] match=%s side=%s team=%s — "
        "suspended=%d at_risk=%d injury_events=%d (from %d matches)",
        match_id, side, team_code,
        len(result_data.suspended), len(result_data.at_risk),
        len(result_data.injury_events), len(match_events_list),
    )
    return result_data
