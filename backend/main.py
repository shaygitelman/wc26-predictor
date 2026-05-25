import logging
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from routers import admin, auth, groups, matches, players, predictions, leagues, teams, tournament, users

log = logging.getLogger(__name__)

_db_url = settings.database_url
_db_host = _db_url.split("@")[-1].split(":")[0] if "@" in _db_url else "UNKNOWN"
log.warning("DB host: %s (url starts with: %s)", _db_host, _db_url[:30])


def _run_migrations() -> None:
    from alembic.config import Config
    from alembic import command
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        log.info("Running Alembic migrations…")
        with ThreadPoolExecutor(max_workers=1) as pool:
            pool.submit(_run_migrations).result(timeout=60)
        log.info("Migrations complete.")
    except Exception as exc:
        log.error("Migration failed — proceeding anyway: %s", exc)
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
