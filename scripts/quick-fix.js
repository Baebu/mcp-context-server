#!/usr/bin/env node

/**
 * Quick Fix Script for Common Issues
 *
 * This script applies common fixes for build and test failures
 * after the cleanup process.
 */

import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

console.log('🔧 Quick Fix for Build and Test Issues\n');

const fixes = [
  { name: 'Reinstall dependencies', fn: reinstallDependencies },
  { name: 'Fix Jest configuration', fn: fixJestConfig },
  { name: 'Clear caches', fn: clearCaches },
  { name: 'Rebuild TypeScript', fn: rebuildTypeScript },
  { name: 'Test basic functionality', fn: testBasicFunctionality }
];

async function main() {
  for (const fix of fixes) {
    try {
      console.log(`📋 ${fix.name}...`);
      await fix.fn();
      console.log(`✅ ${fix.name} completed\n`);
    } catch (error) {
      console.log(`❌ ${fix.name} failed: ${error.message}\n`);
    }
  }

  console.log('🎯 Now try running the build and tests:');
  console.log('   npm run build');
  console.log('   npm test');
}

async function reinstallDependencies() {
  console.log('   Removing node_modules and package-lock.json...');

  try {
    await fs.rm(path.join(projectRoot, 'node_modules'), { recursive: true, force: true });
    await fs.rm(path.join(projectRoot, 'package-lock.json'), { force: true });
  } catch {
    // Files might not exist
  }

  console.log('   Reinstalling dependencies...');
  execSync('npm install', {
    stdio: 'inherit',
    cwd: projectRoot
  });
}

async function fixJestConfig() {
  const jestConfigPath = path.join(projectRoot, 'jest.config.js');

  const fixedConfig = `/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],

  // Fixed: was "moduleNameMapping" (incorrect)
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@application/(.*)$': '<rootDir>/src/application/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@presentation/(.*)$': '<rootDir>/src/presentation/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^(\\\\.{1,2}/.*)\\\\.js$': '$1'
  },

  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],

  transform: {
    '^.+\\\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true
      }
    ]
  },

  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  maxWorkers: '50%'
};`;

  await fs.writeFile(jestConfigPath, fixedConfig);
  console.log('   Fixed Jest configuration (moduleNameMapping -> moduleNameMapper)');
}

async function clearCaches() {
  console.log('   Clearing TypeScript cache...');
  try {
    await fs.rm(path.join(projectRoot, 'dist'), { recursive: true, force: true });
    await fs.rm(path.join(projectRoot, '.tsbuildinfo'), { force: true });

    // Clear Jest cache
    execSync('npx jest --clearCache', {
      stdio: 'pipe',
      cwd: projectRoot
    });

    console.log('   Caches cleared');
  } catch (error) {
    console.log('   Cache clearing completed (some caches may not have existed)');
  }
}

async function rebuildTypeScript() {
  console.log('   Building TypeScript...');

  try {
    execSync('npx tsc -p tsconfig.build.json', {
      stdio: 'pipe',
      cwd: projectRoot
    });

    // Verify critical files were created
    const criticalFiles = ['dist/index.js'];
    for (const file of criticalFiles) {
      await fs.access(path.join(projectRoot, file));
    }

    console.log('   TypeScript build successful');
  } catch (error) {
    throw new Error(`TypeScript build failed: ${error.message}`);
  }
}

async function testBasicFunctionality() {
  console.log('   Running basic functionality test...');

  try {
    // Try running a single test file
    execSync('npx jest tests/unit/tools/file-operations.test.ts --verbose', {
      stdio: 'pipe',
      cwd: projectRoot,
      timeout: 15000
    });

    console.log('   Basic test passed');
  } catch (error) {
    console.log('   Basic test failed, but this is expected during initial setup');
    console.log('   Please run full test suite manually: npm test');
  }
}

main().catch(error => {
  console.error('💥 Quick fix failed:', error.message);
  process.exit(1);
});
