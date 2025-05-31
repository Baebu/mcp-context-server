import {
  CreateSmartPathTool,
  ExecuteSmartPathTool,
  ListSmartPathsTool
} from '../../../src/application/tools/smart-path.tool.js';
import { Container } from 'inversify';
import type {
  ISmartPathManager,
  SmartPathResult,
  SmartPathDefinition
} from '../../../src/core/interfaces/smart-path.interface.js';
import type { ServerConfig } from '../../../src/infrastructure/config/types.js';
import type { ToolContext, ToolResult } from '../../../src/core/interfaces/tool-registry.interface.js';

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
    maxFileSize: 1048576,
    unsafeArgumentPatterns: []
  },
  database: { path: './test.db', backupInterval: 0 },
  logging: { level: 'error', pretty: false },
  performance: { maxConcurrency: 5, queueSize: 100 }
});

describe('SmartPathTools', () => {
  let mockSmartPathManager: jest.Mocked<ISmartPathManager>;
  let container: Container;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockConfig: ServerConfig;
  let toolContext: ToolContext;

  const getResultText = (toolResult: ToolResult): string | undefined => {
    // Renamed parameter
    return toolResult.content && toolResult.content.length > 0 && toolResult.content[0]
      ? toolResult.content[0].text
      : undefined;
  };

  beforeEach(() => {
    mockSmartPathManager = {
      create: jest.fn(),
      execute: jest.fn(),
      list: jest.fn(),
      delete: jest.fn()
    };

    mockLogger = createMockLogger();
    mockConfig = createMockConfig();

    container = new Container();
    container.bind<ISmartPathManager>('SmartPathManager').toConstantValue(mockSmartPathManager);
    toolContext = { container, logger: mockLogger, config: mockConfig };
  });

  describe('CreateSmartPathTool', () => {
    let tool: CreateSmartPathTool;

    beforeEach(() => {
      tool = new CreateSmartPathTool();
    });

    it('should create an item_bundle smart path successfully', async () => {
      const mockId = 'bundle-123';
      mockSmartPathManager.create.mockResolvedValue(mockId);
      const params = {
        name: 'TestBundle',
        type: 'item_bundle' as const,
        definition: { items: ['key1', 'key2'] }
      };
      const result = await tool.execute(params, toolContext);
      const resultText = getResultText(result);
      expect(resultText).toBeDefined();
      const parsedResult = JSON.parse(resultText || '{}');

      expect(mockSmartPathManager.create).toHaveBeenCalledWith({
        name: 'TestBundle',
        type: 'item_bundle',
        definition: { items: ['key1', 'key2'] }
      });
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.smart_path_id).toBe(mockId);
      expect(parsedResult.name).toBe('TestBundle');
    });

    it('should create a smart path with definition as JSON string', async () => {
      const mockId = 'json-def-456';
      mockSmartPathManager.create.mockResolvedValue(mockId);
      const definitionObj = { query: "SELECT * FROM data WHERE type = '{{type}}'" };
      const params = {
        name: 'QueryFromJSON',
        type: 'query_template' as const,
        definition: JSON.stringify(definitionObj)
      };
      await tool.execute(params, toolContext);

      expect(mockSmartPathManager.create).toHaveBeenCalledWith({
        name: 'QueryFromJSON',
        type: 'query_template',
        definition: definitionObj
      });
    });

    it('should handle backward compatibility for path_name', async () => {
      mockSmartPathManager.create.mockResolvedValue('id');
      const params = {
        path_name: 'OldNameBundle',
        type: 'item_bundle' as const,
        definition: { items: ['itemA'] }
      };
      await tool.execute(params as any, toolContext);
      expect(mockSmartPathManager.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'OldNameBundle' }));
    });

    it('should handle backward compatibility for context_keys (JSON array)', async () => {
      mockSmartPathManager.create.mockResolvedValue('id');
      const params = {
        name: 'ContextKeyBundle',
        context_keys: JSON.stringify(['ctxKey1', 'ctxKey2'])
      };
      await tool.execute(params as any, toolContext);
      expect(mockSmartPathManager.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'item_bundle',
          definition: expect.objectContaining({ items: ['ctxKey1', 'ctxKey2'] })
        })
      );
    });

    it('should handle backward compatibility for context_keys (single string)', async () => {
      mockSmartPathManager.create.mockResolvedValue('id');
      const params = {
        name: 'SingleContextKeyBundle',
        context_keys: 'singleKey'
      };
      await tool.execute(params as any, toolContext);
      expect(mockSmartPathManager.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'item_bundle',
          definition: expect.objectContaining({ items: ['singleKey'] })
        })
      );
    });

    it('should handle backward compatibility for steps (item_bundle)', async () => {
      mockSmartPathManager.create.mockResolvedValue('id');
      const steps = JSON.stringify([
        { action: 'get', key: 'stepKey1' },
        { action: 'other' },
        { action: 'get', key: 'stepKey2' }
      ]);
      const params = { name: 'StepsBundle', steps };
      await tool.execute(params as any, toolContext);
      expect(mockSmartPathManager.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'item_bundle',
          definition: expect.objectContaining({ items: ['stepKey1', 'stepKey2'] })
        })
      );
    });

    it('should handle definition.keys as alias for definition.items', async () => {
      mockSmartPathManager.create.mockResolvedValue('id');
      const params = {
        name: 'KeysAliasBundle',
        type: 'item_bundle' as const,
        definition: { keys: ['aliasKey1', 'aliasKey2'] }
      };
      await tool.execute(params as any, toolContext);
      expect(mockSmartPathManager.create).toHaveBeenCalledWith(
        expect.objectContaining({
          definition: expect.objectContaining({ items: ['aliasKey1', 'aliasKey2'] })
        })
      );
      const calledWith = mockSmartPathManager.create.mock.calls[0]?.[0] as SmartPathDefinition;
      expect(calledWith?.definition).not.toHaveProperty('keys');
    });

    it('should auto-detect type "file_set" if definition has paths', async () => {
      mockSmartPathManager.create.mockResolvedValue('id');
      const params = {
        name: 'FileSetAutoType',
        definition: { paths: ['/file1.txt', '/file2.txt'] }
      };
      await tool.execute(params, toolContext);
      expect(mockSmartPathManager.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'file_set' }));
    });

    it('should throw error if name is missing', async () => {
      const params = { type: 'item_bundle' as const, definition: { items: ['a'] } };
      await expect(tool.execute(params as any, toolContext)).rejects.toThrow('Name is required for smart path');
    });

    it('should throw error if definition is missing and not derivable from context_keys/steps', async () => {
      const params = { name: 'NoDefBundle' };
      await expect(tool.execute(params as any, toolContext)).rejects.toThrow('Definition is required for smart path');
    });
  });

  describe('ExecuteSmartPathTool', () => {
    let tool: ExecuteSmartPathTool;

    beforeEach(() => {
      tool = new ExecuteSmartPathTool();
    });

    it('should execute a smart path successfully', async () => {
      const mockResultData: SmartPathResult = {
        id: 'exec-456',
        name: 'ExecutedPath',
        type: 'item_bundle',
        data: { items: [{ key: 'k', value: 'v' }] },
        metadata: {}
      };
      mockSmartPathManager.execute.mockResolvedValue(mockResultData);
      const params = { id: 'exec-456', params: { userId: 1 } };
      const result = await tool.execute(params, toolContext);
      const resultText = getResultText(result);
      expect(resultText).toBeDefined();
      expect(JSON.parse(resultText || '{}')).toEqual(mockResultData);
    });

    it('should handle smart path execution error', async () => {
      const execError = new Error('Smart path not found');
      mockSmartPathManager.execute.mockRejectedValue(execError);
      const params = { id: 'nonexistent-id' };

      await expect(tool.execute(params, toolContext)).rejects.toThrow('Smart path not found');
      expect(mockLogger.error).toHaveBeenCalledWith({ error: execError, params }, 'Failed to execute smart path');
    });
  });

  describe('ListSmartPathsTool', () => {
    let tool: ListSmartPathsTool;

    beforeEach(() => {
      tool = new ListSmartPathsTool();
    });

    it('should list smart paths successfully', async () => {
      const mockPaths = [
        { id: 'path1', name: 'Path One', type: 'item_bundle', usageCount: 10 },
        { id: 'path2', name: 'Path Two', type: 'query_template', usageCount: 5 }
      ];
      mockSmartPathManager.list.mockResolvedValue(mockPaths);
      const params = { limit: 50 };
      const result = await tool.execute(params, toolContext);
      const resultText = getResultText(result);
      expect(resultText).toBeDefined();
      const parsedResult = JSON.parse(resultText || '{}');

      expect(mockSmartPathManager.list).toHaveBeenCalled();
      expect(parsedResult.smart_paths).toEqual(mockPaths);
      expect(parsedResult.total_count).toBe(2);
    });

    it('should respect the limit parameter', async () => {
      const mockPaths = [
        { id: 'path1', name: 'Path One', type: 'item_bundle', usageCount: 10 },
        { id: 'path2', name: 'Path Two', type: 'query_template', usageCount: 5 },
        { id: 'path3', name: 'Path Three', type: 'file_set', usageCount: 2 }
      ];
      mockSmartPathManager.list.mockResolvedValue(mockPaths);
      const params = { limit: 2 };
      const result = await tool.execute(params, toolContext);
      const resultText = getResultText(result);
      expect(resultText).toBeDefined();
      const parsedResult = JSON.parse(resultText || '{}');

      expect(parsedResult.smart_paths.length).toBe(2);
      expect(parsedResult.smart_paths[0].id).toBe('path1');
      expect(parsedResult.smart_paths[1].id).toBe('path2');
      expect(parsedResult.total_count).toBe(3);
    });

    it('should handle list smart paths error', async () => {
      const listError = new Error('DB connection failed');
      mockSmartPathManager.list.mockRejectedValue(listError);
      const params = { limit: 50 };

      await expect(tool.execute(params, toolContext)).rejects.toThrow('DB connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith({ error: listError, params }, 'Failed to list smart paths');
    });

    it('should correctly handle the default limit if no limit param is passed', async () => {
      const mockPaths = Array.from({ length: 60 }, (_, i) => ({
        id: `path${i}`,
        name: `Path ${i}`,
        type: 'item_bundle',
        usageCount: 1
      }));
      mockSmartPathManager.list.mockResolvedValue(mockPaths);

      const params = {}; // No limit specified
      const result = await tool.execute(params as any, toolContext); // Use default limit (50)
      const resultText = getResultText(result);
      expect(resultText).toBeDefined();
      const parsedResult = JSON.parse(resultText || '{}');

      expect(parsedResult.smart_paths.length).toBe(50);
      expect(parsedResult.total_count).toBe(60);
    });
  });
});
