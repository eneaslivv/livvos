import platform
import subprocess
from typing import Dict, Any, List
from src.agent.state import AgentState
import structlog

logger = structlog.get_logger()

# Mapping of common app names (including Spanish) to commands
APP_MAP = {
    # English names
    "whatsapp": {"cmd": "start whatsapp:"},
    "spotify": {"cmd": "start spotify:"},
    "chrome": {"cmd": "start chrome"},
    "browser": {"cmd": "start http://google.com"},
    "calculator": {"cmd": "calc"},
    "notepad": {"cmd": "notepad"},
    "excel": {"cmd": "start excel"},
    "word": {"cmd": "start winword"},
    # Spanish names
    "calculadora": {"cmd": "calc"},
    "bloc de notas": {"cmd": "notepad"},
    "notas": {"cmd": "notepad"},
    "navegador": {"cmd": "start http://google.com"},
    "explorador": {"cmd": "explorer"},
}

async def execute_system_command(state: AgentState) -> AgentState:
    """Execute system level commands like opening apps."""
    intent_data = state.get("current_intent", {})
    intent_type = intent_data.get("intent", "")  # Changed from "action" to "intent"
    
    # Get entities - they might be in current_intent or in state["entities"]
    entities = intent_data.get("entities", {}) or state.get("entities", {})
    app_name = entities.get("app_name", "").lower().strip()
    
    logger.info("system_command", intent=intent_type, app=app_name, entities=entities)
    
    result_msg = ""
    
    if intent_type == "open_app" and app_name:
        if app_name in APP_MAP:
            cmd_info = APP_MAP[app_name]
            
            try:
                # Execute command
                cmd = cmd_info.get("cmd", f"start {app_name}")
                logger.info(f"Executing command: {cmd}")
                subprocess.Popen(cmd, shell=True)
                result_msg = f"Abriendo {app_name}..."
            except Exception as e:
                logger.error("failed_to_open_app", error=str(e))
                result_msg = f"Tuve un error al intentar abrir {app_name}."
        else:
            # Try to open with generic 'start' command
            try:
                subprocess.Popen(f"start {app_name}", shell=True)
                result_msg = f"Intentando abrir {app_name}..."
            except Exception as e:
                result_msg = f"No sé cómo abrir '{app_name}' todavía."
            
    if not result_msg:
        result_msg = "No entendí qué aplicación querés abrir. Decime el nombre de la app."
    
    # Set response_text so it's used by respond node
    return {
        **state,
        "response_text": result_msg,
        "task_status": "COMPLETED",
        "action_result": {"message": result_msg},
        "messages": state.get("messages", []) + [{
            "role": "assistant",
            "content": result_msg
        }],
    }

