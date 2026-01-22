"""
Generate Response Node
======================
Generate the final response to the user.
"""
from src.agent.state import AgentState
from src.services.llm import get_openai_client


async def generate_response(state: AgentState) -> AgentState:
    """
    Generate a natural language response for the user.
    
    Takes into account the action result, errors, or general queries.
    """
    # If response_text is already set (e.g., by clarify node), use it
    if state.get("response_text"):
        return state
    
    intent = state.get("current_intent", {}).get("intent", "unknown")
    task_status = state.get("task_status", "IDLE")
    action_result = state.get("action_result")
    action_error = state.get("action_error")
    current_input = state.get("current_input", "")
    messages = state.get("messages", [])
    
    response_text = ""
    
    # Handle different scenarios
    if task_status == "COMPLETED" and action_result:
        # Action completed successfully
        response_text = await generate_success_response(intent, action_result)
    
    elif task_status == "FAILED":
        # Action failed
        error_msg = action_error or "Algo salió mal"
        response_text = f"Ups, hubo un problema: {error_msg}. ¿Querés que lo intente de nuevo?"
    
    elif task_status == "CANCELLED":
        response_text = "Dale, cancelado. ¿En qué más te puedo ayudar?"
    
    elif intent == "general_query" or intent == "unknown":
        # General conversation - use Claude to respond
        response_text = await generate_conversational_response(current_input, messages)
    
    elif intent == "greeting":
        response_text = "¡Hola! ¿En qué te puedo ayudar?"
    
    else:
        response_text = "Listo, ¿algo más?"
    
    return {
        **state,
        "response_text": response_text,
        "should_speak": True,
        "messages": messages + [{
            "role": "assistant",
            "content": response_text
        }],
    }


async def generate_success_response(intent: str, result: dict) -> str:
    """Generate a success response based on intent."""
    responses = {
        "send_message": "Listo, mensaje enviado.",
        "set_reminder": "Dale, te voy a recordar.",
        "create_note": "Nota guardada.",
        "open_app": "Abriendo...",
        "open_url": "Abriendo la página...",
        "search_web": "Acá está lo que encontré.",
        "set_timer": "Temporizador activado.",
    }
    
    base_response = responses.get(intent, "Listo.")
    
    # Add details from result if available
    if result.get("message"):
        return result["message"]
    
    return base_response


async def generate_conversational_response(user_input: str, messages: list) -> str:
    """Generate a conversational response using OpenAI."""
    try:
        client = get_openai_client()
        
        # Build conversation context
        conversation = []
        for msg in messages[-10:]:
            role = "user" if msg["role"] == "user" else "assistant"
            conversation.append({"role": role, "content": msg["content"]})
        
        # Add current input
        conversation.append({"role": "user", "content": user_input})
        
        response = await client.chat.completions.create(
            model="gpt-4o",
            max_tokens=200,
            messages=[
                {
                    "role": "system",
                    "content": """Sos un asistente de voz amigable y conciso. 
            Respondé en español rioplatense casual y breve.
            Tus respuestas deben ser cortas porque se van a leer en voz alta."""
                },
                *conversation
            ]
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        return f"Perdón, tuve un problema para procesar eso. ¿Podrías repetirlo?"
