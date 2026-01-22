# Antigravity Voice - Agente de Voz Inteligente Multiplataforma

🎙️ Un asistente de voz inteligente multiplataforma con capacidades de agente conversacional.

## Stack Tecnológico

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Agente AI**: LangGraph + Claude 3.5 Sonnet
- **ASR**: Deepgram (streaming) / Whisper (batch)
- **TTS**: ElevenLabs
- **DB**: PostgreSQL (Supabase)
- **Cache**: Redis (Upstash)

### Frontend
- **Desktop**: Tauri 2.0 + React
- **Mobile**: React Native (Expo)
- **State**: Zustand
- **Styling**: Tailwind CSS

## Estructura del Proyecto

```
antigravity-voice/
├── apps/
│   ├── api/          # Backend FastAPI
│   ├── desktop/      # Tauri + React
│   └── mobile/       # React Native
├── packages/
│   ├── shared-types/ # TypeScript types compartidos
│   └── ui/           # Componentes UI compartidos
└── infra/            # Docker, configs
```

## Comenzar

### Prerrequisitos
- Node.js 18+
- pnpm 8+
- Python 3.11+
- Rust (para Tauri)

### Instalación

```bash
# Instalar dependencias
pnpm install

# Desarrollo
pnpm dev

# Solo backend
pnpm api:dev

# Solo desktop
pnpm desktop:dev
```

## Variables de Entorno

Copiar `.env.example` a `.env` y configurar:

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
DATABASE_URL=

# LLM
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Speech
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=

# Redis
REDIS_URL=
```

## Licencia

MIT
