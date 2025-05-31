import { ReadFileTool } from '../../../src/application/tools/file-operations.tool.js';
import { Container } from 'inversify';
import type { IFilesystemHandler } from '../../../src/core/interfaces/filesystem.interface.js';
import type { ServerConfig } from '../../../src/infrastructure/config/types.js';

// Mock logger interface
const createMockLogger = () => ({
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
});

// Mock config
const createMockConfig = (): ServerConfig => ({
  server: {
    name: 'test-server',
    version: '1.0.0'
  },
  security: {
    allowedCommands: ['ls', 'cat'],
    safezones: ['.'],
    maxExecutionTime: 30000,
    maxFileSize: 1048576
  },
  database: {
    path: './test.db',
    backupInterval: 0
  },
  logging: {
    level: 'error',
    pretty: false
  },
  performance: {
    maxConcurrency: 5,
    queueSize: 100
  }
});

describe('ReadFileTool', () => {
  let tool: ReadFileTool;
  let mockFilesystem: jest.Mocked<IFilesystemHandler>;
  let container: Container;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockConfig: ServerConfig;

  beforeEach(() => {
    mockFilesystem = {
      readFileWithTruncation: jest.fn(),
      writeFile: jest.fn(),
      listDirectory: jest.fn(),
      deleteFile: jest.fn(),
      deleteDirectory: jest.fn()
    };

    mockLogger = createMockLogger();
    mockConfig = createMockConfig();

    container = new Container();
    container.bind<IFilesystemHandler>('FilesystemHandler').toConstantValue(mockFilesystem);

    tool = new ReadFileTool();
  });

  it('should read file successfully', async () => {
    const mockContent = { content: 'test content', truncated: false, actualSize: 12 };
    mockFilesystem.readFileWithTruncation.mockResolvedValue(mockContent);

    const result = await tool.execute(
      {
        path: '/test/file.txt',
        encoding: 'utf8',
        maxSize: 1048576
      },
      { container, logger: mockLogger, config: mockConfig }
    );

    expect(result.content?.[0]?.text).toBe('test content');
    expect(mockFilesystem.readFileWithTruncation).toHaveBeenCalledWith('/test/file.txt', 1048576, 'utf8');
  });

  it('should handle file read errors', async () => {
    mockFilesystem.readFileWithTruncation.mockRejectedValue(new Error('File not found'));

    await expect(
      tool.execute(
        {
          path: '/nonexistent/file.txt',
          encoding: 'utf8',
          maxSize: 1048576
        },
        { container, logger: mockLogger, config: mockConfig }
      )
    ).rejects.toThrow('File not found');
  });

  it('should use default parameters when not provided', async () => {
    const mockContent = { content: 'test content', truncated: false, actualSize: 12 };
    mockFilesystem.readFileWithTruncation.mockResolvedValue(mockContent);

    const result = await tool.execute(
      {
        path: '/test/file.txt',
        encoding: 'utf8',
        maxSize: 1048576
      },
      { container, logger: mockLogger, config: mockConfig }
    );

    expect(result.content?.[0]?.text).toBe('test content');
    expect(mockFilesystem.readFileWithTruncation).toHaveBeenCalledWith('/test/file.txt', 1048576, 'utf8');
  });
});
