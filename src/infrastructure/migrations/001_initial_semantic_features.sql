-- Migration: Initial semantic features for context_items table
-- File: src/infrastructure/migrations/001_initial_semantic_features.sql
-- Description: Adds columns for vector embeddings, semantic tags, and relationships
-- This migration corresponds to the original '001_add_semantic_columns.sql' from the root migrations folder.

-- Add semantic columns to existing context_items table
-- Use safe column addition approach since IF NOT EXISTS is not supported in older SQLite versions
ALTER TABLE context_items ADD COLUMN embedding TEXT; -- JSON array of floats for vector similarity
ALTER TABLE context_items ADD COLUMN semantic_tags TEXT; -- JSON array of extracted keywords/tags
ALTER TABLE context_items ADD COLUMN context_type TEXT DEFAULT 'generic'; -- Enhanced type classification
ALTER TABLE context_items ADD COLUMN relationships TEXT; -- JSON relationships to other context items

-- Create indexes for efficient semantic search
CREATE INDEX IF NOT EXISTS idx_context_type ON context_items(context_type);
CREATE INDEX IF NOT EXISTS idx_semantic_tags ON context_items(semantic_tags);
CREATE INDEX IF NOT EXISTS idx_embedding_exists ON context_items(embedding) WHERE embedding IS NOT NULL;

-- Create table for semantic search cache (for performance)
CREATE TABLE IF NOT EXISTS semantic_cache (
  query_hash TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  results TEXT NOT NULL, -- JSON array of results
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_semantic_cache_expires ON semantic_cache(expires_at);

-- Create table for embedding model metadata
CREATE TABLE IF NOT EXISTS embedding_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  version TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 0
) WITHOUT ROWID;

-- Insert default embedding model configuration
INSERT OR REPLACE INTO embedding_models (id, name, dimensions, version, is_active)
VALUES ('simple-hash-384', 'Simple Hash Embedding', 384, '1.0.0', 1);

-- Create table for semantic relationships between context items
CREATE TABLE IF NOT EXISTS context_relationships (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  target_key TEXT NOT NULL,
  relationship_type TEXT NOT NULL, -- 'similar', 'related', 'child', 'parent', etc.
  similarity_score REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_key) REFERENCES context_items(key) ON DELETE CASCADE,
  FOREIGN KEY (target_key) REFERENCES context_items(key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_relationship_source ON context_relationships(source_key);
CREATE INDEX IF NOT EXISTS idx_relationship_target ON context_relationships(target_key);
CREATE INDEX IF NOT EXISTS idx_relationship_type ON context_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationship_similarity ON context_relationships(similarity_score DESC);

-- Create unique constraint to prevent duplicate relationships
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_relationship
ON context_relationships(source_key, target_key, relationship_type);
