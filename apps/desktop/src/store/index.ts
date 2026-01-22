import { create } from 'zustand';

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error';

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
}

interface VoiceStore {
    // Connection
    isConnected: boolean;
    sessionId: string | null;

    // Voice state
    state: VoiceState;

    // Messages
    messages: Message[];

    // Current transcript (while speaking)
    transcript: string;

    // Actions
    setConnected: (connected: boolean) => void;
    setSessionId: (id: string) => void;
    setState: (state: VoiceState) => void;
    setTranscript: (text: string) => void;
    addMessage: (role: 'user' | 'assistant', content: string) => void;
    clearMessages: () => void;
    reset: () => void;
}

export const useVoiceStore = create<VoiceStore>((set) => ({
    // Initial state
    isConnected: false,
    sessionId: null,
    state: 'idle',
    messages: [],
    transcript: '',

    // Actions
    setConnected: (connected) => set({ isConnected: connected }),

    setSessionId: (id) => set({ sessionId: id }),

    setState: (state) => set({ state }),

    setTranscript: (text) => set({ transcript: text }),

    addMessage: (role, content) =>
        set((state) => ({
            messages: [
                ...state.messages,
                {
                    id: crypto.randomUUID(),
                    role,
                    content,
                    createdAt: new Date().toISOString(),
                },
            ],
        })),

    clearMessages: () => set({ messages: [] }),

    reset: () =>
        set({
            isConnected: false,
            sessionId: null,
            state: 'idle',
            messages: [],
            transcript: '',
        }),
}));
