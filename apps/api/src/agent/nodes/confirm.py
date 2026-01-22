"""
Confirm Action Node
===================
Handle user confirmation to proceed with action.
"""
from src.agent.state import AgentState


async def confirm_action(state: AgentState) -> AgentState:
    """
    Mark the action as confirmed and ready to execute.
    """
    return {
        **state,
        "task_status": "READY_TO_EXECUTE",
    }
