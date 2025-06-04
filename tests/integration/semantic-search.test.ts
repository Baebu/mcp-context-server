// Integration Tests for Semantic Search Implementation (Lightweight Version)
// File: tests/integration/semantic-search.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { Container } from 'inversify';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';

// Services
import { EmbeddingService } from '../../src/application/services/embedding.service.js';
import { DatabaseAdapter } from '../../src/infrastructure/adapters/database.adapter.js';
import { SemanticDatabaseExtension } from '../../src/infrastructure/adapters/semantic-database.extension.js';
import type { ServerConfig } from '../../src/infrastructure/config/schema.js';
import { SafeZoneMode } from '../../src/infrastructure/config/types.js'; // Import SafeZoneMode

// Tools
import {
  SemanticSearchTool,
  FindRelatedContextTool,
  UpdateEmbeddingsTool,
  SemanticStatsTool
} from '../../src/application/tools/semantic-search.tool.js';
import { EnhancedStoreContextTool } from '../../src/application/tools/enhanced-database-operations.tool.js';

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
  let mockConfig: ServerConfig;

  beforeAll(async () => {
    // Setup test container
    container = new Container();

    mockConfig = {
      database: {
        path: TEST_DB_PATH,
        backupInterval: 0,
        busyTimeout: 5000,
        cacheSize: 1000,
        poolSize: 1,
        vacuum: { enabled: false, schedule: '', threshold: 0 },
        vectorStorage: { enabled: true, embeddingDimensions: 384, similarityThreshold: 0.7 },
        walMode: true
      },
      server: {
        name: 'test-server',
        version: '1.0',
        port: 1234,
        host: 'localhost',
        transport: 'stdio',
        fastmcp: { enabled: true, sessionTimeout: 0, progressReporting: false, authentication: false }
      },
      security: {
        safeZoneMode: SafeZoneMode.STRICT, // Use enum member
        allowedPaths: [],
        maxFileSize: 100,
        enableAuditLog: false,
        sessionTimeout: 100,
        maxSessions: 1,
        allowedCommands: [],
        restrictedZones: [],
        safezones: [],
        maxExecutionTime: 1000,
        unsafeArgumentPatterns: [],
        autoExpandSafezones: false,
        blockedPathPatterns: [],
        processKillGracePeriodMs: 100,
        maxConcurrentProcesses: 1,
        maxProcessMemoryMB: 64,
        maxProcessCpuPercent: 50,
        defaultTimeoutMs: 1000,
        maxTimeoutMs: 5000,
        cleanupIntervalMs: 60000,
        resourceCheckIntervalMs: 5000,
        enableProcessMonitoring: false
      },
      logging: {
        level: 'error',
        pretty: false,
        file: { enabled: false, path: '', maxSize: 1, maxFiles: 1, rotateDaily: false },
        audit: { enabled: false, path: '', maxSize: 1, maxFiles: 1 }
      },
      performance: {
        maxConcurrency: 1,
        queueSize: 10,
        timeouts: { default: 1000, fileOperations: 1000, databaseOperations: 1000, semanticSearch: 1000 },
        rateLimiting: { enabled: false, windowMs: 1000, maxRequests: 10 }
      },
      memory: {
        maxContextTokens: 1024,
        maxMemoryMB: 64,
        cacheSize: 10,
        gcInterval: 60000,
        optimizer: { enabled: false, gcThreshold: 0.85, monitoringInterval: 30000, chunkSize: 1024 },
        embeddingCache: { maxSize: 10, ttl: 60000 },
        relevanceCache: { maxSize: 10, ttl: 60000 }
      },
      plugins: {
        directory: '',
        autoDiscover: false,
        sandbox: false,
        maxPlugins: 1,
        enabled: [],
        disabled: [],
        maxLoadTime: 1000,
        security: { allowNetworkAccess: false, allowFileSystemAccess: false, allowProcessExecution: false }
      },
      features: {
        fastmcpIntegration: false,
        semanticMemory: true,
        vectorStorage: true,
        enhancedSecurity: false,
        memoryOptimization: false,
        pluginSystem: false,
        advancedBackup: false,
        realTimeMonitoring: false,
        sessionManagement: false,
        auditLogging: false
      },
      development: {
        enabled: false,
        debugMode: false,
        enableDebugLogs: false,
        enableProfiler: false,
        hotReload: false,
        mockServices: false,
        testData: { enabled: false, seedDatabase: false },
        profiling: { enabled: false, samplingRate: 0.1 }
      },
      consent: { alwaysAllow: [], alwaysDeny: [], requireConsent: [] },
      ui: { consentPort: 3004 },
      semanticSearch: {
        enabled: true,
        provider: 'tensorflow',
        model: 'universal-sentence-encoder',
        batchSize: 32,
        maxQueryLength: 500,
        relevanceScoring: { semanticWeight: 0.4, recencyWeight: 0.3, typeWeight: 0.2, accessWeight: 0.1 }
      },
      backup: {
        enabled: false,
        directory: './backups',
        maxVersions: 1,
        compression: false,
        schedule: { auto: '', cleanup: '' },
        types: {
          emergency: { maxCount: 1, retention: 0 },
          manual: { maxCount: 1, retention: 0 },
          auto: { maxCount: 1, retention: 0 }
        }
      },
      monitoring: {
        enabled: false,
        healthCheck: { interval: 60000, endpoints: [] },
        metrics: { enabled: false, collectInterval: 30000, retention: 0 },
        alerts: {
          enabled: false,
          thresholds: { memoryUsage: 0.9, diskUsage: 0.95, errorRate: 0.1, responseTime: 5000 }
        }
      }
    };

    container.bind<ServerConfig>('Config').toConstantValue(mockConfig);
    container.bind<IEmbeddingService>('EmbeddingService').to(EmbeddingService).inSingletonScope();
    container.bind<IDatabaseHandler>('DatabaseHandler').to(DatabaseAdapter).inSingletonScope();

    embeddingService = container.get<IEmbeddingService>('EmbeddingService');
    await embeddingService.initialize();

    databaseHandler = container.get<IDatabaseHandler>('DatabaseHandler');

    const dbInstance = (databaseHandler as any).getDatabase();
    semanticDb = new SemanticDatabaseExtension(dbInstance);

    toolContext = {
      container,
      config: mockConfig,
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      } as any
    };

    await runSemanticMigration(dbInstance);
  });

  afterAll(async () => {
    databaseHandler.close();
    if (existsSync(TEST_DB_PATH)) {
      try {
        unlinkSync(TEST_DB_PATH);
      } catch (e) {
        console.error('Failed to delete test DB', e);
      }
    }
  });

  beforeEach(async () => {
    const dbInstance = (databaseHandler as any).getDatabase();
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

      expect(codeEmbedding).not.toEqual(docEmbedding);
      expect(docEmbedding).not.toEqual(chatEmbedding);
      expect(codeEmbedding).not.toEqual(chatEmbedding);

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

      const results = await semanticDb.semanticSearch({
        query: 'artificial intelligence',
        queryEmbedding: await embeddingService.generateEmbedding('artificial intelligence'),
        limit: 5,
        minSimilarity: 0.1,
        includeRelated: false
      });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].key).toBe(key);
      expect(results[0].type).toBe(type);
    });

    it('should perform semantic search with similarity scoring', async () => {
      const testData = [
        {
          key: 'ai:1',
          value: 'Machine learning algorithms and neural networks for data analysis',
          type: 'documentation'
        },
        {
          key: 'ai:2',
          value: 'Deep learning and artificial intelligence concepts in modern computing',
          type: 'documentation'
        },
        { key: 'cooking:1', value: 'Recipe for chocolate cake and baking techniques in the kitchen', type: 'generic' },
        { key: 'sports:1', value: 'Football strategies and game analysis for competitive teams', type: 'generic' }
      ];

      for (const item of testData) {
        const embedding = await embeddingService.generateEmbedding(item.value);
        await semanticDb.storeSemanticContext(item.key, item.value, item.type, embedding);
      }

      const queryEmbedding = await embeddingService.generateEmbedding('artificial intelligence and machine learning');
      const results = await semanticDb.semanticSearch({
        query: 'artificial intelligence and machine learning',
        queryEmbedding,
        limit: 5,
        minSimilarity: 0.1,
        includeRelated: false
      });

      expect(results.length).toBeGreaterThan(0);

      const aiResults = results.filter(r => r.key.startsWith('ai:'));
      expect(aiResults.length).toBeGreaterThanOrEqual(1);

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

      const techItems = similarItems.filter(item => item.key.startsWith('tech:'));
      const foodItems = similarItems.filter(item => item.key.startsWith('food:'));

      if (techItems.length > 0 && foodItems.length > 0) {
        expect(techItems[0].similarity).toBeGreaterThan(foodItems[0].similarity);
      }
    });
  });

  describe('Semantic Search Tools', () => {
    it('should execute semantic search tool successfully', async () => {
      const tool = new SemanticSearchTool(embeddingService as EmbeddingService);

      const storeData = [
        { key: 'ml:basics', value: 'Introduction to machine learning fundamentals and basic concepts' },
        { key: 'ml:advanced', value: 'Advanced deep learning techniques, neural networks and AI algorithms' }
      ];

      for (const item of storeData) {
        const embedding = await embeddingService.generateEmbedding(item.value);
        await semanticDb.storeSemanticContext(item.key, item.value, 'documentation', embedding);
      }

      const result = await tool.execute(
        {
          query: 'machine learning basics and fundamentals',
          limit: 5,
          minSimilarity: 0.1,
          includeRelated: false
        },
        toolContext
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');

      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.query).toBe('machine learning basics and fundamentals');
      expect(responseData.resultsCount).toBeGreaterThan(0);
      expect(responseData.results).toHaveLength(responseData.resultsCount);
    });

    it('should execute enhanced store context tool', async () => {
      const tool = new EnhancedStoreContextTool(embeddingService as EmbeddingService);

      const result = await tool.execute(
        {
          key: 'test:enhanced:store',
          value: 'This is a test of enhanced context storage with automatic embedding generation',
          type: 'documentation',
          generateEmbedding: true
        },
        toolContext
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Context stored successfully');

      const stats = await semanticDb.getSemanticStats();
      expect(stats.itemsWithEmbeddings).toBeGreaterThan(0);
    });

    it('should execute update embeddings tool', async () => {
      await databaseHandler.storeContext('test:no:embedding', 'Test content without embedding', 'generic');

      const tool = new UpdateEmbeddingsTool(embeddingService as EmbeddingService);

      const result = await tool.execute(
        {
          batchSize: 10,
          dryRun: false
        },
        toolContext
      );

      expect(result.content).toBeDefined();

      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.updated).toBe(1);
      expect(responseData.failed).toBe(0);
    });

    it('should execute semantic stats tool', async () => {
      const embedding = await embeddingService.generateEmbedding('test content for statistics');
      await semanticDb.storeSemanticContext('test:stats', 'test content for statistics', 'generic', embedding);

      const tool = new SemanticStatsTool();

      const result = await tool.execute({}, toolContext);

      expect(result.content).toBeDefined();

      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.semanticSearchStats).toBeDefined();
      expect(responseData.semanticSearchStats.totalContextItems).toBeGreaterThan(0);
      expect(responseData.semanticSearchStats.itemsWithEmbeddings).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle batch embedding generation efficiently', async () => {
      const texts = Array.from(
        { length: 20 },
        (_, i) => `Test content number ${i} with different words and semantic context for testing embeddings`
      );

      const startTime = Date.now();
      const embeddings = await embeddingService.generateBatchEmbeddings(texts);
      const endTime = Date.now();

      expect(embeddings).toHaveLength(20);
      expect(embeddings.every(emb => emb.length === 384)).toBe(true);
      expect(endTime - startTime).toBeLessThan(10000);
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
      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should maintain embedding quality across different text types', async () => {
      const testCases = [
        { type: 'code', text: 'function processData(input) { return input.map(x => x * 2); }' },
        { type: 'documentation', text: 'This function processes data by doubling each value in the input array' },
        { type: 'conversation', text: 'Can you help me understand how this data processing function works?' },
        {
          type: 'technical',
          text: 'Array.prototype.map() creates a new array with the results of calling a provided function'
        }
      ];

      const embeddings = await Promise.all(testCases.map(tc => embeddingService.generateEmbedding(tc.text)));

      embeddings.forEach(embedding => {
        expect(embeddingService.validateEmbedding(embedding)).toBe(true);
      });

      const codeSimilarity = embeddingService.calculateSimilarity(embeddings[0], embeddings[1]);
      const conversationSimilarity = embeddingService.calculateSimilarity(embeddings[1], embeddings[2]);

      expect(codeSimilarity).toBeGreaterThan(0.1);
      expect(conversationSimilarity).toBeGreaterThan(0.1);
    });
  });
});

async function runSemanticMigration(db: any): Promise<void> {
  const tableInfo = db.prepare('PRAGMA table_info(context_items)').all();
  const columnNames = tableInfo.map((col: any) => col.name);

  const addColumnIfNotExists = (columnName: string, columnType: string, defaultValue?: string) => {
    if (!columnNames.includes(columnName)) {
      let sql = `ALTER TABLE context_items ADD COLUMN ${columnName} ${columnType}`;
      if (defaultValue) {
        sql += ` DEFAULT ${defaultValue}`;
      }
      db.exec(sql);
    }
  };

  addColumnIfNotExists('embedding', 'TEXT');
  addColumnIfNotExists('semantic_tags', 'TEXT');
  addColumnIfNotExists('context_type', 'TEXT', "'generic'");
  addColumnIfNotExists('relationships', 'TEXT');
  addColumnIfNotExists('relevance_score', 'REAL', '0.0');

  db.exec(`
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
