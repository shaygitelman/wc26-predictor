import asyncio
import os
import sys
from logging.config import fileConfig

from sqlalchemy.engine import Connection
from alembic import context

# ── Make backend root importable ─────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# ── Import app engine (SSL config lives there — single source of truth) ──
from core.database import engine, Base  # noqa: E402

# ── Register every model so autogenerate can diff them ───────────
import models  # noqa: E402, F401  — imports all models via models/__init__.py

# ── Alembic config ───────────────────────────────────────────────
alembic_config = context.config

if alembic_config.config_file_name:
    fileConfig(alembic_config.config_file_name)

target_metadata = Base.metadata


# ── Offline mode — generates SQL without a live connection ────────
def run_migrations_offline() -> None:
    from core.config import settings
    context.configure(
        url=settings.database_url,
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
    # Reuse the same engine the app uses (same URL, same SSL context)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
