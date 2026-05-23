from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.match import Match
from models.player import Player
from schemas.match import MatchOut
from services.squad_availability import get_squad_availability
from services.match_stats import get_match_statistics
from services.team_form import get_team_form, get_h2h

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

    return [
        {
            "name":          p.name,
            "teamShortCode": team_code,
            "teamName":      team_name,
            "position":      p.position,
            "goals":         0,
            "assists":       0,
        }
        for p in players
    ]


@router.get("/{match_id}/players/home")
async def get_match_players_home(match_id: str, db: AsyncSession = Depends(get_db)) -> list:
    return await _get_match_players(match_id, "home", db)


@router.get("/{match_id}/players/away")
async def get_match_players_away(match_id: str, db: AsyncSession = Depends(get_db)) -> list:
    return await _get_match_players(match_id, "away", db)
