// Semantic Search Tool for Enhanced Context Retrieval
// File: src/application/tools/semantic-search.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import { EmbeddingService } from '../services/embedding.service.js';
import { SemanticDatabaseExtension } from '../../infrastructure/adapters/semantic-database.extension.js';
import { semanticSearchSchema } from '../../core/interfaces/semantic-context.interface.js';

/**
 * Tool for performing semantic search across stored context
 */
@injectable()
export class SemanticSearchTool implements IMCPTool {
  name = 'semantic_search_context';
  description = 'Search context using natural language queries with semantic understanding';
  schema = semanticSearchSchema;

  constructor(@inject('EmbeddingService') private embeddingService: EmbeddingService) {}

  async execute(params: z.infer<typeof semanticSearchSchema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get<IDatabaseHandler>('DatabaseHandler'); // Use IDatabaseHandler

    try {
      // Access the underlying database instance to use semantic extension
      const dbInstance = db.getDatabase(); // Use the interface method
      const semanticDb = new SemanticDatabaseExtension(dbInstance);

      let results: any[] = [];

      // If traditional query filters are provided, use traditional search
      if (params.keyPattern || params.type) {
        // Perform traditional database search with filters
        let query = 'SELECT * FROM context_items WHERE 1=1';
        const queryParams: any[] = [];

        // Type filter
        if (params.type) {
          query += ' AND (type = ? OR context_type = ?)';
          queryParams.push(params.type, params.type);
        }

        // Pattern filter
        if (params.keyPattern) {
          query += ' AND key LIKE ?';
          queryParams.push(`%${params.keyPattern}%`);
        }

        query += ' ORDER BY updated_at DESC LIMIT ?';
        queryParams.push(params.limit || 5);

        const stmt = dbInstance.prepare(query);
        const traditionalResults = stmt.all(...queryParams);

        // Format results to match semantic search format
        results = traditionalResults.map((row: any) => ({
          key: row.key,
          type: row.type || row.context_type,
          similarity: 1.0, // Traditional search doesn't have similarity score
          value: this.safeJsonParse(row.value),
          metadata: {
            timestamp: new Date(row.updated_at || row.created_at),
            source: 'traditional_query',
            tags: row.semantic_tags ? this.safeJsonParse(row.semantic_tags) : []
          }
        }));
      } else {
        // Generate embedding for semantic search query
        const queryEmbedding = await this.embeddingService.generateEmbedding(params.query);

        // Perform semantic search
        results = await semanticDb.semanticSearch({
          ...params,
          queryEmbedding
        });
      }

      const responseData = {
        query: params.query,
        searchType: params.keyPattern || params.type ? 'traditional' : 'semantic',
        resultsCount: results.length,
        results: results.map(result => ({
          key: result.key,
          type: result.type,
          similarity: Math.round((result.similarity || 1.0) * 100) / 100,
          preview: this.generatePreview(result.value),
          metadata: {
            timestamp:
              result.metadata.timestamp instanceof Date
                ? result.metadata.timestamp.toISOString()
                : result.metadata.timestamp,
            source: result.metadata.source,
            tags: result.metadata.tags || []
          }
        })),
        searchMetadata: {
          minSimilarity: params.minSimilarity || 0.7,
          contextTypesFilter: params.contextTypes,
          includeRelated: params.includeRelated || false,
          keyPatternFilter: params.keyPattern,
          typeFilter: params.type,
          timestamp: new Date().toISOString(),
          embeddingDimensions:
            params.keyPattern || params.type
              ? null
              : (await this.embeddingService.generateEmbedding(params.query)).length
        }
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Semantic search failed');
      return {
        content: [
          {
            type: 'text',
            text: `Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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

  private generatePreview(value: unknown): string {
    if (typeof value === 'string') {
      return value.length > 200 ? value.substring(0, 200) + '...' : value;
    }

    const jsonString = JSON.stringify(value);
    return jsonString.length > 200 ? jsonString.substring(0, 200) + '...' : jsonString;
  }
}

/**
 * Tool for finding semantically related context items
 */
@injectable()
export class FindRelatedContextTool implements IMCPTool {
  name = 'find_related_context';
  description = 'Find context items semantically related to a given key';
  schema = z.object({
    key: z.string().describe('Key of the context item to find related items for'),
    limit: z.number().optional().default(5).describe('Maximum number of related items to return'),
    minSimilarity: z.number().optional().default(0.3).describe('Minimum similarity threshold')
  });

  async execute(params: z.infer<typeof this.schema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get<IDatabaseHandler>('DatabaseHandler'); // Use IDatabaseHandler

    try {
      const dbInstance = db.getDatabase(); // Use the interface method
      const semanticDb = new SemanticDatabaseExtension(dbInstance);

      const relatedItems = await semanticDb.findSimilarItems(params.key, params.limit);

      // Filter by minimum similarity
      const filteredItems = relatedItems.filter(item => item.similarity >= (params.minSimilarity || 0.3));

      const responseData = {
        sourceKey: params.key,
        relatedItemsCount: filteredItems.length,
        relatedItems: filteredItems.map(item => ({
          key: item.key,
          type: item.type,
          similarity: Math.round(item.similarity * 100) / 100,
          preview: this.generatePreview(item.value),
          metadata: {
            timestamp: item.metadata.timestamp.toISOString(),
            tags: item.metadata.tags || []
          }
        })),
        searchMetadata: {
          minSimilarity: params.minSimilarity || 0.3,
          requestedLimit: params.limit,
          timestamp: new Date().toISOString()
        }
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Find related context failed');
      return {
        content: [
          {
            type: 'text',
            text: `Finding related context failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generatePreview(value: unknown): string {
    if (typeof value === 'string') {
      return value.length > 150 ? value.substring(0, 150) + '...' : value;
    }

    const jsonString = JSON.stringify(value);
    return jsonString.length > 150 ? jsonString.substring(0, 150) + '...' : jsonString;
  }
}

/**
 * Tool for creating relationships between context items
 */
@injectable()
export class CreateContextRelationshipTool implements IMCPTool {
  name = 'create_context_relationship';
  description = 'Create a semantic relationship between two context items';
  schema = z.object({
    sourceKey: z.string().describe('Key of the source context item'),
    targetKey: z.string().describe('Key of the target context item'),
    relationshipType: z.string().describe('Type of the relationship'),
    similarityScore: z.number().optional().describe('Optional similarity score for the relationship')
  });

  async execute(params: z.infer<typeof this.schema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get<IDatabaseHandler>('DatabaseHandler'); // Use IDatabaseHandler

    try {
      const dbInstance = db.getDatabase(); // Use the interface method
      const semanticDb = new SemanticDatabaseExtension(dbInstance);

      await semanticDb.createRelationship(
        params.sourceKey,
        params.targetKey,
        params.relationshipType,
        params.similarityScore
      );

      return {
        content: [
          {
            type: 'text',
            text: `Relationship created successfully: ${params.sourceKey} -> ${params.targetKey} (${params.relationshipType})`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Create relationship failed');
      return {
        content: [
          {
            type: 'text',
            text: `Creating relationship failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

/**
 * Tool for updating missing embeddings in the database
 */
@injectable()
export class UpdateEmbeddingsTool implements IMCPTool {
  name = 'update_missing_embeddings';
  description = "Generate embeddings for context items that don't have them";
  schema = z.object({
    batchSize: z.number().optional().default(50).describe('Number of items to process in one batch'),
    dryRun: z.boolean().optional().default(false).describe('Preview what would be updated without making changes')
  });

  constructor(@inject('EmbeddingService') private embeddingService: EmbeddingService) {}

  async execute(params: z.infer<typeof this.schema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get<IDatabaseHandler>('DatabaseHandler'); // Use IDatabaseHandler

    try {
      const dbInstance = db.getDatabase(); // Use the interface method
      const semanticDb = new SemanticDatabaseExtension(dbInstance);

      // Get items missing embeddings
      const missingItems = await semanticDb.getMissingEmbeddingItems();

      if (missingItems.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'All context items already have embeddings!'
            }
          ]
        };
      }

      if (params.dryRun) {
        return {
          content: [
            {
              type: 'text',
              text: `Found ${missingItems.length} items without embeddings:\n${missingItems
                .slice(0, 10)
                .map(item => `- ${item.key} (${item.type})`)
                .join('\n')}${missingItems.length > 10 ? `\n... and ${missingItems.length - 10} more` : ''}`
            }
          ]
        };
      }

      // Process in batches
      const batchSize = params.batchSize || 50;
      let updated = 0;
      let failed = 0;

      for (let i = 0; i < missingItems.length; i += batchSize) {
        const batch = missingItems.slice(i, Math.min(i + batchSize, missingItems.length));

        for (const item of batch) {
          try {
            // Parse value to get text content
            let textContent: string;
            try {
              const parsed = JSON.parse(item.value);
              textContent = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
            } catch {
              textContent = item.value;
            }

            // Generate embedding
            const embedding = await this.embeddingService.generateEmbedding(textContent);

            // Update in database
            await semanticDb.updateEmbedding(item.key, embedding);
            updated++;
          } catch (error) {
            context.logger.error({ error, key: item.key }, 'Failed to update embedding for item');
            failed++;
          }
        }

        // Brief pause between batches to avoid overwhelming the system
        if (i + batchSize < missingItems.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const responseData = {
        totalItems: missingItems.length,
        updated,
        failed,
        batchSize,
        completedAt: new Date().toISOString()
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Update embeddings failed');
      return {
        content: [
          {
            type: 'text',
            text: `Updating embeddings failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// SemanticStatsTool REMOVED - Functionality consolidated into system-health.tool.ts
