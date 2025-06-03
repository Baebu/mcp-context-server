// Enhanced Database Operations with Semantic Features
// File: src/application/tools/enhanced-database-operations.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import { EmbeddingService } from '../services/embedding.service.js';
import { SemanticDatabaseExtension } from '../../infrastructure/adapters/semantic-database.extension.js';

const enhancedStoreContextSchema = z.object({
  key: z.string().describe('Unique key for the context item'),
  value: z.any().describe('Value to store (will be JSON serialized)'),
  type: z.string().optional().default('generic').describe('Type of context content'),
  generateEmbedding: z.boolean().optional().default(true).describe('Whether to generate semantic embedding'),
  tags: z.array(z.string()).optional().describe('Manual semantic tags'),
  // Backward compatibility
  content: z.any().optional().describe('Alias for value (backward compatibility)'),
  metadata: z.string().optional().describe('JSON metadata string (backward compatibility)')
});

/**
 * Enhanced store context tool with semantic capabilities
 */
@injectable()
export class EnhancedStoreContextTool implements IMCPTool {
  name = 'store_context_semantic';
  description = 'Store a context item with automatic semantic embedding and tag extraction';
  schema = enhancedStoreContextSchema;

  constructor(
    @inject('EmbeddingService') private embeddingService: EmbeddingService
  ) {}

  async execute(params: z.infer<typeof enhancedStoreContextSchema>, context: ToolContext): Promise<ToolResult> {
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

      // Use semantic database extension for enhanced storage
      const dbInstance = (db as any).getDatabase();
      const semanticDb = new SemanticDatabaseExtension(dbInstance);

      await semanticDb.storeSemanticContext(params.key, value, type, embedding, tags);

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
          text: `Context stored successfully with semantic enhancements:\n${JSON.stringify(responseData, null, 2)}`
        }]
      };

    } catch (error) {
      context.logger.error({ error, params }, 'Failed to store enhanced context');
      return {
        content: [{
          type: 'text',
          text: `Failed to store context: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  private extractSemanticTags(content: string, type: string): string[] {
    const tags: string[] = [type];

    // Simple keyword extraction (can be enhanced with NLP libraries)
    const text = content.toLowerCase();

    // Remove common stop words and extract meaningful terms
    const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should']);

    const words = text.match(/\b\w{3,}\b/g) || [];
    const meaningfulWords = words
      .filter(word => !stopWords.has(word))
      .filter(word => word.length >= 3);

    // Get word frequency
    const wordFreq: { [key: string]: number } = {};
    meaningfulWords.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Extract top keywords
    const sortedWords = Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([word]) => word);

    tags.push(...sortedWords);

    // Add type-specific tags
    if (type === 'code') {
      const codePatterns = [
        /\b(function|class|method|variable|interface|type)\b/gi,
        /\b(javascript|typescript|python|java|cpp|rust|go)\b/gi,
        /\b(api|endpoint|database|query|model)\b/gi
      ];

      codePatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          tags.push(...matches.map(m => m.toLowerCase()));
        }
      });
    }

    if (type === 'documentation') {
      const docPatterns = [
        /\b(guide|tutorial|example|reference|manual)\b/gi,
        /\b(setup|installation|configuration|usage)\b/gi
      ];

      docPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          tags.push(...matches.map(m => m.toLowerCase()));
        }
      });
    }

    // Remove duplicates and return
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
  schema = z.object({
    // Traditional query options
    type: z.string().optional().describe('Filter by type'),
    pattern: z.string().optional().describe('Key pattern to match'),
    keyPattern: z.string().optional().describe('Alias for pattern'),
    limit: z.number().optional().default(20).describe('Maximum results to return'),

    // Semantic search options
    semanticQuery: z.string().optional().describe('Natural language query for semantic search'),
    minSimilarity: z.number().optional().default(0.5).describe('Minimum similarity for semantic results'),
    includeTraditional: z.boolean().optional().default(true).describe('Include traditional query results'),

    // Backward compatibility
    filters: z.string().optional().describe('JSON filters string (backward compatibility)')
  });

  constructor(
    @inject('EmbeddingService') private embeddingService: EmbeddingService
  ) {}

  async execute(params: z.infer<typeof this.schema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get('DatabaseHandler') as IDatabaseHandler;

    try {
      const results: any[] = [];

      // Traditional query if requested
      if (params.includeTraditional !== false) {
        const queryOptions: { type?: string; keyPattern?: string; limit?: number } = {
          limit: params.limit
        };

        // Handle backward compatibility
        if (params.filters) {
          try {
            const filters = JSON.parse(params.filters);
            queryOptions.type = filters.type;
            queryOptions.keyPattern = filters.pattern || filters.keyPattern;
          } catch {
            // Ignore invalid JSON
          }
        }

        // Direct parameters take precedence
        if (params.type) queryOptions.type = params.type;
        if (params.pattern) queryOptions.keyPattern = params.pattern;
        if (params.keyPattern) queryOptions.keyPattern = params.keyPattern;

        const traditionalResults = await db.queryContext(queryOptions);
        results.push(...traditionalResults.map((item: any) => ({ ...item, searchType: 'traditional' })));
      }

      // Semantic search if query provided
      if (params.semanticQuery) {
        const dbInstance = (db as any).getDatabase();
        const semanticDb = new SemanticDatabaseExtension(dbInstance);

        const queryEmbedding = await this.embeddingService.generateEmbedding(params.semanticQuery);

        const semanticResults = await semanticDb.semanticSearch({
          query: params.semanticQuery,
          queryEmbedding,
          limit: params.limit,
          minSimilarity: params.minSimilarity,
          contextTypes: params.type ? [params.type] : undefined
        });

        results.push(...semanticResults.map((item: any) => ({
          ...item,
          searchType: 'semantic',
          createdAt: item.metadata?.timestamp,
          updatedAt: item.metadata?.timestamp
        })));
      }

      // Remove duplicates and sort
      const uniqueResults = this.deduplicateResults(results);
      const sortedResults = this.sortResults(uniqueResults, params.semanticQuery);

      const responseData = {
        totalResults: uniqueResults.length,
        searchTypes: [...new Set(uniqueResults.map((r: any) => r.searchType))],
        query: {
          traditional: {
            type: params.type,
            pattern: params.pattern || params.keyPattern
          },
          semantic: {
            query: params.semanticQuery,
            minSimilarity: params.minSimilarity
          }
        },
        results: sortedResults.slice(0, params.limit),
        timestamp: new Date().toISOString()
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(responseData, null, 2)
        }]
      };

    } catch (error) {
      context.logger.error({ error, params }, 'Enhanced query failed');
      return {
        content: [{
          type: 'text',
          text: `Enhanced query failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  private deduplicateResults(results: any[]): any[] {
    const seen = new Set<string>();
    return results.filter((result: any) => {
      if (seen.has(result.key)) {
        return false;
      }
      seen.add(result.key);
      return true;
    });
  }

  private sortResults(results: any[], hasSemanticQuery?: string): any[] {
    if (hasSemanticQuery) {
      // Prioritize semantic results by similarity, then by recency
      return results.sort((a: any, b: any) => {
        if (a.searchType === 'semantic' && b.searchType !== 'semantic') return -1;
        if (b.searchType === 'semantic' && a.searchType !== 'semantic') return 1;

        if (a.similarity && b.similarity) {
          return b.similarity - a.similarity;
        }

        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }

    // Sort by recency for traditional queries
    return results.sort((a: any, b: any) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }
}
