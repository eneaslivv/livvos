"""
Database Configuration
======================
SQLAlchemy async engine and session factory.
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from src.config import settings


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"),
    echo=settings.API_DEBUG,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

# Session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def init_db() -> None:
    """Initialize database (create tables if needed)."""
    async with engine.begin() as conn:
        # Import models to register them
        from src.db import models  # noqa: F401
        # Note: In production, use Alembic migrations instead
        # await conn.run_sync(Base.metadata.create_all)
    pass


async def get_session() -> AsyncSession:
    """Get a new database session."""
    async with async_session_maker() as session:
        return session
