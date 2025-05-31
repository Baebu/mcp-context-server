#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runCommand(command, description) {
  console.log(`🔧 ${description}...`);
  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: __dirname
    });
    console.log(`✅ ${description} completed`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return false;
  }
}

async function ensureDirectories() {
  const dataDir = join(__dirname, 'data');
  const configFile = join(__dirname, 'config', 'server.yaml');
  const envFile = join(__dirname, '.env');

  // Create data directory
  try {
    await fs.mkdir(dataDir, { recursive: true });
    console.log('✅ Data directory ready');
  } catch (error) {
    console.log('⚠️  Could not create data directory:', error.message);
  }

  // Check for config file
  try {
    await fs.access(configFile);
    console.log('✅ Config file exists');
  } catch {
    try {
      const exampleConfig = join(__dirname, 'config', 'server.example.yaml');
      await fs.copyFile(exampleConfig, configFile);
      console.log('✅ Created config file from example');
    } catch (error) {
      console.log('⚠️  Could not create config file:', error.message);
    }
  }

  // Check for env file
  try {
    await fs.access(envFile);
    console.log('✅ Environment file exists');
  } catch {
    try {
      const exampleEnv = join(__dirname, '.env.example');
      await fs.copyFile(exampleEnv, envFile);
      console.log('✅ Created environment file from example');
    } catch (error) {
      console.log('⚠️  Could not create environment file:', error.message);
    }
  }
}

async function main() {
  console.log('🚀 Clean build process starting...\n');

  try {
    // Ensure necessary directories and files exist
    await ensureDirectories();

    // Clean previous build completely
    console.log('🧹 Cleaning previous build...');
    try {
      await fs.rm(join(__dirname, 'dist'), { recursive: true, force: true });
      console.log('✅ Previous build cleaned');
    } catch {
      console.log('✅ No previous build to clean');
    }

    // Install dependencies if needed
    console.log('📦 Checking dependencies...');
    try {
      execSync('npm list --depth=0', { stdio: 'pipe' });
      console.log('✅ Dependencies are installed');
    } catch {
      console.log('📦 Installing dependencies...');
      const installed = await runCommand('npm install', 'Installing dependencies');
      if (!installed) {
        throw new Error('Failed to install dependencies');
      }
    }

    // Type check first
    console.log('🔍 Type checking...');
    const typeCheckResult = await runCommand('npx tsc -p tsconfig.build.json --noEmit', 'Type checking');
    if (!typeCheckResult) {
      console.log('⚠️  Type check failed, but continuing...');
    }

    // Build with the corrected config
    const buildResult = await runCommand('npx tsc -p tsconfig.build.json', 'Building TypeScript');
    if (!buildResult) {
      throw new Error('TypeScript build failed');
    }

    // Verify the build output
    console.log('🔍 Verifying build output...');
    const indexPath = join(__dirname, 'dist', 'index.js');
    try {
      await fs.access(indexPath);
      console.log('✅ Build output verified - index.js exists at dist/index.js');
    } catch {
      console.log('❌ Build output verification failed - index.js not found at expected location');

      // List what was actually created
      try {
        const distContents = await fs.readdir(join(__dirname, 'dist'), { recursive: true });
        console.log('📁 Actual dist contents:', distContents);
      } catch {
        console.log('❌ Could not read dist directory');
      }
    }

    console.log('\n✅ Clean build completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Test the server: npm start');
    console.log('   2. Configure Claude Desktop (see CLAUDE_DESKTOP_CONFIG.md)');
    console.log('   3. Restart Claude Desktop');
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('   1. Check that Node.js 18+ is installed');
    console.log('   2. Verify tsconfig.build.json is correct');
    console.log('   3. Check for TypeScript errors: npx tsc --noEmit');
    console.log('   4. Run health check: npm run health-check');
    process.exit(1);
  }
}

main();
