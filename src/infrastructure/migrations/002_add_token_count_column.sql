-- Migration: Add token_count column to context_items table
-- File: src/infrastructure/migrations/002_add_token_count_column.sql
-- Description: Adds the token_count column to existing context_items table for token tracking

-- Add token_count column if it doesn't exist
ALTER TABLE context_items ADD COLUMN token_count INTEGER DEFAULT 0;

-- Add index for token_count
CREATE INDEX IF NOT EXISTS idx_context_token_count ON context_items(token_count);

-- Add other enhanced columns if they don't exist
ALTER TABLE context_items ADD COLUMN metadata TEXT;
ALTER TABLE context_items ADD COLUMN relationships TEXT;
ALTER TABLE context_items ADD COLUMN accessed_at TEXT DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE context_items ADD COLUMN access_count INTEGER DEFAULT 0;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_context_accessed ON context_items(accessed_at);
CREATE INDEX IF NOT EXISTS idx_context_access_count ON context_items(access_count);
CREATE INDEX IF NOT EXISTS idx_context_semantic_type ON context_items(context_type);

-- Create token tracking and budgeting tables
CREATE TABLE IF NOT EXISTS token_budgets (
  session_id TEXT PRIMARY KEY,
  total_tokens INTEGER DEFAULT 0,
  used_tokens INTEGER DEFAULT 0,
  remaining_tokens INTEGER DEFAULT 0,
  max_tokens INTEGER DEFAULT 200000,
  handoff_threshold INTEGER DEFAULT 180000,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS token_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  operation TEXT,
  context_key TEXT,
  tokens_used INTEGER,
  cumulative_tokens INTEGER,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES token_budgets(session_id)
);

CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage_log(session_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage_log(timestamp);

-- Create context relationships table
CREATE TABLE IF NOT EXISTS context_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  target_key TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  strength REAL DEFAULT 1.0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_key) REFERENCES context_items(key) ON DELETE CASCADE,
  FOREIGN KEY (target_key) REFERENCES context_items(key) ON DELETE CASCADE,
  UNIQUE(source_key, target_key, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_source ON context_relationships(source_key);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON context_relationships(target_key);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON context_relationships(relationship_type);
