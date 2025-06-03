#!/usr/bin/env tsx
import Database from 'better-sqlite3';
console.log('🔍 Inspecting Database Schema...');
try {
    const db = new Database('./data/context.db');
    const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `).all();
    console.log('\\n📋 All Tables:');
    tables.forEach((table) => {
        console.log(`  • ${table.name}`);
    });
    const migrationTables = ['migrations', 'context_blocks', 'sessions', 'context_relationships'];
    console.log('\\n🏗️ Context_Items Table Structure:');
    try {
        const contextsColumns = db.prepare('PRAGMA table_info(context_items)').all();
        if (contextsColumns.length > 0) {
            contextsColumns.forEach((col) => {
                console.log(`  • ${col.name} (${col.type})`);
            });
        }
        else {
            console.log('  ❌ context_items table not found');
        }
    }
    catch (error) {
        console.log('  ❌ Error reading context_items table:', error);
    }
    db.close();
    console.log('\\n✅ Database inspection complete');
}
catch (error) {
    console.error('❌ Database inspection failed:', error);
    process.exit(1);
}
