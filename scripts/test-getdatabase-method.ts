#!/usr/bin/env tsx
/**
 * Test getDatabaseInstance() Method
 */

import 'reflect-metadata';
import { Container } from 'inversify';
import { loadConfig } from '../src/infrastructure/config/config-loader.js';
import { DatabaseAdapter } from '../src/infrastructure/adapters/database.adapter.js';

console.log('🔍 Testing getDatabaseInstance() Method...');

try {
  const config = await loadConfig();
  
  // Create database adapter exactly like the system does
  const container = new Container();
  container.bind('Config').toConstantValue(config);
  container.bind('DatabaseHandler').to(DatabaseAdapter).inSingletonScope();
  
  const db = container.get('DatabaseHandler') as any;
  
  console.log('\n🧪 Testing getDatabaseInstance() method...');
  
  // Test the new method
  const dbInstance = db.getDatabaseInstance();
  console.log('  ✅ getDatabaseInstance() method works');
  
  // Test the database instance
  const columns = dbInstance.prepare('PRAGMA table_info(context_items)').all();
  console.log(`  ✅ Database instance accessible, ${columns.length} columns found`);
  
  // Check for embedding column specifically
  const embeddingColumn = columns.find((col: any) => col.name === 'embedding');
  if (embeddingColumn) {
    console.log('  ✅ Embedding column found via getDatabaseInstance()');
  } else {
    console.log('  ❌ Embedding column NOT found via getDatabaseInstance()');
  }
  
  // Test a simple query using the instance
  const testQuery = dbInstance.prepare('SELECT COUNT(*) as count FROM context_items WHERE embedding IS NULL');
  const result = testQuery.get() as { count: number };
  console.log(`  ✅ Query successful: ${result.count} items without embeddings`);
  
  console.log('\n✅ getDatabaseInstance() method test complete - method works correctly');
  
} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
