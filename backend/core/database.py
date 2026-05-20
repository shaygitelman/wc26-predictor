import ssl

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


def _ssl_args() -> dict:
    host = settings.database_url.split("@")[-1].split(":")[0] if "@" in settings.database_url else ""
    if "supabase.co" in host or "supabase.com" in host or settings.is_production:
        # Supabase uses its own private CA (not in public bundles); require SSL but skip CA verification.
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return {"connect_args": {"ssl": ctx}}
    return {}


engine = create_async_engine(
    settings.database_url,
    echo=not settings.is_production,
    **_ssl_args(),
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:  # type: ignore[return]
    async with SessionLocal() as session:
        yield session
