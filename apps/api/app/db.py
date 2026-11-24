"""Async SQLAlchemy engine and session factory with automatic fallback to SQLite."""

import logging
import socket
from pathlib import Path
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

logger = logging.getLogger("circuitmentor.db")

db_url = settings.DATABASE_URL.strip()
if db_url.startswith("postgres://"):
    db_url = "postgresql+asyncpg://" + db_url[len("postgres://"):]
elif db_url.startswith("postgresql://"):
    db_url = "postgresql+asyncpg://" + db_url[len("postgresql://"):]

connect_args = {}
engine_kwargs = {}

SQLITE_PATH = (Path(__file__).resolve().parent.parent / "circuitmentor.db").as_posix()
SQLITE_DB_URL = f"sqlite+aiosqlite:///{SQLITE_PATH}"

# Check if PostgreSQL is reachable when a postgres url is specified
if "postgres" in db_url:
    is_postgres_up = False
    host = "localhost"
    port = 5432
    try:
        if "@" in db_url:
            host_port = db_url.split("@", 1)[1].split("/", 1)[0]
            if ":" in host_port:
                host, port_str = host_port.split(":", 1)
                port = int(port_str)
            else:
                host = host_port
        sock = socket.create_connection((host, port), timeout=3.0)
        is_postgres_up = True
        sock.close()
    except Exception:
        is_postgres_up = False

    if is_postgres_up:
        if ":6543" in db_url or "pooler.supabase.com" in db_url:
            connect_args["statement_cache_size"] = 0
            connect_args["prepared_statement_cache_size"] = 0
        engine_kwargs = {
            "pool_size": 10,
            "max_overflow": 20,
            "pool_pre_ping": True,
            "pool_recycle": 300,
            "connect_args": connect_args,
        }
    else:
        if settings.cookie_secure:
            raise RuntimeError(
                f"PostgreSQL on {host}:{port} is unreachable in production mode (cookie_secure=True). "
                "Hint: On Render/IPv4 hosts, use the Supabase Pooler hostname (aws-0-<region>.pooler.supabase.com) instead of db.<ref>.supabase.co."
            )
        logger.warning(
            "PostgreSQL on %s:%s is unreachable. Falling back to local SQLite database (%s).",
            host,
            port,
            SQLITE_PATH,
        )
        db_url = SQLITE_DB_URL
        engine_kwargs = {}
else:
    engine_kwargs = {}

engine = create_async_engine(
    db_url,
    echo=False,
    **engine_kwargs,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    """FastAPI dependency: yields an async DB session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except HTTPException:
            await session.rollback()
            raise
        except Exception:
            await session.rollback()
            raise
