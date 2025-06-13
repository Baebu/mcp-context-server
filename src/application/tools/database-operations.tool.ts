import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import { EmbeddingService } from '../services/embedding.service.js'; // Needed for semantic features

// Schema for StoreContextTool (formerly EnhancedStoreContextTool)
const storeContextSchema = z.object({
  key: z.string().describe('Unique key for the context item'),
  value: z.any().describe('Value to store (will be JSON serialized)'),
  type: z.string().optional().default('generic').describe('Type of context content'),
  generateEmbedding: z.boolean().optional().default(true).describe('Whether to generate semantic embedding'),
  tags: z.array(z.string()).optional().describe('Manual semantic tags'),
  /**
   * @deprecated Use `value` instead. This parameter is for backward compatibility.
   */
  content: z.any().optional().describe('Alias for value (backward compatibility)'),
  /**
   * @deprecated Use `type` instead. This parameter is for backward compatibility.
   */
  metadata: z.string().optional().describe('JSON metadata string (backward compatibility)')
});

/**
 * Store context tool with automatic semantic embedding and tag extraction.
 * This is the consolidated and enhanced version of the original `store_context`.
 */
@injectable()
export class StoreContextTool implements IMCPTool {
  name = 'store_context'; // Renamed from store_context_semantic
  description = 'Store a context item with automatic semantic embedding and tag extraction'; // Updated description
  schema = storeContextSchema;

  constructor(@inject('EmbeddingService') private embeddingService: EmbeddingService) {}

  async execute(params: z.infer<typeof storeContextSchema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get<IDatabaseHandler>('DatabaseHandler');

    try {
      // Prioritize new parameters, then fallback to deprecated ones
      let valueToStore = params.value;
      let typeToStore = params.type || 'generic';

      // Backward compatibility for 'content'
      if (valueToStore === undefined && params.content !== undefined) {
        valueToStore = params.content;
        context.logger.warn({ key: params.key }, "Using deprecated 'content' parameter. Please use 'value' instead.");
      }

      // Backward compatibility for 'metadata' influencing 'type'
      if (typeToStore === 'generic' && params.metadata) {
        try {
          const metadata = JSON.parse(params.metadata);
          if (metadata.type) {
            typeToStore = metadata.type;
            context.logger.warn(
              { key: params.key },
              "Using deprecated 'metadata' parameter for type. Please use 'type' directly."
            );
          }
          // If valueToStore is a string and metadata is parsed, merge them
          if (typeof valueToStore === 'string' && typeof metadata === 'object') {
            valueToStore = {
              content: valueToStore,
              metadata
            };
          }
        } catch {
          // If metadata isn't valid JSON, treat it as a string type
          typeToStore = params.metadata;
          context.logger.warn(
            { key: params.key },
            "Using deprecated 'metadata' parameter as type. Please use 'type' directly."
          );
        }
      }

      // Ensure valueToStore is JSON-serializable before proceeding
      let textContent: string;
      try {
        textContent = typeof valueToStore === 'string' ? valueToStore : JSON.stringify(valueToStore);
      } catch (error) {
        throw new Error(
          `Value for key '${params.key}' is not JSON-serializable: ${error instanceof Error ? error.message : String(error)}. Value must be JSON-serializable.`
        );
      }

      let embedding: number[] | undefined;
      let tags: string[] = params.tags || [];

      // Generate embedding if requested and content is not empty
      if (params.generateEmbedding && textContent.trim().length > 0) {
        try {
          embedding = await this.embeddingService.generateEmbedding(textContent);
          context.logger.debug({ key: params.key, embeddingDims: embedding.length }, 'Generated embedding');
        } catch (error) {
          context.logger.warn({ error, key: params.key }, 'Failed to generate embedding, storing without it');
        }
      }

      // Extract semantic tags if none provided and content is not empty
      if (tags.length === 0 && textContent.length > 0) {
        tags = this.extractSemanticTags(textContent, typeToStore);
      }

      // DIRECT SEMANTIC STORAGE - Use database instance directly
      const dbInstance = db.getDatabase();

      if (dbInstance) {
        // Use direct SQL with semantic columns (confirmed working)
        const embeddingJson = embedding ? JSON.stringify(embedding) : null;
        const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;

        const stmt = dbInstance.prepare(`
          INSERT OR REPLACE INTO context_items
          (key, value, type, embedding, semantic_tags, context_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        // Ensure value is always stored as a JSON string
        const finalValueForDb = typeof valueToStore === 'string' ? valueToStore : JSON.stringify(valueToStore);

        stmt.run(params.key, finalValueForDb, typeToStore, embeddingJson, tagsJson, typeToStore);

        context.logger.debug(
          { key: params.key, type: typeToStore, hasEmbedding: !!embedding },
          'Semantic context stored directly'
        );
      } else {
        // Fallback to regular storage (will also handle JSON serialization internally)
        await db.storeContext(params.key, valueToStore, typeToStore);
        context.logger.warn({ key: params.key }, 'Stored without semantic features - database instance not available');
      }

      return {
        content: [
          {
            type: 'text',
            text: `Context stored successfully with key: ${params.key}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to store enhanced context');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to store context: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private extractSemanticTags(content: string, type: string): string[] {
    const tags: string[] = [type];

    // Simple keyword extraction
    const text = content.toLowerCase();
    const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

    const words = text.match(/\b\w{3,}\b/g) || [];
    const meaningfulWords = words.filter(word => !stopWords.has(word)).filter(word => word.length >= 3);

    // Get word frequency
    const wordFreq: { [key: string]: number } = {};
    meaningfulWords.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Extract top keywords
    const sortedWords = Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);

    tags.push(...sortedWords);
    return [...new Set(tags)];
  }
}

// Schema for GetContextTool (remains unchanged)
const getContextSchema = z.object({
  key: z.string().describe('Key of the context item to retrieve')
});

@injectable()
export class GetContextTool implements IMCPTool {
  name = 'get_context';
  description = 'Retrieve a previously stored context item by its exact key.';
  schema = getContextSchema;

  async execute(params: z.infer<typeof getContextSchema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get<IDatabaseHandler>('DatabaseHandler');

    try {
      const value = await db.getContext(params.key);

      if (value === null) {
        return {
          content: [
            {
              type: 'text',
              text: `No context found for key: ${params.key}`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                key: params.key,
                value,
                retrieved_at: new Date().toISOString()
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to get context');
      throw error;
    }
  }
}

// QueryContextTool REMOVED - Functionality consolidated into semantic-search.tool.ts
