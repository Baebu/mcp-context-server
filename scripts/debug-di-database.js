#!/usr/bin/env tsx
import 'reflect-metadata';
import { container } from '../src/infrastructure/di/container.js';
import { ContainerInitializer } from '../src/infrastructure/di/container-initializer.js';
import { loadConfig } from '../src/infrastructure/config/config-loader.js';
console.log('🔍 Debugging Database Access through DI Container...');
try {
    const config = await loadConfig();
    container.bind('Config').toConstantValue(config);
    await ContainerInitializer.initialize(container);
    console.log('\n📋 Testing Database Access through DI...');
    const db = container.get('DatabaseHandler');
    console.log('✅ Database handler retrieved from container');
    if (typeof db.getDatabase === 'function') {
        console.log('✅ getDatabase method exists');
        const dbInstance = db.getDatabase();
        console.log('✅ Database instance retrieved');
        console.log('\n📋 Schema through DI:');
        const schema = dbInstance.prepare("PRAGMA table_info(context_items)").all();
        schema.forEach((col) => {
            console.log(`  • ${col.name} (${col.type})`);
        });
        console.log('\n🧪 Testing embedding column access...');
        const testStmt = dbInstance.prepare(`
      INSERT OR REPLACE INTO context_items
      (key, value, type, embedding)
      VALUES (?, ?, ?, ?)
    `);
        testStmt.run('test:di:embedding', '{"test": "di"}', 'test', '{"embedding": [0.1, 0.2]}');
        console.log('✅ Embedding column accessible through DI');
    }
    else {
        console.log('❌ getDatabase method not found');
        console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(db)));
    }
    console.log('\n✅ Debug complete');
}
catch (error) {
    console.error('❌ Debug failed:', error);
    if (error instanceof Error) {
        console.error('Stack trace:', error.stack);
    }
    process.exit(1);
}
