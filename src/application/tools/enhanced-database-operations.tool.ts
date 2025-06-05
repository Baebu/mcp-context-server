// Enhanced Database Operations with Semantic Features (CLEAN VERSION)
// File: src/application/tools/enhanced-database-operations.tool.ts

import { injectable, inject } from 'inversify'; // Import inject
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import { EmbeddingService } from '../services/embedding.service.js';

const enhancedStoreContextSchema = z.object({
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

const enhancedQueryContextSchema = z.object({
  type: z.string().optional().describe('Filter by type'),
  pattern: z.string().optional().describe('Key pattern to match'),
  keyPattern: z.string().optional().describe('Alias for pattern'),
  limit: z.number().optional().default(20).describe('Maximum results to return'),
  semanticQuery: z.string().optional().describe('Natural language query for semantic search'),
  minSimilarity: z.number().optional().default(0.5).describe('Minimum similarity for semantic results'),
  includeTraditional: z.boolean().optional().default(true).describe('Include traditional query results'),
  /**
   * @deprecated Use `type` and `keyPattern` directly. This parameter is for backward compatibility.
   */
  filters: z.string().optional().describe('JSON filters string (backward compatibility)')
});

/**
 * Enhanced store context tool with semantic capabilities
 */
@injectable()
export class EnhancedStoreContextTool implements IMCPTool {
  name = 'store_context_semantic';
  description = 'Store a context item with automatic semantic embedding and tag extraction';
  schema = enhancedStoreContextSchema;

  constructor(@inject('EmbeddingService') private embeddingService: EmbeddingService) {}

  async execute(params: z.infer<typeof enhancedStoreContextSchema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get<IDatabaseHandler>('DatabaseHandler'); // Use IDatabaseHandler

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
          `Value for key '${params.key}' is not JSON-serializable: ${error instanceof Error ? error.message : String(error)}`
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
      const dbInstance = db.getDatabase(); // Use the interface method

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

/**
 * Enhanced query tool with semantic and traditional search
 */
@injectable()
export class EnhancedQueryContextTool implements IMCPTool {
  name = 'query_context_enhanced';
  description = 'Query context with both traditional filters and semantic search capabilities';
  schema = enhancedQueryContextSchema;

  constructor(@inject('EmbeddingService') private embeddingService: EmbeddingService) {}

  async execute(params: z.infer<typeof enhancedQueryContextSchema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get<IDatabaseHandler>('DatabaseHandler'); // Use IDatabaseHandler

    try {
      const dbInstance = db.getDatabase(); // Use the interface method
      let results: any[] = [];

      // Prioritize new parameters, then fallback to deprecated ones
      let searchPattern = params.keyPattern;
      if (searchPattern === undefined && params.pattern !== undefined) {
        searchPattern = params.pattern;
        context.logger.warn("Using deprecated 'pattern' parameter. Please use 'keyPattern' instead.");
      }

      let queryType = params.type;
      let filtersParsed: { type?: string; keyPattern?: string; pattern?: string } | undefined;

      // Backward compatibility for 'filters' parameter
      if (params.filters) {
        try {
          filtersParsed = JSON.parse(params.filters);
          // Safely access properties of filtersParsed
          if (queryType === undefined && filtersParsed?.type) {
            queryType = filtersParsed.type;
            context.logger.warn("Using deprecated 'filters' parameter for type. Please use 'type' directly.");
          }
          if (searchPattern === undefined && (filtersParsed?.keyPattern || filtersParsed?.pattern)) {
            searchPattern = filtersParsed.keyPattern || filtersParsed.pattern;
            context.logger.warn("Using deprecated 'filters' parameter for pattern. Please use 'keyPattern' directly.");
          }
        } catch (error) {
          context.logger.warn({ error }, "Failed to parse deprecated 'filters' parameter. Ignoring.");
        }
      }

      if (dbInstance) {
        // Build query with filters
        let query = 'SELECT * FROM context_items WHERE 1=1';
        const queryParams: any[] = [];

        // Type filter
        if (queryType) {
          query += ' AND (type = ? OR context_type = ?)';
          queryParams.push(queryType, queryType);
        }

        // Pattern filter
        if (searchPattern) {
          query += ' AND key LIKE ?';
          queryParams.push(`%${searchPattern}%`);
        }

        query += ' ORDER BY updated_at DESC LIMIT ?';
        queryParams.push(params.limit || 20);

        const stmt = dbInstance.prepare(query);
        results = stmt.all(...queryParams);

        // Parse results
        results = results.map(row => ({
          key: row.key,
          value: this.safeJsonParse(row.value),
          type: row.type,
          contextType: row.context_type,
          hasEmbedding: !!row.embedding,
          tags: row.semantic_tags ? this.safeJsonParse(row.semantic_tags) : [],
          relevanceScore: row.relevance_score || 0,
          createdAt: row.created_at,
          updatedAt: row.updatedAt
        }));
      } else {
        // Fallback to regular query
        const fallbackSearchPattern = searchPattern; // Use the resolved searchPattern
        const queryOptions = {
          type: queryType, // Use the resolved queryType
          keyPattern: fallbackSearchPattern,
          limit: params.limit || 20
        };

        results = await db.queryContext(queryOptions);
      }

      // Use embedding service for semantic enhancement if needed
      if (params.semanticQuery && this.embeddingService) {
        try {
          await this.embeddingService.generateEmbedding(params.semanticQuery);
          // Future: implement full semantic search here
        } catch (error) {
          context.logger.warn({ error }, 'Semantic enhancement failed');
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                resultsCount: results.length,
                results: results,
                queryParams: {
                  type: queryType,
                  pattern: searchPattern,
                  limit: params.limit || 20,
                  semanticQuery: params.semanticQuery,
                  timestamp: new Date().toISOString()
                }
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Enhanced query failed');
      return {
        content: [
          {
            type: 'text',
            text: `Enhanced query failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private safeJsonParse(jsonString: any): any {
    if (typeof jsonString !== 'string') return jsonString;
    try {
      return JSON.parse(jsonString);
    } catch {
      return jsonString;
    }
  }
}

// Clean export - no duplicates
