// Semantic Database Operations Extension
// File: src/infrastructure/adapters/semantic-database.extension.ts

import Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';
import type {
  SemanticSearchOptions,
  SemanticSearchResult,
  ContextRelationship
} from '../../core/interfaces/semantic-context.interface.js';

/**
 * Extension class for adding semantic operations to the database adapter
 * This allows us to add semantic functionality without modifying the core database adapter
 */
export class SemanticDatabaseExtension {
  constructor(private db: Database.Database) {}

  /**
   * Store context with semantic enhancements
   */
  async storeSemanticContext(
    key: string,
    value: unknown,
    type: string = 'generic',
    embedding?: number[],
    tags?: string[]
  ): Promise<void> {
    const embeddingJson = embedding ? JSON.stringify(embedding) : null;
    const tagsJson = tags ? JSON.stringify(tags) : null;

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO context_items
        (key, value, type, embedding, semantic_tags, context_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      stmt.run(key, JSON.stringify(value), type, embeddingJson, tagsJson, type);

      logger.debug(
        {
          key,
          type,
          hasEmbedding: !!embedding,
          tagCount: tags?.length || 0
        },
        'Semantic context stored'
      );
    } catch (error) {
      logger.error({ error, key, type }, 'Failed to store semantic context');
      throw error;
    }
  }

  /**
   * Perform semantic search with embedding similarity
   */
  async semanticSearch(options: SemanticSearchOptions): Promise<SemanticSearchResult[]> {
    try {
      // Build base query with filters
      let query = 'SELECT * FROM context_items WHERE 1=1';
      const params: unknown[] = [];

      // Filter by context types
      if (options.contextTypes && options.contextTypes.length > 0) {
        const placeholders = options.contextTypes.map(() => '?').join(',');
        query += ` AND context_type IN (${placeholders})`;
        params.push(...options.contextTypes);
      }

      // Filter by time range
      if (options.timeRange?.from) {
        query += ' AND updated_at >= ?';
        params.push(options.timeRange.from.toISOString());
      }

      if (options.timeRange?.to) {
        query += ' AND updated_at <= ?';
        params.push(options.timeRange.to.toISOString());
      }

      // Order by recency if no embedding provided
      query += ' ORDER BY updated_at DESC';

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as Array<{
        key: string;
        value: string;
        type: string;
        context_type: string;
        embedding: string | null;
        semantic_tags: string | null;
        created_at: string;
        updated_at: string;
      }>;

      const results: SemanticSearchResult[] = [];

      for (const row of rows) {
        let similarity = 1.0; // Default similarity for text-based matches

        // Calculate semantic similarity if embeddings are available
        if (options.queryEmbedding && row.embedding) {
          try {
            const storedEmbedding = JSON.parse(row.embedding);
            similarity = this.calculateCosineSimilarity(options.queryEmbedding, storedEmbedding);

            // Skip if below threshold
            if (similarity < (options.minSimilarity || 0.7)) {
              continue;
            }
          } catch (error) {
            logger.warn({ key: row.key, error }, 'Failed to parse stored embedding');
            continue;
          }
        } else if (options.queryEmbedding && !row.embedding) {
          // Skip items without embeddings when doing semantic search
          continue;
        }

        // Parse stored data
        let value: unknown;
        try {
          value = JSON.parse(row.value);
        } catch {
          value = row.value;
        }

        let tags: string[] = [];
        if (row.semantic_tags) {
          try {
            tags = JSON.parse(row.semantic_tags);
          } catch {
            // Ignore parsing errors for tags
          }
        }

        results.push({
          key: row.key,
          value,
          type: row.context_type || row.type,
          similarity,
          metadata: {
            timestamp: new Date(row.updated_at),
            source: 'database',
            tags
          }
        });
      }

      // Sort by similarity and apply limit
      const sortedResults = results.sort((a, b) => b.similarity - a.similarity).slice(0, options.limit || 5);

      logger.debug(
        {
          queryLength: options.query.length,
          totalRows: rows.length,
          matchedResults: results.length,
          returnedResults: sortedResults.length,
          hasEmbedding: !!options.queryEmbedding
        },
        'Semantic search completed'
      );

      return sortedResults;
    } catch (error) {
      logger.error({ error, options }, 'Semantic search failed');
      throw error;
    }
  }

  /**
   * Create a relationship between context items
   */
  async createRelationship(
    sourceKey: string,
    targetKey: string,
    relationshipType: string,
    similarityScore?: number
  ): Promise<void> {
    try {
      const relationshipId = `${sourceKey}-${targetKey}-${relationshipType}`;

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO context_relationships
        (id, source_key, target_key, relationship_type, similarity_score, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run(relationshipId, sourceKey, targetKey, relationshipType, similarityScore || null);

      logger.debug(
        {
          sourceKey,
          targetKey,
          relationshipType,
          similarityScore
        },
        'Context relationship created'
      );
    } catch (error) {
      logger.error({ error, sourceKey, targetKey, relationshipType }, 'Failed to create relationship');
      throw error;
    }
  }

  /**
   * Get relationships for a context item
   */
  async getRelationships(key: string): Promise<ContextRelationship[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM context_relationships
        WHERE source_key = ? OR target_key = ?
        ORDER BY similarity_score DESC, created_at DESC
      `);

      const rows = stmt.all(key, key) as Array<{
        id: string;
        source_key: string;
        target_key: string;
        relationship_type: string;
        similarity_score: number | null;
        created_at: string;
      }>;

      return rows.map(row => ({
        id: row.id,
        sourceKey: row.source_key,
        targetKey: row.target_key,
        relationshipType: row.relationship_type as any,
        similarityScore: row.similarity_score || undefined,
        createdAt: new Date(row.created_at)
      }));
    } catch (error) {
      logger.error({ error, key }, 'Failed to get relationships');
      throw error;
    }
  }

  /**
   * Find items similar to a given key
   */
  async findSimilarItems(key: string, limit: number = 5): Promise<SemanticSearchResult[]> {
    try {
      // First get the embedding for the source item
      const sourceStmt = this.db.prepare('SELECT embedding FROM context_items WHERE key = ?');
      const sourceRow = sourceStmt.get(key) as { embedding: string | null } | undefined;

      if (!sourceRow?.embedding) {
        return [];
      }

      const sourceEmbedding = JSON.parse(sourceRow.embedding);

      // Get all items with embeddings (excluding the source)
      const candidatesStmt = this.db.prepare(`
        SELECT key, value, type, context_type, embedding, semantic_tags, updated_at
        FROM context_items
        WHERE key != ? AND embedding IS NOT NULL
      `);

      const candidates = candidatesStmt.all(key) as Array<{
        key: string;
        value: string;
        type: string;
        context_type: string;
        embedding: string;
        semantic_tags: string | null;
        updated_at: string;
      }>;

      const similarities: Array<{ item: (typeof candidates)[0]; similarity: number }> = [];

      for (const candidate of candidates) {
        try {
          const candidateEmbedding = JSON.parse(candidate.embedding);
          const similarity = this.calculateCosineSimilarity(sourceEmbedding, candidateEmbedding);

          if (similarity >= 0.3) {
            // Only include reasonably similar items
            similarities.push({ item: candidate, similarity });
          }
        } catch (error) {
          logger.warn({ key: candidate.key, error }, 'Failed to calculate similarity');
        }
      }

      // Sort by similarity and take top results
      const topSimilar = similarities.sort((a, b) => b.similarity - a.similarity).slice(0, limit);

      return topSimilar.map(({ item, similarity }) => {
        let value: unknown;
        try {
          value = JSON.parse(item.value);
        } catch {
          value = item.value;
        }

        let tags: string[] = [];
        if (item.semantic_tags) {
          try {
            tags = JSON.parse(item.semantic_tags);
          } catch {
            // Ignore tag parsing errors
          }
        }

        return {
          key: item.key,
          value,
          type: item.context_type || item.type,
          similarity,
          metadata: {
            timestamp: new Date(item.updated_at),
            source: 'database',
            tags
          }
        };
      });
    } catch (error) {
      logger.error({ error, key }, 'Failed to find similar items');
      throw error;
    }
  }

  /**
   * Update missing embeddings for context items
   */
  async getMissingEmbeddingItems(): Promise<Array<{ key: string; value: string; type: string }>> {
    try {
      const stmt = this.db.prepare(`
        SELECT key, value, type
        FROM context_items
        WHERE embedding IS NULL
        ORDER BY updated_at DESC
      `);

      const rows = stmt.all() as Array<{ key: string; value: string; type: string }>;

      logger.debug({ count: rows.length }, 'Found items missing embeddings');

      return rows;
    } catch (error) {
      logger.error({ error }, 'Failed to get items missing embeddings');
      throw error;
    }
  }

  /**
   * Update embedding for a specific context item
   */
  async updateEmbedding(key: string, embedding: number[]): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE context_items
        SET embedding = ?, updated_at = CURRENT_TIMESTAMP
        WHERE key = ?
      `);

      const result = stmt.run(JSON.stringify(embedding), key);

      if (result.changes === 0) {
        throw new Error(`Context item with key '${key}' not found`);
      }

      logger.debug({ key, dimensions: embedding.length }, 'Updated embedding for context item');
    } catch (error) {
      logger.error({ error, key }, 'Failed to update embedding');
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      const val1 = vec1[i] ?? 0;
      const val2 = vec2[i] ?? 0;
      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    }

    const magnitude1 = Math.sqrt(norm1);
    const magnitude2 = Math.sqrt(norm2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Get semantic search statistics
   */
  async getSemanticStats(): Promise<{
    totalItems: number;
    itemsWithEmbeddings: number;
    embeddingCoverage: number;
    totalRelationships: number;
  }> {
    try {
      const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM context_items');
      const embeddedStmt = this.db.prepare('SELECT COUNT(*) as count FROM context_items WHERE embedding IS NOT NULL');
      const relationshipsStmt = this.db.prepare('SELECT COUNT(*) as count FROM context_relationships');

      const totalItems = (totalStmt.get() as { count: number }).count;
      const itemsWithEmbeddings = (embeddedStmt.get() as { count: number }).count;
      const totalRelationships = (relationshipsStmt.get() as { count: number }).count;

      const embeddingCoverage = totalItems > 0 ? (itemsWithEmbeddings / totalItems) * 100 : 0;

      return {
        totalItems,
        itemsWithEmbeddings,
        embeddingCoverage: Math.round(embeddingCoverage * 100) / 100,
        totalRelationships
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get semantic stats');
      throw error;
    }
  }
}
