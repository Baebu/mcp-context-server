#!/usr/bin/env node
// Quick Setup Script for Semantic Search
// File: scripts/setup-semantic.js

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

console.log('🚀 Setting up Semantic Search for context-savy-server...\n');

try {
  // 1. Install dependencies
  console.log('📦 Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Dependencies installed\n');

  // 2. Run database migration
  console.log('🗄️  Running database migration...');
  execSync('npm run migrate', { stdio: 'inherit' });
  console.log('✅ Database migration complete\n');

  // 3. Build the project
  console.log('🔨 Building the project...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Build complete\n');

  // 4. Run semantic tests to verify
  console.log('🧪 Running semantic search tests...');
  try {
    execSync('npm run test:semantic', { stdio: 'inherit' });
    console.log('✅ All semantic tests passed\n');
  } catch (error) {
    console.log('⚠️  Some tests may have failed, but setup is complete\n');
  }

  console.log('🎉 Semantic Search Setup Complete!\n');
  console.log('Next steps:');
  console.log('1. Start the server: npm run dev');
  console.log('2. Test semantic search: {"tool": "get_semantic_stats"}');
  console.log('3. Store semantic context: {"tool": "store_context_semantic", "key": "test", "value": "Hello semantic world!"}');
  console.log('4. Search semantically: {"tool": "semantic_search_context", "query": "hello world"}');
  console.log('\nFor more info, see SEMANTIC_SEARCH_GUIDE.md');

} catch (error) {
  console.error('❌ Setup failed:', error.message);
  console.log('\nTry manual steps:');
  console.log('1. npm install');
  console.log('2. npm run migrate');
  console.log('3. npm run build');
  console.log('4. npm run dev');
  process.exit(1);
}
