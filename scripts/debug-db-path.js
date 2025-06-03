#!/usr/bin/env tsx
import { loadConfig } from '../src/infrastructure/config/config-loader.js';
import Database from 'better-sqlite3';
console.log('🔍 Debugging Database Path Issue...');
try {
    const config = await loadConfig();
    console.log('\n📋 Configuration Database Path:');
    console.log(`  • Config path: ${config.database.path}`);
    console.log('\n🧪 Testing Config Database...');
    try {
        const db = new Database(config.database.path);
        const columns = db.prepare('PRAGMA table_info(context_items)').all();
        console.log('  • Context_Items columns:');
        columns.forEach((col) => {
            console.log(`    - ${col.name} (${col.type})`);
        });
        console.log('\n🔧 Testing Embedding Column Access...');
        try {
            const testQuery = db.prepare('SELECT COUNT(*) as count FROM context_items WHERE embedding IS NULL');
            const result = testQuery.get();
            console.log(`  ✅ Embedding column accessible, ${result.count} items without embeddings`);
        }
        catch (error) {
            console.log(`  ❌ Embedding column access failed: ${error}`);
        }
        db.close();
    }
    catch (error) {
        console.log(`  ❌ Config database access failed: ${error}`);
    }
    console.log('\n🧪 Testing Hardcoded Path (./data/context.db)...');
    try {
        const db2 = new Database('./data/context.db');
        const columns2 = db2.prepare('PRAGMA table_info(context_items)').all();
        console.log(`  • Found ${columns2.length} columns in hardcoded path`);
        db2.close();
    }
    catch (error) {
        console.log(`  ❌ Hardcoded path failed: ${error}`);
    }
    console.log('\n✅ Database path debug complete');
}
catch (error) {
    console.error('❌ Debug failed:', error);
    process.exit(1);
}
