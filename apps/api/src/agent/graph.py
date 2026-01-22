"""
LangGraph Agent Definition
==========================
Main agent graph with nodes and edges.
"""
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from typing import Literal

from src.agent.state import AgentState
from src.agent.nodes import (
    parse_input,
    detect_intent,
    check_entities,
    resolve_entities,
    clarify,
    execute_action,
    generate_response,
    cancel_task,
    confirm_action,
)
from src.agent.nodes.system_control import execute_system_command


def route_after_intent(state: AgentState) -> Literal["check_entities", "cancel", "confirm", "respond", "system_control"]:
    """Decide what to do after intent detection."""
    intent = state.get("current_intent", {})
    intent_type = intent.get("intent", "unknown") if intent else "unknown"
    
    if intent_type == "cancel":
        return "cancel"
    elif intent_type == "confirm":
        return "confirm"
    elif intent_type == "open_app":
        return "system_control"
    elif intent_type in ["general_query", "unknown", "greeting"]:
        return "respond"
    else:
        return "check_entities"


def route_after_entity_check(state: AgentState) -> Literal["resolve", "clarify", "execute"]:
    """Decide if we need to clarify, resolve entities, or execute."""
    unresolved = state.get("unresolved_entities", [])
    missing = state.get("missing_entities", [])
    
    if unresolved:
        return "resolve"
    elif missing:
        return "clarify"
    else:
        return "execute"


def route_after_resolve(state: AgentState) -> Literal["clarify", "execute"]:
    """Decide after trying to resolve entities."""
    if state.get("needs_user_disambiguation"):
        return "clarify"
    return "execute"

def create_agent_graph() -> StateGraph:
    """Create and compile the agent graph."""
    
    # Create the graph
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("parse_input", parse_input)
    workflow.add_node("detect_intent", detect_intent)
    workflow.add_node("check_entities", check_entities)
    workflow.add_node("resolve", resolve_entities)
    workflow.add_node("clarify", clarify)
    workflow.add_node("execute", execute_action)
    workflow.add_node("system_control", execute_system_command)  # NEW NODE
    workflow.add_node("respond", generate_response)
    workflow.add_node("cancel", cancel_task)
    workflow.add_node("confirm", confirm_action)
    
    # Set entry point
    workflow.set_entry_point("parse_input")
    
    # Simple edges
    workflow.add_edge("parse_input", "detect_intent")
    workflow.add_edge("cancel", "respond")
    workflow.add_edge("confirm", "execute")
    workflow.add_edge("execute", "respond")
    workflow.add_edge("system_control", "respond") # New Edge
    workflow.add_edge("clarify", "respond")
    workflow.add_edge("respond", END)
    
    # Conditional edges
    workflow.add_conditional_edges(
        "detect_intent",
        route_after_intent,
        {
            "check_entities": "check_entities",
            "cancel": "cancel",
            "confirm": "confirm",
            "system_control": "system_control",
            "respond": "respond"
        }
    )
    
    workflow.add_conditional_edges(
        "check_entities",
        route_after_entity_check,
        {
            "resolve": "resolve",
            "clarify": "clarify",
            "execute": "execute"
        }
    )
    
    workflow.add_conditional_edges(
        "resolve",
        route_after_resolve,
        {
            "clarify": "clarify",
            "execute": "execute"
        }
    )
    
    # Compile with checkpointer for state persistence
    # For MVP, we use MemorySaver to avoid Redis dependency
    checkpointer = MemorySaver()
    
    return workflow.compile(checkpointer=checkpointer)


# Global agent instance
agent = create_agent_graph()
