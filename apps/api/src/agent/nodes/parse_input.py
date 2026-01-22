"""
Parse Input Node
================
Preprocess user input before intent detection.
"""
from src.agent.state import AgentState


async def parse_input(state: AgentState) -> AgentState:
    """
    Parse and preprocess the user's input.
    
    - Normalize text (lowercase, strip whitespace)
    - Detect language
    - Increment turn count
    """
    messages = state.get("messages", [])
    
    if not messages:
        return state
    
    # Get the last user message
    last_message = None
    for msg in reversed(messages):
        if msg.get("role") == "user":
            last_message = msg.get("content", "")
            break
    
    if not last_message:
        return state
    
    # Basic preprocessing
    current_input = last_message.strip()
    
    # Simple language detection (can be enhanced)
    # Default to Spanish for this project
    input_language = "es"
    
    # Check for some English patterns
    english_patterns = ["hello", "hi ", "please", "thank you", "yes", "no ", "what", "how"]
    if any(pattern in current_input.lower() for pattern in english_patterns):
        input_language = "en"
    
    return {
        **state,
        "current_input": current_input,
        "input_language": input_language,
        "turn_count": state.get("turn_count", 0) + 1,
    }
