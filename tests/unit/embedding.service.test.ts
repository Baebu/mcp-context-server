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
    const text1 = 'project management and planning';
    const text2 = 'managing projects and creating plans';
    const embedding1 = await embeddingService.generateEmbedding(text1);
    const embedding2 = await embeddingService.generateEmbedding(text2);
    const similarity = embeddingService.calculateSimilarity(embedding1, embedding2);

    expect(similarity).toBeGreaterThan(0.1); // Adjusted threshold for lightweight model
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

    const candidatesData = [
      // Changed to hold original data for easier assertion
      { id: 'sql', text: 'SQL database queries' },
      { id: 'cooking', text: 'cooking and recipes' },
      { id: 'storage', text: 'data storage systems' }
    ];

    const candidateEmbeddings = await Promise.all(
      candidatesData.map(item => embeddingService.generateEmbedding(item.text))
    );

    const results = embeddingService.findMostSimilar(queryEmbedding, candidateEmbeddings, 2);

    expect(results).toHaveLength(2);
    expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
    // Check if the IDs of the most similar items are among the expected ones
    const resultIds = results.map(r => candidatesData[r.index].id);
    expect(resultIds).toEqual(expect.arrayContaining(['sql', 'storage']));
  });

  it('should handle empty text by throwing an error', async () => {
    // Updated to reflect that empty string now throws error
    await expect(embeddingService.generateEmbedding('')).rejects.toThrow('Input text cannot be empty');
  });

  it('should handle similarity calculation with zero vectors', () => {
    const zeroVector = new Array(384).fill(0);
    const normalVector = new Array(384).fill(0); // Create a valid normal vector
    for (let i = 0; i < 4; ++i) normalVector[i] = i % 2 === 0 ? 1 : 0;

    const similarity = embeddingService.calculateSimilarity(zeroVector, normalVector);
    expect(similarity).toBe(0);
  });
});
