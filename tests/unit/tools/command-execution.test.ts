// tests/unit/tools/command-execution.test.ts
import { ExecuteCommandTool } from '../../../src/application/tools/command-execution.tool.js';
import { Container } from 'inversify';
import type { ICLIHandler, CommandResult } from '../../../src/core/interfaces/cli.interface.js';
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
    allowedCommands: ['ls', 'cat', 'echo'],
    safezones: ['.'],
    maxExecutionTime: 30000,
    maxFileSize: 1048576
  },
  database: { path: './test.db', backupInterval: 0 },
  logging: { level: 'error', pretty: false },
  performance: { maxConcurrency: 5, queueSize: 100 }
});

describe('ExecuteCommandTool', () => {
  let tool: ExecuteCommandTool;
  let mockCliHandler: jest.Mocked<ICLIHandler>;
  let container: Container;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockConfig: ServerConfig;
  let toolContext: ToolContext;

  beforeEach(() => {
    mockCliHandler = {
      execute: jest.fn(),
      validateCommand: jest.fn().mockResolvedValue(true)
    };

    mockLogger = createMockLogger();
    mockConfig = createMockConfig();

    container = new Container();
    container.bind<ICLIHandler>('CLIHandler').toConstantValue(mockCliHandler);

    tool = new ExecuteCommandTool();
    toolContext = { container, logger: mockLogger, config: mockConfig };
  });

  it('should execute a simple command successfully', async () => {
    const mockResult: CommandResult = {
      stdout: 'hello world',
      stderr: '',
      exitCode: 0,
      executionTime: 100
    };
    mockCliHandler.execute.mockResolvedValue(mockResult);

    const params = {
      command: 'echo',
      args: ['hello world'],
      timeout: 30000, // Added default
      shell: 'default' as const // Added default
    };
    const result = await tool.execute(params, toolContext);

    expect(mockCliHandler.execute).toHaveBeenCalledWith({
      command: 'echo',
      args: ['hello world'],
      options: {
        cwd: undefined,
        timeout: 30000,
        shell: 'default'
      }
    });
    expect(result.content[0]?.type).toBe('text');
    expect(JSON.parse(result.content[0]?.text || '')).toEqual({
      stdout: 'hello world',
      stderr: '',
      exitCode: 0,
      executionTime: 100
    });
  });

  it('should handle command execution errors', async () => {
    const mockError = new Error('Command failed');
    mockCliHandler.execute.mockRejectedValue(mockError);

    const params = {
      command: 'failing_command',
      args: [],
      timeout: 30000, // Added default
      shell: 'default' as const // Added default
    };

    await expect(tool.execute(params, toolContext)).rejects.toThrow('Command failed');
    expect(mockLogger.error).toHaveBeenCalledWith({ error: mockError, params }, 'Failed to execute command');
  });

  it('should pass cwd and timeout to CLIHandler', async () => {
    const mockResult: CommandResult = { stdout: '', stderr: '', exitCode: 0, executionTime: 50 };
    mockCliHandler.execute.mockResolvedValue(mockResult);

    const params = {
      command: 'ls',
      args: [],
      cwd: '/tmp',
      timeout: 10000,
      shell: 'default' as const // Added default
    };
    await tool.execute(params, toolContext);

    expect(mockCliHandler.execute).toHaveBeenCalledWith({
      command: 'ls',
      args: [],
      options: {
        cwd: '/tmp',
        timeout: 10000,
        shell: 'default'
      }
    });
  });

  it('should use specified shell type', async () => {
    const mockResult: CommandResult = { stdout: '', stderr: '', exitCode: 0, executionTime: 50 };
    mockCliHandler.execute.mockResolvedValue(mockResult);

    const params = {
      command: 'Get-Process',
      args: [],
      shell: 'powershell' as const,
      timeout: 30000 // Added default
    };
    await tool.execute(params, toolContext);

    expect(mockCliHandler.execute).toHaveBeenCalledWith({
      command: 'Get-Process',
      args: [],
      options: {
        cwd: undefined,
        timeout: 30000,
        shell: 'powershell'
      }
    });
  });

  it('should return stderr content if present', async () => {
    const mockResult: CommandResult = {
      stdout: '',
      stderr: 'Error: something went wrong',
      exitCode: 1,
      executionTime: 120
    };
    mockCliHandler.execute.mockResolvedValue(mockResult);

    const params = {
      command: 'cat',
      args: ['nonexistent_file'],
      timeout: 30000, // Added default
      shell: 'default' as const // Added default
    };
    const result = await tool.execute(params, toolContext);

    expect(JSON.parse(result.content[0]?.text || '')).toEqual({
      stdout: '',
      stderr: 'Error: something went wrong',
      exitCode: 1,
      executionTime: 120
    });
  });
});
