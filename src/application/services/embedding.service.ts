// Embedding Service for Semantic Context Management (Lightweight Version)
// File: src/application/services/embedding.service.ts

import { injectable } from 'inversify';
import { logger } from '../../utils/logger.js';
import type { IEmbeddingService, EmbeddingModel } from '../../core/interfaces/semantic-context.interface.js';

/**
 * Lightweight embedding service using hash-based vector generation
 * Provides deterministic semantic embeddings without external ML dependencies
 * Perfect for MVP and can be extended with real ML models later
 */
@injectable()
export class EmbeddingService implements IEmbeddingService {
  private modelInfo: EmbeddingModel;
  private isInitialized = false;
  private stopWords: Set<string>;
  private commonPatterns: RegExp[];

  constructor() {
    this.modelInfo = {
      id: 'lightweight-hash-384',
      name: 'Lightweight Hash Embedding',
      dimensions: 384,
      version: '1.0.0',
      isActive: true
    };

    // Common English stop words for better semantic representation
    this.stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'can', 'may', 'might', 'must', 'shall', 'a', 'an', 'as', 'if', 'it', 'its',
      'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
    ]);

    // Patterns for identifying important semantic elements
    this.commonPatterns = [
      /\b\d+(?:\.\d+)?\b/g,           // Numbers
      /\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g, // CamelCase
      /\b[a-zA-Z]+_[a-zA-Z_]+\b/g,    // snake_case
      /\b[a-zA-Z]+-[a-zA-Z-]+\b/g,    // kebab-case
      /\b(?:https?|ftp):\/\/[^\s]+\b/g, // URLs
      /\b[A-Z]{2,}\b/g,               // UPPERCASE acronyms
    ];
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('Embedding service already initialized');
      return;
    }

    try {
      // Lightweight initialization - no external dependencies needed
      logger.info({
        model: this.modelInfo.name,
        dimensions: this.modelInfo.dimensions,
        type: 'hash-based'
      }, 'Lightweight embedding service initialized');

      this.isInitialized = true;

    } catch (error) {
      logger.error({ error }, 'Failed to initialize embedding service');
      throw new Error(`Embedding service initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Input text cannot be empty');
    }

    try {
      const embedding = await this.generateAdvancedEmbedding(text);

      if (!this.validateEmbedding(embedding)) {
        throw new Error('Generated embedding is invalid');
      }

      logger.debug({
        textLength: text.length,
        embeddingDimensions: embedding.length,
        magnitude: this.calculateMagnitude(embedding)
      }, 'Generated lightweight embedding');

      return embedding;

    } catch (error) {
      logger.error({ error, textLength: text.length }, 'Failed to generate embedding');
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async generateAdvancedEmbedding(text: string): Promise<number[]> {
    // Initialize embedding vector
    const embedding = new Array(this.modelInfo.dimensions).fill(0) as number[];

    // Multi-layer feature extraction for better semantic representation
    const features = this.extractFeatures(text);

    // 1. Word-level semantic features (60% of embedding space)
    this.addWordFeatures(embedding, features.words, 0, Math.floor(this.modelInfo.dimensions * 0.6));

    // 2. N-gram features for context (20% of embedding space)
    this.addNGramFeatures(embedding, features.words, Math.floor(this.modelInfo.dimensions * 0.6), Math.floor(this.modelInfo.dimensions * 0.8));

    // 3. Structural and pattern features (15% of embedding space)
    this.addStructuralFeatures(embedding, features, Math.floor(this.modelInfo.dimensions * 0.8), Math.floor(this.modelInfo.dimensions * 0.95));

    // 4. Statistical features (5% of embedding space)
    this.addStatisticalFeatures(embedding, features, Math.floor(this.modelInfo.dimensions * 0.95), this.modelInfo.dimensions);

    // Normalize the embedding to unit vector
    return this.normalizeVector(embedding);
  }

  private extractFeatures(text: string): {
    originalText: string;
    normalizedText: string;
    words: string[];
    meaningfulWords: string[];
    patterns: string[];
    stats: {
      length: number;
      wordCount: number;
      avgWordLength: number;
      uniqueWords: number;
      upperCaseRatio: number;
      digitRatio: number;
    };
  } {
    const originalText = text;
    const normalizedText = text
      .toLowerCase()
      .replace(/[^\\w\\s-]/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();

    const words = normalizedText.split(/\\s+/).filter(word => word.length > 0);
    const meaningfulWords = words.filter(word =>
      word.length >= 2 &&
      !this.stopWords.has(word) &&
      !/^\\d+$/.test(word) // Exclude pure numbers
    );

    // Extract patterns from original text
    const patterns: string[] = [];
    this.commonPatterns.forEach(pattern => {
      const matches = originalText.match(pattern);
      if (matches) {
        patterns.push(...matches);
      }
    });

    const stats = {
      length: originalText.length,
      wordCount: words.length,
      avgWordLength: words.length > 0 ? words.reduce((sum, word) => sum + word.length, 0) / words.length : 0,
      uniqueWords: new Set(words).size,
      upperCaseRatio: (originalText.match(/[A-Z]/g) || []).length / originalText.length,
      digitRatio: (originalText.match(/\\d/g) || []).length / originalText.length
    };

    return {
      originalText,
      normalizedText,
      words,
      meaningfulWords,
      patterns,
      stats
    };
  }

  private addWordFeatures(embedding: number[], words: string[], startIdx: number, endIdx: number): void {
    const sectionSize = endIdx - startIdx;
    if (sectionSize <= 0 || !embedding) return;

    const wordFrequency = new Map<string, number>();

    // Calculate word frequencies
    words.forEach(word => {
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    });

    // Add word features with TF weighting
    for (const [word, freq] of wordFrequency.entries()) {
      const hash = this.advancedHash(word);
      const idx = startIdx + (hash % sectionSize);
      const tfWeight = Math.log(1 + freq); // TF weighting

      // Safe array access with bounds checking
      if (idx >= 0 && idx < embedding.length) {
        embedding[idx] = (embedding[idx] || 0) + tfWeight;
      }

      // Add character-level features for better word representation
      for (let i = 0; i < word.length - 1; i++) {
        const charPair = word.substring(i, i + 2);
        const charHash = this.advancedHash(charPair);
        const charIdx = startIdx + (charHash % sectionSize);

        // Safe array access with bounds checking
        if (charIdx >= 0 && charIdx < embedding.length) {
          embedding[charIdx] = (embedding[charIdx] || 0) + (0.1 * tfWeight);
        }
      }
    }
  }

  private addNGramFeatures(embedding: number[], words: string[], startIdx: number, endIdx: number): void {
    const sectionSize = endIdx - startIdx;
    if (sectionSize <= 0 || !embedding) return;

    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]}_${words[i + 1]}`;
      const hash = this.advancedHash(bigram);
      const idx = startIdx + (hash % sectionSize);

      // Safe array access with bounds checking
      if (idx >= 0 && idx < embedding.length) {
        embedding[idx] = (embedding[idx] || 0) + 0.8;
      }
    }

    // Trigrams for longer texts
    if (words.length >= 10) {
      for (let i = 0; i < words.length - 2; i++) {
        const trigram = `${words[i]}_${words[i + 1]}_${words[i + 2]}`;
        const hash = this.advancedHash(trigram);
        const idx = startIdx + (hash % sectionSize);

        // Safe array access with bounds checking
        if (idx >= 0 && idx < embedding.length) {
          embedding[idx] = (embedding[idx] || 0) + 0.5;
        }
      }
    }
  }

  private addStructuralFeatures(embedding: number[], features: any, startIdx: number, endIdx: number): void {
    const sectionSize = endIdx - startIdx;
    if (sectionSize <= 0 || !embedding) return;

    // Pattern-based features
    if (features.patterns && Array.isArray(features.patterns)) {
      features.patterns.forEach((pattern: string) => {
        const hash = this.advancedHash(pattern);
        const idx = startIdx + (hash % sectionSize);

        // Safe array access with bounds checking
        if (idx >= 0 && idx < embedding.length) {
          embedding[idx] = (embedding[idx] || 0) + 0.6;
        }
      });
    }

    // Structural indicators
    if (features.stats) {
      const structuralFeatures = [
        `len_${Math.floor(features.stats.length / 100)}`, // Length buckets
        `words_${Math.floor(features.stats.wordCount / 10)}`, // Word count buckets
        `avglen_${Math.floor(features.stats.avgWordLength)}`, // Average word length
        `unique_${Math.floor(features.stats.uniqueWords / 10)}`, // Unique word buckets
      ];

      structuralFeatures.forEach(feature => {
        const hash = this.advancedHash(feature);
        const idx = startIdx + (hash % sectionSize);

        // Safe array access with bounds checking
        if (idx >= 0 && idx < embedding.length) {
          embedding[idx] = (embedding[idx] || 0) + 0.3;
        }
      });
    }
  }

  private addStatisticalFeatures(embedding: number[], features: any, startIdx: number, endIdx: number): void {
    if (endIdx <= startIdx || !features.stats || !embedding) return;

    // Direct statistical encoding
    const statFeatures = [
      features.stats.upperCaseRatio * 10, // Scale ratios
      features.stats.digitRatio * 10,
      Math.min(features.stats.length / 1000, 10), // Normalized length
      Math.min(features.stats.wordCount / 100, 10), // Normalized word count
      Math.min(features.stats.avgWordLength, 10), // Capped average word length
    ];

    statFeatures.forEach((value, i) => {
      const targetIdx = startIdx + i;
      // Safe array access with bounds checking
      if (targetIdx >= 0 && targetIdx < embedding.length) {
        embedding[targetIdx] = (embedding[targetIdx] || 0) + value;
      }
    });
  }

  private advancedHash(str: string): number {
    // Implementation of djb2 hash algorithm for better distribution
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private normalizeVector(vector: number[]): number[] {
    const magnitude = this.calculateMagnitude(vector);
    if (magnitude === 0) {
      // Return small random values for zero vectors
      return vector.map(() => (Math.random() - 0.5) * 0.001);
    }
    return vector.map(val => val / magnitude);
  }

  private calculateMagnitude(vector: number[]): number {
    return Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  }

  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (!this.validateEmbedding(embedding1) || !this.validateEmbedding(embedding2)) {
      throw new Error('Invalid embeddings provided for similarity calculation');
    }

    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions for similarity calculation');
    }

    // Cosine similarity calculation with null safety
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      const val1 = embedding1[i] ?? 0; // Use nullish coalescing for safety
      const val2 = embedding2[i] ?? 0;

      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    }

    const magnitude1 = Math.sqrt(norm1);
    const magnitude2 = Math.sqrt(norm2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    const similarity = dotProduct / (magnitude1 * magnitude2);

    // Clamp to [0, 1] range and handle floating point precision
    return Math.max(0, Math.min(1, (similarity + 1) / 2)); // Convert from [-1,1] to [0,1]
  }

  getModelInfo(): EmbeddingModel {
    return { ...this.modelInfo };
  }

  validateEmbedding(embedding: number[]): boolean {
    if (!Array.isArray(embedding)) {
      logger.warn('Embedding is not an array');
      return false;
    }

    if (embedding.length !== this.modelInfo.dimensions) {
      logger.warn({
        expected: this.modelInfo.dimensions,
        actual: embedding.length
      }, 'Embedding has incorrect dimensions');
      return false;
    }

    if (embedding.some(val => typeof val !== 'number' || isNaN(val) || !isFinite(val))) {
      logger.warn('Embedding contains invalid values');
      return false;
    }

    return true;
  }

  /**
   * Batch generate embeddings for multiple texts
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Invalid input: texts must be a non-empty array');
    }

    const embeddings: number[][] = [];
    const batchSize = 20; // Process in batches to manage memory

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map(text => this.generateEmbedding(text))
      );
      embeddings.push(...batchEmbeddings);

      // Brief pause between batches for system breathing room
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    logger.info({
      processedCount: texts.length,
      batchSize
    }, 'Generated batch embeddings');

    return embeddings;
  }

  /**
   * Calculate pairwise similarities for a set of embeddings
   */
  calculatePairwiseSimilarities(embeddings: number[][]): number[][] {
    const n = embeddings.length;
    const similarities: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        // Safe array access with null checks
        const embedding1 = embeddings[i];
        const embedding2 = embeddings[j];

        if (!embedding1 || !embedding2) {
          continue; // Skip invalid embeddings
        }

        if (i === j) {
          const row = similarities[i];
          if (row) {
            row[j] = 1.0;
          }
        } else {
          const similarity = this.calculateSimilarity(embedding1, embedding2);
          const row1 = similarities[i];
          const row2 = similarities[j];

          if (row1) {
            row1[j] = similarity;
          }
          if (row2) {
            row2[i] = similarity;
          }
        }
      }
    }

    return similarities;
  }

  /**
   * Find the most similar embeddings to a query embedding
   */
  findMostSimilar(queryEmbedding: number[], candidateEmbeddings: number[][], limit: number = 5): Array<{ index: number; similarity: number }> {
    const similarities = candidateEmbeddings
      .map((embedding, index) => {
        if (!embedding) {
          return { index, similarity: 0 }; // Handle undefined embeddings
        }
        return {
          index,
          similarity: this.calculateSimilarity(queryEmbedding, embedding)
        };
      })
      .filter(item => item.similarity > 0); // Filter out invalid similarities

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Cleanup resources (lightweight version doesn't need cleanup)
   */
  dispose(): void {
    this.isInitialized = false;
    logger.info('Lightweight embedding service disposed');
  }
}
