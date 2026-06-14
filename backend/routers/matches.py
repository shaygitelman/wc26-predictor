import asyncio
import logging
from collections import defaultdict
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

log = logging.getLogger(__name__)
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from models.league import League, LeagueMember
from models.match import Match
from models.player import Player
from models.prediction import Prediction
from models.team import Team
from models.user import User
from schemas.match import MatchOut, LeaguePredictionEntry, LeaguePredictionGroup, MatchLeaguePredictionsOut
from services.squad_availability import get_squad_availability
from services.card_tracker import get_card_tracking
from services.match_stats import get_match_statistics
from services.team_form import get_team_form, get_h2h, get_wc_top_performers

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("", response_model=list[MatchOut])
async def list_matches(
    status_filter: Optional[str] = Query(None, alias="status"),
    round_filter:  Optional[str] = Query(None, alias="round"),
    group_filter:  Optional[str] = Query(None, alias="group"),
    db: AsyncSession = Depends(get_db),
) -> list[MatchOut]:
    q = select(Match).order_by(Match.scheduled_at)
    if status_filter:
        q = q.where(Match.status == status_filter)
    if round_filter:
        q = q.where(Match.round == round_filter)
    if group_filter:
        q = q.where(Match.group_name == group_filter.upper())

    result = await db.execute(q)
    matches = result.scalars().all()
    return [MatchOut.from_orm(m) for m in matches]


@router.get("/{match_id}", response_model=MatchOut)
async def get_match(match_id: str, db: AsyncSession = Depends(get_db)) -> MatchOut:
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    return MatchOut.from_orm(match)


@router.get("/{match_id}/league-predictions", response_model=MatchLeaguePredictionsOut)
async def match_league_predictions(
    match_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MatchLeaguePredictionsOut:
    """
    Return predictions for this match grouped by every league the caller belongs to.

    Privacy rules
    ─────────────
    scheduled  → predictions list is empty for every group; only counts are returned.
                 The current user's own prediction IS included so they can see their pick.
    live / finished → all predictions revealed.

    Optimisation
    ────────────
    Two queries, zero N+1:
    1. Fetch all league IDs the caller belongs to.
    2. One wide JOIN fetches leagues + members + users + predictions for those leagues.
    Member counts are computed in Python from the grouped rows.
    """
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    revealed = match.status != "scheduled"

    # ── Query 1: which leagues does the caller belong to? ────────────────────
    league_id_rows = (await db.execute(
        select(LeagueMember.league_id).where(LeagueMember.user_id == current_user.id)
    )).scalars().all()

    if not league_id_rows:
        return MatchLeaguePredictionsOut(
            matchStatus      = match.status,
            matchScheduledAt = match.scheduled_at.isoformat(),
            leagues          = [],
        )

    # ── Query 2: all members + predictions for those leagues ─────────────────
    rows = (await db.execute(
        select(League, LeagueMember, User, Prediction)
        .join(LeagueMember, LeagueMember.league_id == League.id)
        .join(User, User.id == LeagueMember.user_id)
        .outerjoin(
            Prediction,
            (Prediction.user_id == User.id) & (Prediction.match_id == match_id),
        )
        .where(League.id.in_(league_id_rows))
        .order_by(League.is_default.desc(), League.created_at, LeagueMember.rank.nulls_last(), LeagueMember.joined_at)
    )).all()

    # ── Group rows by league ─────────────────────────────────────────────────
    league_order:   list[str]                                     = []
    league_objs:    dict[str, League]                             = {}
    member_count:   dict[str, int]                                = defaultdict(int)
    pred_count:     dict[str, int]                                = defaultdict(int)
    league_entries: dict[str, list[tuple[LeagueMember, User, Optional[Prediction]]]] = defaultdict(list)

    for league, member, member_user, pred in rows:
        lid = league.id
        if lid not in league_objs:
            league_objs[lid] = league
            league_order.append(lid)
        member_count[lid] += 1
        if pred is not None:
            pred_count[lid] += 1
        league_entries[lid].append((member, member_user, pred))

    # outcome priority for finished matches: exact > correct_direction > wrong > pending/none
    _OUTCOME_ORDER = {"exact": 0, "difference": 1, "outcome": 1, "wrong": 2, "pending": 3}
    _NO_TS         = "9999-12-31T23:59:59"

    # ── Build response groups ────────────────────────────────────────────────
    groups: list[LeaguePredictionGroup] = []

    for lid in league_order:
        league = league_objs[lid]
        entries: list[LeaguePredictionEntry] = []

        for member, member_user, pred in league_entries[lid]:
            is_own = member_user.id == current_user.id

            # Before kickoff: skip entries that have no prediction, or other users' picks
            if not revealed and not is_own:
                continue
            if pred is None:
                continue  # never show members without a prediction in this section

            # Privacy: hide stats if member opted out (always show own)
            show_stats = is_own or member_user.show_stats

            entry = LeaguePredictionEntry.from_orm(
                user_id      = member_user.id,
                username     = member_user.username,
                avatar_url   = member_user.avatar_url,
                avatar_id    = member_user.avatar_id,
                rank         = member.rank         if show_stats else None,
                total_points = member.total_points if show_stats else None,
                is_current   = is_own,
                pred         = pred,
            )
            entries.append(entry)

        # Sort entries
        if match.status == "finished":
            entries.sort(key=lambda e: (
                _OUTCOME_ORDER.get(e.outcome or "", 3),
                e.submittedAt or _NO_TS,
            ))
        else:
            entries.sort(key=lambda e: e.submittedAt or _NO_TS)

        groups.append(LeaguePredictionGroup(
            leagueId       = league.id,
            leagueName     = league.name,
            isDefault      = league.is_default,
            totalMembers   = member_count[lid],
            predictedCount = pred_count[lid],
            predictions    = entries,
        ))

    return MatchLeaguePredictionsOut(
        matchStatus      = match.status,
        matchScheduledAt = match.scheduled_at.isoformat(),
        leagues          = groups,
    )


@router.get("/{match_id}/squad/home")
async def get_match_squad_home(match_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    availability = await get_squad_availability(match_id, "home", db)
    if availability is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Squad data not available for this match",
        )
    return availability.to_dict()


@router.get("/{match_id}/squad/away")
async def get_match_squad_away(match_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    availability = await get_squad_availability(match_id, "away", db)
    if availability is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Squad data not available for this match",
        )
    return availability.to_dict()


async def _build_squad_news(match_id: str, side: str, db: AsyncSession) -> dict:
    """
    Merge card-tracking data (suspensions, at-risk, injury events) with
    reported injury/suspension data from the API-Football injuries pipeline.
    Always returns a dict (never 501).
    """
    # Run both pipelines concurrently
    card_result, injury_result = await asyncio.gather(
        get_card_tracking(match_id, side, db),   # type: ignore[arg-type]
        get_squad_availability(match_id, side, db),
        return_exceptions=True,
    )

    # Defensive: treat exceptions as None
    if isinstance(card_result, Exception):
        log.error("[SquadNews] match=%s side=%s — card_tracker threw: %s", match_id, side, card_result)
        card_result = None
    if isinstance(injury_result, Exception):
        log.error("[SquadNews] match=%s side=%s — squad_availability threw: %s", match_id, side, injury_result)
        injury_result = None

    card_dict = card_result.to_dict() if card_result else {
        "suspended": [], "atRisk": [], "injuryEvents": [],
        "yellowThreshold": 2, "cardDataAvailable": False,
    }

    injury_dict = injury_result.to_dict() if injury_result else None
    injury_available = injury_dict is not None

    return {
        "suspended":           card_dict["suspended"],
        "atRisk":              card_dict["atRisk"],
        "injured":             injury_dict["injured"]    if injury_available else [],
        "doubtful":            injury_dict["doubtful"]   if injury_available else [],
        "reportedSuspended":   injury_dict["suspended"]  if injury_available else [],
        "injuryEvents":        card_dict["injuryEvents"],
        "yellowThreshold":     card_dict["yellowThreshold"],
        "cardDataAvailable":   card_dict["cardDataAvailable"],
        "injuryDataAvailable": injury_available,
    }


@router.get("/{match_id}/squad-news/home")
async def get_match_squad_news_home(match_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    return await _build_squad_news(match_id, "home", db)


@router.get("/{match_id}/squad-news/away")
async def get_match_squad_news_away(match_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    return await _build_squad_news(match_id, "away", db)


@router.get("/{match_id}/stats")
async def get_match_stats(match_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    """
    Returns verified live match statistics from API-Football.

    Only available for live or finished matches with a mapped fixture ID.
    Returns 501 when statistics are not yet available (scheduled match, unmapped
    fixture, or API-Football has not yet published stats for this fixture).

    Response shape:
      {
        matchId, fixtureId, source, fetchedAt, verified, confidence,
        home: { possession, totalShots, shotsOnTarget, corners, fouls,
                yellowCards, redCards, saves, offsides, passes, passAccuracy, xG },
        away: { ...same fields... }
      }

    All null fields mean the API did not return a value — never a fallback estimate.
    """
    stats = await get_match_statistics(match_id, db)
    if stats is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Match statistics not available for this fixture",
        )
    return stats.to_dict()


# ─── Insights data endpoints ──────────────────────────────────────────
#
# Form and H2H data come from API-Football (real historical internationals
# across ALL competitions — qualifiers, friendlies, Nations League, etc.).
# Falls back to local DB when API-Football is unavailable.
#
# Stats/home and stats/away return per-team averages (corners, possession,
# shots) derived from the same API-Football fixture history.


async def _local_team_form(match_id: str, side: str, db: AsyncSession) -> list[dict]:
    """Local DB fallback — returns form from finished WC26 matches only."""
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    team_code = match.home_team_code if side == "home" else match.away_team_code
    q = (
        select(Match)
        .where(
            and_(
                Match.status == "finished",
                or_(Match.home_team_code == team_code, Match.away_team_code == team_code),
                Match.id != match_id,
            )
        )
        .order_by(Match.scheduled_at.desc())
        .limit(5)
    )
    result = await db.execute(q)
    finished = result.scalars().all()

    form = []
    for m in finished:
        if m.home_score is None or m.away_score is None:
            continue
        is_home_side = m.home_team_code == team_code
        goals_for = m.home_score if is_home_side else m.away_score
        goals_agt = m.away_score if is_home_side else m.home_score
        r = "W" if goals_for > goals_agt else ("L" if goals_for < goals_agt else "D")
        form.append({
            "result":   r,
            "goalsFor": goals_for,
            "goalsAgt": goals_agt,
            "opponent": m.away_team_name if is_home_side else m.home_team_name,
            "date":     m.scheduled_at.isoformat(),
        })
    return form


@router.get("/{match_id}/form/home")
async def get_match_form_home(match_id: str, db: AsyncSession = Depends(get_db)) -> list:
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    form_result = await get_team_form(match.home_team_code, db)
    if form_result is not None:
        return form_result.form

    # API-Football unavailable — fall back to local WC26 DB
    return await _local_team_form(match_id, "home", db)


@router.get("/{match_id}/form/away")
async def get_match_form_away(match_id: str, db: AsyncSession = Depends(get_db)) -> list:
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    form_result = await get_team_form(match.away_team_code, db)
    if form_result is not None:
        return form_result.form

    return await _local_team_form(match_id, "away", db)


@router.get("/{match_id}/h2h")
async def get_match_h2h(match_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    h2h = await get_h2h(match.home_team_code, match.away_team_code, db)
    if h2h is not None:
        return h2h

    # Local DB fallback (only WC26 finished matches)
    q = (
        select(Match)
        .where(
            and_(
                Match.status == "finished",
                or_(
                    and_(
                        Match.home_team_code == match.home_team_code,
                        Match.away_team_code == match.away_team_code,
                    ),
                    and_(
                        Match.home_team_code == match.away_team_code,
                        Match.away_team_code == match.home_team_code,
                    ),
                ),
                Match.id != match_id,
            )
        )
        .order_by(Match.scheduled_at.desc())
    )
    result = await db.execute(q)
    h2h_matches = result.scalars().all()

    home_wins = 0
    away_wins = 0
    draws = 0
    last_meeting = None

    for m in h2h_matches:
        if m.home_score is None or m.away_score is None:
            continue
        if m.home_team_code == match.home_team_code:
            h_goals, a_goals = m.home_score, m.away_score
        else:
            h_goals, a_goals = m.away_score, m.home_score

        if h_goals > a_goals:
            home_wins += 1
        elif h_goals < a_goals:
            away_wins += 1
        else:
            draws += 1

        if last_meeting is None:
            last_meeting = {
                "date":         m.scheduled_at.isoformat(),
                "homeGoals":    h_goals,
                "awayGoals":    a_goals,
                "homeTeamName": match.home_team_name,
                "awayTeamName": match.away_team_name,
            }

    return {
        "homeWins":     home_wins,
        "awayWins":     away_wins,
        "draws":        draws,
        "totalMatches": home_wins + away_wins + draws,
        "lastMeeting":  last_meeting,
    }


@router.get("/{match_id}/stats/home")
async def get_match_stats_home(match_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    """
    Returns per-team averages (corners, possession, shots) derived from
    the last 5 real international fixtures for the home team via API-Football.
    Returns 501 when data is unavailable.
    """
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    form_result = await get_team_form(match.home_team_code, db)
    if form_result is None or (
        form_result.avg_corners is None
        and form_result.avg_possession is None
        and form_result.avg_shots is None
    ):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Team statistics not available",
        )

    return {
        "avgCorners":    form_result.avg_corners,
        "avgPossession": form_result.avg_possession,
        "avgShots":      form_result.avg_shots,
        "fixtureCoverage": form_result.fixture_count,
        "source":        form_result.source,
        "fetchedAt":     form_result.fetched_at,
        "verified":      True,
    }


@router.get("/{match_id}/stats/away")
async def get_match_stats_away(match_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    """
    Returns per-team averages (corners, possession, shots) derived from
    the last 5 real international fixtures for the away team via API-Football.
    Returns 501 when data is unavailable.
    """
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    form_result = await get_team_form(match.away_team_code, db)
    if form_result is None or (
        form_result.avg_corners is None
        and form_result.avg_possession is None
        and form_result.avg_shots is None
    ):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Team statistics not available",
        )

    return {
        "avgCorners":    form_result.avg_corners,
        "avgPossession": form_result.avg_possession,
        "avgShots":      form_result.avg_shots,
        "fixtureCoverage": form_result.fixture_count,
        "source":        form_result.source,
        "fetchedAt":     form_result.fetched_at,
        "verified":      True,
    }


async def _get_match_players(match_id: str, side: str, db: AsyncSession) -> list[dict]:
    match = await db.get(Match, match_id)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    if side == "home":
        team_id   = match.home_team_code.lower()
        team_name = match.home_team_name
        team_code = match.home_team_code
    else:
        team_id   = match.away_team_code.lower()
        team_name = match.away_team_name
        team_code = match.away_team_code

    q = select(Player).where(Player.team_id == team_id).order_by(Player.shirt_number)
    result = await db.execute(q)
    players = result.scalars().all()

    # Enrich with live WC2026 goals/assists from API-Football top scorers
    wc_performers = await get_wc_top_performers()
    team_obj      = await db.get(Team, team_id)
    api_team_id   = ""
    if team_obj:
        ext = team_obj.external_ids or {}
        api_team_id = str(
            ext.get("api_football") or ext.get("apifootball") or ext.get("api-football") or ""
        )
    # {api_player_id: (goals, assists)} for this team
    player_stats: dict[str, tuple[int, int]] = {
        p["player_id"]: (p["goals"], p["assists"])
        for p in wc_performers.get(api_team_id, [])
    }

    return [
        {
            "name":          p.name,
            "teamShortCode": team_code,
            "teamName":      team_name,
            "position":      p.position,
            **dict(zip(
                ("goals", "assists"),
                player_stats.get(str((p.external_ids or {}).get("apifootball", "")), (0, 0)),
            )),
        }
        for p in players
    ]


@router.get("/{match_id}/players/home")
async def get_match_players_home(match_id: str, db: AsyncSession = Depends(get_db)) -> list:
    return await _get_match_players(match_id, "home", db)


@router.get("/{match_id}/players/away")
async def get_match_players_away(match_id: str, db: AsyncSession = Depends(get_db)) -> list:
    return await _get_match_players(match_id, "away", db)
