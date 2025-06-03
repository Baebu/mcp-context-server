#!/usr/bin/env tsx
/**
 * Debug Embedding Service Issue
 */

import 'reflect-metadata';
import { Container } from 'inversify';
import { loadConfig } from '../src/infrastructure/config/config-loader.js';
import { DatabaseAdapter } from '../src/infrastructure/adapters/database.adapter.js';
import { EmbeddingService } from '../src/application/services/embedding.service.js';
import { SemanticDatabaseExtension } from '../src/infrastructure/adapters/semantic-database.extension.js';

console.log('🔍 Debugging Embedding Service Issue...');

try {
  const config = await loadConfig();
  
  // Set up container like the real application
  const container = new Container();
  container.bind('Config').toConstantValue(config);
  container.bind('DatabaseHandler').to(DatabaseAdapter).inSingletonScope();
  container.bind('EmbeddingService').to(EmbeddingService).inSingletonScope();
  
  console.log('\n🏗️ Testing Container Setup...');
  
  // Test database handler
  const db = container.get('DatabaseHandler') as any;
  console.log('  ✅ Database handler created');
  
  // Test embedding service
  const embeddingService = container.get('EmbeddingService') as EmbeddingService;
  console.log('  ✅ Embedding service created');
  
  // Initialize embedding service
  console.log('\n🚀 Initializing Embedding Service...');
  await embeddingService.initialize();
  console.log('  ✅ Embedding service initialized');
  
  // Test embedding generation
  console.log('\n🧪 Testing Embedding Generation...');
  const testText = 'This is a test for embedding generation';
  const embedding = await embeddingService.generateEmbedding(testText);
  console.log(`  ✅ Generated embedding with ${embedding.length} dimensions`);
  
  // Test semantic database extension with the container database
  console.log('\n🔧 Testing Semantic Database Extension...');
  const dbInstance = (db as any).db;
  const semanticDb = new SemanticDatabaseExtension(dbInstance);
  
  await semanticDb.storeSemanticContext(
    'debug:container:test',
    { test: 'container semantic test' },
    'test',
    embedding,
    ['container', 'test']
  );
  console.log('  ✅ Semantic storage via container database successful');
  
  // Clean up
  dbInstance.prepare('DELETE FROM context_items WHERE key = ?').run('debug:container:test');
  console.log('  ✅ Cleanup completed');
  
  console.log('\n✅ All container components working correctly');
  
} catch (error) {
  console.error('❌ Debug failed:', error);
  process.exit(1);
}
