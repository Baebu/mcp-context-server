// Semantic Context Interfaces for Enhanced Context Management
// File: src/core/interfaces/semantic-context.interface.ts

import { z } from 'zod';

/**
 * Enhanced context entry with semantic capabilities
 */
export interface SemanticContextEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    timestamp: Date;
    source: string;
    tags: string[];
    contextType: 'code' | 'documentation' | 'configuration' | 'conversation' | 'generic';
  };
  relationships?: {
    relatedEntries: string[];
    semanticSimilarity: number;
  };
}

/**
 * Options for semantic search operations
 */
export interface SemanticSearchOptions {
  query: string;
  queryEmbedding?: number[];
  limit?: number;
  minSimilarity?: number;
  contextTypes?: string[];
  includeRelated?: boolean;
  timeRange?: {
    from?: Date;
    to?: Date;
  };
}

/**
 * Result from semantic search with similarity score
 */
export interface SemanticSearchResult {
  key: string;
  value: unknown;
  type: string;
  similarity: number;
  metadata: {
    timestamp: Date;
    source: string;
    tags?: string[];
  };
}

/**
 * Embedding model configuration
 */
export interface EmbeddingModel {
  id: string;
  name: string;
  dimensions: number;
  version: string;
  isActive: boolean;
}

/**
 * Relationship between context items
 */
export interface ContextRelationship {
  id: string;
  sourceKey: string;
  targetKey: string;
  relationshipType: 'similar' | 'related' | 'child' | 'parent' | 'reference';
  similarityScore?: number;
  createdAt: Date;
}

/**
 * Semantic clustering result
 */
export interface SemanticCluster {
  id: string;
  centroid: number[];
  items: string[];
  coherenceScore: number;
  description?: string;
}

/**
 * Interface for semantic context store operations
 */
export interface ISemanticContextStore {
  /**
   * Store context with semantic embedding
   */
  storeWithEmbedding(entry: SemanticContextEntry): Promise<void>;

  /**
   * Perform semantic search across stored context
   */
  semanticSearch(options: SemanticSearchOptions): Promise<SemanticSearchResult[]>;

  /**
   * Find semantically related entries
   */
  findRelated(entryId: string, limit: number): Promise<SemanticContextEntry[]>;

  /**
   * Generate embedding for text content
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Create relationship between context items
   */
  createRelationship(sourceKey: string, targetKey: string, type: string, similarity?: number): Promise<void>;

  /**
   * Get relationships for a context item
   */
  getRelationships(key: string): Promise<ContextRelationship[]>;

  /**
   * Cluster context items by semantic similarity
   */
  clusterBySemantics(options: { minClusterSize?: number; maxClusters?: number }): Promise<SemanticCluster[]>;

  /**
   * Update embeddings for all items without embeddings
   */
  updateMissingEmbeddings(): Promise<{ updated: number; failed: number }>;
}

/**
 * Interface for embedding service
 */
export interface IEmbeddingService {
  /**
   * Initialize the embedding service
   */
  initialize(): Promise<void>;

  /**
   * Generate embedding for text
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Calculate similarity between two embeddings
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number;

  /**
   * Get embedding model information
   */
  getModelInfo(): EmbeddingModel;

  /**
   * Validate embedding dimensions
   */
  validateEmbedding(embedding: number[]): boolean;

  /**
   * Batch generate embeddings for multiple texts
   */
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * Calculate pairwise similarities for a set of embeddings
   */
  calculatePairwiseSimilarities(embeddings: number[][]): number[][];

  /**
   * Find the most similar embeddings to a query embedding
   */
  findMostSimilar(
    queryEmbedding: number[],
    candidateEmbeddings: number[][],
    limit?: number
  ): Array<{ index: number; similarity: number }>;

  /**
   * Cleanup resources
   */
  dispose(): void;
}

/**
 * Zod schemas for validation
 */

export const contextTypeSchema = z.enum(['code', 'documentation', 'configuration', 'conversation', 'generic']);

export const semanticContextEntrySchema = z.object({
  id: z.string().describe('Unique identifier for the context entry'),
  content: z.string().describe('The actual content to store'),
  embedding: z.array(z.number()).optional().describe('Vector embedding for semantic search'),
  metadata: z.object({
    timestamp: z.date().describe('When the entry was created'),
    source: z.string().describe('Source of the content'),
    tags: z.array(z.string()).describe('Semantic tags for categorization'),
    contextType: contextTypeSchema.describe('Type of context content')
  })
});

export const semanticSearchSchema = z.object({
  query: z.string().describe('Natural language search query'),
  limit: z.number().optional().default(5).describe('Maximum results to return'),
  minSimilarity: z.number().optional().default(0.7).describe('Minimum similarity threshold (0-1)'),
  contextTypes: z.array(z.string()).optional().describe('Filter by context types'),
  includeRelated: z.boolean().optional().default(false).describe('Include semantically related entries'),
  timeRange: z
    .object({
      from: z.date().optional().describe('Start of time range filter'),
      to: z.date().optional().describe('End of time range filter')
    })
    .optional()
    .describe('Filter by time range'),
  // Traditional query filters for consolidation
  keyPattern: z.string().optional().describe('Key pattern to match for traditional search'),
  type: z.string().optional().describe('Filter by context type for traditional search')
});

export const relationshipTypeSchema = z.enum(['similar', 'related', 'child', 'parent', 'reference']);

export const createRelationshipSchema = z.object({
  sourceKey: z.string().describe('Key of the source context item'),
  targetKey: z.string().describe('Key of the target context item'),
  relationshipType: relationshipTypeSchema.describe('Type of relationship'),
  similarityScore: z.number().min(0).max(1).optional().describe('Similarity score between items')
});

export const clusterOptionsSchema = z.object({
  minClusterSize: z.number().optional().default(3).describe('Minimum items per cluster'),
  maxClusters: z.number().optional().default(10).describe('Maximum number of clusters to create')
});

/**
 * Type exports for convenience
 */
export type ContextType = z.infer<typeof contextTypeSchema>;
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;
export type SemanticSearchParams = z.infer<typeof semanticSearchSchema>;
export type CreateRelationshipParams = z.infer<typeof createRelationshipSchema>;
export type ClusterOptions = z.infer<typeof clusterOptionsSchema>;
