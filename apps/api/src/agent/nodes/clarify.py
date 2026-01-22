"""
Clarify Node
============
Generate clarification questions for missing/ambiguous entities.
"""
from src.agent.state import AgentState
from src.services.llm import get_openai_client


# Entity-specific clarification prompts
CLARIFICATION_TEMPLATES = {
    "recipient": "¿A quién le querés enviar el mensaje?",
    "message_content": "¿Qué querés que diga el mensaje?",
    "platform": "¿Por qué plataforma? ¿WhatsApp, Telegram, o SMS?",
    "reminder_text": "¿Qué querés que te recuerde?",
    "datetime": "¿Cuándo querés que te avise?",
    "note_content": "¿Qué querés anotar?",
    "app_name": "¿Qué aplicación querés abrir?",
    "url": "¿A qué sitio querés ir?",
    "query": "¿Qué querés buscar?",
    "duration": "¿De cuánto tiempo el temporizador?",
}


async def clarify(state: AgentState) -> AgentState:
    """
    Generate a natural clarification question.
    
    Asks for ONE missing entity at a time.
    """
    missing = state.get("missing_entities", [])
    disambiguation = state.get("disambiguation_options", [])
    clarification_count = state.get("clarification_count", 0)
    max_clarifications = state.get("max_clarifications", 3)
    
    # Check if we've asked too many times
    if clarification_count >= max_clarifications:
        return {
            **state,
            "response_text": "Parece que estamos teniendo problemas para entendernos. ¿Podés repetir todo desde el principio?",
            "task_status": "CANCELLED",
            "should_speak": True,
            "messages": state.get("messages", []) + [{
                "role": "assistant",
                "content": "Parece que estamos teniendo problemas para entendernos. ¿Podés repetir todo desde el principio?"
            }],
        }
    
    clarification_text = ""
    
    # First check disambiguation options
    if disambiguation:
        option = disambiguation[0]
        clarification_text = option.get("message", "")
    
    # Then check missing entities
    elif missing:
        entity_to_ask = missing[0]
        
        # Check if we have a template
        if entity_to_ask in CLARIFICATION_TEMPLATES:
            clarification_text = CLARIFICATION_TEMPLATES[entity_to_ask]
        else:
            # Generate with OpenAI for more natural phrasing
            try:
                client = get_openai_client()
                intent = state.get("current_intent", {}).get("intent", "")
                entities = state.get("entities", {})
                
                response = await client.chat.completions.create(
                    model="gpt-4o",
                    max_tokens=100,
                    messages=[
                        {
                            "role": "system",
                            "content": """Sos un asistente amigable. Generá UNA pregunta corta 
                    y natural para obtener la información faltante. 
                    Usá español rioplatense casual. Solo la pregunta, nada más."""
                        },
                        {
                            "role": "user",
                            "content": f"""
Intención: {intent}
Entidades que ya tengo: {entities}
Necesito saber: {entity_to_ask}

Generá solo la pregunta.
"""
                        }
                    ]
                )
                clarification_text = response.choices[0].message.content.strip()
            except Exception:
                clarification_text = f"¿Podrías darme más información sobre {entity_to_ask}?"
    
    if not clarification_text:
        clarification_text = "¿Podrías darme más detalles?"
    
    return {
        **state,
        "response_text": clarification_text,
        "last_clarification": clarification_text,
        "clarification_count": clarification_count + 1,
        "task_status": "WAITING_USER_INPUT",
        "should_speak": True,
        "messages": state.get("messages", []) + [{
            "role": "assistant",
            "content": clarification_text
        }],
    }
