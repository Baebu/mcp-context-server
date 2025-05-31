#!/usr/bin/env node

// diagnose-mcp.js
// Diagnostic script for MCP Context Server issues

import { promises as fs } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

async function diagnoseMCPServer() {
  console.log('🔍 MCP Context Server Diagnostic Tool');
  console.log('='.repeat(50));

  const issues = [];
  const fixes = [];

  // Check if data directory exists
  try {
    await fs.access('./data');
    console.log('✅ Data directory exists');
  } catch {
    console.log('❌ Data directory missing');
    issues.push('Data directory not found');
    fixes.push('Create data directory: mkdir -p data');
  }

  // Check database file and contents
  try {
    const dbPath = './data/context.db';
    await fs.access(dbPath);
    console.log('✅ Database file exists');

    // Check database contents
    const db = new Database(dbPath);

    // Check tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(`✅ Database tables: ${tables.map(t => t.name).join(', ')}`);

    // Check context items
    const contextCount = db.prepare('SELECT COUNT(*) as count FROM context_items').get();
    console.log(`📊 Context items in database: ${contextCount.count}`);

    if (contextCount.count > 0) {
      const contexts = db.prepare('SELECT key, type, length(value) as value_length FROM context_items').all();
      console.log('📋 Context items:');
      contexts.forEach(ctx => {
        console.log(`   - ${ctx.key} (type: ${ctx.type}, size: ${ctx.value_length} chars)`);
      });

      // Check for null values issue
      const nullValues = db.prepare("SELECT key FROM context_items WHERE value IS NULL OR value = 'null'").all();
      if (nullValues.length > 0) {
        console.log('❌ Found context items with null values:');
        nullValues.forEach(item => console.log(`   - ${item.key}`));
        issues.push('Context items have null values');
        fixes.push('Recreate contexts using correct parameter format');
      }
    }

    db.close();
  } catch (error) {
    console.log('❌ Database issue:', error.message);
    issues.push('Database access problem');
    fixes.push('Check database permissions and rebuild');
  }

  // Check build output
  try {
    await fs.access('./dist/index.js');
    console.log('✅ Built server exists');
  } catch {
    console.log('❌ Built server missing');
    issues.push('Server not built');
    fixes.push('Run: npm run build');
  }

  // Check for known problematic files
  const filesToCheck = [
    './src/application/tools/database-operations.tool.ts',
    './src/application/tools/smart-path.tool.ts',
    './src/infrastructure/adapters/database.adapter.ts'
  ];

  for (const file of filesToCheck) {
    try {
      const content = await fs.readFile(file, 'utf8');

      // Check for specific issues
      if (file.includes('database-operations.tool.ts')) {
        if (!content.includes('content: z.any().optional()')) {
          issues.push('Database operations tool needs backward compatibility');
          fixes.push('Update database-operations.tool.ts with backward compatibility');
        }
      }

      if (file.includes('smart-path.tool.ts')) {
        if (!content.includes('path_name: z.string().optional()')) {
          issues.push('Smart path tool needs backward compatibility');
          fixes.push('Update smart-path.tool.ts with backward compatibility');
        }
      }

      console.log(`✅ ${path.basename(file)} exists`);
    } catch {
      console.log(`❌ ${path.basename(file)} missing or unreadable`);
      issues.push(`${path.basename(file)} needs attention`);
    }
  }

  // Summary
  console.log('\n🏥 Diagnostic Summary');
  console.log('='.repeat(30));

  if (issues.length === 0) {
    console.log('✅ No issues detected!');
  } else {
    console.log('❌ Issues found:');
    issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));

    console.log('\n🔧 Recommended fixes:');
    fixes.forEach((fix, i) => console.log(`   ${i + 1}. ${fix}`));
  }

  console.log('\n📋 Next steps:');
  console.log('1. Apply the provided code fixes');
  console.log('2. Run: npm run build');
  console.log('3. Restart Claude Desktop');
  console.log('4. Test with the provided test cases');
}

diagnoseMCPServer().catch(console.error);
