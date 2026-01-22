"""
LLM Service
===========
Claude and OpenAI client configuration.
"""
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from functools import lru_cache

from src.config import settings


@lru_cache()
def get_claude_client() -> AsyncAnthropic:
    """Get cached Anthropic client."""
    return AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


@lru_cache()
def get_openai_client() -> AsyncOpenAI:
    """Get cached OpenAI client."""
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
