-- Migration: Add vector storage capabilities and enhanced context management
-- Version: 002_vector_storage_and_enhanced_context
-- Date: 2025-06-02

-- First, create migrations table if it doesn't exist
CREATE TABLE IF NOT EXISTS migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add vector storage capabilities to context_items table (existing table)
ALTER TABLE context_items ADD COLUMN embedding_vector BLOB;
ALTER TABLE context_items ADD COLUMN relevance_score REAL DEFAULT 0.0;
ALTER TABLE context_items ADD COLUMN access_count INTEGER DEFAULT 0;
ALTER TABLE context_items ADD COLUMN last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Create context_blocks table for chunked content processing
CREATE TABLE IF NOT EXISTS context_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  context_id INTEGER REFERENCES context_items(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding_vector BLOB,
  embedding_json TEXT, -- JSON representation for SQLite vector search
  token_count INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  block_index INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create sessions table for enhanced session management
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  is_active INTEGER DEFAULT 1
);

-- Create context_relationships for semantic relationships
CREATE TABLE IF NOT EXISTS context_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_context_id INTEGER REFERENCES context_items(id) ON DELETE CASCADE,
  target_context_id INTEGER REFERENCES context_items(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  similarity_score REAL DEFAULT 0.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_context_id, target_context_id, relationship_type)
);

-- Create plugin_registry for dynamic tool management
CREATE TABLE IF NOT EXISTS plugin_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  metadata JSON NOT NULL,
  enabled INTEGER DEFAULT 0,
  config JSON,
  installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME
);

-- Add indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_context_items_relevance ON context_items(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_context_items_access ON context_items(access_count DESC, last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_priority ON context_blocks(context_id, priority DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_embedding ON context_blocks(context_id) WHERE embedding_vector IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON context_relationships(source_context_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON context_relationships(target_context_id);
CREATE INDEX IF NOT EXISTS idx_plugins_enabled ON plugin_registry(enabled, name);

-- Update existing context_items table to have better performance
CREATE INDEX IF NOT EXISTS idx_context_items_type ON context_items(type);
CREATE INDEX IF NOT EXISTS idx_context_items_created ON context_items(created_at DESC);

-- Create backup_metadata table for enhanced backup system
CREATE TABLE IF NOT EXISTS backup_metadata (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  backup_type TEXT NOT NULL, -- 'manual', 'auto', 'emergency'
  reason TEXT,
  file_path TEXT,
  checksum TEXT,
  size_bytes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  restored_at DATETIME,
  is_valid INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_backups_session ON backup_metadata(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_type ON backup_metadata(backup_type, created_at DESC);

-- Record this migration as applied
INSERT OR REPLACE INTO migrations (version, name, applied_at) 
VALUES (2, '002_vector_storage_and_enhanced_context', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS backup_metadata (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  backup_type TEXT NOT NULL, -- 'manual', 'auto', 'emergency'
  reason TEXT,
  file_path TEXT,
  checksum TEXT,
  size_bytes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  restored_at DATETIME,
  is_valid INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_backups_session ON backup_metadata(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_type ON backup_metadata(backup_type, created_at DESC);

-- Add version tracking
INSERT OR REPLACE INTO migrations (version, name, applied_at) 
VALUES (2, '002_vector_storage_and_enhanced_context', CURRENT_TIMESTAMP);
