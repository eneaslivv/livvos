"""
Sessions Router
===============
Conversation session management.
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from src.dependencies import DBSession, CurrentUser
from src.db.models import ConversationMode

router = APIRouter()


# ==================== SCHEMAS ====================

class SessionCreate(BaseModel):
    mode: ConversationMode = ConversationMode.AGENT
    device_id: Optional[UUID] = None


class SessionResponse(BaseModel):
    id: UUID
    mode: ConversationMode
    title: Optional[str]
    started_at: datetime
    ended_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# ==================== ENDPOINTS ====================

@router.post("/", response_model=SessionResponse)
async def create_session(
    session_data: SessionCreate,
    current_user: CurrentUser,
    db: DBSession
):
    """Create a new conversation session."""
    # TODO: Implement session creation
    pass


@router.get("/", response_model=List[SessionResponse])
async def list_sessions(
    current_user: CurrentUser,
    db: DBSession,
    skip: int = 0,
    limit: int = 20
):
    """List user's conversation sessions."""
    # TODO: Implement listing
    return []


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: UUID,
    current_user: CurrentUser,
    db: DBSession
):
    """Get a specific session."""
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Session not found"
    )


@router.get("/{session_id}/messages", response_model=List[MessageResponse])
async def get_session_messages(
    session_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
    skip: int = 0,
    limit: int = 50
):
    """Get messages from a session."""
    return []


@router.post("/{session_id}/end")
async def end_session(
    session_id: UUID,
    current_user: CurrentUser,
    db: DBSession
):
    """End a conversation session."""
    return {"message": "Session ended"}
