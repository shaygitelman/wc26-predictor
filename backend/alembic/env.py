import asyncio
import os
import ssl
import sys
from logging.config import fileConfig

from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from alembic import context

# ── Make backend root importable ─────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# ── Import metadata (models only) — NOT the shared app engine ────
# Importing the shared engine here would cause it to be disposed inside
# a ThreadPoolExecutor + asyncio.run() during the in-app migration call,
# corrupting the asyncpg connection pool for the main FastAPI event loop.
from core.database import Base  # noqa: E402
from core.config import settings  # noqa: E402

# ── Register every model so autogenerate can diff them ───────────
import models  # noqa: E402, F401  — imports all models via models/__init__.py

# ── Alembic config ───────────────────────────────────────────────
alembic_config = context.config

if alembic_config.config_file_name:
    fileConfig(alembic_config.config_file_name)

target_metadata = Base.metadata


def _migration_url() -> str:
    """Return the database URL with the asyncpg scheme."""
    url = settings.database_url
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _migration_connect_args() -> dict:
    """asyncpg connect_args for Supabase / production (mirrors database.py)."""
    host = settings.database_url.split("@")[-1].split(":")[0] if "@" in settings.database_url else ""
    if "supabase.co" in host or "supabase.com" in host or settings.is_production:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return {"ssl": ctx, "statement_cache_size": 0}
    return {}


# ── Offline mode — generates SQL without a live connection ────────
def run_migrations_offline() -> None:
    context.configure(
        url=_migration_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online mode — runs against the live database ──────────────────
def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # Create a short-lived engine local to this migration run.
    # Never reuse the app's shared engine here — disposing it from within
    # a thread's asyncio.run() event loop corrupts the pool for FastAPI's
    # main event loop.
    migration_engine = create_async_engine(
        _migration_url(),
        connect_args=_migration_connect_args(),
    )
    try:
        async with migration_engine.connect() as connection:
            await connection.run_sync(do_run_migrations)
    finally:
        await migration_engine.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
