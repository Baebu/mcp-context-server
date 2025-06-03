-- Semantic Database Migration
-- File: 002_add_semantic_columns.sql
-- Description: Add semantic search capabilities to context_items table

-- Add embedding storage column (JSON format for SQLite compatibility)
ALTER TABLE context_items ADD COLUMN embedding TEXT;

-- Add semantic tags for categorization
ALTER TABLE context_items ADD COLUMN semantic_tags TEXT;

-- Add context_type column (duplicate of type for semantic extension compatibility)
ALTER TABLE context_items ADD COLUMN context_type TEXT;

-- Add relevance scoring column
ALTER TABLE context_items ADD COLUMN relevance_score REAL DEFAULT 0.0;

-- Create indexes for semantic search performance
CREATE INDEX IF NOT EXISTS idx_context_embedding ON context_items(embedding) WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_context_semantic_tags ON context_items(semantic_tags) WHERE semantic_tags IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_context_relevance ON context_items(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_context_type_semantic ON context_items(context_type);

-- Create context relationships table for semantic connections
CREATE TABLE IF NOT EXISTS context_relationships (
  source_key TEXT NOT NULL,
  target_key TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  similarity_score REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_key, target_key, relationship_type),
  FOREIGN KEY (source_key) REFERENCES context_items(key) ON DELETE CASCADE,
  FOREIGN KEY (target_key) REFERENCES context_items(key) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_relationships_source ON context_relationships(source_key);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON context_relationships(target_key);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON context_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_similarity ON context_relationships(similarity_score DESC);
