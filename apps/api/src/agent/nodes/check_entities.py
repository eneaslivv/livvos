"""
Check Entities Node
===================
Verify if all required entities are present for the detected intent.
"""
from src.agent.state import AgentState


# Required entities for each intent
REQUIRED_ENTITIES = {
    "send_message": ["recipient", "message_content"],
    "set_reminder": ["reminder_text", "datetime"],
    "create_note": ["note_content"],
    "open_app": ["app_name"],
    "open_url": ["url"],
    "search_web": ["query"],
    "set_timer": ["duration"],
}

# Optional entities that can be inferred or have defaults
OPTIONAL_ENTITIES = {
    "send_message": ["platform"],  # Can ask or use default
    "set_reminder": ["recurrence"],
    "create_note": ["title", "tags"],
}


async def check_entities(state: AgentState) -> AgentState:
    """
    Check if all required entities are present for the intent.
    
    Updates missing_entities list and task_status accordingly.
    """
    intent_data = state.get("current_intent", {})
    intent = intent_data.get("intent", "unknown")
    entities = state.get("entities", {})
    
    # Get required entities for this intent
    required = REQUIRED_ENTITIES.get(intent, [])
    
    # Check which are missing
    missing = []
    for entity in required:
        if entity not in entities or not entities[entity]:
            missing.append(entity)
    
    # Check for entities that need resolution (e.g., "Juan" is ambiguous)
    unresolved = []
    for entity, value in entities.items():
        if isinstance(value, str) and entity == "recipient":
            # Mark recipient for resolution lookup
            unresolved.append(entity)
    
    if missing:
        return {
            **state,
            "missing_entities": missing,
            "unresolved_entities": unresolved,
            "task_status": "NEEDS_CLARIFICATION",
        }
    elif unresolved:
        return {
            **state,
            "missing_entities": [],
            "unresolved_entities": unresolved,
            "task_status": "NEEDS_CLARIFICATION",
        }
    else:
        return {
            **state,
            "missing_entities": [],
            "unresolved_entities": [],
            "task_status": "READY_TO_EXECUTE",
        }
