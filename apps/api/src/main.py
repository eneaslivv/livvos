"""
Antigravity Voice API
=====================
Backend API for the intelligent voice agent system.
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog

from src.config import settings
from src.routers import voice, dictation, sessions, users, health
from src.db.database import init_db

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    logger.info("Starting Antigravity Voice API", env=settings.API_ENV)
    
    # Initialize database
    await init_db()
    
    yield
    
    logger.info("Shutting down Antigravity Voice API")


# Create FastAPI application
app = FastAPI(
    title="Antigravity Voice API",
    description="Backend API for the intelligent voice agent system",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.API_DEBUG else None,
    redoc_url="/redoc" if settings.API_DEBUG else None,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.API_DEBUG else settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["Sessions"])
app.include_router(voice.router, prefix="/ws", tags=["Voice WebSocket"])
app.include_router(dictation.router, prefix="/ws", tags=["Dictation WebSocket"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.API_DEBUG,
    )
