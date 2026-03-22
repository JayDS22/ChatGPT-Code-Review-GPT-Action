"""Async SQLAlchemy database engine and session factory.

Supports:
  - PostgreSQL via asyncpg (production / docker)
  - SQLite via aiosqlite (local development, zero-config)
"""

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

# SQLite needs special connect args
_connect_args = {}
_pool_kwargs = {"pool_pre_ping": True, "pool_size": 20, "max_overflow": 10}
if settings.use_sqlite:
    _connect_args = {"check_same_thread": False}
    _pool_kwargs = {}  # SQLite doesn't support pool_size

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args=_connect_args,
    **_pool_kwargs,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """Dependency that yields an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables. Works with both PostgreSQL and SQLite."""
    # Import models so they register with Base.metadata
    import app.models.database  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """Dispose of the engine connection pool."""
    await engine.dispose()
