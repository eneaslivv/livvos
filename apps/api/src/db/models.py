"""
Database Models
===============
SQLAlchemy models for the voice agent system.
"""
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from sqlalchemy import String, Text, ForeignKey, TIMESTAMP, Boolean, Integer, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
import enum

from src.db.database import Base


# ==================== ENUMS ====================

class DeviceType(str, enum.Enum):
    DESKTOP = "desktop"
    MOBILE = "mobile"
    WEB = "web"
    WEARABLE = "wearable"


class ConversationMode(str, enum.Enum):
    AGENT = "agent"
    DICTATION = "dictation"


class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class TaskStatus(str, enum.Enum):
    IDLE = "IDLE"
    INTENT_DETECTED = "INTENT_DETECTED"
    NEEDS_CLARIFICATION = "NEEDS_CLARIFICATION"
    WAITING_USER_INPUT = "WAITING_USER_INPUT"
    READY_TO_EXECUTE = "READY_TO_EXECUTE"
    EXECUTING = "EXECUTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class ActionStatus(str, enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PENDING = "pending"


# ==================== MODELS ====================

class User(Base):
    """User account."""
    __tablename__ = "users"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    avatar_url: Mapped[Optional[str]] = mapped_column(Text)
    preferred_language: Mapped[str] = mapped_column(String(10), default="es")
    voice_settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    timezone: Mapped[str] = mapped_column(String(50), default="America/Argentina/Buenos_Aires")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    devices: Mapped[List["Device"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    sessions: Mapped[List["ConversationSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    contacts: Mapped[List["UserContact"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Device(Base):
    """User's registered devices."""
    __tablename__ = "devices"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_type: Mapped[DeviceType] = mapped_column(SQLEnum(DeviceType), nullable=False)
    device_name: Mapped[Optional[str]] = mapped_column(String(255))
    device_info: Mapped[dict] = mapped_column(JSONB, default=dict)
    push_token: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_active_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="devices")


class ConversationSession(Base):
    """Conversation session."""
    __tablename__ = "conversation_sessions"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("devices.id", ondelete="SET NULL"))
    mode: Mapped[ConversationMode] = mapped_column(SQLEnum(ConversationMode), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(255))
    started_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    session_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="sessions")
    messages: Mapped[List["Message"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    tasks: Mapped[List["TaskState"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class Message(Base):
    """Conversation message."""
    __tablename__ = "messages"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("conversation_sessions.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[MessageRole] = mapped_column(SQLEnum(MessageRole), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    audio_url: Mapped[Optional[str]] = mapped_column(Text)
    audio_duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    intent: Mapped[Optional[dict]] = mapped_column(JSONB)
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer)
    processing_time_ms: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    
    # Relationships
    session: Mapped["ConversationSession"] = relationship(back_populates="messages")


class TaskState(Base):
    """Active task state."""
    __tablename__ = "task_states"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("conversation_sessions.id", ondelete="CASCADE"), nullable=False)
    task_type: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[TaskStatus] = mapped_column(SQLEnum(TaskStatus), default=TaskStatus.IDLE)
    intent_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    entities: Mapped[dict] = mapped_column(JSONB, default=dict)
    missing_entities: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    clarification_history: Mapped[List[dict]] = mapped_column(JSONB, default=list)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    session: Mapped["ConversationSession"] = relationship(back_populates="tasks")
    actions: Mapped[List["ExecutedAction"]] = relationship(back_populates="task", cascade="all, delete-orphan")


class ExecutedAction(Base):
    """Record of executed actions."""
    __tablename__ = "executed_actions"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    task_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("task_states.id", ondelete="SET NULL"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("conversation_sessions.id", ondelete="SET NULL"))
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    action_params: Mapped[dict] = mapped_column(JSONB, nullable=False)
    result: Mapped[Optional[dict]] = mapped_column(JSONB)
    status: Mapped[ActionStatus] = mapped_column(SQLEnum(ActionStatus), default=ActionStatus.PENDING)
    error_details: Mapped[Optional[str]] = mapped_column(Text)
    executed_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    
    # Relationships
    task: Mapped[Optional["TaskState"]] = relationship(back_populates="actions")


class UserContact(Base):
    """User's contacts for entity resolution."""
    __tablename__ = "user_contacts"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    aliases: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    platform_ids: Mapped[dict] = mapped_column(JSONB, default=dict)  # {whatsapp: '+54...', telegram: '@...'}
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    last_contacted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    contact_frequency: Mapped[int] = mapped_column(Integer, default=0)
    contact_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="contacts")


class UserPreference(Base):
    """Key-value preferences for users."""
    __tablename__ = "user_preferences"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class Reminder(Base):
    """User reminders."""
    __tablename__ = "reminders"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("executed_actions.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    remind_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    recurrence: Mapped[Optional[str]] = mapped_column(String(100))  # cron expression
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    notification_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)


class Note(Base):
    """User notes."""
    __tablename__ = "notes"
    
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("executed_actions.id", ondelete="SET NULL"))
    title: Mapped[Optional[str]] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
