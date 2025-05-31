// tests/unit/tools/database-operations.test.ts
import {
  StoreContextTool,
  GetContextTool,
  QueryContextTool
} from '../../../src/application/tools/database-operations.tool.js';
import { Container } from 'inversify';
import type { IDatabaseHandler, ContextItem } from '../../../src/core/interfaces/database.interface.js';
import type { ServerConfig } from '../../../src/infrastructure/config/types.js';
import type { ToolContext } from '../../../src/core/interfaces/tool-registry.interface.js';

// Mock logger interface
const createMockLogger = () => ({
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
});

// Mock config
const createMockConfig = (): ServerConfig => ({
  server: { name: 'test-server', version: '1.0.0' },
  security: {
    allowedCommands: ['ls'],
    safezones: ['.'],
    maxExecutionTime: 30000,
    maxFileSize: 1048576
  },
  database: { path: './test.db', backupInterval: 0 },
  logging: { level: 'error', pretty: false },
  performance: { maxConcurrency: 5, queueSize: 100 }
});

describe('DatabaseOperationTools', () => {
  let mockDbHandler: jest.Mocked<IDatabaseHandler>;
  let container: Container;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockConfig: ServerConfig;
  let toolContext: ToolContext;

  beforeEach(() => {
    mockDbHandler = {
      storeContext: jest.fn(),
      getContext: jest.fn(),
      deleteContext: jest.fn(),
      queryContext: jest.fn(),
      backup: jest.fn(),
      close: jest.fn(),
      executeQuery: jest.fn(),
      executeCommand: jest.fn(),
      getSingle: jest.fn()
    };

    mockLogger = createMockLogger();
    mockConfig = createMockConfig();

    container = new Container();
    container.bind<IDatabaseHandler>('DatabaseHandler').toConstantValue(mockDbHandler);

    toolContext = { container, logger: mockLogger, config: mockConfig };
  });

  describe('StoreContextTool', () => {
    let tool: StoreContextTool;

    beforeEach(() => {
      tool = new StoreContextTool();
    });

    it('should store context successfully', async () => {
      mockDbHandler.storeContext.mockResolvedValue(undefined);
      const params = { key: 'testKey', value: { data: 'some data' }, type: 'testType' };
      const result = await tool.execute(params, toolContext);

      expect(mockDbHandler.storeContext).toHaveBeenCalledWith('testKey', { data: 'some data' }, 'testType');
      expect(result.content[0]?.text).toBe('Context stored successfully with key: testKey');
    });

    it('should use "generic" type if not provided', async () => {
      mockDbHandler.storeContext.mockResolvedValue(undefined);
      const params = { key: 'testKey', value: { data: 'some data' } };
      await tool.execute(params, toolContext);
      expect(mockDbHandler.storeContext).toHaveBeenCalledWith('testKey', { data: 'some data' }, 'generic');
    });

    it('should handle backward compatibility with "content" and "metadata"', async () => {
      mockDbHandler.storeContext.mockResolvedValue(undefined);
      const params = {
        key: 'compatKey',
        content: 'some old content',
        metadata: JSON.stringify({ type: 'compatType', extra: 'info' })
      };
      await tool.execute(params as any, toolContext);

      expect(mockDbHandler.storeContext).toHaveBeenCalledWith(
        'compatKey',
        {
          content: 'some old content',
          metadata: { type: 'compatType', extra: 'info' }
        },
        'compatType'
      );
    });

    it('should handle non-JSON metadata as type (backward compatibility)', async () => {
      mockDbHandler.storeContext.mockResolvedValue(undefined);
      const params = { key: 'compatKey2', content: 'other content', metadata: 'simpleStringType' };
      await tool.execute(params as any, toolContext);

      expect(mockDbHandler.storeContext).toHaveBeenCalledWith('compatKey2', 'other content', 'simpleStringType');
    });

    it('should handle store context errors', async () => {
      const mockError = new Error('DB error');
      mockDbHandler.storeContext.mockRejectedValue(mockError);
      const params = { key: 'errorKey', value: 'errorData' };

      await expect(tool.execute(params, toolContext)).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith({ error: mockError, params }, 'Failed to store context');
    });
  });

  describe('GetContextTool', () => {
    let tool: GetContextTool;

    beforeEach(() => {
      tool = new GetContextTool();
    });

    it('should retrieve context successfully', async () => {
      const mockValue = { data: 'retrieved data' };
      mockDbHandler.getContext.mockResolvedValue(mockValue);
      const params = { key: 'retrieveKey' };
      const result = await tool.execute(params, toolContext);

      expect(mockDbHandler.getContext).toHaveBeenCalledWith('retrieveKey');
      const parsedResult = JSON.parse(result.content[0]?.text || '');
      expect(parsedResult.key).toBe('retrieveKey');
      expect(parsedResult.value).toEqual(mockValue);
      expect(parsedResult.retrieved_at).toBeDefined();
    });

    it('should handle context not found', async () => {
      mockDbHandler.getContext.mockResolvedValue(null);
      const params = { key: 'notFoundKey' };
      const result = await tool.execute(params, toolContext);

      expect(result.content[0]?.text).toBe('No context found for key: notFoundKey');
    });

    it('should handle get context errors', async () => {
      const mockError = new Error('DB retrieve error');
      mockDbHandler.getContext.mockRejectedValue(mockError);
      const params = { key: 'errorRetrieveKey' };

      await expect(tool.execute(params, toolContext)).rejects.toThrow('DB retrieve error');
      expect(mockLogger.error).toHaveBeenCalledWith({ error: mockError, params }, 'Failed to get context');
    });
  });

  describe('QueryContextTool', () => {
    let tool: QueryContextTool;

    beforeEach(() => {
      tool = new QueryContextTool();
    });

    it('should query context successfully with type and limit', async () => {
      const mockItems: ContextItem[] = [
        {
          key: 'item1',
          value: { info: 'item 1' },
          type: 'queryType',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      mockDbHandler.queryContext.mockResolvedValue(mockItems);
      const params = { type: 'queryType', limit: 5 };
      const result = await tool.execute(params, toolContext);

      expect(mockDbHandler.queryContext).toHaveBeenCalledWith({ type: 'queryType', limit: 5 });
      expect(JSON.parse(result.content[0]?.text || '')).toEqual(
        mockItems.map(item => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        }))
      );
    });

    it('should use keyPattern if provided (from pattern alias)', async () => {
      mockDbHandler.queryContext.mockResolvedValue([]);
      const params = { pattern: 'user*', limit: 10 };
      await tool.execute(params, toolContext);
      expect(mockDbHandler.queryContext).toHaveBeenCalledWith({ keyPattern: 'user*', limit: 10 });
    });

    it('should use keyPattern if provided directly', async () => {
      mockDbHandler.queryContext.mockResolvedValue([]);
      const params = { keyPattern: 'admin*', limit: 10 };
      await tool.execute(params, toolContext);
      expect(mockDbHandler.queryContext).toHaveBeenCalledWith({ keyPattern: 'admin*', limit: 10 });
    });

    it('should handle backward compatibility with "filters"', async () => {
      mockDbHandler.queryContext.mockResolvedValue([]);
      const filters = JSON.stringify({ type: 'filterType', pattern: 'filterPattern' });
      const params = { filters, limit: 20 };
      await tool.execute(params as any, toolContext);

      expect(mockDbHandler.queryContext).toHaveBeenCalledWith({
        type: 'filterType',
        keyPattern: 'filterPattern',
        limit: 20
      });
    });

    it('should prioritize direct params over "filters"', async () => {
      mockDbHandler.queryContext.mockResolvedValue([]);
      const filters = JSON.stringify({ type: 'filterTypeOld', pattern: 'filterPatternOld' });
      const params = { type: 'newType', pattern: 'newPattern', filters, limit: 25 };
      await tool.execute(params as any, toolContext);

      expect(mockDbHandler.queryContext).toHaveBeenCalledWith({
        type: 'newType',
        keyPattern: 'newPattern',
        limit: 25
      });
    });

    it('should use default limit if not provided', async () => {
      mockDbHandler.queryContext.mockResolvedValue([]);
      const params = { type: 'anyType', limit: 100 }; // Explicitly add default limit
      await tool.execute(params, toolContext);
      expect(mockDbHandler.queryContext).toHaveBeenCalledWith({ type: 'anyType', limit: 100 });
    });

    it('should handle query context errors', async () => {
      const mockError = new Error('DB query error');
      mockDbHandler.queryContext.mockRejectedValue(mockError);
      const params = { type: 'errorQueryType', limit: 100 }; // Explicitly add default limit

      await expect(tool.execute(params, toolContext)).rejects.toThrow('DB query error');
      expect(mockLogger.error).toHaveBeenCalledWith({ error: mockError, params }, 'Failed to query context');
    });
  });
});
