// Direct Database Schema Inspector
// Run with: node inspect-schema.js

import Database from 'better-sqlite3';
import path from 'path';

function inspectSchema() {
  console.log('🔍 Inspecting Database Schema...');
  
  try {
    const dbPath = path.join(process.cwd(), 'data', 'context.db');
    console.log(`📍 Database: ${dbPath}`);
    
    const db = new Database(dbPath);
    
    // Get context_items table structure
    console.log('\n📋 context_items table structure:');
    const columns = db.prepare('PRAGMA table_info(context_items)').all();
    columns.forEach(col => {
      console.log(`  ${col.cid}: ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    });
    
    // Check for semantic columns specifically
    const hasEmbedding = columns.some(col => col.name === 'embedding');
    const hasSemanticTags = columns.some(col => col.name === 'semantic_tags');
    const hasContextType = columns.some(col => col.name === 'context_type');
    const hasRelevanceScore = columns.some(col => col.name === 'relevance_score');
    
    console.log('\n🧠 Semantic columns status:');
    console.log(`  embedding: ${hasEmbedding ? '✅' : '❌'}`);
    console.log(`  semantic_tags: ${hasSemanticTags ? '✅' : '❌'}`);
    console.log(`  context_type: ${hasContextType ? '✅' : '❌'}`);
    console.log(`  relevance_score: ${hasRelevanceScore ? '✅' : '❌'}`);
    
    // Check if context_relationships table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const hasRelationshipsTable = tables.some(table => table.name === 'context_relationships');
    console.log(`  context_relationships table: ${hasRelationshipsTable ? '✅' : '❌'}`);
    
    // Check migrations table
    console.log('\n📝 Applied migrations:');
    try {
      const migrations = db.prepare('SELECT * FROM migrations ORDER BY version').all();
      if (migrations.length > 0) {
        migrations.forEach(migration => {
          console.log(`  v${migration.version}: ${migration.name} (${migration.applied_at})`);
        });
      } else {
        console.log('  No migrations recorded');
      }
    } catch (error) {
      console.log('  Migrations table does not exist');
    }
    
    // Show all tables
    console.log('\n📊 All database tables:');
    tables.forEach(table => {
      console.log(`  - ${table.name}`);
    });
    
    // Test a simple context query
    console.log('\n💾 Sample context items:');
    const contexts = db.prepare('SELECT key, type, created_at FROM context_items LIMIT 3').all();
    contexts.forEach(ctx => {
      console.log(`  - ${ctx.key} (${ctx.type || 'no type'}) - ${ctx.created_at}`);
    });
    
    db.close();
    console.log('\n✅ Schema inspection completed');
    
  } catch (error) {
    console.error('❌ Schema inspection failed:', error.message);
  }
}

inspectSchema();
