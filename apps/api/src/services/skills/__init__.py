"""
Skills Module
=============
Skill definitions for executing actions.
"""
from typing import Optional, Dict, Any
from abc import ABC, abstractmethod


class BaseSkill(ABC):
    """Base class for all skills."""
    
    name: str
    description: str
    required_entities: list[str] = []
    optional_entities: list[str] = []
    
    @abstractmethod
    async def execute(self, user_id: str, entities: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the skill with given entities."""
        pass
    
    def validate_entities(self, entities: Dict[str, Any]) -> tuple[bool, list[str]]:
        """Validate that all required entities are present."""
        missing = [e for e in self.required_entities if e not in entities or not entities[e]]
        return len(missing) == 0, missing


class NotesSkill(BaseSkill):
    """Create and manage notes."""
    
    name = "create_note"
    description = "Create a new note"
    required_entities = ["note_content"]
    optional_entities = ["title", "tags"]
    
    async def execute(self, user_id: str, entities: Dict[str, Any]) -> Dict[str, Any]:
        # TODO: Implement actual note creation in database
        content = entities.get("note_content", "")
        title = entities.get("title", "Nota sin título")
        
        return {
            "success": True,
            "message": f"Guardé tu nota: '{title}'",
            "data": {
                "title": title,
                "content": content,
            }
        }


class ReminderSkill(BaseSkill):
    """Set reminders."""
    
    name = "set_reminder"
    description = "Create a reminder"
    required_entities = ["reminder_text", "datetime"]
    optional_entities = ["recurrence"]
    
    async def execute(self, user_id: str, entities: Dict[str, Any]) -> Dict[str, Any]:
        # TODO: Implement actual reminder creation with scheduler
        text = entities.get("reminder_text", "")
        when = entities.get("datetime", "")
        
        return {
            "success": True,
            "message": f"Te voy a recordar '{text}' {when}",
            "data": {
                "text": text,
                "datetime": when,
            }
        }


class MessageSkill(BaseSkill):
    """Send messages via various platforms."""
    
    name = "send_message"
    description = "Send a message to a contact"
    required_entities = ["recipient", "message_content"]
    optional_entities = ["platform"]
    
    async def execute(self, user_id: str, entities: Dict[str, Any]) -> Dict[str, Any]:
        # TODO: Implement actual message sending
        recipient = entities.get("recipient", "")
        content = entities.get("message_content", "")
        platform = entities.get("platform", "whatsapp")
        
        # Placeholder - would integrate with WhatsApp/Telegram API
        return {
            "success": True,
            "message": f"Mensaje enviado a {recipient} por {platform}",
            "data": {
                "recipient": recipient,
                "content": content,
                "platform": platform,
            }
        }


class TimerSkill(BaseSkill):
    """Set timers."""
    
    name = "set_timer"
    description = "Set a timer"
    required_entities = ["duration"]
    
    async def execute(self, user_id: str, entities: Dict[str, Any]) -> Dict[str, Any]:
        duration = entities.get("duration", "")
        
        return {
            "success": True,
            "message": f"Temporizador de {duration} activado",
            "data": {
                "duration": duration,
            }
        }


class SearchSkill(BaseSkill):
    """Search the web."""
    
    name = "search_web"
    description = "Search the internet"
    required_entities = ["query"]
    
    async def execute(self, user_id: str, entities: Dict[str, Any]) -> Dict[str, Any]:
        query = entities.get("query", "")
        
        # TODO: Implement actual web search
        return {
            "success": True,
            "message": f"Buscando: {query}",
            "data": {
                "query": query,
            }
        }


# Skill registry
SKILLS: Dict[str, BaseSkill] = {
    "create_note": NotesSkill(),
    "set_reminder": ReminderSkill(),
    "send_message": MessageSkill(),
    "set_timer": TimerSkill(),
    "search_web": SearchSkill(),
}


def get_skill(intent: str) -> Optional[BaseSkill]:
    """Get the skill handler for an intent."""
    return SKILLS.get(intent)
