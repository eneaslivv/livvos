"""
Detect Intent Node
==================
Detect user intent using Claude.
"""
import json
from src.agent.state import AgentState
from src.services.llm import get_openai_client
from src.agent.prompts.intent import INTENT_DETECTION_PROMPT


async def detect_intent(state: AgentState) -> AgentState:
    """
    Detect the user's intent using Claude.
    
    Returns detected intent with entities and confidence.
    """
    current_input = state.get("current_input", "")
    messages = state.get("messages", [])
    
    if not current_input:
        return {
            **state,
            "current_intent": {"intent": "unknown", "confidence": 0.0, "entities": {}},
            "task_status": "IDLE",
        }
    
    # Get OpenAI client
    client = get_openai_client()
    
    # Build context from recent messages
    context_messages = messages[-10:]  # Last 10 messages for context
    context_str = "\n".join([
        f"{msg['role'].upper()}: {msg['content']}"
        for msg in context_messages
    ])
    
    # Call OpenAI for intent detection
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            temperature=0,
            messages=[
                {
                    "role": "system", 
                    "content": INTENT_DETECTION_PROMPT
                },
                {
                    "role": "user",
                    "content": f"""
Historial reciente:
{context_str}

Último mensaje del usuario: "{current_input}"

Detectá la intención y entidades. Respondé SOLO en JSON válido.
"""
                }
            ]
        )
        
        # Parse JSON response
        response_text = response.choices[0].message.content.strip()
        
        # Clean up response if needed
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        
        intent_data = json.loads(response_text.strip())
        
        return {
            **state,
            "current_intent": intent_data,
            "entities": intent_data.get("entities", {}),
            "missing_entities": intent_data.get("missing", []),
            "task_status": "INTENT_DETECTED",
        }
        
    except json.JSONDecodeError:
        # If JSON parsing fails, try to extract intent manually
        return {
            **state,
            "current_intent": {
                "intent": "general_query",
                "confidence": 0.5,
                "entities": {},
                "reasoning": "Could not parse intent response"
            },
            "task_status": "INTENT_DETECTED",
        }
    except Exception as e:
        return {
            **state,
            "current_intent": {
                "intent": "unknown",
                "confidence": 0.0,
                "entities": {},
                "error": str(e)
            },
            "task_status": "FAILED",
            "action_error": str(e),
        }
