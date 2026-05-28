import asyncio
import os
import ssl
import sys
import uuid
from logging.config import fileConfig

from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from alembic import context

# ── Make backend root importable ─────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from core.database import Base  # noqa: E402
from core.config import settings  # noqa: E402

import models  # noqa: E402, F401

alembic_config = context.config

if alembic_config.config_file_name:
    fileConfig(alembic_config.config_file_name)

target_metadata = Base.metadata


def _migration_url() -> str:
    url = settings.database_url
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _migration_connect_args() -> dict:
    """asyncpg connect_args safe for Supabase PgBouncer transaction mode.

    statement_cache_size=0       : disables asyncpg's user-query LRU cache.
    prepared_statement_name_func : generates a UUID-based name for EVERY
        prepared statement asyncpg creates, including internal introspection
        queries like "select pg_catalog.version()".  Without this, asyncpg
        uses deterministic names (__asyncpg_0__, __asyncpg_1__, …) that
        collide when PgBouncer reuses a backend connection that already has
        those statements prepared from a previous session.
    ssl                          : required for Supabase (private CA).
    """
    args: dict = {
        "statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4().hex}__",
    }
    host = settings.database_url.split("@")[-1].split(":")[0] if "@" in settings.database_url else ""
    if "supabase.co" in host or "supabase.com" in host or settings.is_production:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        args["ssl"] = ctx
    return args


def run_migrations_offline() -> None:
    context.configure(
        url=_migration_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # NullPool: migrations need exactly one connection; no pooling required.
    # Each connect() → close() cycle is clean and independent.
    migration_engine = create_async_engine(
        _migration_url(),
        poolclass=NullPool,
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
