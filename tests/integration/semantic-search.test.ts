// Integration Tests for Semantic Search Implementation (Lightweight Version)
// File: tests/integration/semantic-search.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Container } from 'inversify';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';

// Services
import { EmbeddingService } from '../../src/application/services/embedding.service.js';
import { DatabaseAdapter } from '../../src/infrastructure/adapters/database.adapter.js';
import { SemanticDatabaseExtension } from '../../src/infrastructure/adapters/semantic-database.extension.js';

// Tools
import { 
  SemanticSearchTool, 
  FindRelatedContextTool, 
  UpdateEmbeddingsTool,
  SemanticStatsTool
} from '../../src/application/tools/semantic-search.tool.js';
import {
  EnhancedStoreContextTool
} from '../../src/application/tools/enhanced-database-operations.tool.js';

// Interfaces
import type { IEmbeddingService } from '../../src/core/interfaces/semantic-context.interface.js';
import type { IDatabaseHandler } from '../../src/core/interfaces/database.interface.js';
import type { ToolContext } from '../../src/core/interfaces/tool-registry.interface.js';

// Test configuration
const TEST_DB_PATH = join(__dirname, 'test-semantic.db');

describe('Semantic Search Integration Tests (Lightweight)', () => {
  let container: Container;
  let embeddingService: IEmbeddingService;
  let databaseHandler: IDatabaseHandler;
  let semanticDb: SemanticDatabaseExtension;
  let toolContext: ToolContext;

  beforeAll(async () => {
    // Setup test container
    container = new Container();
    
    // Mock configuration for database
    const mockConfig = {
      database: { path: TEST_DB_PATH },
      server: { workingDirectory: __dirname }
    };
    
    container.bind('Config').toConstantValue(mockConfig);
    container.bind<IEmbeddingService>('EmbeddingService').to(EmbeddingService).inSingletonScope();
    container.bind<IDatabaseHandler>('DatabaseHandler').to(DatabaseAdapter).inSingletonScope();

    // Initialize services
    embeddingService = container.get<IEmbeddingService>('EmbeddingService');
    await embeddingService.initialize();

    databaseHandler = container.get<IDatabaseHandler>('DatabaseHandler');
    
    // Create semantic database extension
    const dbInstance = (databaseHandler as any).db;
    semanticDb = new SemanticDatabaseExtension(dbInstance);

    // Setup tool context
    toolContext = {
      container,
      logger: { 
        debug: jest.fn(), 
        info: jest.fn(), 
        warn: jest.fn(), 
        error: jest.fn() 
      } as any
    };

    // Run database migration for semantic features
    await runSemanticMigration(dbInstance);
  });

  afterAll(async () => {
    // Cleanup test database
    databaseHandler.close();
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clear existing data before each test
    const dbInstance = (databaseHandler as any).db;
    dbInstance.exec('DELETE FROM context_items');
    dbInstance.exec('DELETE FROM context_relationships');
  });

  describe('Lightweight EmbeddingService', () => {
    it('should generate consistent embeddings for identical text', async () => {
      const text = 'This is a test context entry about project management';
      const embedding1 = await embeddingService.generateEmbedding(text);
      const embedding2 = await embeddingService.generateEmbedding(text);
      
      expect(embedding1).toEqual(embedding2);
      expect(embedding1.length).toBe(384);
      expect(embedding1.every(val => typeof val === 'number' && isFinite(val))).toBe(true);
    });

    it('should find semantically similar content', async () => {
      const embedding1 = await embeddingService.generateEmbedding('project management and team coordination');
      const embedding2 = await embeddingService.generateEmbedding('managing projects and coordinating teams');
      const embedding3 = await embeddingService.generateEmbedding('cooking recipes and kitchen techniques');
      
      const similarity12 = embeddingService.calculateSimilarity(embedding1, embedding2);
      const similarity13 = embeddingService.calculateSimilarity(embedding1, embedding3);
      
      expect(similarity12).toBeGreaterThan(similarity13);
      expect(similarity12).toBeGreaterThan(0.1);
      expect(similarity12).toBeLessThanOrEqual(1.0);
      expect(similarity13).toBeGreaterThanOrEqual(0.0);
    });

    it('should handle edge cases gracefully', async () => {
      await expect(embeddingService.generateEmbedding('')).rejects.toThrow('Input text cannot be empty');
      
      const shortEmbedding = await embeddingService.generateEmbedding('a');
      expect(shortEmbedding).toHaveLength(384);
      
      const longText = 'word '.repeat(1000);
      const longEmbedding = await embeddingService.generateEmbedding(longText);
      expect(longEmbedding).toHaveLength(384);
    });

    it('should generate diverse embeddings for different content types', async () => {
      const codeText = 'function calculateSum(a, b) { return a + b; }';
      const documentationText = 'This function calculates the sum of two numbers';
      const conversationText = 'Hey, can you help me with this calculation?';
      
      const codeEmbedding = await embeddingService.generateEmbedding(codeText);
      const docEmbedding = await embeddingService.generateEmbedding(documentationText);
      const chatEmbedding = await embeddingService.generateEmbedding(conversationText);
      
      // Each should be different
      expect(codeEmbedding).not.toEqual(docEmbedding);
      expect(docEmbedding).not.toEqual(chatEmbedding);
      expect(codeEmbedding).not.toEqual(chatEmbedding);
      
      // But related content should have reasonable similarity
      const codeSimilarity = embeddingService.calculateSimilarity(codeEmbedding, docEmbedding);
      expect(codeSimilarity).toBeGreaterThan(0.0);
    });
  });

  describe('SemanticDatabaseExtension', () => {
    it('should store and retrieve context with embeddings', async () => {
      const key = 'test:semantic:storage';
      const value = 'This is a test about machine learning and AI algorithms';
      const type = 'documentation';
      const embedding = await embeddingService.generateEmbedding(value);
      const tags = ['ai', 'machine-learning', 'algorithms'];

      await semanticDb.storeSemanticContext(key, value, type, embedding, tags);

      // Verify storage by searching
      const results = await semanticDb.semanticSearch({
        query: 'artificial intelligence',
        queryEmbedding: await embeddingService.generateEmbedding('artificial intelligence'),
        limit: 5,
        minSimilarity: 0.1
      });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].key).toBe(key);
      expect(results[0].type).toBe(type);
    });

    it('should perform semantic search with similarity scoring', async () => {
      // Store test data
      const testData = [
        { key: 'ai:1', value: 'Machine learning algorithms and neural networks for data analysis', type: 'documentation' },
        { key: 'ai:2', value: 'Deep learning and artificial intelligence concepts in modern computing', type: 'documentation' },
        { key: 'cooking:1', value: 'Recipe for chocolate cake and baking techniques in the kitchen', type: 'generic' },
        { key: 'sports:1', value: 'Football strategies and game analysis for competitive teams', type: 'generic' }
      ];

      for (const item of testData) {
        const embedding = await embeddingService.generateEmbedding(item.value);
        await semanticDb.storeSemanticContext(item.key, item.value, item.type, embedding);
      }

      // Search for AI-related content
      const queryEmbedding = await embeddingService.generateEmbedding('artificial intelligence and machine learning');
      const results = await semanticDb.semanticSearch({
        query: 'artificial intelligence and machine learning',
        queryEmbedding,
        limit: 5,
        minSimilarity: 0.1
      });

      expect(results.length).toBeGreaterThan(0);
      
      // Should find AI-related items
      const aiResults = results.filter(r => r.key.startsWith('ai:'));
      expect(aiResults.length).toBeGreaterThanOrEqual(1);
      
      // Results should be ordered by similarity
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
      }
    });

    it('should create and retrieve relationships', async () => {
      const sourceKey = 'source:test';
      const targetKey = 'target:test';
      const relationshipType = 'similar';
      const similarityScore = 0.85;

      await semanticDb.createRelationship(sourceKey, targetKey, relationshipType, similarityScore);

      const relationships = await semanticDb.getRelationships(sourceKey);
      
      expect(relationships).toHaveLength(1);
      expect(relationships[0].sourceKey).toBe(sourceKey);
      expect(relationships[0].targetKey).toBe(targetKey);
      expect(relationships[0].relationshipType).toBe(relationshipType);
      expect(relationships[0].similarityScore).toBe(similarityScore);
    });

    it('should find similar items', async () => {
      // Store related items
      const items = [
        { key: 'tech:react', value: 'React JavaScript library for building user interfaces and web applications' },
        { key: 'tech:vue', value: 'Vue.js progressive JavaScript framework for frontend development' },
        { key: 'tech:angular', value: 'Angular TypeScript framework for web applications and single page apps' },
        { key: 'food:pizza', value: 'Italian pizza recipe with fresh tomatoes, mozzarella cheese and basil' }
      ];

      for (const item of items) {
        const embedding = await embeddingService.generateEmbedding(item.value);
        await semanticDb.storeSemanticContext(item.key, item.value, 'documentation', embedding);
      }

      const similarItems = await semanticDb.findSimilarItems('tech:react', 5);
      
      expect(similarItems.length).toBeGreaterThan(0);
      
      // Should find other tech items as more similar than food items
      const techItems = similarItems.filter(item => item.key.startsWith('tech:'));
      const foodItems = similarItems.filter(item => item.key.startsWith('food:'));
      
      if (techItems.length > 0 && foodItems.length > 0) {
        expect(techItems[0].similarity).toBeGreaterThan(foodItems[0].similarity);
      }
    });
  });

  describe('Semantic Search Tools', () => {
    it('should execute semantic search tool successfully', async () => {
      const tool = new SemanticSearchTool(embeddingService);
      
      // Store test data
      const storeData = [
        { key: 'ml:basics', value: 'Introduction to machine learning fundamentals and basic concepts' },
        { key: 'ml:advanced', value: 'Advanced deep learning techniques, neural networks and AI algorithms' }
      ];

      for (const item of storeData) {
        const embedding = await embeddingService.generateEmbedding(item.value);
        await semanticDb.storeSemanticContext(item.key, item.value, 'documentation', embedding);
      }

      const result = await tool.execute({
        query: 'machine learning basics and fundamentals',
        limit: 5,
        minSimilarity: 0.1
      }, toolContext);

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.query).toBe('machine learning basics and fundamentals');
      expect(responseData.resultsCount).toBeGreaterThan(0);
      expect(responseData.results).toHaveLength(responseData.resultsCount);
    });

    it('should execute enhanced store context tool', async () => {
      const tool = new EnhancedStoreContextTool(embeddingService);
      
      const result = await tool.execute({
        key: 'test:enhanced:store',
        value: 'This is a test of enhanced context storage with automatic embedding generation',
        type: 'documentation',
        generateEmbedding: true
      }, toolContext);

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('semantic enhancements');
      
      // Verify the item was stored with embedding
      const stats = await semanticDb.getSemanticStats();
      expect(stats.itemsWithEmbeddings).toBeGreaterThan(0);
    });

    it('should execute update embeddings tool', async () => {
      // Store context without embedding first
      await databaseHandler.storeContext('test:no:embedding', 'Test content without embedding', 'generic');
      
      const tool = new UpdateEmbeddingsTool(embeddingService);
      
      const result = await tool.execute({
        batchSize: 10,
        dryRun: false
      }, toolContext);

      expect(result.content).toBeDefined();
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.updated).toBe(1);
      expect(responseData.failed).toBe(0);
    });

    it('should execute semantic stats tool', async () => {
      // Store some test data with embeddings
      const embedding = await embeddingService.generateEmbedding('test content for statistics');
      await semanticDb.storeSemanticContext('test:stats', 'test content for statistics', 'generic', embedding);
      
      const tool = new SemanticStatsTool();
      
      const result = await tool.execute({}, toolContext);

      expect(result.content).toBeDefined();
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.semanticSearchStats).toBeDefined();
      expect(responseData.semanticSearchStats.totalContextItems).toBeGreaterThan(0);
      expect(responseData.semanticSearchStats.itemsWithEmbeddings).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle batch embedding generation efficiently', async () => {
      const texts = Array.from({ length: 20 }, (_, i) => 
        `Test content number ${i} with different words and semantic context for testing embeddings`
      );
      
      const startTime = Date.now();
      const embeddings = await embeddingService.generateBatchEmbeddings(texts);
      const endTime = Date.now();
      
      expect(embeddings).toHaveLength(20);
      expect(embeddings.every(emb => emb.length === 384)).toBe(true);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should handle large-scale similarity calculations', async () => {
      const baseEmbedding = await embeddingService.generateEmbedding('base text for comparison and similarity testing');
      const testEmbeddings = await Promise.all(
        Array.from({ length: 50 }, (_, i) => 
          embeddingService.generateEmbedding(`test content ${i} with unique semantic features`)
        )
      );
      
      const startTime = Date.now();
      const similarItems = embeddingService.findMostSimilar(baseEmbedding, testEmbeddings, 10);
      const endTime = Date.now();
      
      expect(similarItems).toHaveLength(10);
      expect(similarItems.every(item => typeof item.similarity === 'number')).toBe(true);
      expect(similarItems.every(item => item.similarity >= 0 && item.similarity <= 1)).toBe(true);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should maintain embedding quality across different text types', async () => {
      const testCases = [
        { type: 'code', text: 'function processData(input) { return input.map(x => x * 2); }' },
        { type: 'documentation', text: 'This function processes data by doubling each value in the input array' },
        { type: 'conversation', text: 'Can you help me understand how this data processing function works?' },
        { type: 'technical', text: 'Array.prototype.map() creates a new array with the results of calling a provided function' }
      ];

      const embeddings = await Promise.all(
        testCases.map(tc => embeddingService.generateEmbedding(tc.text))
      );

      // All embeddings should be valid
      embeddings.forEach(embedding => {
        expect(embeddingService.validateEmbedding(embedding)).toBe(true);
      });

      // Related content should have reasonable similarity
      const codeSimilarity = embeddingService.calculateSimilarity(embeddings[0], embeddings[1]);
      const conversationSimilarity = embeddingService.calculateSimilarity(embeddings[1], embeddings[2]);
      
      expect(codeSimilarity).toBeGreaterThan(0.1);
      expect(conversationSimilarity).toBeGreaterThan(0.1);
    });
  });
});

// Helper function to run semantic migration
async function runSemanticMigration(db: any): Promise<void> {
  db.exec(`
    ALTER TABLE context_items ADD COLUMN embedding TEXT;
    ALTER TABLE context_items ADD COLUMN semantic_tags TEXT;
    ALTER TABLE context_items ADD COLUMN context_type TEXT DEFAULT 'generic';
    ALTER TABLE context_items ADD COLUMN relationships TEXT;

    CREATE INDEX IF NOT EXISTS idx_context_type ON context_items(context_type);
    CREATE INDEX IF NOT EXISTS idx_semantic_tags ON context_items(semantic_tags);
    CREATE INDEX IF NOT EXISTS idx_embedding_exists ON context_items(embedding) WHERE embedding IS NOT NULL;

    CREATE TABLE IF NOT EXISTS context_relationships (
      id TEXT PRIMARY KEY,
      source_key TEXT NOT NULL,
      target_key TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      similarity_score REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_key) REFERENCES context_items(key) ON DELETE CASCADE,
      FOREIGN KEY (target_key) REFERENCES context_items(key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_relationship_source ON context_relationships(source_key);
    CREATE INDEX IF NOT EXISTS idx_relationship_target ON context_relationships(target_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_relationship 
    ON context_relationships(source_key, target_key, relationship_type);
  `);
}
