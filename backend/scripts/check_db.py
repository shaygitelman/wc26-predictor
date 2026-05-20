"""
Run with:  python scripts/check_db.py
from the backend/ directory (with the venv activated).

Checks:
  1. DNS resolution for the database host
  2. Live SQLAlchemy async connection
  3. PostgreSQL server version
  4. Whether the 'users' table exists yet
"""
import asyncio
import socket
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from urllib.parse import urlparse

from sqlalchemy import text

from core.config import settings
from core.database import engine


def check_dns(host: str) -> bool:
    try:
        socket.getaddrinfo(host, 5432)
        print(f"  DNS  ✓  {host}")
        return True
    except socket.gaierror as e:
        print(f"  DNS  ✗  {host}  →  {e}")
        print("         → Project may be paused. Resume it at https://supabase.com/dashboard")
        return False


async def check_connection() -> None:
    parsed = urlparse(settings.database_url)
    host = parsed.hostname or ""

    print("\n── Connection check ─────────────────────────────────────")

    if not check_dns(host):
        sys.exit(1)

    try:
        async with engine.connect() as conn:
            version = await conn.scalar(text("SELECT version()"))
            print(f"  DB   ✓  {version[:55]}")

            table_exists = await conn.scalar(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = 'users')"
            ))
            if table_exists:
                count = await conn.scalar(text("SELECT COUNT(*) FROM public.users"))
                print(f"  Table users  ✓  {count} rows")
            else:
                print("  Table users  –  not yet created (run: alembic upgrade head)")

        print("\n  All checks passed.\n")
    except Exception as e:
        print(f"  DB   ✗  {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(check_connection())
