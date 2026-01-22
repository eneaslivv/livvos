"""
Execute Action Node
===================
Execute the detected action with resolved entities.
"""
from src.agent.state import AgentState
from src.services.skills import get_skill


async def execute_action(state: AgentState) -> AgentState:
    """
    Execute the action based on intent and entities.
    
    Calls the appropriate skill handler.
    """
    intent = state.get("current_intent", {}).get("intent", "unknown")
    entities = {**state.get("entities", {}), **state.get("resolved_entities", {})}
    user_id = state.get("user_id")
    
    # Get the skill for this intent
    skill = get_skill(intent)
    
    if not skill:
        return {
            **state,
            "action_result": {"success": False, "error": f"No skill for intent: {intent}"},
            "action_error": f"No handler for intent: {intent}",
            "task_status": "FAILED",
        }
    
    try:
        # Execute the skill
        result = await skill.execute(user_id=user_id, entities=entities)
        
        return {
            **state,
            "action_result": result,
            "action_error": None,
            "task_status": "COMPLETED" if result.get("success") else "FAILED",
        }
        
    except Exception as e:
        return {
            **state,
            "action_result": {"success": False, "error": str(e)},
            "action_error": str(e),
            "task_status": "FAILED",
        }
