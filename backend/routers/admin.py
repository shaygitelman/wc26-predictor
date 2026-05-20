from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.scorer import score_match
from core.wc2026_config import APIFOOTBALL_ID_TO_CODE, CODE_TO_FLAG, CODE_TO_GROUP, CODE_TO_NAME, GROUPS
from models.match import Match
from models.sync_log import SyncLog
from models.team import Team
from providers.apifootball import ApiFootballProvider
from schemas.match import MatchOut
from services.sync import SyncResult, SyncService
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
