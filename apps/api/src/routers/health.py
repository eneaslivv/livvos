"""
Health Check Router
===================
Endpoints for health monitoring and status checks.
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check API health status."""
    return HealthResponse(status="healthy", version="0.1.0")


@router.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Antigravity Voice API", "docs": "/docs"}
