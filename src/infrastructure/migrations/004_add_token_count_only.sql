-- Migration: Add missing token_count column
-- File: src/infrastructure/migrations/004_add_token_count_only.sql
-- Description: Adds only the missing token_count column that was causing the startup error

-- Add the missing columns that are actually needed
ALTER TABLE context_items ADD COLUMN token_count INTEGER DEFAULT 0;
ALTER TABLE context_items ADD COLUMN metadata TEXT;
ALTER TABLE context_items ADD COLUMN accessed_at TEXT;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_context_token_count ON context_items(token_count);
CREATE INDEX IF NOT EXISTS idx_context_accessed ON context_items(accessed_at);
CREATE INDEX IF NOT EXISTS idx_context_semantic_type ON context_items(context_type);
