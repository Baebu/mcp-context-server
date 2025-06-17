#!/usr/bin/env node
/* eslint-disable no-console */

// MCP Context Server Health Check Script

import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

console.log('🏥 MCP Context Server Health Check\n');

let hasErrors = false;

// Check Node.js version
function checkNodeVersion() {
  console.log('📋 Checking Node.js version...');

  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0]);

  if (major >= 18) {
    console.log(`✅ Node.js version: ${nodeVersion}`);
  } else {
    console.log(`❌ Node.js version ${nodeVersion} is too old. Requires 18.0.0+`);
    hasErrors = true;
  }
}

// Check project structure
async function checkProjectStructure() {
  console.log('\n📋 Checking project structure...');

  const requiredFiles = ['package.json', 'src/index.ts', 'config/server.example.yaml', 'tsconfig.json'];

  for (const file of requiredFiles) {
    const filePath = path.join(projectRoot, file);
    try {
      await fs.access(filePath);
      console.log(`✅ ${file}`);
    } catch {
      console.log(`❌ Missing: ${file}`);
      hasErrors = true;
    }
  }
}

// Check configuration
async function checkConfiguration() {
  console.log('\n📋 Checking configuration...');

  const configPath = path.join(projectRoot, 'config/server.yaml');
  try {
    await fs.access(configPath);
    console.log('✅ config/server.yaml exists');
  } catch {
    console.log('⚠️  config/server.yaml missing - will use defaults');
    console.log('   Run: cp config/server.example.yaml config/server.yaml');
  }

  const dataDir = path.join(projectRoot, 'data');
  try {
    const stats = await fs.stat(dataDir);
    if (stats.isDirectory()) {
      console.log('✅ data directory exists');
    }
  } catch {
    console.log('⚠️  data directory missing - will be created automatically');
  }
}

// Check build
async function checkBuild() {
  console.log('\n📋 Checking build...');

  const distPath = path.join(projectRoot, 'dist/index.js');
  try {
    await fs.access(distPath);
    console.log('✅ Project is built (dist/index.js exists)');
  } catch {
    console.log('❌ Project not built - run: npm run build');
    hasErrors = true;
  }
}

// Check dependencies
function checkDependencies() {
  console.log('\n📋 Checking dependencies...');

  try {
    execSync('npm list --depth=0', {
      cwd: projectRoot,
      stdio: 'pipe'
    });
    console.log('✅ Dependencies are installed');
  } catch (error) {
    console.log('❌ Dependencies issue - run: npm install');
    hasErrors = true;
  }
}

// Check Claude Desktop config locations
async function checkClaudeDesktopConfig() {
  console.log('\n📋 Checking Claude Desktop configuration...');

  const configPaths = {
    darwin: '~/Library/Application Support/Claude/claude_desktop_config.json',
    win32: '%APPDATA%\\Claude\\claude_desktop_config.json',
    linux: '~/.config/claude/claude_desktop_config.json'
  };

  const platform = process.platform;
  const configPath = configPaths[platform] || configPaths.linux;

  console.log(`📍 Config location for ${platform}: ${configPath}`);

  // Try to expand home directory for actual checking on Unix-like systems
  if (platform !== 'win32') {
    const expandedPath = configPath.replace('~', process.env.HOME || '');
    try {
      await fs.access(expandedPath);
      console.log('✅ Claude Desktop config file exists');

      // Try to read and validate
      const content = await fs.readFile(expandedPath, 'utf8');
      const config = JSON.parse(content);

      if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
        console.log('✅ MCP servers configured');

        // Check if our server is configured
        const ourServer = Object.values(config.mcpServers).find(
          server => server.args && server.args.some(arg => arg.includes('context-savvy-mcp'))
        );

        if (ourServer) {
          console.log('✅ This MCP server appears to be configured');
        } else {
          console.log('⚠️  This MCP server not found in configuration');
        }
      } else {
        console.log('⚠️  No MCP servers configured');
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️  Claude Desktop config file not found');
      } else {
        console.log('⚠️  Could not read Claude Desktop config');
      }
    }
  }
}

// Generate sample Claude Desktop config
function generateClaudeConfig() {
  console.log('\n📋 Sample Claude Desktop Configuration:');

  const absolutePath = path.resolve(projectRoot, 'dist/index.js');

  const config = {
    mcpServers: {
      'context-savvy-mcp': {
        command: 'node',
        args: [absolutePath],
        env: {
          MCP_LOG_LEVEL: 'info'
        }
      }
    }
  };

  console.log(JSON.stringify(config, null, 2));
}

// Main health check
async function main() {
  try {
    checkNodeVersion();
    await checkProjectStructure();
    await checkConfiguration();
    await checkBuild();
    checkDependencies();
    await checkClaudeDesktopConfig();

    if (!hasErrors) {
      console.log('\n🎉 All checks passed!');
      console.log('\n📋 Next steps:');
      console.log('   1. Configure Claude Desktop (see sample config above)');
      console.log('   2. Restart Claude Desktop completely');
      console.log('   3. Test with: "Can you list files in the current directory?"');
    } else {
      console.log('\n❌ Some issues found. Please fix them and run the health check again.');
      process.exit(1);
    }

    generateClaudeConfig();
  } catch (error) {
    console.error('\n💥 Health check failed:', error.message);
    process.exit(1);
  }
}

main();
