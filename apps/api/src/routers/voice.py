"""
Voice WebSocket Router
======================
Real-time voice communication for agent mode.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Optional
import structlog
import json

from src.dependencies import get_redis
from src.agent.graph import agent
from src.services.asr import transcribe_audio
from src.services.tts import synthesize_speech

router = APIRouter()
logger = structlog.get_logger()


@router.websocket("/voice/{session_id}")
async def voice_websocket(
    websocket: WebSocket,
    session_id: str,
    user_id: Optional[str] = None  # TODO: Add auth
):
    """
    WebSocket endpoint for voice-based agent interaction.
    
    Protocol:
    - Client sends: Binary audio data (WebM/Opus or WAV)
    - Server sends: JSON messages and binary audio responses
    
    Message types:
    - {"type": "transcript", "text": "..."} - User's transcribed speech
    - {"type": "response", "text": "...", "task_status": "..."} - Agent response
    - {"type": "error", "message": "..."} - Error occurred
    - Binary data - Audio response (MP3)
    """
    await websocket.accept()
    logger.info("Voice WebSocket connected", session_id=session_id, user_id=user_id)
    
    # Initialize agent state
    state = {
        "user_id": user_id or "anonymous",
        "session_id": session_id,
        "messages": [],
        "current_intent": None,
        "task_status": "IDLE",
        "entities": {},
        "missing_entities": [],
        "response_text": "",
        "should_speak": True,
    }
    
    try:
        while True:
            # Receive audio data from client
            data = await websocket.receive()
            
            # Check for disconnect
            if data.get("type") == "websocket.disconnect":
                logger.info("Client disconnected gracefully", session_id=session_id)
                break
            
            if "bytes" in data:
                audio_data = data["bytes"]
                logger.info(f"Received audio data: {len(audio_data)} bytes", session_id=session_id)
                
                try:
                    # Speech-to-text
                    logger.info("Starting transcription...", session_id=session_id)
                    transcript = await transcribe_audio(audio_data)
                    
                    if transcript:
                        logger.info(f"Transcription result: '{transcript[:100]}'", session_id=session_id)
                    else:
                        logger.warning("Empty transcription result", session_id=session_id)
                    
                    if not transcript or not transcript.strip():
                        await websocket.send_json({
                            "type": "error",
                            "message": "No se pudo transcribir el audio. Intentá hablar más claro."
                        })
                        continue
                    
                    logger.info("Transcribed audio", text=transcript[:100])
                    
                    # Send transcription to client
                    await websocket.send_json({
                        "type": "transcript",
                        "text": transcript
                    })
                    
                    # Add user message to state
                    state["messages"].append({
                        "role": "user",
                        "content": transcript
                    })
                    
                    # CRITICAL: Set current_input for intent detection
                    state["current_input"] = transcript
                    state["response_text"] = ""  # Reset response for new turn
                    
                    # Run agent
                    result = await agent.ainvoke(
                        state,
                        config={"configurable": {"thread_id": session_id}}
                    )
                    state = result
                    
                    # Get response text
                    response_text = state.get("response_text", "")
                    if not response_text and state.get("messages"):
                        # Get last assistant message
                        for msg in reversed(state["messages"]):
                            if msg.get("role") == "assistant":
                                response_text = msg.get("content", "")
                                break
                    
                    # Send text response
                    await websocket.send_json({
                        "type": "response",
                        "text": response_text,
                        "task_status": state.get("task_status", "IDLE"),
                        "intent": state.get("current_intent")
                    })
                    
                    # Generate and send audio response
                    if response_text and state.get("should_speak", True):
                        audio_response = await synthesize_speech(response_text)
                        if audio_response:
                            await websocket.send_bytes(audio_response)
                    
                except Exception as e:
                    logger.error("Error processing voice", error=str(e))
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e)
                    })
            
            elif "text" in data:
                # Handle text commands (for debugging/testing)
                try:
                    command = json.loads(data["text"])
                    
                    if command.get("type") == "text_input":
                        # Process text directly without ASR
                        text = command.get("text", "")
                        state["messages"].append({
                            "role": "user",
                            "content": text
                        })
                        
                        result = await agent.ainvoke(
                            state,
                            config={"configurable": {"thread_id": session_id}}
                        )
                        state = result
                        
                        response_text = state.get("response_text", "")
                        await websocket.send_json({
                            "type": "response",
                            "text": response_text,
                            "task_status": state.get("task_status", "IDLE")
                        })
                        
                except json.JSONDecodeError:
                    pass
                    
    except WebSocketDisconnect:
        logger.info("Voice WebSocket disconnected", session_id=session_id)
        # TODO: Persist state to Redis/DB
    except Exception as e:
        logger.error("Voice WebSocket error", error=str(e))
        raise
