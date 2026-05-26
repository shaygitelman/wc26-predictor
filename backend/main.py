import logging
import uuid
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from core.config import settings
from routers import admin, auth, groups, matches, players, predictions, leagues, teams, tournament, users

log = logging.getLogger(__name__)

_db_url = settings.database_url
_db_host = _db_url.split("@")[-1].split(":")[0] if "@" in _db_url else "UNKNOWN"
log.warning("DB host: %s (url starts with: %s)", _db_host, _db_url[:30])

_DEFAULT_LEAGUE_ID   = '00000000-0000-0000-0000-000000000001'
_DEFAULT_LEAGUE_NAME = 'MatchPoint26 World League'
_DEFAULT_INVITE_CODE = 'WORLD001'


def _run_migrations() -> None:
    from alembic.config import Config
    from alembic import command
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")


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

            # Step 3 — backfill every user who isn't yet a member
            log.info("BOOTSTRAP: step 3 — backfilling user memberships")
            rows = (await db.execute(
                text("SELECT id, COALESCE(total_points, 0) FROM users")
            )).fetchall()
            log.info("BOOTSTRAP: step 3 — found %d users to process", len(rows))

            inserted = 0
            for user_id, total_points in rows:
                result = await db.execute(text("""
                    INSERT INTO league_members (id, league_id, user_id, total_points)
                    VALUES (:id, :league_id, :user_id, :total_points)
                    ON CONFLICT ON CONSTRAINT uq_league_members_league_user DO NOTHING
                """), {
                    "id":           str(uuid.uuid4()),
                    "league_id":    actual_league_id,
                    "user_id":      user_id,
                    "total_points": total_points,
                })
                inserted += result.rowcount

            await db.commit()
            log.info("BOOTSTRAP: done — %d/%d memberships inserted, league_id=%s",
                     inserted, len(rows), actual_league_id)
    except Exception as exc:
        log.error("BOOTSTRAP: FAILED — %s", exc, exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        log.info("Running Alembic migrations…")
        with ThreadPoolExecutor(max_workers=1) as pool:
            pool.submit(_run_migrations).result(timeout=60)
        log.info("Migrations complete.")
    except Exception as exc:
        log.error("Migration failed — proceeding anyway: %s", exc)

    await _bootstrap_default_league()

    yield


app = FastAPI(title="WC26 Predictor API", version="0.1.0", lifespan=lifespan)

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


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
