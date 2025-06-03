#!/usr/bin/env tsx
import 'reflect-metadata';
import { container } from '../src/infrastructure/di/container.js';
import { ContainerInitializer } from '../src/infrastructure/di/container-initializer.js';
import { loadConfig } from '../src/infrastructure/config/config-loader.js';
console.log('🔍 Testing MCP Database Connection...');
try {
    const config = await loadConfig();
    console.log('Database path from config:', config.database.path);
    container.bind('Config').toConstantValue(config);
    await ContainerInitializer.initialize(container);
    console.log('\n📋 Testing Database Access through MCP...');
    const db = container.get('DatabaseHandler');
    console.log('✅ Database handler retrieved from container');
    if (typeof db.getDatabase === 'function') {
        console.log('✅ getDatabase method exists');
        const dbInstance = db.getDatabase();
        console.log('✅ Database instance retrieved');
        console.log('\n📋 Schema through MCP DI:');
        const schema = dbInstance.prepare("PRAGMA table_info(context_items)").all();
        schema.forEach((col) => {
            console.log(`  • ${col.name} (${col.type})`);
        });
        console.log('\n🧪 Testing direct semantic insertion through MCP database...');
        const testStmt = dbInstance.prepare(`
      INSERT OR REPLACE INTO context_items
      (key, value, type, embedding, semantic_tags, context_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
        testStmt.run('test:mcp:semantic-direct', JSON.stringify({ test: 'MCP semantic test' }), 'test', JSON.stringify([0.4, 0.5, 0.6]), JSON.stringify(['mcp', 'semantic', 'test']), 'test');
        console.log('✅ Direct semantic insertion through MCP successful');
        console.log('\n🧪 Testing SemanticDatabaseExtension...');
        const { SemanticDatabaseExtension } = await import('../src/infrastructure/adapters/semantic-database.extension.js');
        const semanticDb = new SemanticDatabaseExtension(dbInstance);
        await semanticDb.storeSemanticContext('test:mcp:semantic-extension', { test: 'MCP semantic extension test' }, 'test', [0.7, 0.8, 0.9], ['mcp', 'extension', 'test']);
        console.log('✅ SemanticDatabaseExtension test successful');
    }
    else {
        console.log('❌ getDatabase method not found');
        console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(db)));
    }
    console.log('\n✅ MCP Database test complete');
}
catch (error) {
    console.error('❌ Test failed:', error);
    if (error instanceof Error) {
        console.error('Stack trace:', error.stack);
    }
    process.exit(1);
}
