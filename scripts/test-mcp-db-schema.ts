#!/usr/bin/env tsx
/**
 * Test MCP Database Connection Schema
 */

import 'reflect-metadata';
import { Container } from 'inversify';
import { loadConfig } from '../src/infrastructure/config/config-loader.js';
import { DatabaseAdapter } from '../src/infrastructure/adapters/database.adapter.js';

console.log('🔍 Testing MCP Database Connection Schema...');

try {
  const config = await loadConfig();
  
  // Create database adapter EXACTLY like the MCP server does
  const container = new Container();
  container.bind('Config').toConstantValue(config);
  
  const db = container.get(DatabaseAdapter);
  
  console.log('\n🧪 Testing through DatabaseAdapter...');
  
  // Test getting the database instance
  const dbInstance = (db as any).getDatabaseInstance();
  console.log('  ✅ Got database instance via getDatabaseInstance()');
  
  // Check schema using the same database instance
  const columns = dbInstance.prepare('PRAGMA table_info(context_items)').all();
  console.log(`  ✅ Found ${columns.length} columns in context_items`);
  
  const embeddingColumn = columns.find((col: any) => col.name === 'embedding');
  console.log(`  ${embeddingColumn ? '✅' : '❌'} Embedding column: ${embeddingColumn ? 'EXISTS' : 'NOT FOUND'}`);
  
  // Test a direct INSERT with embedding column
  console.log('\n🔧 Testing direct INSERT with embedding column...');
  try {
    const testInsert = dbInstance.prepare(`
      INSERT OR REPLACE INTO context_items
      (key, value, type, embedding, semantic_tags, context_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    
    testInsert.run(
      'test:mcp:direct-insert',
      JSON.stringify({ test: 'direct insert via MCP database' }),
      'test',
      JSON.stringify([0.1, 0.2, 0.3]),
      JSON.stringify(['test', 'mcp']),
      'test'
    );
    
    console.log('  ✅ Direct INSERT with embedding successful');
    
    // Clean up
    dbInstance.prepare('DELETE FROM context_items WHERE key = ?').run('test:mcp:direct-insert');
    
  } catch (error) {
    console.log('  ❌ Direct INSERT failed:', error);
  }
  
  console.log('\n✅ MCP Database Connection Schema test complete');
  
} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
