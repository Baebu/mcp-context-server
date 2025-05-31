#!/usr/bin/env node

// config-fix.js - Quick fix for configuration issues

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Working configuration content
const workingConfig = `server:
  name: 'mcp-context-server'
  version: '1.0.0'

security:
  allowedCommands:
    - 'ls'
    - 'cat'
    - 'grep'
    - 'find'
    - 'git'
    - 'npm'
    - 'node'
    - 'python'
    - 'python3'
    - 'echo'
    - 'pwd'
    - 'which'
    - 'whoami'
  safezones:
    - '.'
    - '/tmp'
    - '/var/tmp'
  maxExecutionTime: 30000
  maxFileSize: 10485760

database:
  path: './data/context.db'
  backupInterval: 60

logging:
  level: 'info'
  pretty: true

performance:
  maxConcurrency: 10
  queueSize: 1000`;

async function diagnoseAndFix() {
  console.log('🔍 Diagnosing configuration issue...\n');

  try {
    // Check if config directory exists
    const configDir = join(__dirname, 'config');
    try {
      await fs.access(configDir);
      console.log('✅ Config directory exists');
    } catch {
      console.log('❌ Config directory missing - creating...');
      await fs.mkdir(configDir, { recursive: true });
      console.log('✅ Config directory created');
    }

    // Check existing config file
    const configPath = join(configDir, 'server.yaml');
    let needsReplacement = false;

    try {
      const existingContent = await fs.readFile(configPath, 'utf8');
      console.log('📋 Current config file exists');
      console.log(`📏 File size: ${existingContent.length} characters`);

      // Test YAML parsing
      try {
        const yaml = await import('yaml');
        const parsed = yaml.parse(existingContent);
        console.log('✅ YAML syntax is valid');

        // Check for required fields
        const required = ['server', 'security', 'database', 'logging', 'performance'];
        const missing = required.filter(field => !parsed || !parsed[field]);

        if (missing.length > 0) {
          console.log(`❌ Missing required sections: ${missing.join(', ')}`);
          needsReplacement = true;
        } else {
          console.log('✅ All required sections present');
        }
      } catch (yamlError) {
        console.log(`❌ YAML syntax error: ${yamlError.message}`);
        needsReplacement = true;
      }
    } catch {
      console.log('❌ Config file not readable or missing');
      needsReplacement = true;
    }

    if (needsReplacement) {
      console.log('\n🔧 Replacing config file with working version...');

      // Backup existing file if it exists
      try {
        const backupPath = join(configDir, `server.yaml.backup.${Date.now()}`);
        await fs.copyFile(configPath, backupPath);
        console.log(`📦 Backed up existing config to: ${backupPath}`);
      } catch {
        // No existing file to backup
      }

      // Write new config
      await fs.writeFile(configPath, workingConfig, 'utf8');
      console.log('✅ New working configuration file created');
    }

    // Ensure data directory exists
    const dataDir = join(__dirname, 'data');
    try {
      await fs.access(dataDir);
      console.log('✅ Data directory exists');
    } catch {
      console.log('📁 Creating data directory...');
      await fs.mkdir(dataDir, { recursive: true });
      console.log('✅ Data directory created');
    }

    console.log('\n🎉 Configuration issue should now be fixed!');
    console.log('\n📋 Next steps:');
    console.log('   1. Run: npm run build');
    console.log('   2. Run: npm start');
    console.log('   3. Server should start successfully');
  } catch (error) {
    console.error('\n❌ Fix script failed:', error.message);
    console.log('\n🔧 Manual fix steps:');
    console.log('   1. Ensure config/server.yaml exists');
    console.log('   2. Copy the working config content provided above');
    console.log('   3. Make sure YAML syntax is valid');
    console.log('   4. Check file permissions');
  }
}

// Run the diagnosis and fix
diagnoseAndFix();
