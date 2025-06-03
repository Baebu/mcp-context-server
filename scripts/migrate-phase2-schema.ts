#!/usr/bin/env tsx
/**
 * Apply complete Phase 2 database schema migration
 */

import Database from 'better-sqlite3';

console.log('🚀 Applying Phase 2 Database Schema Migration...');

try {
  const db = new Database('./data/context.db');
  
  console.log('\n1️⃣ Checking current schema...');
  const currentSchema = db.prepare("PRAGMA table_info(context_items)").all();
  const existingColumns = currentSchema.map((col: any) => col.name);
  console.log('Existing columns:', existingColumns.join(', '));
  
  // Add missing semantic columns if they don't exist
  console.log('\n2️⃣ Adding missing semantic columns...');
  
  const columnsToAdd = [
    { name: 'embedding', type: 'TEXT', default: null },
    { name: 'semantic_tags', type: 'TEXT', default: null },
    { name: 'context_type', type: 'TEXT', default: "'generic'" },
    { name: 'relationships', type: 'TEXT', default: null },
    { name: 'relevance_score', type: 'REAL', default: '0.0' },
    { name: 'access_count', type: 'INTEGER', default: '0' },
    { name: 'last_accessed_at', type: 'DATETIME', default: 'CURRENT_TIMESTAMP' }
  ];
  
  for (const column of columnsToAdd) {
    if (!existingColumns.includes(column.name)) {
      try {
        const alterSql = `ALTER TABLE context_items ADD COLUMN ${column.name} ${column.type}${column.default ? ` DEFAULT ${column.default}` : ''}`;
        console.log(`Adding column: ${column.name}`);
        db.exec(alterSql);
        console.log(`✅ Added ${column.name} column`);
      } catch (error) {
        console.log(`⚠️ Column ${column.name} might already exist:`, error);
      }
    } else {
      console.log(`✅ Column ${column.name} already exists`);
    }
  }
  
  console.log('\n3️⃣ Creating Phase 2 performance indexes...');
  
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_context_embedding ON context_items(embedding) WHERE embedding IS NOT NULL',
    'CREATE INDEX IF NOT EXISTS idx_context_semantic_tags ON context_items(semantic_tags)',
    'CREATE INDEX IF NOT EXISTS idx_context_relevance ON context_items(relevance_score DESC)',
    'CREATE INDEX IF NOT EXISTS idx_context_access ON context_items(access_count DESC, last_accessed_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_context_type_enhanced ON context_items(context_type, relevance_score DESC)'
  ];
  
  for (const indexSql of indexes) {
    try {
      db.exec(indexSql);
      console.log('✅ Created performance index');
    } catch (error) {
      console.log('⚠️ Index creation:', error);
    }
  }
  
  console.log('\n4️⃣ Verifying final schema...');
  const finalSchema = db.prepare("PRAGMA table_info(context_items)").all();
  console.log('Final columns:');
  finalSchema.forEach((col: any) => {
    console.log(`  • ${col.name} (${col.type}) - ${col.notnull ? 'NOT NULL' : 'NULLABLE'}`);
  });
  
  console.log('\n5️⃣ Testing semantic storage...');
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO context_items
      (key, value, type, embedding, semantic_tags, context_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    
    stmt.run(
      'test:phase2:migration-test',
      JSON.stringify({ test: 'Phase 2 migration test' }),
      'test',
      JSON.stringify([0.1, 0.2, 0.3]),
      JSON.stringify(['phase2', 'migration', 'test']),
      'test'
    );
    
    console.log('✅ Semantic storage test successful');
  } catch (error) {
    console.log('❌ Semantic storage test failed:', error);
  }
  
  db.close();
  console.log('\n🎉 Phase 2 Database Migration Complete!');
  
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}
