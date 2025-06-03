#!/usr/bin/env tsx
/**
 * Debug Database Path Issue
 */

import { loadConfig } from '../src/infrastructure/config/config-loader.js';
import Database from 'better-sqlite3';

console.log('🔍 Debugging Database Path Issue...');

try {
  // Load the configuration exactly as the server does
  const config = await loadConfig();
  
  console.log('\n📋 Configuration Database Path:');
  console.log(`  • Config path: ${config.database.path}`);
  
  // Test the database from config
  console.log('\n🧪 Testing Config Database...');
  try {
    const db = new Database(config.database.path);
    
    // Check context_items table structure
    const columns = db.prepare('PRAGMA table_info(context_items)').all();
    console.log('  • Context_Items columns:');
    columns.forEach((col: any) => {
      console.log(`    - ${col.name} (${col.type})`);
    });
    
    // Test if embedding column exists by trying to access it
    console.log('\n🔧 Testing Embedding Column Access...');
    try {
      const testQuery = db.prepare('SELECT COUNT(*) as count FROM context_items WHERE embedding IS NULL');
      const result = testQuery.get() as { count: number };
      console.log(`  ✅ Embedding column accessible, ${result.count} items without embeddings`);
    } catch (error) {
      console.log(`  ❌ Embedding column access failed: ${error}`);
    }
    
    db.close();
  } catch (error) {
    console.log(`  ❌ Config database access failed: ${error}`);
  }
  
  // Also test the hardcoded path from our debug script
  console.log('\n🧪 Testing Hardcoded Path (./data/context.db)...');
  try {
    const db2 = new Database('./data/context.db');
    const columns2 = db2.prepare('PRAGMA table_info(context_items)').all();
    console.log(`  • Found ${columns2.length} columns in hardcoded path`);
    db2.close();
  } catch (error) {
    console.log(`  ❌ Hardcoded path failed: ${error}`);
  }
  
  console.log('\n✅ Database path debug complete');
  
} catch (error) {
  console.error('❌ Debug failed:', error);
  process.exit(1);
}
