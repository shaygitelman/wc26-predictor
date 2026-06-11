import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.player_seeds import GOLDEN_BOOT_PLAYER_SEEDS, _photo
from core.scorer import score_match
from core.wc2026_config import APIFOOTBALL_ID_TO_CODE, GROUPS
from models.match import Match
from models.player import Player
from models.sync_log import SyncLog
from models.team import Team
from providers.apifootball import ApiFootballProvider
from schemas.match import MatchOut
from services.sync import SyncService
from services.wc2026_seed import WC2026SeedService

router = APIRouter(prefix="/admin", tags=["admin"])

_WC2026_LEAGUE_ID = "1"
_WC2026_SEASON    = "2026"


# ── Auth guard ────────────────────────────────────────────────────

def _verify_admin(x_admin_key: str = Header(...)) -> None:
    if not settings.admin_key or x_admin_key != settings.admin_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid admin key")


# ── Match result ──────────────────────────────────────────────────

class MatchResult(BaseModel):
    home_score: int = Field(..., ge=0)
    away_score: int = Field(..., ge=0)


@router.patch(
    "/matches/{match_id}/result",
    response_model=MatchOut,
    dependencies=[Depends(_verify_admin)],
)
async def set_match_result(
    match_id: str,
    body: MatchResult,
    db: AsyncSession = Depends(get_db),
) -> MatchOut:
    try:
        match = await score_match(match_id, body.home_score, body.away_score, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return MatchOut.from_orm(match)


# ── Sync endpoints ────────────────────────────────────────────────

class SyncResponse(BaseModel):
    status:           str
    entity_type:      str
    records_affected: int
    errors:           list[str] = []


def _make_service() -> SyncService:
    return SyncService(
        provider  = ApiFootballProvider(settings.apifootball_key),
        league_id = _WC2026_LEAGUE_ID,
        season    = _WC2026_SEASON,
    )


@router.post(
    "/sync/teams",
    response_model=SyncResponse,
    dependencies=[Depends(_verify_admin)],
    summary="Import/update all WC 2026 teams from TheSportsDB",
)
async def sync_teams(db: AsyncSession = Depends(get_db)) -> SyncResponse:
    result = await _make_service().sync_teams(db)
    return SyncResponse(**vars(result))


@router.post(
    "/sync/fixtures",
    response_model=SyncResponse,
    dependencies=[Depends(_verify_admin)],
    summary="Import/update all WC 2026 fixtures from TheSportsDB",
)
async def sync_fixtures(db: AsyncSession = Depends(get_db)) -> SyncResponse:
    result = await _make_service().sync_fixtures(db)
    return SyncResponse(**vars(result))


class PlayerSyncSummary(BaseModel):
    status:           str
    entity_type:      str
    records_affected: int
    teams_attempted:  int
    teams_succeeded:  int
    errors:           list[str] = []


@router.post(
    "/sync/players",
    response_model=PlayerSyncSummary,
    dependencies=[Depends(_verify_admin)],
    summary="Import player rosters. Pass ?teams=bra&teams=fra to limit; omit to sync ALL teams.",
)
async def sync_players(
    teams: list[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
) -> PlayerSyncSummary:
    from sqlalchemy import select as sa_select
    from models.team import Team as TeamModel

    svc = _make_service()
    team_ids = teams or None

    # Count how many teams will be attempted
    q = sa_select(TeamModel)
    if team_ids:
        q = q.where(TeamModel.id.in_(team_ids))
    all_teams = (await db.execute(q)).scalars().all()
    teams_with_ext = [t for t in all_teams if svc.provider.provider_key in (t.external_ids or {})]

    result = await svc.sync_players(db, team_ids=team_ids)

    teams_succeeded = len(teams_with_ext) - len(result.errors)
    return PlayerSyncSummary(
        status           = result.status,
        entity_type      = result.entity_type,
        records_affected = result.records_affected,
        teams_attempted  = len(teams_with_ext),
        teams_succeeded  = max(0, teams_succeeded),
        errors           = result.errors,
    )


@router.post(
    "/sync/groups",
    response_model=SyncResponse,
    dependencies=[Depends(_verify_admin)],
    summary="Infer group letters (A–L) from fixture data. Run after sync/fixtures.",
)
async def sync_groups(db: AsyncSession = Depends(get_db)) -> SyncResponse:
    result = await _make_service().sync_groups(db)
    return SyncResponse(**vars(result))


class SyncAllResponse(BaseModel):
    results: list[SyncResponse]


@router.post(
    "/sync/all",
    response_model=SyncAllResponse,
    dependencies=[Depends(_verify_admin)],
    summary="Full refresh: fixtures → teams → groups. Safe for cron.",
)
async def sync_all(db: AsyncSession = Depends(get_db)) -> SyncAllResponse:
    results = await _make_service().sync_all(db)
    return SyncAllResponse(results=[SyncResponse(**vars(r)) for r in results])


@router.post(
    "/sync/venues",
    response_model=SyncResponse,
    dependencies=[Depends(_verify_admin)],
    summary=(
        "Backfill venue/city for all matches where the provider now has that data. "
        "Safe to re-run — never writes null, never removes existing values."
    ),
)
async def sync_venues(db: AsyncSession = Depends(get_db)) -> SyncResponse:
    result = await _make_service().sync_venues(db)
    return SyncResponse(**vars(result))


@router.post(
    "/sync/live",
    response_model=SyncResponse,
    dependencies=[Depends(_verify_admin)],
    summary="Poll live fixtures from API-Football and update scores/status. Auto-scores finished matches.",
)
async def sync_live(db: AsyncSession = Depends(get_db)) -> SyncResponse:
    result = await _make_service().sync_live(db)
    return SyncResponse(**vars(result))


@router.post(
    "/sync/reconcile",
    response_model=SyncResponse,
    dependencies=[Depends(_verify_admin)],
    summary=(
        "Reconcile manually-seeded WC2026 matches to real API-Football fixture IDs. "
        "Matches by home+away team code. Updates external_id in-place — preserves all "
        "match UUIDs, user predictions, and league data. Also updates current "
        "status/scores and auto-scores any newly-finished matches. Idempotent."
    ),
)
async def reconcile_fixtures(db: AsyncSession = Depends(get_db)) -> SyncResponse:
    result = await _make_service().reconcile_fixtures(db)
    return SyncResponse(**vars(result))


@router.post(
    "/sync/full",
    response_model=SyncAllResponse,
    dependencies=[Depends(_verify_admin)],
    summary="Full pipeline: clean manual seeds → sync fixtures+teams+groups → re-seed missing fixtures.",
)
async def sync_full(db: AsyncSession = Depends(get_db)) -> SyncAllResponse:
    from services.wc2026_seed import WC2026SeedService

    svc  = _make_service()
    results: list[SyncResponse] = []

    # Step 1: sync real data from provider
    for r in await svc.sync_all(db):
        results.append(SyncResponse(**vars(r)))

    # Step 2: fill any missing fixtures (MD2/MD3 + knockouts not yet in provider)
    seed_result = await WC2026SeedService(db).seed()
    results.append(SyncResponse(
        status           = seed_result.status,
        entity_type      = "seed",
        records_affected = seed_result.created,
        errors           = seed_result.errors,
    ))

    return SyncAllResponse(results=results)


class GroupAssignment(BaseModel):
    groups: dict[str, str]  # {"MEX": "A", "RSA": "A", "BRA": "B", ...}


@router.post(
    "/groups",
    response_model=SyncResponse,
    dependencies=[Depends(_verify_admin)],
    summary="Manually set group letters. Body: {groups: {SHORT_CODE: letter}}",
)
async def set_groups(
    body: GroupAssignment,
    db: AsyncSession = Depends(get_db),
) -> SyncResponse:
    result = await _make_service().set_groups_manual(body.groups, db)
    return SyncResponse(**vars(result))


class SeedResponse(BaseModel):
    created: int
    skipped: int
    errors:  list[str] = []
    status:  str


@router.post(
    "/seed/wc2026",
    response_model=SeedResponse,
    dependencies=[Depends(_verify_admin)],
    summary="Seed missing WC 2026 fixtures (MD2+MD3 per group + all knockout placeholders)",
)
async def seed_wc2026(db: AsyncSession = Depends(get_db)) -> SeedResponse:
    result = await WC2026SeedService(db).seed()
    return SeedResponse(
        created = result.created,
        skipped = result.skipped,
        errors  = result.errors,
        status  = result.status,
    )


@router.delete(
    "/seed/wc2026",
    dependencies=[Depends(_verify_admin)],
    summary="Remove all manually-seeded WC 2026 fixtures (manual-wc2026-* external IDs)",
)
async def clean_wc2026_seed(db: AsyncSession = Depends(get_db)) -> dict:
    deleted = await WC2026SeedService(db).clean_manual()
    return {"deleted": deleted}


@router.delete(
    "/teams/{team_id}",
    dependencies=[Depends(_verify_admin)],
    summary="Delete a stale team record by ID (lowercase short code)",
)
async def delete_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    await db.execute(delete(Team).where(Team.id == team_id.lower()))
    await db.commit()
    return {"deleted": team_id.lower()}


# ── Full WC 2026 reset ────────────────────────────────────────────

class ResetResult(BaseModel):
    teams_seeded:     int
    fixtures_synced:  int
    groups_assigned:  int
    knockouts_seeded: int
    errors:           list[str] = []


@router.post(
    "/reset/wc2026",
    response_model=ResetResult,
    dependencies=[Depends(_verify_admin)],
    summary=(
        "Full WC 2026 reset: wipes all matches and teams, re-seeds all 48 teams "
        "from config, syncs real fixtures from API-Football, assigns groups from "
        "config, seeds knockout placeholders. WARNING: deletes all predictions."
    ),
)
async def reset_wc2026(db: AsyncSession = Depends(get_db)) -> ResetResult:
    errors: list[str] = []

    # 1. Wipe all match records (cascades predictions via DB FK)
    await db.execute(delete(Match))
    # 2. Wipe all team records (sets player.team_id = NULL via DB FK)
    await db.execute(delete(Team))
    await db.commit()

    # 3. Seed all 48 teams from the authoritative config
    teams_seeded = 0
    # Build reverse map: canonical code → API-Football external ID
    code_to_api_id: dict[str, str] = {v: k for k, v in APIFOOTBALL_ID_TO_CODE.items()}

    for g, slots in GROUPS.items():
        for (code, name, flag_url) in slots:
            ext_id = code_to_api_id.get(code)
            ext_ids = {"apifootball": ext_id} if ext_id else {}
            try:
                await db.execute(
                    pg_insert(Team)
                    .values(
                        id           = code.lower(),
                        name         = name,
                        short_code   = code,
                        flag_url     = flag_url,
                        logo_url     = None,
                        group_name   = g,
                        is_confirmed = True,
                        external_ids = ext_ids,
                        updated_at   = datetime.now(timezone.utc),
                    )
                    .on_conflict_do_update(
                        index_elements=["id"],
                        set_={
                            "name":        name,
                            "short_code":  code,
                            "flag_url":    flag_url,
                            "group_name":  g,
                            "external_ids": Team.__table__.c.external_ids.op("||")(ext_ids),
                            "updated_at":  datetime.now(timezone.utc),
                        },
                    )
                )
                teams_seeded += 1
            except Exception as exc:
                errors.append(f"team {code}: {exc}")

    await db.commit()

    # 4. Sync all fixtures from API-Football (group stage; knockout placeholders come later)
    svc = _make_service()
    fix_result = await svc.sync_fixtures(db)
    if fix_result.errors:
        errors.extend(fix_result.errors[:5])

    # 5. Apply group assignments from config via sync_groups
    grp_result = await svc.sync_groups(db)
    if grp_result.errors:
        errors.extend(grp_result.errors[:5])

    # 6. Seed knockout bracket placeholders
    seed_result = await WC2026SeedService(db).seed()
    if seed_result.errors:
        errors.extend(seed_result.errors[:5])

    return ResetResult(
        teams_seeded     = teams_seeded,
        fixtures_synced  = fix_result.records_affected,
        groups_assigned  = grp_result.records_affected,
        knockouts_seeded = seed_result.created,
        errors           = errors,
    )


# ── Sync log ──────────────────────────────────────────────────────

class SyncLogEntry(BaseModel):
    id:               str
    provider:         str
    entity_type:      str
    status:           str
    records_affected: int
    error_message:    str | None
    started_at:       str
    finished_at:      str | None


@router.get(
    "/sync/log",
    response_model=list[SyncLogEntry],
    dependencies=[Depends(_verify_admin)],
    summary="Last N sync log entries",
)
async def sync_log(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[SyncLogEntry]:
    rows = (
        await db.execute(
            select(SyncLog)
            .order_by(SyncLog.started_at.desc())
            .limit(limit)
        )
    ).scalars().all()

    return [
        SyncLogEntry(
            id               = r.id,
            provider         = r.provider,
            entity_type      = r.entity_type,
            status           = r.status,
            records_affected = r.records_affected,
            error_message    = r.error_message,
            started_at       = r.started_at.isoformat(),
            finished_at      = r.finished_at.isoformat() if r.finished_at else None,
        )
        for r in rows
    ]


# ── Fixture-mapping audit ─────────────────────────────────────────


@router.get(
    "/stats/fixture-mapping",
    dependencies=[Depends(_verify_admin)],
    summary=(
        "Audit how many matches have real API-Football fixture IDs vs. "
        "manual placeholders vs. NULL. Use this to verify sync coverage "
        "before expecting live statistics to appear in the UI."
    ),
)
async def fixture_mapping_audit(db: AsyncSession = Depends(get_db)) -> dict:
    """
    Returns a complete audit of the matches table with respect to external_id
    mapping status. Three buckets:

      synced_numeric  — external_id is a pure integer (real API-Football ID)
                        → stats available once match goes live/finished
      manual_seed     — external_id starts with "manual-wc2026-" (placeholder)
                        → stats never available until real ID is synced
      null_or_other   — external_id is NULL or unexpected format
                        → stats never available

    Also returns:
      - Breakdown by round × id_type
      - Breakdown by status × id_type
      - Last 5 fixture sync log entries (to confirm when sync last ran)
      - Up to 10 sample rows per bucket (match_id, external_id, round, status)
    """
    # ── Per-match classification ──────────────────────────────────
    all_matches = (
        await db.execute(select(Match).order_by(Match.scheduled_at))
    ).scalars().all()

    synced:  list[dict] = []
    manual:  list[dict] = []
    missing: list[dict] = []

    for m in all_matches:
        row = {
            "match_id":    m.id,
            "external_id": m.external_id,
            "round":       m.round,
            "status":      m.status,
            "home":        m.home_team_code,
            "away":        m.away_team_code,
        }
        if m.external_id and m.external_id.isdigit():
            synced.append(row)
        elif m.external_id and m.external_id.startswith("manual-"):
            manual.append(row)
        else:
            missing.append(row)

    total = len(synced) + len(manual) + len(missing)

    # ── Counts by round ───────────────────────────────────────────
    rounds_all = set(m.round for m in all_matches)
    by_round: dict[str, dict] = {}
    for rnd in sorted(rounds_all):
        rnd_matches = [m for m in all_matches if m.round == rnd]
        by_round[rnd] = {
            "total":          len(rnd_matches),
            "synced_numeric": sum(1 for m in rnd_matches if m.external_id and m.external_id.isdigit()),
            "manual_seed":    sum(1 for m in rnd_matches if m.external_id and m.external_id.startswith("manual-")),
            "null_or_other":  sum(1 for m in rnd_matches if not m.external_id or (not m.external_id.isdigit() and not m.external_id.startswith("manual-"))),
        }

    # ── Counts by status ──────────────────────────────────────────
    statuses = set(m.status for m in all_matches)
    by_status: dict[str, dict] = {}
    for s in sorted(statuses):
        s_matches = [m for m in all_matches if m.status == s]
        by_status[s] = {
            "total":          len(s_matches),
            "synced_numeric": sum(1 for m in s_matches if m.external_id and m.external_id.isdigit()),
            "manual_seed":    sum(1 for m in s_matches if m.external_id and m.external_id.startswith("manual-")),
            "null_or_other":  sum(1 for m in s_matches if not m.external_id or (not m.external_id.isdigit() and not m.external_id.startswith("manual-"))),
        }

    # ── Stats-ready matches (synced + live or finished) ───────────
    stats_ready = [
        m for m in all_matches
        if m.external_id and m.external_id.isdigit() and m.status in ("live", "finished")
    ]

    # ── Last fixture sync log entries ─────────────────────────────
    recent_sync_logs = (
        await db.execute(
            select(SyncLog)
            .where(SyncLog.entity_type == "fixtures")
            .order_by(SyncLog.started_at.desc())
            .limit(5)
        )
    ).scalars().all()

    sync_log_summary = [
        {
            "provider":         s.provider,
            "status":           s.status,
            "records_affected": s.records_affected,
            "started_at":       s.started_at.isoformat(),
            "finished_at":      s.finished_at.isoformat() if s.finished_at else None,
            "error":            s.error_message,
        }
        for s in recent_sync_logs
    ]

    # ── Verdict ───────────────────────────────────────────────────
    if not recent_sync_logs:
        sync_verdict = "NEVER_SYNCED — POST /admin/sync/fixtures has never run"
    elif any(s.status == "success" for s in recent_sync_logs):
        latest_ok = next(s for s in recent_sync_logs if s.status == "success")
        sync_verdict = f"OK — last successful sync at {latest_ok.started_at.isoformat()}"
    else:
        sync_verdict = f"LAST_SYNC_FAILED — last attempt: {recent_sync_logs[0].started_at.isoformat()}"

    stats_verdict = (
        f"READY — {len(stats_ready)} match(es) are live/finished with numeric external_id "
        "and can return real statistics from API-Football"
        if stats_ready else
        "NOT_READY — no matches are currently live/finished with a real API-Football fixture ID"
    )

    return {
        "summary": {
            "total_matches":    total,
            "synced_numeric":   len(synced),
            "manual_seed":      len(manual),
            "null_or_other":    len(missing),
            "stats_ready_now":  len(stats_ready),
        },
        "verdicts": {
            "fixture_sync":  sync_verdict,
            "stats_pipeline": stats_verdict,
        },
        "by_round":       by_round,
        "by_status":      by_status,
        "stats_ready_matches": [
            {
                "match_id":    m.id,
                "external_id": m.external_id,
                "round":       m.round,
                "status":      m.status,
                "home":        m.home_team_code,
                "away":        m.away_team_code,
            }
            for m in stats_ready
        ],
        "samples": {
            "synced_numeric": synced[:10],
            "manual_seed":    manual[:10],
            "null_or_other":  missing[:10],
        },
        "recent_fixture_sync_log": sync_log_summary,
    }


# ── Test-user cleanup ─────────────────────────────────────────────

_TEST_USER_CONDITION = """
    email ILIKE '%@test.wc26'
    OR email ILIKE '%@test.com'
    OR email ILIKE '%@example.com'
    OR google_id ILIKE 'google-test-%'
"""


@router.get(
    "/test-users",
    dependencies=[Depends(_verify_admin)],
    summary="List all test/demo users in the database",
)
async def list_test_users(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(text(
        f"SELECT id, email, username, google_id FROM users WHERE {_TEST_USER_CONDITION} ORDER BY email"
    ))).all()
    return {
        "count": len(rows),
        "users": [
            {"id": r.id, "email": r.email, "username": r.username, "googleId": r.google_id}
            for r in rows
        ],
    }


@router.delete(
    "/test-users",
    dependencies=[Depends(_verify_admin)],
    summary="Permanently delete all test/demo users and their data",
)
async def delete_test_users(db: AsyncSession = Depends(get_db)) -> dict:
    """Delete users whose email or google_id matches test/demo patterns.

    Cascades to: predictions, league_members, tournament_picks.
    Does NOT touch real users, real matches, or real leagues.
    """
    result = await db.execute(text(
        f"DELETE FROM users WHERE {_TEST_USER_CONDITION}"
    ))
    await db.commit()
    return {"deleted": result.rowcount}


# ── Player audit ──────────────────────────────────────────────────

@router.get(
    "/stats/players",
    dependencies=[Depends(_verify_admin)],
    summary=(
        "Audit player database: counts per team, missing roster teams, "
        "Golden Boot favorites check, and Harry Kane diagnosis."
    ),
)
async def player_stats_audit(db: AsyncSession = Depends(get_db)) -> dict:
    seed_ids = [s["apifootball_id"] for s in GOLDEN_BOOT_PLAYER_SEEDS]

    all_teams = (await db.execute(select(Team).order_by(Team.short_code))).scalars().all()

    count_rows = (
        await db.execute(
            select(Player.team_id, func.count(Player.id).label("cnt"))
            .group_by(Player.team_id)
        )
    ).all()
    counts_by_team: dict[str, int] = {r.team_id: r.cnt for r in count_rows}
    total_players = sum(counts_by_team.values())

    team_rows   = []
    no_players  = []
    incomplete  = []
    for team in all_teams:
        ext_id = (team.external_ids or {}).get("apifootball")
        cnt    = counts_by_team.get(team.id, 0)
        team_rows.append({
            "team_id":            team.id,
            "name":               team.name,
            "short_code":         team.short_code,
            "player_count":       cnt,
            "has_apifootball_id": bool(ext_id),
            "apifootball_id":     ext_id,
        })
        if cnt == 0:
            no_players.append({"team_id": team.id, "name": team.name, "has_apifootball_id": bool(ext_id)})
        elif cnt < 20:
            incomplete.append({"team_id": team.id, "name": team.name, "count": cnt})

    fav_rows = (
        await db.execute(
            select(Player)
            .where(Player.external_ids["apifootball"].as_string().in_(seed_ids))
        )
    ).scalars().all()
    found_by_api_id: dict[str, dict] = {
        (p.external_ids or {}).get("apifootball"): {
            "player_id": p.id,
            "name":      p.name,
            "team_id":   p.team_id,
            "position":  p.position,
        }
        for p in fav_rows
    }

    favorites_audit = []
    for i, seed in enumerate(GOLDEN_BOOT_PLAYER_SEEDS):
        api_id = seed["apifootball_id"]
        info   = found_by_api_id.get(api_id)
        favorites_audit.append({
            "slot":           i,
            "label":          f"{seed['name']} ({seed['team_id'].upper()})",
            "apifootball_id": api_id,
            "found":          info is not None,
            **(info or {"player_id": None, "name": None, "team_id": None, "position": None}),
        })

    def _player_diagnosis(team_id: str, player_name: str, api_id: str) -> dict:
        team = next((t for t in all_teams if t.id == team_id), None)
        return {
            f"{team_id}_team_exists":        team is not None,
            f"{team_id}_has_apifootball_id": bool(team and (team.external_ids or {}).get("apifootball")),
            f"{team_id}_apifootball_id":     (team.external_ids or {}).get("apifootball") if team else None,
            f"{team_id}_player_count":       counts_by_team.get(team_id, 0),
            f"{player_name.lower().replace(' ', '_')}_in_db": api_id in found_by_api_id,
            f"{player_name.lower().replace(' ', '_')}_record": found_by_api_id.get(api_id),
            "verdict": (
                f"FOUND — {player_name} is in DB and favorites query will return him"
                if api_id in found_by_api_id
                else (
                    f"MISSING — {team_id.upper()} team exists but sync_players was never run or the API "
                    f"squads endpoint didn't return {player_name}. Run POST /admin/seed/players to guarantee "
                    f"{player_name} is seeded, or POST /admin/sync/players?teams={team_id} to re-sync."
                    if (team and (team.external_ids or {}).get("apifootball"))
                    else f"MISSING — {team_id.upper()} team record lacks apifootball external_id; sync_players will skip it."
                )
            ),
        }

    return {
        "summary": {
            "total_teams":              len(all_teams),
            "total_players":            total_players,
            "teams_with_0_players":     len(no_players),
            "teams_with_lt_20_players": len(incomplete),
            "favorites_found":          sum(1 for f in favorites_audit if f["found"]),
            "favorites_missing":        sum(1 for f in favorites_audit if not f["found"]),
        },
        "ronaldo_diagnosis": _player_diagnosis("por", "Cristiano Ronaldo", "874"),
        "kane_diagnosis":    _player_diagnosis("eng", "Harry Kane", "184"),
        "favorites_audit":   favorites_audit,
        "teams_no_players":  no_players,
        "teams_incomplete":  incomplete,
        "all_teams":         team_rows,
    }


# ── Manual player seed ────────────────────────────────────────────
# Source of truth is core/player_seeds.py — imported above.


class PlayerSeedResponse(BaseModel):
    seeded:  int
    updated: int
    skipped: int
    errors:  list[str] = []
    players: list[dict] = []


@router.post(
    "/seed/players",
    response_model=PlayerSeedResponse,
    dependencies=[Depends(_verify_admin)],
    summary=(
        "Upsert the 14 Golden Boot favorite players by API-Football ID. "
        "Idempotent — the same logic runs automatically on every startup."
    ),
)
async def seed_players(db: AsyncSession = Depends(get_db)) -> PlayerSeedResponse:
    """
    Guarantees all 14 Golden Boot favorite players exist in the DB.
    Identical logic to the startup bootstrap — use this as a manual
    recovery endpoint after a database reset.
    """
    seeded      = 0
    updated     = 0
    skipped     = 0
    errors: list[str]  = []
    players_out: list[dict] = []

    for seed in GOLDEN_BOOT_PLAYER_SEEDS:
        api_id    = seed["apifootball_id"]
        photo_url = _photo(api_id)
        try:
            existing = (
                await db.execute(
                    select(Player).where(
                        Player.external_ids["apifootball"].as_string() == api_id
                    )
                )
            ).scalar_one_or_none()

            if existing is None:
                db.add(Player(
                    id           = str(uuid.uuid4()),
                    team_id      = seed["team_id"],
                    name         = seed["name"],
                    position     = seed["position"],
                    shirt_number = seed.get("shirt_number"),
                    photo_url    = photo_url,
                    external_ids = {"apifootball": api_id},
                    updated_at   = datetime.now(timezone.utc),
                ))
                seeded += 1
                action    = "created"
                player_id = "(new)"
            else:
                changed = False
                if existing.team_id != seed["team_id"]:
                    existing.team_id = seed["team_id"]
                    changed = True
                # Always prefer the seed's full name over an abbreviated API name
                if existing.name != seed["name"]:
                    existing.name = seed["name"]
                    changed = True
                if not existing.position:
                    existing.position = seed["position"]
                    changed = True
                if not existing.photo_url:
                    existing.photo_url = photo_url
                    changed = True
                if existing.shirt_number is None and seed.get("shirt_number") is not None:
                    existing.shirt_number = seed["shirt_number"]
                    changed = True
                if changed:
                    existing.updated_at = datetime.now(timezone.utc)
                    updated += 1
                    action = "updated"
                else:
                    skipped += 1
                    action = "skipped"
                player_id = existing.id

            players_out.append({
                "apifootball_id": api_id,
                "name":           seed["name"],
                "team_id":        seed["team_id"],
                "action":         action,
                "player_id":      player_id,
            })
        except Exception as exc:
            errors.append(f"{seed['name']} ({api_id}): {exc}")

    await db.commit()
    return PlayerSeedResponse(
        seeded=seeded, updated=updated, skipped=skipped,
        errors=errors, players=players_out,
    )


# ── Tournament scoring ────────────────────────────────────────────

class TournamentResultIn(BaseModel):
    winner_team_code: str | None = None
    top_scorer_id:    str | None = None
    notes:            str | None = None


class TournamentResultOut(BaseModel):
    id:               str
    winner_team_code: str | None
    top_scorer_id:    str | None
    set_at:           str
    set_by:           str | None
    notes:            str | None


class TournamentPreviewUser(BaseModel):
    user_id:             str
    winner_pick:         str | None
    scorer_pick:         str | None
    winner_pts_current:  int
    scorer_pts_current:  int
    winner_pts_new:      int
    scorer_pts_new:      int
    winner_delta:        int
    scorer_delta:        int
    total_delta:         int


class TournamentScoringPreviewOut(BaseModel):
    actual_winner_code:     str | None
    actual_scorer_id:       str | None
    is_first_run:           bool
    users_affected_winner:  int
    users_affected_scorer:  int
    winner_pts_total_delta: int
    scorer_pts_total_delta: int
    users_winning_winner:   int
    users_winning_scorer:   int
    users:                  list[TournamentPreviewUser]


class TournamentScoringApplyIn(BaseModel):
    winner_team_code: str | None = None
    top_scorer_id:    str | None = None
    notes:            str | None = None


class TournamentScoringResultOut(BaseModel):
    run_id:                 str
    run_at:                 str
    actual_winner_code:     str | None
    actual_scorer_id:       str | None
    winner_pts_delta:       int
    scorer_pts_delta:       int
    users_affected_winner:  int
    users_affected_scorer:  int
    is_correction:          bool
    leagues_reranked:       int


class TournamentScoringRunOut(BaseModel):
    id:                    str
    run_at:                str
    winner_team_code:      str | None
    top_scorer_id:         str | None
    winner_pts_delta:      int
    scorer_pts_delta:      int
    users_affected_winner: int
    users_affected_scorer: int
    is_correction:         bool
    notes:                 str | None


@router.get(
    "/tournament/results",
    response_model=TournamentResultOut | None,
    dependencies=[Depends(_verify_admin)],
    summary="Get the current official tournament result (winner + Golden Boot)",
)
async def get_tournament_result(db: AsyncSession = Depends(get_db)) -> TournamentResultOut | None:
    from services.tournament_scoring import get_current_result
    result = await get_current_result(db)
    if result is None:
        return None
    return TournamentResultOut(
        id               = result.id,
        winner_team_code = result.winner_team_code,
        top_scorer_id    = result.top_scorer_id,
        set_at           = result.set_at.isoformat(),
        set_by           = result.set_by,
        notes            = result.notes,
    )


@router.post(
    "/tournament/results",
    response_model=TournamentResultOut,
    dependencies=[Depends(_verify_admin)],
    summary="Record the official tournament winner and/or Golden Boot player",
)
async def set_tournament_result(
    body: TournamentResultIn,
    x_admin_key: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> TournamentResultOut:
    from services.tournament_scoring import set_official_result
    result = await set_official_result(
        winner_team_code = body.winner_team_code,
        top_scorer_id    = body.top_scorer_id,
        db               = db,
        set_by           = x_admin_key[:8] + "...",  # partial key as audit identity
        notes            = body.notes,
    )
    return TournamentResultOut(
        id               = result.id,
        winner_team_code = result.winner_team_code,
        top_scorer_id    = result.top_scorer_id,
        set_at           = result.set_at.isoformat(),
        set_by           = result.set_by,
        notes            = result.notes,
    )


@router.get(
    "/tournament/scoring/preview",
    response_model=TournamentScoringPreviewOut,
    dependencies=[Depends(_verify_admin)],
    summary=(
        "Preview what would happen if tournament scoring ran now. "
        "Pass winner_team_code and/or top_scorer_id as query params. "
        "No writes — safe to call repeatedly."
    ),
)
async def preview_tournament_scoring(
    winner_team_code: str | None = None,
    top_scorer_id:    str | None = None,
    db: AsyncSession = Depends(get_db),
) -> TournamentScoringPreviewOut:
    from services.tournament_scoring import preview_tournament_scoring as _preview
    preview = await _preview(winner_team_code, top_scorer_id, db)
    return TournamentScoringPreviewOut(
        actual_winner_code     = preview.actual_winner_code,
        actual_scorer_id       = preview.actual_scorer_id,
        is_first_run           = preview.is_first_run,
        users_affected_winner  = preview.users_affected_winner,
        users_affected_scorer  = preview.users_affected_scorer,
        winner_pts_total_delta = preview.winner_pts_total_delta,
        scorer_pts_total_delta = preview.scorer_pts_total_delta,
        users_winning_winner   = preview.users_winning_winner,
        users_winning_scorer   = preview.users_winning_scorer,
        users=[
            TournamentPreviewUser(
                user_id            = u.user_id,
                winner_pick        = u.winner_pick,
                scorer_pick        = u.scorer_pick,
                winner_pts_current = u.winner_pts_current,
                scorer_pts_current = u.scorer_pts_current,
                winner_pts_new     = u.winner_pts_new,
                scorer_pts_new     = u.scorer_pts_new,
                winner_delta       = u.winner_delta,
                scorer_delta       = u.scorer_delta,
                total_delta        = u.total_delta,
            )
            for u in preview.users
        ],
    )


@router.post(
    "/tournament/scoring/apply",
    response_model=TournamentScoringResultOut,
    dependencies=[Depends(_verify_admin)],
    summary=(
        "Apply (or correct) tournament pick scoring. "
        "Idempotent — safe to run multiple times with the same inputs. "
        "Corrects previous scoring automatically when winner/scorer changes."
    ),
)
async def apply_tournament_scoring(
    body: TournamentScoringApplyIn,
    db: AsyncSession = Depends(get_db),
) -> TournamentScoringResultOut:
    from services.tournament_scoring import apply_tournament_scoring as _apply
    result = await _apply(
        winner_team_code = body.winner_team_code,
        top_scorer_id    = body.top_scorer_id,
        db               = db,
        notes            = body.notes,
    )
    return TournamentScoringResultOut(
        run_id                = result.run_id,
        run_at                = result.run_at.isoformat(),
        actual_winner_code    = result.actual_winner_code,
        actual_scorer_id      = result.actual_scorer_id,
        winner_pts_delta      = result.winner_pts_delta,
        scorer_pts_delta      = result.scorer_pts_delta,
        users_affected_winner = result.users_affected_winner,
        users_affected_scorer = result.users_affected_scorer,
        is_correction         = result.is_correction,
        leagues_reranked      = result.leagues_reranked,
    )


@router.post(
    "/tournament/scoring/rebuild",
    response_model=TournamentScoringResultOut,
    dependencies=[Depends(_verify_admin)],
    summary=(
        "Rebuild tournament scoring from the stored official result. "
        "Re-applies the most-recent TournamentResult row. "
        "Useful after manual DB corrections or disaster recovery."
    ),
)
async def rebuild_tournament_scoring(db: AsyncSession = Depends(get_db)) -> TournamentScoringResultOut:
    from services.tournament_scoring import rebuild_tournament_standings
    try:
        result = await rebuild_tournament_standings(db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return TournamentScoringResultOut(
        run_id                = result.run_id,
        run_at                = result.run_at.isoformat(),
        actual_winner_code    = result.actual_winner_code,
        actual_scorer_id      = result.actual_scorer_id,
        winner_pts_delta      = result.winner_pts_delta,
        scorer_pts_delta      = result.scorer_pts_delta,
        users_affected_winner = result.users_affected_winner,
        users_affected_scorer = result.users_affected_scorer,
        is_correction         = result.is_correction,
        leagues_reranked      = result.leagues_reranked,
    )


@router.get(
    "/tournament/scoring/log",
    response_model=list[TournamentScoringRunOut],
    dependencies=[Depends(_verify_admin)],
    summary="Audit log of all tournament scoring runs",
)
async def tournament_scoring_log(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[TournamentScoringRunOut]:
    from services.tournament_scoring import list_scoring_runs
    runs = await list_scoring_runs(db, limit=limit)
    return [
        TournamentScoringRunOut(
            id                    = r.id,
            run_at                = r.run_at.isoformat(),
            winner_team_code      = r.winner_team_code,
            top_scorer_id         = r.top_scorer_id,
            winner_pts_delta      = r.winner_pts_delta,
            scorer_pts_delta      = r.scorer_pts_delta,
            users_affected_winner = r.users_affected_winner,
            users_affected_scorer = r.users_affected_scorer,
            is_correction         = r.is_correction,
            notes                 = r.notes,
        )
        for r in runs
    ]
