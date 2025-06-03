// Fix script for embedding compilation issues
// Run: npm exec tsx fix-embedding-imports.ts

import { promises as fs } from 'fs';
import path from 'path';

async function fixImports() {
  console.log('🔧 Fixing embedding-related import issues...');

  try {
    // 1. Check if the main issue is in enhanced-database-operations.tool.ts
    const toolPath = path.join(process.cwd(), 'src', 'application', 'tools', 'enhanced-database-operations.tool.ts');
    
    let toolContent = await fs.readFile(toolPath, 'utf-8');
    console.log('📍 Checking enhanced-database-operations.tool.ts...');

    // Check if it has the problematic import
    if (toolContent.includes("import { EmbeddingService } from '../services/embedding.service.js';")) {
      console.log('✅ Import already uses .js extension - good!');
    } else if (toolContent.includes("import { EmbeddingService } from '../services/embedding.service';")) {
      console.log('🔧 Fixing import to use .js extension...');
      toolContent = toolContent.replace(
        "import { EmbeddingService } from '../services/embedding.service';",
        "import { EmbeddingService } from '../services/embedding.service.js';"
      );
      await fs.writeFile(toolPath, toolContent, 'utf-8');
      console.log('✅ Fixed enhanced-database-operations.tool.ts import');
    }

    // 2. Check semantic-search.tool.ts
    const semanticToolPath = path.join(process.cwd(), 'src', 'application', 'tools', 'semantic-search.tool.ts');
    
    try {
      let semanticContent = await fs.readFile(semanticToolPath, 'utf-8');
      console.log('📍 Checking semantic-search.tool.ts...');

      if (semanticContent.includes("import") && semanticContent.includes("EmbeddingService")) {
        // Fix any .ts imports to .js
        semanticContent = semanticContent.replace(/from '[^']*\.ts'/g, (match) => {
          return match.replace('.ts\'', '.js\'');
        });
        
        await fs.writeFile(semanticToolPath, semanticContent, 'utf-8');
        console.log('✅ Fixed semantic-search.tool.ts imports');
      }
    } catch (err) {
      console.log('ℹ️ semantic-search.tool.ts - no issues or file not found');
    }

    // 3. Check DI container
    const containerPath = path.join(process.cwd(), 'src', 'infrastructure', 'di', 'container.ts');
    
    let containerContent = await fs.readFile(containerPath, 'utf-8');
    console.log('📍 Checking DI container...');

    if (containerContent.includes("import { EmbeddingService } from '../../application/services/embedding.service.js';")) {
      console.log('✅ DI container import already uses .js extension - good!');
    } else if (containerContent.includes("import { EmbeddingService } from '../../application/services/embedding.service';")) {
      console.log('🔧 Fixing DI container import...');
      containerContent = containerContent.replace(
        "import { EmbeddingService } from '../../application/services/embedding.service';",
        "import { EmbeddingService } from '../../application/services/embedding.service.js';"
      );
      await fs.writeFile(containerPath, containerContent, 'utf-8');
      console.log('✅ Fixed DI container import');
    }

    console.log('\n🎉 Import fixes completed!');
    console.log('\nNow try running: npm run build');

  } catch (error) {
    console.error('❌ Error fixing imports:', error.message);
  }
}

fixImports();
