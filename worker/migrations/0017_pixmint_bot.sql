-- Migration 0017: PIXMINT BOT 3.0 Database Schema
-- Provides session persistence, role-isolated chat messages, knowledge chunk index,
-- suggested questions catalog, unanswered questions triage, feedback, and audit logs.

CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_role TEXT NOT NULL CHECK(user_role IN ('engineer', 'draughtsman', 'student', 'admin', 'guest')),
    title TEXT NOT NULL DEFAULT 'New Conversation',
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_role ON chat_sessions(user_role);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    sender TEXT NOT NULL CHECK(sender IN ('user', 'bot', 'system')),
    content TEXT NOT NULL,
    sources_json TEXT, -- JSON array of ChatSource objects
    model_name TEXT,
    latency_ms INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    allowed_roles_json TEXT NOT NULL, -- JSON array of allowed roles
    content TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    section_title TEXT NOT NULL,
    content TEXT NOT NULL,
    allowed_roles_json TEXT NOT NULL,
    keywords TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(doc_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc ON knowledge_chunks(doc_id);

CREATE TABLE IF NOT EXISTS suggested_questions (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK(role IN ('engineer', 'draughtsman', 'student', 'admin', 'guest')),
    label TEXT NOT NULL,
    prompt TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'help_outline',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suggested_questions_role ON suggested_questions(role, sort_order ASC);

CREATE TABLE IF NOT EXISTS bot_config (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS unanswered_questions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_role TEXT NOT NULL,
    query TEXT NOT NULL,
    intent_category TEXT,
    failure_reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_feedback (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating IN (-1, 1)),
    feedback_text TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);
