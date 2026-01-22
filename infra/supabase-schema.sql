-- ============================================================
-- Antigravity Voice - Database Schema
-- ============================================================
-- Execute this in Supabase SQL Editor: https://supabase.com/dashboard/project/svjtiktyepkoivmgkhro/sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy search

-- ==================== ENUM TYPES ====================

CREATE TYPE device_type AS ENUM ('desktop', 'mobile', 'web', 'wearable');
CREATE TYPE conversation_mode AS ENUM ('agent', 'dictation');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE task_status AS ENUM (
    'IDLE',
    'INTENT_DETECTED',
    'NEEDS_CLARIFICATION',
    'WAITING_USER_INPUT',
    'READY_TO_EXECUTE',
    'EXECUTING',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);
CREATE TYPE action_status AS ENUM ('success', 'failed', 'cancelled', 'pending');

-- ==================== TABLES ====================

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    preferred_language TEXT DEFAULT 'es' CHECK (preferred_language IN ('es', 'en')),
    voice_settings JSONB DEFAULT '{
        "voice_id": "default",
        "speed": 1.0,
        "auto_confirm": false
    }',
    timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Devices
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_type device_type NOT NULL,
    device_name TEXT,
    device_info JSONB DEFAULT '{}',
    push_token TEXT,
    is_active BOOLEAN DEFAULT true,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, device_name)
);

-- Conversation Sessions
CREATE TABLE conversation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    mode conversation_mode NOT NULL,
    title TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    
    CONSTRAINT valid_session_times CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    role message_role NOT NULL,
    content TEXT NOT NULL,
    audio_url TEXT,
    audio_duration_ms INTEGER,
    intent JSONB,
    tokens_used INTEGER,
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task States
CREATE TABLE task_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,
    status task_status NOT NULL DEFAULT 'IDLE',
    intent_data JSONB NOT NULL,
    entities JSONB DEFAULT '{}',
    missing_entities TEXT[] DEFAULT '{}',
    clarification_history JSONB DEFAULT '[]',
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Executed Actions
CREATE TABLE executed_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES task_states(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES conversation_sessions(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    action_params JSONB NOT NULL,
    result JSONB,
    status action_status NOT NULL DEFAULT 'pending',
    error_details TEXT,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- User Contacts
CREATE TABLE user_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    aliases TEXT[] DEFAULT '{}',
    phone TEXT,
    email TEXT,
    platform_ids JSONB DEFAULT '{}',
    is_favorite BOOLEAN DEFAULT false,
    last_contacted_at TIMESTAMPTZ,
    contact_frequency INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Preferences
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, key)
);

-- Reminders
CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_id UUID REFERENCES executed_actions(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    remind_at TIMESTAMPTZ NOT NULL,
    recurrence TEXT,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    notification_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notes
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_id UUID REFERENCES executed_actions(id) ON DELETE SET NULL,
    title TEXT,
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== INDEXES ====================

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;

-- Devices
CREATE INDEX idx_devices_user ON devices(user_id);
CREATE INDEX idx_devices_active ON devices(user_id, is_active) WHERE is_active = true;

-- Sessions
CREATE INDEX idx_sessions_user ON conversation_sessions(user_id);
CREATE INDEX idx_sessions_user_recent ON conversation_sessions(user_id, started_at DESC);
CREATE INDEX idx_sessions_active ON conversation_sessions(user_id) WHERE ended_at IS NULL;

-- Messages
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_session_time ON messages(session_id, created_at);

-- Tasks
CREATE INDEX idx_tasks_session ON task_states(session_id);
CREATE INDEX idx_tasks_status ON task_states(status) WHERE status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED');

-- Actions
CREATE INDEX idx_actions_user ON executed_actions(user_id);
CREATE INDEX idx_actions_user_recent ON executed_actions(user_id, executed_at DESC);
CREATE INDEX idx_actions_type ON executed_actions(action_type);

-- Contacts
CREATE INDEX idx_contacts_user ON user_contacts(user_id);
CREATE INDEX idx_contacts_name_search ON user_contacts USING gin(name gin_trgm_ops);
CREATE INDEX idx_contacts_aliases ON user_contacts USING gin(aliases);
CREATE INDEX idx_contacts_frequency ON user_contacts(user_id, contact_frequency DESC);

-- Reminders
CREATE INDEX idx_reminders_user ON reminders(user_id);
CREATE INDEX idx_reminders_pending ON reminders(remind_at) WHERE is_completed = false AND notification_sent = false;

-- Notes
CREATE INDEX idx_notes_user ON notes(user_id);

-- ==================== FUNCTIONS ====================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_task_states_updated_at
    BEFORE UPDATE ON task_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_contacts_updated_at
    BEFORE UPDATE ON user_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================== RLS POLICIES ====================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE executed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own data
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Devices policies
CREATE POLICY "Users can manage own devices" ON devices
    FOR ALL USING (auth.uid() = user_id);

-- Sessions policies
CREATE POLICY "Users can manage own sessions" ON conversation_sessions
    FOR ALL USING (auth.uid() = user_id);

-- Messages policies
CREATE POLICY "Users can view own messages" ON messages
    FOR SELECT USING (
        session_id IN (
            SELECT id FROM conversation_sessions WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own messages" ON messages
    FOR INSERT WITH CHECK (
        session_id IN (
            SELECT id FROM conversation_sessions WHERE user_id = auth.uid()
        )
    );

-- Task states policies
CREATE POLICY "Users can manage own tasks" ON task_states
    FOR ALL USING (
        session_id IN (
            SELECT id FROM conversation_sessions WHERE user_id = auth.uid()
        )
    );

-- Actions policies
CREATE POLICY "Users can manage own actions" ON executed_actions
    FOR ALL USING (auth.uid() = user_id);

-- Contacts policies
CREATE POLICY "Users can manage own contacts" ON user_contacts
    FOR ALL USING (auth.uid() = user_id);

-- Preferences policies
CREATE POLICY "Users can manage own preferences" ON user_preferences
    FOR ALL USING (auth.uid() = user_id);

-- Reminders policies
CREATE POLICY "Users can manage own reminders" ON reminders
    FOR ALL USING (auth.uid() = user_id);

-- Notes policies
CREATE POLICY "Users can manage own notes" ON notes
    FOR ALL USING (auth.uid() = user_id);

-- ==================== DONE ====================
-- Schema created successfully!
