#!/usr/bin/env tsx
/**
 * Debug Semantic Storage Issue
 */

import Database from 'better-sqlite3';
import { SemanticDatabaseExtension } from '../src/infrastructure/adapters/semantic-database.extension.js';

console.log('🔍 Debugging Semantic Storage Issue...');

try {
  const db = new Database('./data/context.db');
  
  // Test 1: Check exact column names in context_items
  console.log('\n📋 Context_Items Table Schema:');
  const columns = db.prepare('PRAGMA table_info(context_items)').all();
  columns.forEach((col: any) => {
    console.log(`  • ${col.name} (${col.type}) - ${col.notnull ? 'NOT NULL' : 'NULLABLE'}`);
  });
  
  // Test 2: Try a simple insert with the exact columns we expect
  console.log('\n🧪 Testing Direct SQL Insert...');
  try {
    const testInsert = db.prepare(`
      INSERT OR REPLACE INTO context_items
      (key, value, type, embedding, semantic_tags, context_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    
    testInsert.run(
      'debug:test:direct-sql',
      JSON.stringify({ test: 'direct SQL insert' }),
      'test',
      JSON.stringify([0.1, 0.2, 0.3]),
      JSON.stringify(['test', 'debug']),
      'test'
    );
    
    console.log('  ✅ Direct SQL insert successful');
  } catch (error) {
    console.log('  ❌ Direct SQL insert failed:', error);
  }
  
  // Test 3: Test SemanticDatabaseExtension
  console.log('\n🔧 Testing SemanticDatabaseExtension...');
  try {
    const semanticDb = new SemanticDatabaseExtension(db);
    
    await semanticDb.storeSemanticContext(
      'debug:test:semantic-extension',
      { test: 'semantic extension' },
      'test',
      [0.4, 0.5, 0.6],
      ['semantic', 'test']
    );
    
    console.log('  ✅ Semantic extension successful');
  } catch (error) {
    console.log('  ❌ Semantic extension failed:', error);
  }
  
  // Test 4: Check what we stored
  // Test 4: Check what we stored
  console.log('\n📊 Verifying Stored Data...');
  const storedItems = db.prepare('SELECT key, type, embedding, semantic_tags FROM context_items WHERE key LIKE ?').all('debug:test:%');
  storedItems.forEach((item: any) => {
    console.log(`  • ${item.key}: ${item.type}, embedding: ${item.embedding ? 'YES' : 'NO'}, tags: ${item.semantic_tags ? 'YES' : 'NO'}`);
  });
  
  // Test 5: Clean up test data
  console.log('\n🧹 Cleaning up test data...');
  db.prepare('DELETE FROM context_items WHERE key LIKE ?').run('debug:test:%');
  db.prepare('DELETE FROM context_items WHERE key LIKE "debug:test:%"').run();
  
  db.close();
  console.log('\n✅ Debug complete');
  
} catch (error) {
  console.error('❌ Debug failed:', error);
  process.exit(1);
}
