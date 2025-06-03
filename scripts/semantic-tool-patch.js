// Direct Fix for Enhanced Database Operations Tool
// File: semantic-tool-patch.js

import Database from 'better-sqlite3';
import path from 'path';

async function patchSemanticTools() {
  console.log('🔧 Patching Semantic Tool Integration...');
  
  try {
    // Read the current enhanced database operations tool
    const fs = await import('fs/promises');
    const toolPath = path.join(process.cwd(), 'src', 'application', 'tools', 'enhanced-database-operations.tool.ts');
    
    let toolContent = await fs.readFile(toolPath, 'utf-8');
    
    // Check if the tool needs patching
    if (toolContent.includes('// SEMANTIC PATCH APPLIED')) {
      console.log('✅ Tool already patched');
      return;
    }
    
    console.log('🔍 Applying semantic integration patch...');
    
    // Replace the problematic section with a direct implementation
    const patchedExecuteMethod = `
  async execute(params: z.infer<typeof enhancedStoreContextSchema>, context: ToolContext): Promise<ToolResult> {
    // SEMANTIC PATCH APPLIED - Direct database semantic support
    const db = context.container.get('DatabaseHandler') as IDatabaseHandler;

    try {
      // Handle backward compatibility
      let value = params.value;
      let type = params.type || 'generic';

      if (params.content !== undefined && params.value === undefined) {
        value = params.content;
      }

      if (params.metadata && !params.type) {
        try {
          const metadata = JSON.parse(params.metadata);
          type = metadata.type || 'generic';
          if (typeof value === 'string') {
            value = {
              content: value,
              metadata
            };
          }
        } catch {
          type = params.metadata;
        }
      }

      // Prepare text content for embedding generation
      const textContent = typeof value === 'string' ? value : JSON.stringify(value);

      let embedding: number[] | undefined;
      let tags: string[] = params.tags || [];

      // Generate embedding if requested
      if (params.generateEmbedding && textContent.trim().length > 0) {
        try {
          embedding = await this.embeddingService.generateEmbedding(textContent);
          context.logger.debug({ key: params.key, embeddingDims: embedding.length }, 'Generated embedding');
        } catch (error) {
          context.logger.warn({ error, key: params.key }, 'Failed to generate embedding, storing without it');
        }
      }

      // Extract semantic tags if none provided
      if (tags.length === 0 && textContent.length > 0) {
        tags = this.extractSemanticTags(textContent, type);
      }

      // DIRECT SEMANTIC STORAGE - Bypass extension and use database directly
      const dbInstance = (db as any).getDatabase();
      
      if (dbInstance) {
        // Use direct SQL with semantic columns
        const embeddingJson = embedding ? JSON.stringify(embedding) : null;
        const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;

        const stmt = dbInstance.prepare(\`
          INSERT OR REPLACE INTO context_items
          (key, value, type, embedding, semantic_tags, context_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        \`);

        stmt.run(params.key, JSON.stringify(value), type, embeddingJson, tagsJson, type);
        
        context.logger.debug({ key: params.key, type, hasEmbedding: !!embedding }, 'Semantic context stored directly');
      } else {
        // Fallback to regular storage
        await db.storeContext(params.key, value, type);
        context.logger.warn({ key: params.key }, 'Stored without semantic features - database instance not available');
      }

      const responseData = {
        key: params.key,
        type: type,
        semanticFeatures: {
          embeddingGenerated: !!embedding,
          embeddingDimensions: embedding?.length || 0,
          extractedTags: tags,
          tagCount: tags.length
        },
        storedAt: new Date().toISOString()
      };

      return {
        content: [{
          type: 'text',
          text: \`Context stored successfully with key: \${params.key}\`
        }]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Enhanced context storage failed');
      return {
        content: [{
          type: 'text',
          text: \`Failed to store context: \${error instanceof Error ? error.message : 'Unknown error'}\`
        }]
      };
    }
  }`;
    
    // Apply the patch
    const executeMethodRegex = /async execute\(params[^}]+}\s*}\s*}/s;
    
    if (executeMethodRegex.test(toolContent)) {
      toolContent = toolContent.replace(executeMethodRegex, patchedExecuteMethod);
      
      // Write the patched file
      await fs.writeFile(toolPath, toolContent, 'utf-8');
      
      console.log('✅ Semantic tool patch applied successfully!');
      console.log('🔄 Restart the MCP server to apply changes');
    } else {
      console.log('❌ Could not find execute method to patch');
    }
    
  } catch (error) {
    console.error('❌ Patch failed:', error.message);
  }
}

patchSemanticTools();
