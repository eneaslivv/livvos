"""
Application Configuration
=========================
Centralized settings management using Pydantic Settings.
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )
    
    # ===================
    # API Configuration
    # ===================
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_ENV: str = "development"
    API_DEBUG: bool = True
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    
    # ===================
    # Supabase / PostgreSQL
    # ===================
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    # DATABASE_URL: str = ""
    # Force SQLite for development testing to avoid config issues
    DATABASE_URL: str = "sqlite+aiosqlite:///./test.db"
    
    # ===================
    # Redis
    # ===================
    REDIS_URL: str = "redis://localhost:6379"
    
    # ===================
    # LLM APIs
    # ===================
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    
    # Default models
    CLAUDE_MODEL: str = "claude-sonnet-4-20250514"
    OPENAI_MODEL: str = "gpt-4o"
    
    # ===================
    # Speech Services
    # ===================
    DEEPGRAM_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = "21m00Tcm4TlvDq8ikWAM"  # Rachel - default
    
    # ===================
    # Vector Store
    # ===================
    PINECONE_API_KEY: str = ""
    PINECONE_ENVIRONMENT: str = ""
    PINECONE_INDEX_NAME: str = "antigravity-memory"
    
    # ===================
    # JWT / Auth
    # ===================
    JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours


# Global settings instance
settings = Settings()
