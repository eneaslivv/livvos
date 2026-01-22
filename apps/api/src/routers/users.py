"""
Users Router
============
User authentication and profile management.
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID

from src.dependencies import DBSession, CurrentUser

router = APIRouter()


# ==================== SCHEMAS ====================

class UserCreate(BaseModel):
    email: EmailStr
    name: Optional[str] = None


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: Optional[str]
    preferred_language: str
    
    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    preferred_language: Optional[str] = None
    voice_settings: Optional[dict] = None


# ==================== ENDPOINTS ====================

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: CurrentUser):
    """Get current user's profile."""
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_user_profile(
    updates: UserUpdate,
    current_user: CurrentUser,
    db: DBSession
):
    """Update current user's profile."""
    # TODO: Implement update logic
    return current_user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: UUID, db: DBSession):
    """Get user by ID."""
    # TODO: Implement fetch logic
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="User not found"
    )
