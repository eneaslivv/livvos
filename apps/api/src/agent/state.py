"""
Agent State Definition
======================
TypedDict for LangGraph agent state.
"""
from typing import TypedDict, Literal, Annotated, List, Optional
import operator


class IntentData(TypedDict, total=False):
    """Detected intent with entities."""
    intent: str
    confidence: float
    entities: dict
    missing: List[str]
    reasoning: str


class Message(TypedDict):
    """Conversation message."""
    role: Literal["user", "assistant", "system"]
    content: str


class AgentState(TypedDict, total=False):
    """
    State for the voice agent.
    
    This state is passed through all nodes in the LangGraph.
    """
    # Identification
    user_id: str
    session_id: str
    device_id: str
    
    # Messages (accumulate with each turn)
    messages: Annotated[List[Message], operator.add]
    
    # Current input
    current_input: str
    input_language: str
    
    # Intent detection
    current_intent: Optional[IntentData]
    
    # Task status
    task_status: Literal[
        "IDLE",
        "INTENT_DETECTED",
        "NEEDS_CLARIFICATION",
        "WAITING_USER_INPUT",
        "READY_TO_EXECUTE",
        "EXECUTING",
        "COMPLETED",
        "FAILED",
        "CANCELLED"
    ]
    
    # Entities
    entities: dict
    missing_entities: List[str]
    unresolved_entities: List[str]
    resolved_entities: dict
    needs_user_disambiguation: bool
    disambiguation_options: List[dict]
    
    # Clarification
    clarification_count: int
    last_clarification: str
    max_clarifications: int
    
    # Action execution
    action_result: Optional[dict]
    action_error: Optional[str]
    
    # Response
    response_text: str
    should_speak: bool
    
    # Metadata
    turn_count: int
    processing_start_time: float


def create_initial_state(user_id: str, session_id: str) -> AgentState:
    """Create initial agent state."""
    return AgentState(
        user_id=user_id,
        session_id=session_id,
        messages=[],
        current_intent=None,
        task_status="IDLE",
        entities={},
        missing_entities=[],
        unresolved_entities=[],
        resolved_entities={},
        needs_user_disambiguation=False,
        disambiguation_options=[],
        clarification_count=0,
        max_clarifications=3,
        action_result=None,
        action_error=None,
        response_text="",
        should_speak=True,
        turn_count=0,
    )
