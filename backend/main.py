import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.limiter import limiter
from routers import admin, auth, cron, groups, matches, players, predictions, leagues, teams, tournament, users

log = logging.getLogger(__name__)


# ── Sentry — initialise before anything else so every exception is captured ───

def _init_sentry() -> None:
    if not settings.sentry_dsn:
        log.info("Sentry DSN not configured — error monitoring disabled")
        return

    import logging as _logging
    import sentry_sdk
    from sentry_sdk.integrations.fastapi  import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlAlchemyIntegration
    from sentry_sdk.integrations.asyncio  import AsyncioIntegration
    from sentry_sdk.integrations.logging  import LoggingIntegration

    def _before_send(event: dict, hint: dict) -> dict | None:
        """Strip auth tokens and cookies; never send PII to Sentry."""
        req = event.get("request", {})
        headers: dict = req.get("headers", {})
        for sensitive in ("authorization", "cookie", "x-session-token", "x-api-key"):
            headers.pop(sensitive, None)
        # Scrub password / secret fields from any captured data
        for frame in event.get("exception", {}).get("values", []):
            for sf in frame.get("stacktrace", {}).get("frames", []):
                for key in list(sf.get("vars", {}).keys()):
                    if any(w in key.lower() for w in ("password", "secret", "token", "jwt")):
                        sf["vars"][key] = "[Filtered]"
        return event

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        release=settings.sentry_release or None,

        # Errors: 100% capture; traces: light sampling to control cost
        traces_sample_rate=0.05 if settings.is_production else 1.0,

        integrations=[
            # FastAPI + Starlette: captures request context, route, status code
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
            # SQLAlchemy: captures DB errors with query context
            SqlAlchemyIntegration(),
            # asyncio: captures unhandled exceptions in background tasks
            AsyncioIntegration(),
            # Logging: WARNING → breadcrumb, ERROR → Sentry event
            LoggingIntegration(
                level=_logging.WARNING,
                event_level=_logging.ERROR,
            ),
        ],

        before_send=_before_send,
        send_default_pii=False,   # never auto-attach cookies / IP addresses
    )
    log.info(
        "Sentry initialised (env=%s, release=%s)",
        settings.app_env, settings.sentry_release or "unset",
    )


_init_sentry()


_db_url = settings.database_url
_db_host = _db_url.split("@")[-1].split(":")[0] if "@" in _db_url else "UNKNOWN"
log.warning("DB host: %s (url starts with: %s)", _db_host, _db_url[:30])

_DEFAULT_LEAGUE_ID   = '00000000-0000-0000-0000-000000000001'
_DEFAULT_LEAGUE_NAME = 'MatchPoint26 World League'
_DEFAULT_INVITE_CODE = 'WORLD001'


async def _bootstrap_teams() -> None:
    """Seed all 48 WC 2026 teams from authoritative config on first boot.

    Idempotent — ON CONFLICT DO NOTHING on primary key (lowercase code).
    Skips entirely when 48 rows already exist so steady-state restarts are free.
    Allows the tournament-picks team picker to work immediately without any
    admin action after a fresh database deployment.
    """
    from datetime import datetime, timezone
    from core.database import SessionLocal
    from core.wc2026_config import GROUPS, APIFOOTBALL_ID_TO_CODE
    from models.team import Team
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    log.info("BOOTSTRAP: checking teams")
    try:
        async with SessionLocal() as db:
            count = (await db.execute(text("SELECT COUNT(*) FROM teams"))).scalar() or 0
            if count >= 48:
                log.info("BOOTSTRAP: teams already seeded (%d rows), skipping", count)
                return

            code_to_api_id: dict[str, str] = {v: k for k, v in APIFOOTBALL_ID_TO_CODE.items()}
            inserted = 0
            for g, slots in GROUPS.items():
                for (code, name, flag_url) in slots:
                    ext_id = code_to_api_id.get(code)
                    ext_ids: dict = {"apifootball": ext_id} if ext_id else {}
                    await db.execute(
                        pg_insert(Team)
                        .values(
                            id=code.lower(),
                            name=name,
                            short_code=code,
                            flag_url=flag_url,
                            logo_url=None,
                            group_name=g,
                            is_confirmed=True,
                            external_ids=ext_ids,
                            updated_at=datetime.now(timezone.utc),
                        )
                        .on_conflict_do_nothing(index_elements=["id"])
                    )
                    inserted += 1

            await db.commit()
            log.info("BOOTSTRAP: seeded %d teams from config (was %d before)", inserted, count)
    except Exception as exc:
        log.error("BOOTSTRAP: team seeding FAILED — %s", exc, exc_info=True)


async def _bootstrap_group_fixtures() -> None:
    """Sync all WC 2026 group-stage fixtures from API-Football on first boot.

    Only runs when:
      - APIFOOTBALL_KEY is configured
      - No real (non-manual) fixture rows exist yet

    A single /fixtures call fetches all 72 group-stage matches. After fixtures
    are inserted, sync_groups() is called to write group letters onto teams.
    Skipped silently if the API call fails — the admin can call
    POST /admin/sync/fixtures manually.
    """
    if not settings.apifootball_key:
        log.info("BOOTSTRAP: APIFOOTBALL_KEY not set — skipping fixture auto-sync")
        return

    from core.database import SessionLocal
    from providers.apifootball import ApiFootballProvider
    from services.sync import SyncService

    log.info("BOOTSTRAP: checking group-stage fixtures")
    try:
        async with SessionLocal() as db:
            count = (await db.execute(
                text(
                    "SELECT COUNT(*) FROM matches "
                    "WHERE external_id IS NOT NULL "
                    "AND external_id NOT LIKE 'manual-wc2026-%'"
                )
            )).scalar() or 0
            if count > 0:
                log.info("BOOTSTRAP: real fixtures already present (%d rows), skipping sync", count)
                return

        log.info("BOOTSTRAP: no real fixtures found — triggering API-Football sync")
        svc = SyncService(
            provider=ApiFootballProvider(settings.apifootball_key),
            league_id="1",
            season="2026",
        )
        async with SessionLocal() as db:
            fix_result = await svc.sync_fixtures(db)
            log.info(
                "BOOTSTRAP: fixture sync done — records=%d status=%s errors=%s",
                fix_result.records_affected, fix_result.status, fix_result.errors or "none",
            )
            if fix_result.records_affected > 0:
                grp_result = await svc.sync_groups(db)
                log.info(
                    "BOOTSTRAP: group assignment done — records=%d status=%s",
                    grp_result.records_affected, grp_result.status,
                )
    except Exception as exc:
        log.error("BOOTSTRAP: fixture sync FAILED — %s", exc, exc_info=True)


# API-Football player IDs for the ~15 Golden Boot favorites and their team codes.
# Kept here (not in routers/players.py) so bootstrap can sync exactly these teams
# without importing the router.
_GOLDEN_BOOT_FAVORITES: dict[str, str] = {
    "874":    "por",   # Ronaldo (manually seeded — not in WC2026 API squad)
    "278":    "fra",   # Mbappé
    "1100":   "nor",   # Haaland
    "129718": "eng",   # Bellingham
    "184":    "eng",   # Kane (manually seeded — not in WC2026 API squad)
    "154":    "arg",   # Messi
    "762":    "bra",   # Vinícius Júnior
    "386828": "esp",   # Lamine Yamal
    "978":    "ger",   # Havertz
    "377122": "bra",   # Endrick
    "51617":  "uru",   # Darwin Núñez
    "2489":   "col",   # Díaz
    "276":    "bra",   # Neymar
    "18979":  "swe",   # Gyökeres
    "1496":   "bra",   # Raphinha
    "10009":  "bra",   # Rodrygo (manually seeded — not in WC2026 API squad)
    "631":    "eng",   # Phil Foden (seeded for full-name search)
}


_MIN_PLAYERS_PER_TEAM = 15  # re-sync a team if it has fewer than this many players


async def _seed_manual_players() -> None:
    """Guarantee all 14 Golden Boot favorites exist in the DB on every boot.

    Idempotent — keyed on external_ids->>'apifootball'.  For each seed entry:
      • Row already exists with correct fields → skip (no write).
      • Row exists but missing position/photo/shirt_number → patch only the gaps.
      • Row does not exist → INSERT with full data.

    API sync (sync_players) will later overwrite name/position/shirt_number with
    live API-Football values; this seed is the safety net for players the API
    squad endpoint omits (e.g. Kane in WC2026 squads).
    """
    import uuid as _uuid
    from datetime import datetime, timezone
    from sqlalchemy import select
    from core.database import SessionLocal
    from core.player_seeds import GOLDEN_BOOT_PLAYER_SEEDS, _photo
    from models.player import Player

    seeded = updated = skipped = 0
    async with SessionLocal() as db:
        for p in GOLDEN_BOOT_PLAYER_SEEDS:
            af_id     = p["apifootball_id"]
            photo_url = _photo(af_id)
            try:
                existing = (
                    await db.execute(
                        select(Player).where(
                            Player.external_ids["apifootball"].as_string() == af_id
                        )
                    )
                ).scalar_one_or_none()

                if existing is None:
                    db.add(Player(
                        id           = str(_uuid.uuid4()),
                        team_id      = p["team_id"],
                        name         = p["name"],
                        position     = p["position"],
                        shirt_number = p.get("shirt_number"),
                        photo_url    = photo_url,
                        external_ids = {"apifootball": af_id},
                        updated_at   = datetime.now(timezone.utc),
                    ))
                    await db.flush()
                    log.info("SEED: created %s (af=%s team=%s)", p["name"], af_id, p["team_id"])
                    seeded += 1
                else:
                    changed = False
                    # Always prefer the seed's full name over an abbreviated API name.
                    # "J. Bellingham" → "Jude Bellingham"; idempotent when names match.
                    if existing.name != p["name"]:
                        existing.name = p["name"]
                        changed = True
                    if not existing.position:
                        existing.position = p["position"]
                        changed = True
                    if not existing.photo_url:
                        existing.photo_url = photo_url
                        changed = True
                    if existing.shirt_number is None and p.get("shirt_number") is not None:
                        existing.shirt_number = p["shirt_number"]
                        changed = True
                    if changed:
                        existing.updated_at = datetime.now(timezone.utc)
                        log.info("SEED: patched %s (af=%s)", p["name"], af_id)
                        updated += 1
                    else:
                        skipped += 1
            except Exception as exc:
                log.error("SEED: failed for %s (af=%s) — %s", p["name"], af_id, exc, exc_info=True)

        await db.commit()
    log.info(
        "SEED: Golden Boot players done — created=%d updated=%d skipped=%d",
        seeded, updated, skipped,
    )


async def _verify_golden_boot_players() -> None:
    """Log a verification table confirming every Golden Boot favorite is selectable.

    Checks three independent things for each player:
      1. Row exists in players table with correct external_id.
      2. team_id matches the expected national team.
      3. photo_url and position are set (required for UI rendering).

    Emits a single WARNING if any player fails any check, so the log scan
    `grep GOLDEN_BOOT_VERIFY` reveals the full audit at a glance.
    """
    from core.database import SessionLocal
    from core.player_seeds import GOLDEN_BOOT_PLAYER_SEEDS

    try:
        async with SessionLocal() as db:
            rows = (await db.execute(
                text(
                    "SELECT p.external_ids->>'apifootball' AS af_id, "
                    "       p.id, p.name, p.team_id, p.position, p.photo_url "
                    "FROM players p "
                    "WHERE p.external_ids->>'apifootball' = ANY(:ids)"
                ),
                {"ids": [s["apifootball_id"] for s in GOLDEN_BOOT_PLAYER_SEEDS]},
            )).fetchall()

        found = {r[0]: r for r in rows}  # af_id → row

        all_ok   = True
        results  = []
        for seed in GOLDEN_BOOT_PLAYER_SEEDS:
            af_id    = seed["apifootball_id"]
            row      = found.get(af_id)
            if row is None:
                results.append(f"  MISSING  af={af_id} name={seed['name']} team={seed['team_id']}")
                all_ok = False
                continue
            _, pid, name, team_id, position, photo_url = row
            issues = []
            if team_id != seed["team_id"]:
                issues.append(f"team_id={team_id!r} want={seed['team_id']!r}")
            if not position:
                issues.append("position=None")
            if not photo_url:
                issues.append("photo_url=None")
            status = "OK     " if not issues else "PARTIAL"
            if issues:
                all_ok = False
            results.append(f"  {status}  af={af_id} name={name!r} {' '.join(issues)}")

        header = "GOLDEN_BOOT_VERIFY — all players selectable" if all_ok else "GOLDEN_BOOT_VERIFY — PROBLEMS FOUND"
        log_fn  = log.info if all_ok else log.warning
        log_fn("%s\n%s", header, "\n".join(results))
    except Exception as exc:
        log.error("GOLDEN_BOOT_VERIFY: verification query FAILED — %s", exc, exc_info=True)


async def _bootstrap_critical_players() -> None:
    """Sync player rosters for the Golden Boot candidate teams.

    Syncs the ~12 distinct teams whose players appear in the favorites list
    (BRA, FRA, ARG, ENG, NOR, POR, ESP, GER, SWE, NED, URU, COL).

    On each startup: re-syncs any critical team that has fewer than
    _MIN_PLAYERS_PER_TEAM players, rather than skipping the moment any row
    exists. This handles the case where squads are announced after the initial
    sync and new players need to be picked up.

    Each team = 1 API call. Skipped entirely if APIFOOTBALL_KEY is absent.
    """
    if not settings.apifootball_key:
        log.info("BOOTSTRAP: APIFOOTBALL_KEY not set — skipping player auto-sync")
        return

    from core.database import SessionLocal
    from providers.apifootball import ApiFootballProvider
    from services.sync import SyncService

    log.info("BOOTSTRAP: checking player data per critical team")
    try:
        critical_teams = list(set(_GOLDEN_BOOT_FAVORITES.values()))

        async with SessionLocal() as db:
            # Find which critical teams are under the threshold
            rows = (await db.execute(
                text(
                    "SELECT team_id, COUNT(*) AS cnt FROM players "
                    "WHERE team_id = ANY(:ids) GROUP BY team_id"
                ),
                {"ids": critical_teams},
            )).all()
            counts = {r[0]: r[1] for r in rows}

        teams_to_sync = [
            t for t in critical_teams
            if counts.get(t, 0) < _MIN_PLAYERS_PER_TEAM
        ]

        if not teams_to_sync:
            log.info(
                "BOOTSTRAP: all %d critical teams have ≥%d players, skipping",
                len(critical_teams), _MIN_PLAYERS_PER_TEAM,
            )
            return

        log.info(
            "BOOTSTRAP: syncing %d under-threshold teams: %s",
            len(teams_to_sync), sorted(teams_to_sync),
        )
        svc = SyncService(
            provider=ApiFootballProvider(settings.apifootball_key),
            league_id="1",
            season="2026",
        )
        async with SessionLocal() as db:
            result = await svc.sync_players(db, team_ids=teams_to_sync)
            log.info(
                "BOOTSTRAP: player sync done — records=%d status=%s errors=%s",
                result.records_affected, result.status, result.errors or "none",
            )
    except Exception as exc:
        log.error("BOOTSTRAP: player sync FAILED — %s", exc, exc_info=True)


async def _bootstrap_all_players() -> None:
    """Background task: sync player rosters for all remaining WC2026 teams.

    Runs as a non-blocking background task after startup so it doesn't delay
    the health check. Only syncs teams with 0 players — once any player data
    exists for a team, it's left to the critical-teams threshold logic above.
    Each team = 1 API call (rate-limited by the provider).
    """
    if not settings.apifootball_key:
        return

    from core.database import SessionLocal
    from core.wc2026_config import APIFOOTBALL_ID_TO_CODE
    from providers.apifootball import ApiFootballProvider
    from services.sync import SyncService

    all_wc26_teams = [code.lower() for code in APIFOOTBALL_ID_TO_CODE.values()]

    log.info("BACKGROUND: checking player coverage for all %d WC2026 teams", len(all_wc26_teams))
    try:
        async with SessionLocal() as db:
            rows = (await db.execute(
                text(
                    "SELECT team_id, COUNT(*) AS cnt FROM players "
                    "WHERE team_id = ANY(:ids) GROUP BY team_id"
                ),
                {"ids": all_wc26_teams},
            )).all()
            counts = {r[0]: r[1] for r in rows}

        teams_to_sync = [t for t in all_wc26_teams if counts.get(t, 0) < _MIN_PLAYERS_PER_TEAM]

        if not teams_to_sync:
            log.info(
                "BACKGROUND: all %d WC2026 teams have ≥%d players, skipping",
                len(all_wc26_teams), _MIN_PLAYERS_PER_TEAM,
            )
            return

        log.info(
            "BACKGROUND: syncing %d under-threshold teams: %s",
            len(teams_to_sync), sorted(teams_to_sync),
        )
        svc = SyncService(
            provider=ApiFootballProvider(settings.apifootball_key),
            league_id="1",
            season="2026",
        )
        async with SessionLocal() as db:
            result = await svc.sync_players(db, team_ids=teams_to_sync)
            log.info(
                "BACKGROUND: full player sync done — records=%d status=%s errors=%s",
                result.records_affected, result.status, result.errors or "none",
            )
    except Exception as exc:
        log.error("BACKGROUND: full player sync FAILED — %s", exc, exc_info=True)


async def _bootstrap_reconcile_fixtures() -> None:
    """Reconcile manually-seeded matches to real API-Football fixture IDs.

    Runs when any matches still have placeholder external_ids ('manual-wc2026-*').
    Idempotent — subsequent calls are a no-op once all IDs are mapped.
    Also scores any matches that have already finished.
    Skipped entirely if APIFOOTBALL_KEY is absent.
    """
    if not settings.apifootball_key:
        log.info("BOOTSTRAP: APIFOOTBALL_KEY not set — skipping fixture reconciliation")
        return

    from core.database import SessionLocal
    from providers.apifootball import ApiFootballProvider
    from services.sync import SyncService

    log.info("BOOTSTRAP: checking for unreconciled fixtures")
    try:
        async with SessionLocal() as db:
            count = (await db.execute(
                text(
                    "SELECT COUNT(*) FROM matches "
                    "WHERE external_id IS NULL OR external_id LIKE 'manual-%'"
                )
            )).scalar() or 0

            if count == 0:
                log.info("BOOTSTRAP: all fixtures already reconciled, skipping")
                return

        log.info("BOOTSTRAP: %d unreconciled fixtures — running reconciliation", count)
        svc = SyncService(
            provider=ApiFootballProvider(settings.apifootball_key),
            league_id="1",
            season="2026",
        )
        async with SessionLocal() as db:
            result = await svc.reconcile_fixtures(db)
            log.info(
                "BOOTSTRAP: reconcile done — records=%d status=%s errors=%s",
                result.records_affected, result.status, result.errors or "none",
            )
    except Exception as exc:
        log.error("BOOTSTRAP: reconcile FAILED — %s", exc, exc_info=True)


async def _bootstrap_reconcile_knockout_slots() -> None:
    """Auto-reconcile knockout placeholder rows to real API-Football fixture IDs.

    After the group stage ends (~July 2, 2026), API-Football publishes knockout
    fixtures with real team codes.  This matches each placeholder row
    (external_id='manual-wc2026-{round}-{slot}') to the corresponding API
    fixture by positional ordering within each round, then updates external_id
    and team codes in-place (preserving UUIDs and user predictions).

    No-ops before 2026-07-01 and once all KO slots are reconciled.
    Skipped if APIFOOTBALL_KEY is absent.
    """
    if not settings.apifootball_key:
        log.info("BOOTSTRAP: APIFOOTBALL_KEY not set — skipping knockout reconciliation")
        return

    from core.database import SessionLocal
    from providers.apifootball import ApiFootballProvider
    from services.sync import SyncService

    log.info("BOOTSTRAP: checking knockout slot reconciliation")
    try:
        async with SessionLocal() as db:
            count = (await db.execute(
                text(
                    "SELECT COUNT(*) FROM matches "
                    "WHERE round != 'group' AND external_id LIKE 'manual-wc2026-%'"
                )
            )).scalar() or 0

            if count == 0:
                log.info("BOOTSTRAP: all KO slots already reconciled, skipping")
                return

        svc = SyncService(
            provider=ApiFootballProvider(settings.apifootball_key),
            league_id="1",
            season="2026",
        )
        async with SessionLocal() as db:
            result = await svc.reconcile_knockout_slots(db)
            log.info(
                "BOOTSTRAP: KO slot reconcile done — records=%d status=%s errors=%s",
                result.records_affected, result.status, result.errors or "none",
            )
    except Exception as exc:
        log.error("BOOTSTRAP: KO slot reconcile FAILED — %s", exc, exc_info=True)


async def _bootstrap_knockout_matches() -> None:
    """Seed WC 2026 knockout placeholder matches if none exist yet.

    Idempotent — WC2026SeedService uses ON CONFLICT DO NOTHING on external_id.
    """
    from core.database import SessionLocal
    from services.wc2026_seed import WC2026SeedService

    log.info("BOOTSTRAP: checking knockout match placeholders")
    try:
        async with SessionLocal() as db:
            count = (await db.execute(
                text("SELECT COUNT(*) FROM matches WHERE external_id LIKE 'manual-wc2026-%'")
            )).scalar() or 0
            if count > 0:
                log.info("BOOTSTRAP: knockout placeholders already present (%d rows), skipping", count)
                return

            result = await WC2026SeedService(db).seed()
            log.info(
                "BOOTSTRAP: knockout seeding done — created=%d skipped=%d errors=%s",
                result.created, result.skipped, result.errors or "none",
            )
    except Exception as exc:
        log.error("BOOTSTRAP: knockout match seeding FAILED — %s", exc, exc_info=True)


async def _bootstrap_default_league() -> None:
    """Guarantee the default league and all user memberships exist.

    Runs at every startup after Alembic, independently of whether the
    migration succeeded. Uses raw SQL so it works even when the ORM
    models reference columns that don't exist yet.

    Handles the case where a previous migration created the league with
    a different UUID (gen_random_uuid()) — finds by invite_code first.
    """
    from core.database import SessionLocal
    log.info("BOOTSTRAP: starting default league bootstrap")
    try:
        async with SessionLocal() as db:
            # Step 1 — ensure columns exist
            log.info("BOOTSTRAP: step 1 — ensuring is_default/is_system columns")
            await db.execute(text(
                "ALTER TABLE leagues "
                "ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE, "
                "ADD COLUMN IF NOT EXISTS is_system  BOOLEAN NOT NULL DEFAULT FALSE"
            ))
            await db.commit()
            log.info("BOOTSTRAP: step 1 done")

            # Step 2 — find or create the default league
            # Look up by fixed UUID first, then by invite_code — handles the
            # case where a prior migration used gen_random_uuid() and stored
            # the league with a different ID.
            log.info("BOOTSTRAP: step 2 — finding default league")
            row = (await db.execute(text(
                "SELECT id FROM leagues WHERE id = :id OR invite_code = :code LIMIT 1"
            ), {"id": _DEFAULT_LEAGUE_ID, "code": _DEFAULT_INVITE_CODE})).fetchone()

            if row:
                actual_league_id = row[0]
                await db.execute(text(
                    "UPDATE leagues SET is_default = TRUE, is_system = TRUE WHERE id = :id"
                ), {"id": actual_league_id})
                log.info("BOOTSTRAP: step 2 — found existing league id=%s (fixed_id=%s match=%s)",
                         actual_league_id, _DEFAULT_LEAGUE_ID, actual_league_id == _DEFAULT_LEAGUE_ID)
            else:
                await db.execute(text("""
                    INSERT INTO leagues (id, name, invite_code, created_by, is_default, is_system)
                    VALUES (:id, :name, :code, NULL, TRUE, TRUE)
                """), {"id": _DEFAULT_LEAGUE_ID, "name": _DEFAULT_LEAGUE_NAME, "code": _DEFAULT_INVITE_CODE})
                actual_league_id = _DEFAULT_LEAGUE_ID
                log.info("BOOTSTRAP: step 2 — created default league id=%s", actual_league_id)

            await db.commit()
            log.info("BOOTSTRAP: step 2 done — actual_league_id=%s", actual_league_id)

            # Step 3 — backfill every user who isn't yet a member (single bulk INSERT)
            log.info("BOOTSTRAP: step 3 — backfilling user memberships (bulk)")
            result = await db.execute(text("""
                INSERT INTO league_members (id, league_id, user_id, total_points)
                SELECT gen_random_uuid(), :league_id, id, COALESCE(total_points, 0)
                FROM users
                ON CONFLICT ON CONSTRAINT uq_league_members_league_user DO NOTHING
            """), {"league_id": actual_league_id})

            await db.commit()
            log.info("BOOTSTRAP: done — %d memberships inserted, league_id=%s",
                     result.rowcount, actual_league_id)
    except Exception as exc:
        log.error("BOOTSTRAP: FAILED — %s", exc, exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Migrations run via `alembic upgrade head` in start.sh BEFORE uvicorn,
    # so all tables are guaranteed to exist by the time we reach here.
    #
    # Bootstrap order matters:
    #   1. default league  — needs: leagues, league_members, users tables
    #   2. teams           — needs: teams table; no dependencies
    #   3. group fixtures  — needs: matches + teams (API call if APIFOOTBALL_KEY set)
    #   4. knockout matches — needs: matches table; no dependencies
    #   5. critical players — needs: teams with external_ids (API call if key set)
    _admin_key_val    = (settings.admin_key or "").strip()
    _cron_secret_val  = (settings.cron_secret or "").strip()
    log.info(
        "AUTH CONFIG — ADMIN_KEY: present=%s length=%d | CRON_SECRET: present=%s length=%d | commit=%s env=%s",
        bool(_admin_key_val), len(_admin_key_val),
        bool(_cron_secret_val), len(_cron_secret_val),
        os.environ.get("RENDER_GIT_COMMIT", "unknown"),
        settings.app_env,
    )

    await _bootstrap_default_league()       # world league + user memberships
    await _bootstrap_teams()               # 48 WC2026 teams from config
    await _bootstrap_group_fixtures()               # 72 group fixtures (skips if no API key)
    await _bootstrap_reconcile_fixtures()           # map manual IDs → real API IDs + score finished
    await _bootstrap_knockout_matches()             # 32 knockout placeholder matches
    await _bootstrap_reconcile_knockout_slots()     # map KO placeholders → real IDs post-group-stage
    await _seed_manual_players()         # all 14 Golden Boot favorites (no API key needed)
    await _verify_golden_boot_players()  # log verification: confirms each is selectable
    await _bootstrap_critical_players()  # sync full squads for Golden Boot teams (needs API key)
    asyncio.create_task(_bootstrap_all_players())  # remaining 36 teams in background

    yield


app = FastAPI(title="WC26 Predictor API", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(matches.router)
app.include_router(predictions.router)
app.include_router(leagues.router)
app.include_router(teams.router)
app.include_router(players.router)
app.include_router(groups.router)
app.include_router(tournament.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(cron.router)


@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    """
    Liveness + readiness check.

    Runs a lightweight DB ping so Render's health check actually validates
    DB connectivity. Returns degraded (503) rather than a false-positive OK
    when the database is unreachable.

    Timeout: the DB session inherits the engine's pool_pre_ping and
    pool_recycle settings. A hung connection will be recycled automatically;
    this endpoint will never block indefinitely.
    """
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception as exc:
        log.error("[Health] DB ping failed: %s", exc)
        from fastapi import Response
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "db": "unreachable"},
        )


@app.get("/health/version")
async def health_version() -> dict:
    """Public — no auth. Returns safe metadata to verify which commit is running."""
    from datetime import datetime, timezone
    return {
        "app":       "WC26 Predictor API",
        "version":   "0.1.0",
        "commit":    os.environ.get("RENDER_GIT_COMMIT", "unknown"),
        "env":       settings.app_env,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
