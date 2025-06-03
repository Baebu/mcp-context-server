#!/usr/bin/env tsx
/**
 * Simple Phase 1 Migration Application
 * Directly applies Phase 1 enhancements to existing database
 */

import Database from 'better-sqlite3';

console.log('🚀 Applying Phase 1 Database Enhancements...');

function createMigration(): void {
  const db = new Database('./data/context.db');
  db.pragma('journal_mode = WAL');
  
  try {
    // Create migrations table
    console.log('1️⃣ Creating migrations table...');
    db.exec('CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    console.log('✅ Migrations table created');
    
    // Add new columns to context_items if they don't exist
    console.log('2️⃣ Enhancing context_items table...');
    try {
      db.exec('ALTER TABLE context_items ADD COLUMN relevance_score REAL DEFAULT 0.0');
      console.log('✅ Added relevance_score column');
    } catch (e) {
      console.log('⚠️ relevance_score column already exists');
    }
    
    try {
      db.exec('ALTER TABLE context_items ADD COLUMN access_count INTEGER DEFAULT 0');
      console.log('✅ Added access_count column');
    } catch (e) {
      console.log('⚠️ access_count column already exists');
    }
    
    // Create new tables
    console.log('3️⃣ Creating new Phase 1 tables...');
    
    // Context blocks table
    db.exec(`CREATE TABLE IF NOT EXISTS context_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      context_id TEXT,
      content TEXT NOT NULL,
      embedding_vector BLOB,
      embedding_json TEXT,
      token_count INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('✅ Created context_blocks table');
    
    // Sessions table
    db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )`);
    console.log('✅ Created sessions table');
    
    // Context relationships table
    db.exec(`CREATE TABLE IF NOT EXISTS context_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_context_id TEXT,
      target_context_id TEXT,
      relationship_type TEXT NOT NULL,
      similarity_score REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('✅ Created context_relationships table');
    
    // Plugin registry table
    db.exec(`CREATE TABLE IF NOT EXISTS plugin_registry (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      metadata JSON NOT NULL,
      enabled INTEGER DEFAULT 0,
      installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('✅ Created plugin_registry table');
    
    // Create indexes
    console.log('4️⃣ Creating performance indexes...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_context_items_type ON context_items(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_blocks_priority ON context_blocks(context_id, priority DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, last_activity DESC)');
    console.log('✅ Created performance indexes');
    
    // Record migration
    console.log('5️⃣ Recording migration...');
    db.exec("INSERT OR REPLACE INTO migrations (version, name, applied_at) VALUES (2, 'phase1_enhancements', CURRENT_TIMESTAMP)");
    console.log('✅ Migration recorded');
    
    db.close();
    
    console.log('\\n🎉 Phase 1 Database Enhancement Complete!');
    console.log('📋 Summary:');
    console.log('  ✅ Migrations table created');
    console.log('  ✅ Context_items table enhanced');
    console.log('  ✅ 4 new tables created');
    console.log('  ✅ Performance indexes added');
    console.log('  ✅ Migration recorded');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    db.close();
    process.exit(1);
  }
}

createMigration();
