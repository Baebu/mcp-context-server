#!/usr/bin/env node

/**
 * Quick Setup Script for MCP Context Server
 * This script helps new users get up and running quickly
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Setting up Context Savvy MCP...\n');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion < 18) {
  console.error('❌ Node.js 18.0.0 or higher is required');
  console.error('   Current version:', nodeVersion);
  console.error('   Please upgrade Node.js and try again');
  process.exit(1);
}

console.log('✅ Node.js version check passed');

// Create config directory if it doesn't exist
const configDir = path.join(path.dirname(__dirname), 'config');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
  console.log('✅ Created config directory');
}

// Create data directory if it doesn't exist
const dataDir = path.join(path.dirname(__dirname), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ Created data directory');
}

// Copy example config if server.yaml doesn't exist
const serverConfigPath = path.join(configDir, 'server.yaml');
const exampleConfigPath = path.join(configDir, 'server.example.yaml');

if (!fs.existsSync(serverConfigPath) && fs.existsSync(exampleConfigPath)) {
  fs.copyFileSync(exampleConfigPath, serverConfigPath);
  console.log('✅ Created server.yaml from example');
}

// Build the project
try {
  console.log('📦 Building project...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Build completed');
} catch (error) {
  console.error('❌ Build failed');
  process.exit(1);
}

// Run tests to make sure everything works
try {
  console.log('🧪 Running tests...');
  execSync('npm test', { stdio: 'inherit' });
  console.log('✅ Tests passed');
} catch (error) {
  console.error('⚠️  Some tests failed, but the server might still work');
}

console.log('\n🎉 Setup complete!');
console.log('\nNext steps:');
console.log('1. Edit config/server.yaml to configure your settings');
console.log('2. Add the server to your claude_desktop_config.json');
console.log('3. Restart Claude Desktop');
console.log('\nFor detailed instructions, see README.md');

// Show the claude config snippet
const distPath = path.resolve(path.dirname(__dirname), 'dist', 'index.js');
const configPath = path.resolve(serverConfigPath);

console.log('\n📋 Add this to your claude_desktop_config.json:');
console.log(
  JSON.stringify(
    {
      mcpServers: {
        'context-savvy-mcp': {
          command: 'node',
          args: [distPath],
          env: {
            MCP_LOG_LEVEL: 'info',
            MCP_SERVER_CONFIG_PATH: configPath
          }
        }
      }
    },
    null,
    2
  )
);

console.log('\n🔧 Claude Desktop config locations:');
console.log('- macOS: ~/Library/Application Support/Claude/claude_desktop_config.json');
console.log('- Windows: %APPDATA%\\Claude\\claude_desktop_config.json');
console.log('- Linux: ~/.config/claude/claude_desktop_config.json');
