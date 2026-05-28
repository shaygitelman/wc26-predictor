import ssl
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


def _asyncpg_url(url: str) -> str:
    """Ensure the URL uses the postgresql+asyncpg:// scheme.

    Supabase and most PaaS providers supply a plain postgresql:// (or the
    legacy postgres://) connection string.  SQLAlchemy's async engine requires
    the +asyncpg dialect suffix; without it the engine silently falls back to
    a synchronous driver and every connection attempt raises an error.
    """
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _connect_args() -> dict:
    """Return asyncpg connect_args for Supabase PgBouncer transaction mode.

    statement_cache_size=0       : disables asyncpg's user-query LRU cache.
    prepared_statement_name_func : generates a UUID name for every prepared
        statement asyncpg creates — including internal introspection queries
        like "select pg_catalog.version()".  Deterministic names collide when
        PgBouncer reuses a backend connection that already has those statements
        from a prior session; unique UUIDs prevent that entirely.
    ssl                          : Supabase uses a private CA not in public
        trust stores; require TLS but skip CA verification.
    """
    host = settings.database_url.split("@")[-1].split(":")[0] if "@" in settings.database_url else ""
    if "supabase.co" in host or "supabase.com" in host or settings.is_production:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return {
            "ssl": ctx,
            "statement_cache_size": 0,
            "prepared_statement_name_func": lambda _: f"__asyncpg_{uuid.uuid4().hex}__",
        }
    return {}


engine = create_async_engine(
    _asyncpg_url(settings.database_url),
    echo=not settings.is_production,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=10,
    connect_args=_connect_args(),
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:  # type: ignore[return]
    async with SessionLocal() as session:
        yield session
