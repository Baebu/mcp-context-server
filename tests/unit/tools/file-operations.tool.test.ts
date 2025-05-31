import { ReadFileTool, WriteFileTool, ListDirectoryTool } from '../../../src/application/tools/file-operations.tool';
import type {
  IFilesystemHandler,
  DirectoryEntry,
  FileContent
} from '../../../src/core/interfaces/filesystem.interface';
import type { ToolContext } from '../../../src/core/interfaces/tool-registry.interface';
import { Container } from 'inversify';
import { logger } from '../../../src/utils/logger'; // Mocked
import type { ServerConfig } from '../../../src/infrastructure/config/types';

jest.mock('../../../src/utils/logger');

describe('FileOperation Tools', () => {
  let mockFilesystemHandler: jest.Mocked<IFilesystemHandler>;
  let toolContext: ToolContext;
  let container: Container;

  beforeEach(() => {
    mockFilesystemHandler = {
      readFileWithTruncation: jest.fn(),
      writeFile: jest.fn(),
      listDirectory: jest.fn(),
      deleteFile: jest.fn(), // Added to satisfy IFilesystemHandler if it's part of the interface
      deleteDirectory: jest.fn() // Added to satisfy IFilesystemHandler
    };

    container = new Container();
    container.bind<IFilesystemHandler>('FilesystemHandler').toConstantValue(mockFilesystemHandler);

    const mockConfig: ServerConfig = {
      server: { name: 'test', version: '1.0' },
      security: {
        allowedCommands: [],
        safezones: [],
        maxExecutionTime: 1,
        maxFileSize: 1,
        unsafeArgumentPatterns: []
      },
      database: { path: 'path', backupInterval: 0 },
      logging: { level: 'info', pretty: false },
      performance: { maxConcurrency: 1, queueSize: 1 }
    } as ServerConfig;
    toolContext = {
      config: mockConfig,
      logger, // Use the globally mocked logger
      container
    };
    jest.clearAllMocks(); // Clear logger mocks
  });

  describe('ReadFileTool', () => {
    let readFileTool: ReadFileTool;

    beforeEach(() => {
      readFileTool = new ReadFileTool();
    });

    it('should read a file successfully', async () => {
      const mockFileContent: FileContent = { content: 'file data', truncated: false, actualSize: 9 };
      mockFilesystemHandler.readFileWithTruncation.mockResolvedValue(mockFileContent);

      const params = { path: 'test.txt', maxSize: 1024 };
      const result = await readFileTool.execute(params, toolContext);

      expect(mockFilesystemHandler.readFileWithTruncation).toHaveBeenCalledWith(params.path, params.maxSize, 'utf8');
      expect(result.content).toEqual([{ type: 'text', text: 'file data' }]);
    });

    it('should handle file read errors', async () => {
      const error = new Error('Read failed');
      mockFilesystemHandler.readFileWithTruncation.mockRejectedValue(error);

      const params = { path: 'error.txt' };
      await expect(readFileTool.execute(params, toolContext)).rejects.toThrow('Read failed');
      expect(logger.error).toHaveBeenCalledWith({ error, params }, 'Failed to read file');
    });

    it('should use default maxSize if not provided', async () => {
      const mockFileContent: FileContent = { content: 'some data', truncated: false, actualSize: 9 };
      mockFilesystemHandler.readFileWithTruncation.mockResolvedValue(mockFileContent);
      const params = { path: 'test.txt' }; // No maxSize
      await readFileTool.execute(params, toolContext);
      expect(mockFilesystemHandler.readFileWithTruncation).toHaveBeenCalledWith(params.path, 1048576, 'utf8');
    });

    it('should pass encoding to filesystem handler', async () => {
      const mockFileContent: FileContent = { content: 'binary data', truncated: false, actualSize: 11 }; // Content doesn't matter as much as call check
      mockFilesystemHandler.readFileWithTruncation.mockResolvedValue(mockFileContent);
      const params = { path: 'test.bin', encoding: 'binary' as const, maxSize: 512 };
      await readFileTool.execute(params, toolContext);
      expect(mockFilesystemHandler.readFileWithTruncation).toHaveBeenCalledWith(params.path, params.maxSize, 'binary');
    });
  });

  describe('WriteFileTool', () => {
    let writeFileTool: WriteFileTool;

    beforeEach(() => {
      writeFileTool = new WriteFileTool();
    });

    it('should write a file successfully', async () => {
      mockFilesystemHandler.writeFile.mockResolvedValue(undefined);
      const params = { path: 'output.txt', content: 'new data', append: false, createDirs: true };
      const result = await writeFileTool.execute(params, toolContext);

      expect(mockFilesystemHandler.writeFile).toHaveBeenCalledWith(params.path, params.content, {
        append: params.append,
        createDirs: params.createDirs
      });
      expect(result.content).toEqual([{ type: 'text', text: `Successfully wrote to file: ${params.path}` }]);
    });

    it('should handle file write errors', async () => {
      const error = new Error('Write failed');
      mockFilesystemHandler.writeFile.mockRejectedValue(error);
      const params = { path: 'output.txt', content: 'data' };

      await expect(writeFileTool.execute(params, toolContext)).rejects.toThrow('Write failed');
      expect(logger.error).toHaveBeenCalledWith({ error, params }, 'Failed to write file');
    });

    it('should use default options for append and createDirs if not provided', async () => {
      mockFilesystemHandler.writeFile.mockResolvedValue(undefined);
      const params = { path: 'another.txt', content: 'content' };
      await writeFileTool.execute(params, toolContext);
      expect(mockFilesystemHandler.writeFile).toHaveBeenCalledWith(params.path, params.content, {
        append: false, // default
        createDirs: true // default
      });
    });
  });

  describe('ListDirectoryTool', () => {
    let listDirectoryTool: ListDirectoryTool;

    beforeEach(() => {
      listDirectoryTool = new ListDirectoryTool();
    });

    it('should list directory contents successfully', async () => {
      const mockEntries: DirectoryEntry[] = [
        {
          name: 'file1.txt',
          type: 'file',
          path: 'mydir/file1.txt',
          size: 100,
          modified: new Date(),
          permissions: '644'
        },
        { name: 'subDir', type: 'directory', path: 'mydir/subDir', modified: new Date(), permissions: '755' }
      ];
      mockFilesystemHandler.listDirectory.mockResolvedValue(mockEntries);

      const params = { path: 'mydir', includeHidden: false, includeMetadata: true, limit: 100 };
      const result = await listDirectoryTool.execute(params, toolContext);

      expect(mockFilesystemHandler.listDirectory).toHaveBeenCalledWith(params.path, {
        includeHidden: params.includeHidden,
        includeMetadata: params.includeMetadata,
        limit: params.limit
      });
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(mockEntries, null, 2) }]);
    });

    it('should handle directory listing errors', async () => {
      const error = new Error('List failed');
      mockFilesystemHandler.listDirectory.mockRejectedValue(error);
      const params = { path: 'baddir' };

      await expect(listDirectoryTool.execute(params, toolContext)).rejects.toThrow('List failed');
      expect(logger.error).toHaveBeenCalledWith({ error, params }, 'Failed to list directory');
    });

    it('should use default options if not provided', async () => {
      const mockEntries: DirectoryEntry[] = [];
      mockFilesystemHandler.listDirectory.mockResolvedValue(mockEntries);
      const params = { path: 'somedir' };
      await listDirectoryTool.execute(params, toolContext);
      expect(mockFilesystemHandler.listDirectory).toHaveBeenCalledWith(params.path, {
        includeHidden: false, // default
        includeMetadata: true, // default
        limit: 1000 // default
      });
    });
  });
});
