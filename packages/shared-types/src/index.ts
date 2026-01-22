/**
 * Shared Types for Antigravity Voice
 * ===================================
 * TypeScript types shared between frontend apps.
 */

// ==================== API Types ====================

export interface User {
    id: string;
    email: string;
    name?: string;
    preferredLanguage: string;
    voiceSettings: VoiceSettings;
}

export interface VoiceSettings {
    voiceId: string;
    speed: number;
    autoConfirm: boolean;
}

export interface ConversationSession {
    id: string;
    mode: 'agent' | 'dictation';
    title?: string;
    startedAt: string;
    endedAt?: string;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: string;
    audioUrl?: string;
}

// ==================== Agent Types ====================

export type TaskStatus =
    | 'IDLE'
    | 'INTENT_DETECTED'
    | 'NEEDS_CLARIFICATION'
    | 'WAITING_USER_INPUT'
    | 'READY_TO_EXECUTE'
    | 'EXECUTING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED';

export interface IntentData {
    intent: string;
    confidence: number;
    entities: Record<string, string>;
    missing?: string[];
}

export interface AgentResponse {
    type: 'transcript' | 'response' | 'error';
    text?: string;
    taskStatus?: TaskStatus;
    intent?: IntentData;
    message?: string;
}

// ==================== WebSocket Types ====================

export interface WSMessage {
    type: string;
    [key: string]: unknown;
}

export interface TranscriptMessage extends WSMessage {
    type: 'transcript';
    text: string;
}

export interface ResponseMessage extends WSMessage {
    type: 'response';
    text: string;
    taskStatus: TaskStatus;
    intent?: IntentData;
}

export interface ErrorMessage extends WSMessage {
    type: 'error';
    message: string;
}

export interface DictationPartialMessage extends WSMessage {
    type: 'partial';
    text: string;
}

export interface DictationFinalMessage extends WSMessage {
    type: 'final';
    text: string;
    fullTranscript: string;
}

// ==================== Voice State Types ====================

export type VoiceState =
    | 'idle'
    | 'connecting'
    | 'listening'
    | 'processing'
    | 'speaking'
    | 'error';

export interface VoiceSession {
    sessionId: string;
    state: VoiceState;
    messages: Message[];
    currentTranscript: string;
    isConnected: boolean;
}
