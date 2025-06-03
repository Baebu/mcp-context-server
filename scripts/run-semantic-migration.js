// Manual Migration Runner for Semantic Features (ES Module version)
// Run with: node run-semantic-migration.js

import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';

async function runSemanticMigration() {
  console.log('🗄️ Starting Semantic Database Migration...');
  
  try {
    // Connect to database (adjust path as needed)
    const dbPath = path.join(process.cwd(), 'data', 'context.db');
    console.log(`📍 Database path: ${dbPath}`);
    
    const db = new Database(dbPath);
    
    // Enable WAL mode for safety
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    
    // Create migrations tracking table
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Check current schema
    console.log('🔍 Checking current schema...');
    const contextColumns = db.prepare('PRAGMA table_info(context_items)').all();
    console.log(`   Current context_items columns: ${contextColumns.length}`);
    
    const hasEmbedding = contextColumns.some(col => col.name === 'embedding');
    const hasSemanticTags = contextColumns.some(col => col.name === 'semantic_tags');
    
    if (hasEmbedding && hasSemanticTags) {
      console.log('✅ Semantic columns already exist!');
      db.close();
      return;
    }
    
    // Check if migration already applied
    const existing = db.prepare(
      'SELECT version FROM migrations WHERE version = ? AND name = ?'
    ).get(2, 'add_semantic_columns');
    
    if (existing) {
      console.log('✅ Migration already recorded as applied');
      db.close();
      return;
    }
    
    console.log('🔧 Applying semantic migration...');
    
    // Apply migration in transaction
    const transaction = db.transaction(() => {
      // Add semantic columns
      if (!hasEmbedding) {
        db.exec('ALTER TABLE context_items ADD COLUMN embedding TEXT');
        console.log('   ✓ Added embedding column');
      }
      
      if (!hasSemanticTags) {
        db.exec('ALTER TABLE context_items ADD COLUMN semantic_tags TEXT');
        console.log('   ✓ Added semantic_tags column');
      }
      
      // Add context_type column (for semantic extension compatibility)
      const hasContextType = contextColumns.some(col => col.name === 'context_type');
      if (!hasContextType) {
        db.exec('ALTER TABLE context_items ADD COLUMN context_type TEXT');
        console.log('   ✓ Added context_type column');
      }
      
      // Add relevance score column
      const hasRelevanceScore = contextColumns.some(col => col.name === 'relevance_score');
      if (!hasRelevanceScore) {
        db.exec('ALTER TABLE context_items ADD COLUMN relevance_score REAL DEFAULT 0.0');
        console.log('   ✓ Added relevance_score column');
      }
      
      // Create indexes for semantic search
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_context_embedding ON context_items(embedding) WHERE embedding IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_context_semantic_tags ON context_items(semantic_tags) WHERE semantic_tags IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_context_relevance ON context_items(relevance_score DESC);
        CREATE INDEX IF NOT EXISTS idx_context_type_semantic ON context_items(context_type);
      `);
      console.log('   ✓ Created semantic indexes');
      
      // Create context relationships table
      db.exec(`
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
      `);
      console.log('   ✓ Created context_relationships table');
      
      // Record migration as applied
      db.prepare(`
        INSERT INTO migrations (version, name) 
        VALUES (?, ?)
      `).run(2, 'add_semantic_columns');
      console.log('   ✓ Recorded migration');
    });
    
    transaction();
    
    // Verify migration
    const newColumns = db.prepare('PRAGMA table_info(context_items)').all();
    console.log(`🎉 Migration completed! New column count: ${newColumns.length}`);
    
    // List new columns
    const addedColumns = newColumns.filter(col => 
      ['embedding', 'semantic_tags', 'context_type', 'relevance_score'].includes(col.name)
    );
    console.log('   New semantic columns:', addedColumns.map(col => col.name).join(', '));
    
    db.close();
    console.log('✅ Semantic database migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runSemanticMigration();
