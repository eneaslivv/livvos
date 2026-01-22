"""
TTS Service (Text-to-Speech)
============================
Speech synthesis using ElevenLabs.
"""
from typing import Optional
import structlog
from elevenlabs.client import AsyncElevenLabs
from elevenlabs import VoiceSettings

from src.config import settings

logger = structlog.get_logger()


async def synthesize_speech(
    text: str,
    voice_id: Optional[str] = None,
    model: str = "eleven_multilingual_v2",
) -> Optional[bytes]:
    """
    Convert text to speech using ElevenLabs.
    
    Returns MP3 audio bytes.
    """
    if not text or not text.strip():
        return None
    
    try:
        client = AsyncElevenLabs(api_key=settings.ELEVENLABS_API_KEY)
        
        # Use provided voice or default
        voice = voice_id or settings.ELEVENLABS_VOICE_ID
        
        # Generate audio - note: convert() returns async generator directly, no await needed
        audio_generator = client.text_to_speech.convert(
            voice_id=voice,
            text=text,
            model_id=model,
            voice_settings=VoiceSettings(
                stability=0.5,
                similarity_boost=0.75,
                style=0.0,
                use_speaker_boost=True,
            ),
        )
        
        # Collect audio chunks
        audio_chunks = []
        async for chunk in audio_generator:
            audio_chunks.append(chunk)
        
        return b"".join(audio_chunks)
        
    except Exception as e:
        logger.error("ElevenLabs TTS failed", error=str(e))
        # Could add fallback to OpenAI TTS here
        return await synthesize_speech_openai(text)


async def synthesize_speech_openai(text: str) -> Optional[bytes]:
    """
    Fallback TTS using OpenAI.
    """
    try:
        from openai import AsyncOpenAI
        
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        
        response = await client.audio.speech.create(
            model="tts-1",
            voice="alloy",  # Options: alloy, echo, fable, onyx, nova, shimmer
            input=text,
        )
        
        return response.content
        
    except Exception as e:
        logger.error("OpenAI TTS fallback failed", error=str(e))
        return None
