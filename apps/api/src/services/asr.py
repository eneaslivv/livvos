"""
ASR Service (Speech-to-Text)
============================
Audio transcription using Deepgram (streaming) and Whisper (batch).
"""
from typing import Optional, Dict, Any
import structlog
from deepgram import DeepgramClient
from openai import AsyncOpenAI
import io

from src.config import settings

logger = structlog.get_logger()


async def transcribe_audio(audio_data: bytes, language: str = "es") -> str:
    """
    Transcribe audio using Whisper API (batch processing).
    
    Good for final transcription after user stops speaking.
    """
    try:
        if not settings.OPENAI_API_KEY:
             logger.error("OPENAI_API_KEY is missing in settings")
        
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        
        # Create a file-like object from bytes
        audio_file = io.BytesIO(audio_data)
        audio_file.name = "audio.webm"
        
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language=language,
        )
        
        return response.text
        
    except Exception as e:
        logger.error("Whisper transcription failed", error=str(e))
        # Fallback to Deepgram
        return await transcribe_audio_deepgram(audio_data, language)


async def transcribe_audio_deepgram(audio_data: bytes, language: str = "es") -> str:
    """
    Transcribe audio using Deepgram API.
    """
    logger.info("Attempting Deepgram transcription", audio_bytes=len(audio_data), language=language)
    try:
        # Pass api_key as keyword argument to avoid positional argument mismatch
        client = DeepgramClient(api_key=settings.DEEPGRAM_API_KEY)
        
        # options = PrerecordedOptions(
        #     model="nova-2",
        #     language=language,
        #     smart_format=True,
        #     punctuate=True,
        # )
        
        # Using dict instead of typed options to avoid import issues
        options = {
            "model": "nova-2",
            "language": language,
            "smart_format": True,
            "punctuate": True,
        }
        
        # Prepare source
        source = {"buffer": audio_data, "mimetype": "audio/webm"} # Assuming webm as default mimetype
        
        logger.info(f"Sending audio to Deepgram ({len(audio_data)} bytes)...")
        
        response = await client.listen.prerecorded.v("1").transcribe_file(
            source, 
            options,
            timeout=30 # Add timeout to prevent hanging
        )
        
        logger.info("Deepgram response received")
        # logger.debug(f"Raw response: {response}") # Uncomment for detailed debugging
        
        # Extract transcript
        transcript = response.results.channels[0].alternatives[0].transcript
        logger.info("Deepgram transcription successful", transcript=transcript)
        return transcript
        
    except Exception as e:
        logger.error("Deepgram transcription failed", error=str(e))
        return ""


async def transcribe_audio_streaming(audio_chunk: bytes) -> Optional[Dict[str, Any]]:
    """
    Process an audio chunk for streaming transcription.
    
    Returns partial or final transcription results.
    
    Note: Full streaming implementation requires maintaining a Deepgram
    live connection. This is a simplified version.
    """
    try:
        # For streaming, we'd typically maintain a persistent connection
        # and send chunks to it. For this MVP, we'll batch small chunks.
        
        # Simple implementation: transcribe each chunk
        # In production, use Deepgram's LiveTranscription API
        
        if len(audio_chunk) < 1000:
            # Too small, buffer it
            return None
        
        transcript = await transcribe_audio_deepgram(audio_chunk)
        
        if transcript:
            return {
                "text": transcript,
                "is_final": True,  # In real streaming, this would be per-utterance
            }
        
        return None
        
    except Exception as e:
        logger.error("Streaming transcription error", error=str(e))
        return None
