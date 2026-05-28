import ssl

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
    """Return asyncpg connect_args for Supabase / production environments.

    - ssl=ctx          : TLS required; skip CA verification (Supabase uses an
                         internal CA not in public trust stores).
    - statement_cache_size=0 : disables asyncpg prepared-statement caching,
                         required for Supabase PgBouncer in transaction mode
                         (prevents DuplicatePreparedStatementError across
                         pooled connections).
    """
    host = settings.database_url.split("@")[-1].split(":")[0] if "@" in settings.database_url else ""
    if "supabase.co" in host or "supabase.com" in host or settings.is_production:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return {"ssl": ctx, "statement_cache_size": 0}
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
