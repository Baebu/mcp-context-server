#!/usr/bin/env tsx
/**
 * Debug script for dependency injection and database access
 */

import 'reflect-metadata';
import { container } from '../src/infrastructure/di/container.js';
import { ContainerInitializer } from '../src/infrastructure/di/container-initializer.js';
import { loadConfig } from '../src/infrastructure/config/config-loader.js';
import type { IDatabaseHandler } from '../src/core/interfaces/database.interface.js';

console.log('🔍 Debugging Database Access through DI Container...');

try {
  // Load configuration
  const config = await loadConfig();
  container.bind('Config').toConstantValue(config);
  
  // Initialize DI container
  await ContainerInitializer.initialize(container);
  
  console.log('\n📋 Testing Database Access through DI...');
  
  // Get database handler from container
  const db = container.get('DatabaseHandler') as IDatabaseHandler;
  console.log('✅ Database handler retrieved from container');
  
  // Check if it has the getDatabase method
  if (typeof (db as any).getDatabase === 'function') {
    console.log('✅ getDatabase method exists');
    
    const dbInstance = (db as any).getDatabase();
    console.log('✅ Database instance retrieved');
    
    // Test table schema through DI
    console.log('\n📋 Schema through DI:');
    const schema = dbInstance.prepare("PRAGMA table_info(context_items)").all();
    schema.forEach((col: any) => {
      console.log(`  • ${col.name} (${col.type})`);
    });
    
    // Test if we can access the embedding column
    console.log('\n🧪 Testing embedding column access...');
    const testStmt = dbInstance.prepare(`
      INSERT OR REPLACE INTO context_items
      (key, value, type, embedding)
      VALUES (?, ?, ?, ?)
    `);
    
    testStmt.run('test:di:embedding', '{"test": "di"}', 'test', '{"embedding": [0.1, 0.2]}');
    console.log('✅ Embedding column accessible through DI');
    
  } else {
    console.log('❌ getDatabase method not found');
    console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(db)));
  }
  
  console.log('\n✅ Debug complete');
  
} catch (error) {
  console.error('❌ Debug failed:', error);
  if (error instanceof Error) {
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
}
