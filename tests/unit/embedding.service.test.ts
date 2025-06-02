import { describe, it, expect, beforeAll } from '@jest/globals';
import { EmbeddingService } from '../../src/application/services/embedding.service.js';

describe('Embedding Service', () => {
  let embeddingService: EmbeddingService;

  beforeAll(async () => {
    embeddingService = new EmbeddingService();
    await embeddingService.initialize();
  });

  it('should generate consistent embeddings for identical text', async () => {
    const text = 'This is a test context entry about project management';
    const embedding1 = await embeddingService.generateEmbedding(text);
    const embedding2 = await embeddingService.generateEmbedding(text);
    
    expect(embedding1).toEqual(embedding2);
    expect(embedding1.length).toBe(384);
    expect(embedding1.every(val => typeof val === 'number')).toBe(true);
  });

  it('should calculate similarity between similar texts', async () => {
    const similarity = await embeddingService.calculateTextSimilarity(
      'project management and planning',
      'managing projects and creating plans'
    );
    
    expect(similarity).toBeGreaterThan(0.3);
    expect(similarity).toBeLessThanOrEqual(1.0);
  });

  it('should calculate cosine similarity between embeddings', async () => {
    const embedding1 = await embeddingService.generateEmbedding('machine learning');
    const embedding2 = await embeddingService.generateEmbedding('artificial intelligence');
    const embedding3 = await embeddingService.generateEmbedding('cooking recipes');
    
    const similarityRelated = embeddingService.calculateSimilarity(embedding1, embedding2);
    const similarityUnrelated = embeddingService.calculateSimilarity(embedding1, embedding3);
    
    expect(similarityRelated).toBeGreaterThan(similarityUnrelated);
    expect(similarityRelated).toBeGreaterThan(0);
    expect(similarityRelated).toBeLessThanOrEqual(1);
  });

  it('should find most similar embeddings from a list', async () => {
    const queryEmbedding = await embeddingService.generateEmbedding('database operations');
    
    const candidates = [
      { id: 'sql', embedding: await embeddingService.generateEmbedding('SQL database queries') },
      { id: 'cooking', embedding: await embeddingService.generateEmbedding('cooking and recipes') },
      { id: 'storage', embedding: await embeddingService.generateEmbedding('data storage systems') }
    ];

    const results = embeddingService.findMostSimilar(queryEmbedding, candidates, 2);
    
    expect(results).toHaveLength(2);
    expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
    expect(['sql', 'storage']).toContain(results[0].id);
  });

  it('should handle empty text gracefully', async () => {
    const embedding = await embeddingService.generateEmbedding('');
    expect(embedding).toHaveLength(384);
    expect(embedding.every(val => val === 0)).toBe(true);
  });

  it('should handle similarity calculation with zero vectors', () => {
    const zeroVector = new Array(384).fill(0);
    const normalVector = [1, 0, 1, 0];
    
    const similarity = embeddingService.calculateSimilarity(zeroVector, normalVector);
    expect(similarity).toBe(0);
  });
});
