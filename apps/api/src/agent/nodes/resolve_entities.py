"""
Resolve Entities Node
=====================
Try to resolve ambiguous entities (e.g., contact names).
"""
from src.agent.state import AgentState


async def resolve_entities(state: AgentState) -> AgentState:
    """
    Attempt to resolve ambiguous entities.
    
    For example, resolve "Juan" to a specific contact.
    If multiple matches found, set needs_user_disambiguation.
    """
    unresolved = state.get("unresolved_entities", [])
    entities = state.get("entities", {})
    resolved = state.get("resolved_entities", {})
    
    if not unresolved:
        return {
            **state,
            "needs_user_disambiguation": False,
        }
    
    # Process each unresolved entity
    disambiguation_options = []
    needs_disambiguation = False
    
    for entity_name in unresolved:
        entity_value = entities.get(entity_name)
        
        if entity_name == "recipient" and entity_value:
            # TODO: Look up in user's contacts
            # For now, we'll simulate contact lookup
            contacts = await lookup_contacts(state.get("user_id"), entity_value)
            
            if len(contacts) == 0:
                # No matches - need to clarify
                needs_disambiguation = True
                disambiguation_options.append({
                    "entity": entity_name,
                    "query": entity_value,
                    "matches": [],
                    "message": f"No encontré ningún contacto llamado '{entity_value}'. ¿A quién te referís?"
                })
            elif len(contacts) == 1:
                # Single match - resolve automatically
                resolved[entity_name] = contacts[0]
            else:
                # Multiple matches - need user to choose
                needs_disambiguation = True
                disambiguation_options.append({
                    "entity": entity_name,
                    "query": entity_value,
                    "matches": contacts,
                    "message": f"Encontré varios contactos: {', '.join([c.get('name', '') for c in contacts])}. ¿A cuál te referís?"
                })
    
    return {
        **state,
        "resolved_entities": resolved,
        "needs_user_disambiguation": needs_disambiguation,
        "disambiguation_options": disambiguation_options,
        "unresolved_entities": [] if not needs_disambiguation else unresolved,
    }


async def lookup_contacts(user_id: str, query: str) -> list:
    """
    Look up contacts matching the query.
    
    TODO: Implement actual database lookup.
    """
    # Placeholder - return empty for now
    # In production, this would query user_contacts table
    return []
