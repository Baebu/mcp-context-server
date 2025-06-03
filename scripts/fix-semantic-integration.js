// Quick Fix for Semantic Database Integration
// Apply semantic columns directly to database adapter

import Database from 'better-sqlite3';
import path from 'path';

async function fixSemanticIntegration() {
  console.log('🔧 Applying Semantic Integration Fix...');
  
  try {
    const dbPath = path.join(process.cwd(), 'data', 'context.db');
    const db = new Database(dbPath);
    
    // Check if semantic integration is needed
    const columns = db.prepare('PRAGMA table_info(context_items)').all();
    const hasEmbedding = columns.some(col => col.name === 'embedding');
    
    if (!hasEmbedding) {
      console.log('❌ Semantic columns missing - this should not happen!');
      db.close();
      return;
    }
    
    console.log('✅ Semantic columns confirmed present');
    
    // Test if the database adapter can write semantic data
    const testKey = `integration-test-${Date.now()}`;
    
    try {
      // Test direct semantic insert (what the tools should be doing)
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO context_items
        (key, value, type, embedding, semantic_tags, context_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      
      const testEmbedding = JSON.stringify([0.1, 0.2, 0.3]);
      const testTags = JSON.stringify(['test', 'integration']);
      
      stmt.run(testKey, '"Test semantic integration"', 'test', testEmbedding, testTags, 'test');
      
      console.log('✅ Direct semantic insert successful');
      
      // Verify
      const stored = db.prepare('SELECT * FROM context_items WHERE key = ?').get(testKey);
      if (stored) {
        console.log('📊 Integration test result:');
        console.log(`  Has embedding: ${stored.embedding ? 'Yes' : 'No'}`);
        console.log(`  Has tags: ${stored.semantic_tags ? 'Yes' : 'No'}`);
        console.log(`  Context type: ${stored.context_type}`);
      }
      
      // Cleanup
      db.prepare('DELETE FROM context_items WHERE key = ?').run(testKey);
      
      console.log('🎉 Semantic integration is working at database level!');
      console.log('\n💡 The issue may be in the MCP tool layer or adapter integration.');
      
    } catch (error) {
      console.error('❌ Direct semantic insert failed:', error.message);
      console.log('\n🔍 This suggests a database-level issue.');
    }
    
    db.close();
    
  } catch (error) {
    console.error('❌ Fix attempt failed:', error.message);
  }
}

fixSemanticIntegration();
