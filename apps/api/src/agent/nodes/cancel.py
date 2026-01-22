"""
Cancel Task Node
================
Handle task cancellation requests.
"""
from src.agent.state import AgentState


async def cancel_task(state: AgentState) -> AgentState:
    """
    Cancel the current task.
    """
    return {
        **state,
        "current_intent": None,
        "task_status": "CANCELLED",
        "entities": {},
        "missing_entities": [],
        "clarification_count": 0,
        "response_text": "Dale, cancelado. ¿Algo más?",
        "should_speak": True,
        "messages": state.get("messages", []) + [{
            "role": "assistant", 
            "content": "Dale, cancelado. ¿Algo más?"
        }],
    }
