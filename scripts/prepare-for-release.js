#!/usr/bin/env node

/**
 * Repository Cleanup Script for Public Release
 *
 * This script prepares the MCP Context Server repository for public release
 * by cleaning up temporary files, updating configurations, and validating structure.
 */

import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

console.log('🧹 MCP Context Server - Repository Cleanup for Public Release\n');

const cleanupTasks = [
  { name: 'Remove temporary and debug files', fn: removeTemporaryFiles },
  { name: 'Clean build artifacts', fn: cleanBuildArtifacts },
  { name: 'Update package.json for release', fn: updatePackageJson },
  { name: 'Validate project structure', fn: validateProjectStructure },
  { name: 'Create missing documentation', fn: createMissingDocs },
  { name: 'Update .gitignore', fn: updateGitignore },
  { name: 'Validate configuration files', fn: validateConfigs },
  { name: 'Run security audit', fn: runSecurityAudit },
  { name: 'Format and lint code', fn: formatAndLint },
  { name: 'Run tests', fn: runTests },
  { name: 'Generate final build', fn: generateBuild }
];

async function main() {
  let errors = [];

  for (const task of cleanupTasks) {
    try {
      console.log(`📋 ${task.name}...`);
      await task.fn();
      console.log(`✅ ${task.name} completed\n`);
    } catch (error) {
      console.log(`❌ ${task.name} failed: ${error.message}\n`);
      errors.push({ task: task.name, error: error.message });
    }
  }

  if (errors.length > 0) {
    console.log('⚠️  Some tasks failed:');
    errors.forEach(({ task, error }) => {
      console.log(`   - ${task}: ${error}`);
    });
    console.log('\nPlease fix these issues before releasing.\n');
  } else {
    console.log('🎉 Repository cleanup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Review all changes');
    console.log('   2. Update package.json author and repository fields');
    console.log('   3. Create GitHub repository');
    console.log('   4. Set up branch protection rules');
    console.log('   5. Configure GitHub secrets for CI/CD');
    console.log('   6. Create initial release');
  }
}

async function removeTemporaryFiles() {
  const filesToRemove = [
    'comprehensive-import-fixer.js',
    'config-fix.js',
    'diagnose-mcp.js',
    'fix-server.js',
    'test-context-operations.js',
    'test-server.js',
    'scripts/build-with-fix.js',
    'scripts/clean-build.js',
    'scripts/debug-build-script.js'
  ];

  for (const file of filesToRemove) {
    const filePath = path.join(projectRoot, file);
    try {
      await fs.unlink(filePath);
      console.log(`   Removed: ${file}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.log(`   Warning: Could not remove ${file}: ${error.message}`);
      }
    }
  }
}

async function cleanBuildArtifacts() {
  const dirsToClean = ['dist', 'build', 'coverage', 'node_modules/.cache'];

  for (const dir of dirsToClean) {
    const dirPath = path.join(projectRoot, dir);
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      console.log(`   Cleaned: ${dir}`);
    } catch (error) {
      console.log(`   Warning: Could not clean ${dir}: ${error.message}`);
    }
  }
}

async function updatePackageJson() {
  const packagePath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));

  // Remove development-only scripts
  const scriptsToRemove = ['fix-imports', 'build:clean'];
  scriptsToRemove.forEach(script => {
    if (packageJson.scripts[script]) {
      delete packageJson.scripts[script];
      console.log(`   Removed script: ${script}`);
    }
  });

  // Ensure proper repository information
  if (!packageJson.repository || packageJson.repository.url.includes('yourusername')) {
    console.log('   ⚠️  Please update repository URL in package.json');
  }

  // Ensure proper author information
  if (!packageJson.author || packageJson.author.includes('Your Name')) {
    console.log('   ⚠️  Please update author information in package.json');
  }

  // Add keywords if missing
  const recommendedKeywords = ['mcp', 'model-context-protocol', 'claude', 'typescript'];
  if (!packageJson.keywords) {
    packageJson.keywords = [];
  }

  recommendedKeywords.forEach(keyword => {
    if (!packageJson.keywords.includes(keyword)) {
      packageJson.keywords.push(keyword);
    }
  });

  await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log('   Updated package.json');
}

async function validateProjectStructure() {
  const requiredFiles = [
    'README.md',
    'LICENSE',
    'CONTRIBUTING.md',
    'package.json',
    'tsconfig.json',
    'tsconfig.build.json',
    '.gitignore',
    '.eslintrc.json',
    '.prettierrc',
    'src/index.ts'
  ];

  const requiredDirs = ['src/core', 'src/application', 'src/infrastructure', 'src/presentation', 'tests', 'config'];

  for (const file of requiredFiles) {
    const filePath = path.join(projectRoot, file);
    try {
      await fs.access(filePath);
      console.log(`   ✓ ${file}`);
    } catch {
      console.log(`   ⚠️  Missing: ${file}`);
    }
  }

  for (const dir of requiredDirs) {
    const dirPath = path.join(projectRoot, dir);
    try {
      await fs.access(dirPath);
      console.log(`   ✓ ${dir}/`);
    } catch {
      console.log(`   ⚠️  Missing: ${dir}/`);
    }
  }
}

async function createMissingDocs() {
  // Create LICENSE if missing
  const licensePath = path.join(projectRoot, 'LICENSE');
  try {
    await fs.access(licensePath);
  } catch {
    const mitLicense = `MIT License

Copyright (c) ${new Date().getFullYear()} MCP Context Server

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

    await fs.writeFile(licensePath, mitLicense);
    console.log('   Created LICENSE file');
  }

  // Create .github directory structure
  const githubDir = path.join(projectRoot, '.github');
  const workflowsDir = path.join(githubDir, 'workflows');

  await fs.mkdir(workflowsDir, { recursive: true });
  console.log('   Created .github/workflows directory');
}

async function updateGitignore() {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const currentGitignore = await fs.readFile(gitignorePath, 'utf8');

  const additionalEntries = [
    '# IDE specific files',
    '.vscode/settings.json',
    '.vscode/launch.json',
    '',
    '# macOS specific',
    '*.DS_Store',
    '',
    '# Windows specific',
    'Thumbs.db',
    'Desktop.ini',
    '',
    '# Temporary files from cleanup',
    '*-backup*',
    '*.tmp',
    '*.temp'
  ];

  let needsUpdate = false;
  for (const entry of additionalEntries) {
    if (entry && !currentGitignore.includes(entry)) {
      needsUpdate = true;
      break;
    }
  }

  if (needsUpdate) {
    const updatedGitignore = currentGitignore + '\n' + additionalEntries.join('\n') + '\n';
    await fs.writeFile(gitignorePath, updatedGitignore);
    console.log('   Updated .gitignore');
  } else {
    console.log('   .gitignore is up to date');
  }
}

async function validateConfigs() {
  // Check config files exist and are valid
  const configFiles = ['config/server.example.yaml', 'config/development.yaml', 'config/production.yaml'];

  for (const configFile of configFiles) {
    const configPath = path.join(projectRoot, configFile);
    try {
      await fs.access(configPath);
      const content = await fs.readFile(configPath, 'utf8');
      if (content.length < 10) {
        throw new Error('Config file appears to be empty');
      }
      console.log(`   ✓ ${configFile}`);
    } catch (error) {
      console.log(`   ⚠️  Issue with ${configFile}: ${error.message}`);
    }
  }
}

async function runSecurityAudit() {
  try {
    execSync('npm audit --audit-level moderate', {
      stdio: 'pipe',
      cwd: projectRoot
    });
    console.log('   Security audit passed');
  } catch (error) {
    console.log('   ⚠️  Security audit found issues - please review');
  }
}

async function formatAndLint() {
  try {
    execSync('npm run format', {
      stdio: 'pipe',
      cwd: projectRoot
    });
    console.log('   Code formatted');

    execSync('npm run lint:fix', {
      stdio: 'pipe',
      cwd: projectRoot
    });
    console.log('   Linting issues fixed');
  } catch (error) {
    throw new Error('Code formatting or linting failed');
  }
}

async function runTests() {
  try {
    execSync('npm test', {
      stdio: 'pipe',
      cwd: projectRoot
    });
    console.log('   All tests passed');
  } catch (error) {
    throw new Error('Tests failed - please fix before release');
  }
}

async function generateBuild() {
  try {
    execSync('npm run build', {
      stdio: 'pipe',
      cwd: projectRoot
    });
    console.log('   Build generated successfully');

    // Verify critical files exist
    const criticalFiles = ['dist/index.js'];
    for (const file of criticalFiles) {
      await fs.access(path.join(projectRoot, file));
    }
    console.log('   Build verification passed');
  } catch (error) {
    throw new Error('Build failed or verification failed');
  }
}

main().catch(error => {
  console.error('💥 Cleanup script failed:', error.message);
  process.exit(1);
});
