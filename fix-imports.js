#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, 'src');

// Path alias mappings
const aliases = {
  '@core/': 'core/',
  '@application/': 'application/',
  '@infrastructure/': 'infrastructure/',
  '@presentation/': 'presentation/',
  '@utils/': 'utils/'
};

// Function to get relative path from one file to another
function getRelativePath(fromFile, toFile) {
  const fromDir = dirname(fromFile);
  const relativePath = relative(fromDir, toFile);

  // Convert backslashes to forward slashes for consistent imports
  return relativePath.replace(/\\/g, '/');
}

// Function to resolve alias to actual path
function resolveAliasPath(importPath, currentFile) {
  for (const [alias, actualPath] of Object.entries(aliases)) {
    if (importPath.startsWith(alias)) {
      const targetPath = importPath.replace(alias, actualPath);
      const absoluteTargetPath = join(srcDir, targetPath);
      const relativePath = getRelativePath(currentFile, absoluteTargetPath);

      // Ensure relative path starts with ./ or ../
      if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
        return './' + relativePath;
      }
      return relativePath;
    }
  }
  return null;
}

// Function to fix imports in a file
async function fixImportsInFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    let modified = false;

    // Regex to match import statements with path aliases
    const importRegex =
      /import\s+(?:(?:{\s*[^}]*\s*}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"`](@(?:core|application|infrastructure|presentation|utils)\/[^'"`]+)['"`]/g;

    const newContent = content.replace(importRegex, (match, importPath) => {
      const resolvedPath = resolveAliasPath(importPath, filePath);
      if (resolvedPath) {
        modified = true;
        return match.replace(importPath, resolvedPath);
      }
      return match;
    });

    // Also handle type imports
    const typeImportRegex =
      /import\s+type\s+(?:{\s*[^}]*\s*}|\w+)\s+from\s+['"`](@(?:core|application|infrastructure|presentation|utils)\/[^'"`]+)['"`]/g;

    const finalContent = newContent.replace(typeImportRegex, (match, importPath) => {
      const resolvedPath = resolveAliasPath(importPath, filePath);
      if (resolvedPath) {
        modified = true;
        return match.replace(importPath, resolvedPath);
      }
      return match;
    });

    if (modified) {
      await fs.writeFile(filePath, finalContent, 'utf-8');
      console.log(`✅ Fixed imports in: ${relative(process.cwd(), filePath)}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Function to recursively find all TypeScript files
async function findTypeScriptFiles(dir) {
  const files = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, dist, build directories
        if (!['node_modules', 'dist', 'build', 'coverage'].includes(entry.name)) {
          files.push(...(await findTypeScriptFiles(fullPath)));
        }
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }

  return files;
}

// Main function
async function main() {
  console.log('🔧 Starting import path alias fix...\n');

  try {
    // Find all TypeScript files
    const typeScriptFiles = await findTypeScriptFiles(srcDir);
    console.log(`📁 Found ${typeScriptFiles.length} TypeScript files\n`);

    let fixedCount = 0;

    // Process each file
    for (const file of typeScriptFiles) {
      const wasFixed = await fixImportsInFile(file);
      if (wasFixed) {
        fixedCount++;
      }
    }

    console.log(`\n✅ Fix complete! Updated ${fixedCount} files.`);
    console.log('\n🔨 Next steps:');
    console.log('1. Run: npm run build');
    console.log('2. Test the server: npm start');
    console.log('3. Check Claude Desktop integration');
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Handle command line execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
