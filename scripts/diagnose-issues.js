#!/usr/bin/env node

/**
 * Diagnostic Script for Build and Test Issues
 *
 * This script helps identify what's causing the build and test failures
 * after cleanup for public release.
 */

import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

console.log('🔍 Diagnosing Build and Test Issues\n');

async function main() {
  const diagnostics = [
    { name: 'Check Node.js and npm versions', fn: checkVersions },
    { name: 'Verify dependencies are installed', fn: checkDependencies },
    { name: 'Check TypeScript configuration', fn: checkTypeScriptConfig },
    { name: 'Attempt TypeScript compilation', fn: attemptBuild },
    { name: 'Check test configuration', fn: checkTestConfig },
    { name: 'Attempt test run with verbose output', fn: attemptTests },
    { name: 'Check for import/export issues', fn: checkImports },
    { name: 'Verify critical files exist', fn: checkCriticalFiles }
  ];

  for (const diagnostic of diagnostics) {
    console.log(`📋 ${diagnostic.name}...`);
    try {
      await diagnostic.fn();
      console.log(`✅ ${diagnostic.name} - OK\n`);
    } catch (error) {
      console.log(`❌ ${diagnostic.name} - FAILED`);
      console.log(`   Error: ${error.message}\n`);
    }
  }
}

async function checkVersions() {
  const nodeVersion = process.version;
  console.log(`   Node.js: ${nodeVersion}`);

  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    console.log(`   npm: ${npmVersion}`);
  } catch (error) {
    throw new Error(`npm version check failed: ${error.message}`);
  }

  // Check if Node.js version is sufficient
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion < 18) {
    throw new Error(`Node.js ${nodeVersion} is too old. Requires 18.0.0+`);
  }
}

async function checkDependencies() {
  try {
    // Check if node_modules exists
    await fs.access(path.join(projectRoot, 'node_modules'));
    console.log('   node_modules directory exists');

    // Try to list dependencies
    const result = execSync('npm list --depth=0', {
      encoding: 'utf8',
      cwd: projectRoot,
      stdio: 'pipe'
    });
    console.log('   Dependencies appear to be installed');

    // Check for common missing dependencies
    const criticalDeps = ['@modelcontextprotocol/sdk', 'typescript', 'inversify', 'better-sqlite3', 'zod'];

    for (const dep of criticalDeps) {
      try {
        await fs.access(path.join(projectRoot, 'node_modules', dep));
        console.log(`   ✓ ${dep}`);
      } catch {
        console.log(`   ⚠️  Missing: ${dep}`);
      }
    }
  } catch (error) {
    throw new Error(`Dependency check failed: ${error.message}`);
  }
}

async function checkTypeScriptConfig() {
  const configFiles = ['tsconfig.json', 'tsconfig.build.json'];

  for (const configFile of configFiles) {
    const configPath = path.join(projectRoot, configFile);
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      console.log(`   ✓ ${configFile} is valid JSON`);

      // Check for common issues
      if (config.compilerOptions) {
        console.log(`   - Target: ${config.compilerOptions.target}`);
        console.log(`   - Module: ${config.compilerOptions.module}`);
        console.log(`   - ModuleResolution: ${config.compilerOptions.moduleResolution}`);
      }
    } catch (error) {
      throw new Error(`${configFile} is invalid: ${error.message}`);
    }
  }
}

async function attemptBuild() {
  try {
    console.log('   Attempting TypeScript compilation...');
    const result = execSync('npx tsc -p tsconfig.build.json --noEmit', {
      encoding: 'utf8',
      cwd: projectRoot,
      stdio: 'pipe'
    });
    console.log('   TypeScript compilation successful (dry run)');

    // Try actual build
    console.log('   Attempting actual build...');
    execSync('npx tsc -p tsconfig.build.json', {
      encoding: 'utf8',
      cwd: projectRoot,
      stdio: 'pipe'
    });
    console.log('   Build successful');
  } catch (error) {
    console.log(`   TypeScript compilation failed:`);
    console.log(`   ${error.stdout || error.message}`);
    throw new Error('Build failed - see TypeScript errors above');
  }
}

async function checkTestConfig() {
  const jestConfigPath = path.join(projectRoot, 'jest.config.js');

  try {
    await fs.access(jestConfigPath);
    console.log('   ✓ jest.config.js exists');

    // Try to load the config
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);

    // Read the config file content to check for issues
    const configContent = await fs.readFile(jestConfigPath, 'utf8');
    console.log('   ✓ Jest config is readable');

    // Check if it references deprecated options
    if (configContent.includes('moduleNameMapping')) {
      console.log('   ⚠️  Found deprecated Jest option: moduleNameMapping (should be moduleNameMapper)');
    }
  } catch (error) {
    throw new Error(`Jest config check failed: ${error.message}`);
  }
}

async function attemptTests() {
  try {
    console.log('   Running tests with verbose output...');
    const result = execSync('npm test -- --verbose --no-coverage', {
      encoding: 'utf8',
      cwd: projectRoot,
      stdio: 'pipe',
      timeout: 30000
    });
    console.log('   Tests passed');
  } catch (error) {
    console.log(`   Test execution failed:`);
    console.log(`   STDOUT: ${error.stdout || 'No stdout'}`);
    console.log(`   STDERR: ${error.stderr || 'No stderr'}`);
    throw new Error('Tests failed - check output above for details');
  }
}

async function checkImports() {
  const srcDir = path.join(projectRoot, 'src');

  try {
    // Check for common import issues
    const tsFiles = await findTSFiles(srcDir);
    console.log(`   Found ${tsFiles.length} TypeScript files`);

    let importIssues = [];

    for (const file of tsFiles.slice(0, 5)) {
      // Check first 5 files
      const content = await fs.readFile(file, 'utf8');

      // Check for problematic imports
      if (content.includes("from '@core/")) {
        const relativePath = path.relative(projectRoot, file);
        importIssues.push(`${relativePath}: Uses @core/ import path`);
      }

      if (content.includes("\.js'") && !file.endsWith('.js')) {
        const relativePath = path.relative(projectRoot, file);
        importIssues.push(`${relativePath}: .js extension in TypeScript import`);
      }
    }

    if (importIssues.length > 0) {
      console.log('   Import issues found:');
      importIssues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log('   No obvious import issues detected');
    }
  } catch (error) {
    throw new Error(`Import check failed: ${error.message}`);
  }
}

async function findTSFiles(dir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory() && entry.name !== 'node_modules') {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

async function checkCriticalFiles() {
  const criticalFiles = [
    'src/index.ts',
    'src/presentation/server.ts',
    'src/infrastructure/di/container.ts',
    'src/infrastructure/config/config-loader.ts'
  ];

  for (const file of criticalFiles) {
    const filePath = path.join(projectRoot, file);
    try {
      await fs.access(filePath);

      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size < 10) {
        throw new Error(`${file} appears to be empty`);
      }

      console.log(`   ✓ ${file} (${stats.size} bytes)`);
    } catch (error) {
      throw new Error(`Critical file issue with ${file}: ${error.message}`);
    }
  }
}

main().catch(error => {
  console.error('💥 Diagnostic failed:', error.message);
  process.exit(1);
});
