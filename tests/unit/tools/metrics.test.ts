import { GetMetricsTool } from '../../../src/application/tools/metrics.tool.js';
import type { ToolResult } from '../../../src/core/interfaces/tool-registry.interface.js';
import { Container } from 'inversify';
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
    maxFileSize: 1048576,
    unsafeArgumentPatterns: []
  },
  database: { path: './test.db', backupInterval: 0 },
  logging: { level: 'error', pretty: false },
  performance: { maxConcurrency: 5, queueSize: 100 }
});

describe('GetMetricsTool', () => {
  let dateNowSpy: jest.SpyInstance<number, []>;
  const A_VALID_TIMESTAMP = 1678886400000; // A fixed valid timestamp for general use
  let toolContext: ToolContext;

  beforeAll(() => {
    dateNowSpy = jest.spyOn(Date, 'now');
  });

  afterAll(() => {
    dateNowSpy.mockRestore();
  });

  beforeEach(() => {
    dateNowSpy.mockReset();
    // Default mock for tests not caring about specific sequences
    dateNowSpy.mockImplementation(() => A_VALID_TIMESTAMP);

    const mockLoggerInstance = createMockLogger();
    const mockConfigInstance = createMockConfig();
    const containerInstance = new Container();
    toolContext = { logger: mockLoggerInstance, config: mockConfigInstance, container: containerInstance };
  });

  const getResultText = (toolResult: ToolResult): string | undefined => {
    return toolResult.content && toolResult.content.length > 0 && toolResult.content[0]
      ? toolResult.content[0].text
      : undefined;
  };

  it('should return all metrics if no category is specified', async () => {
    const constructorTime = 1000000000000;
    const executeTime = constructorTime + 50;

    dateNowSpy
      .mockImplementationOnce(() => constructorTime) // constructor: this.startTime
      .mockImplementationOnce(() => constructorTime) // constructor: this.lastRequestTime
      .mockImplementationOnce(() => executeTime) // execute: this.lastRequestTime = Date.now()
      .mockImplementationOnce(() => executeTime) // execute: uptime: Date.now() - this.startTime
      .mockImplementationOnce(() => executeTime); // execute: uptimeFormatted: Date.now() - this.startTime

    const testTool = new GetMetricsTool();
    const result = await testTool.execute({}, toolContext);

    const metricsText = getResultText(result);
    expect(metricsText).toBeDefined();
    const metrics = JSON.parse(metricsText!);

    expect(metrics.server.uptime).toBe(50);
    expect(metrics.server.uptimeFormatted).toBe('0s');
    expect(metrics.server.requestCount).toBe(1);
    expect(new Date(metrics.server.lastRequestTime).getTime()).toBe(executeTime);
  });

  it('should return only server metrics if category is "server"', async () => {
    const constructorTime = A_VALID_TIMESTAMP - 1000;
    const executeTime = A_VALID_TIMESTAMP;
    dateNowSpy
      .mockImplementationOnce(() => constructorTime) // constructor startTime
      .mockImplementationOnce(() => constructorTime) // constructor lastRequestTime
      .mockImplementationOnce(() => executeTime) // execute lastRequestTime
      .mockImplementationOnce(() => executeTime) // execute uptime Date.now()
      .mockImplementationOnce(() => executeTime); // execute uptimeFormatted Date.now()
    const tool = new GetMetricsTool();

    const result = await tool.execute({ category: 'server' }, toolContext);
    const metricsText = getResultText(result);
    expect(metricsText).toBeDefined();
    const metrics = JSON.parse(metricsText!);

    expect(metrics.server).toBeDefined();
    expect(metrics.database).toBeUndefined();
    expect(metrics.server.requestCount).toBe(1);
    expect(new Date(metrics.server.lastRequestTime).getTime()).toBe(executeTime);
  });

  it('should return only database metrics if category is "database"', async () => {
    const constructorTime = A_VALID_TIMESTAMP - 2000;
    const executeTime = A_VALID_TIMESTAMP;
    dateNowSpy
      .mockImplementationOnce(() => constructorTime) // Ctor startTime
      .mockImplementationOnce(() => constructorTime) // Ctor lastRequestTime
      .mockImplementationOnce(() => executeTime) // Exec lastRequestTime
      .mockImplementationOnce(() => executeTime) // Exec uptime (raw)
      .mockImplementationOnce(() => executeTime); // Exec uptimeFormatted arg
    const tool = new GetMetricsTool();

    const result = await tool.execute({ category: 'database' }, toolContext);
    const metricsText = getResultText(result);
    expect(metricsText).toBeDefined();
    const metrics = JSON.parse(metricsText!);

    expect(metrics.database).toBeDefined();
    expect(metrics.server).toBeUndefined();
  });

  it('should increment requestCount on subsequent calls TO THE SAME INSTANCE', async () => {
    const constructorTime = A_VALID_TIMESTAMP - 3000;
    dateNowSpy
      .mockImplementationOnce(() => constructorTime) // For constructor startTime
      .mockImplementationOnce(() => constructorTime); // For constructor lastRequestTime
    const tool = new GetMetricsTool();

    const firstExecuteTime = A_VALID_TIMESTAMP - 200;
    dateNowSpy
      .mockImplementationOnce(() => firstExecuteTime) // For first execute lastRequestTime
      .mockImplementationOnce(() => firstExecuteTime) // For first execute uptime Date.now()
      .mockImplementationOnce(() => firstExecuteTime); // For first execute uptimeFormatted Date.now()
    await tool.execute({}, toolContext);

    const secondExecuteTime = A_VALID_TIMESTAMP - 100;
    dateNowSpy
      .mockImplementationOnce(() => secondExecuteTime) // For second execute lastRequestTime
      .mockImplementationOnce(() => secondExecuteTime) // For second execute uptime Date.now()
      .mockImplementationOnce(() => secondExecuteTime); // For second execute uptimeFormatted Date.now()
    const result = await tool.execute({ category: 'server' }, toolContext);

    const metricsText = getResultText(result);
    expect(metricsText).toBeDefined();
    const metrics = JSON.parse(metricsText!);
    expect(metrics.server.requestCount).toBe(2);
  });

  it('should format uptime correctly', async () => {
    const fixedReferenceTime = 1000000000000;

    // --- Test for 1 second uptime ---
    dateNowSpy.mockReset(); // Reset for this specific sequence
    dateNowSpy
      .mockImplementationOnce(() => fixedReferenceTime) // constructor startTime
      .mockImplementationOnce(() => fixedReferenceTime) // constructor lastRequestTime
      .mockImplementationOnce(() => fixedReferenceTime + 1000) // execute lastRequestTime
      .mockImplementationOnce(() => fixedReferenceTime + 1000) // execute uptime Date.now()
      .mockImplementationOnce(() => fixedReferenceTime + 1000); // execute uptimeFormatted Date.now()
    const toolInstance1s = new GetMetricsTool();

    let result = await toolInstance1s.execute({ category: 'server' }, toolContext);
    let metricsText = getResultText(result);
    expect(metricsText).toBeDefined();
    let metrics = JSON.parse(metricsText!);
    expect(metrics.server.uptimeFormatted).toBe('1s');
    expect(metrics.server.uptime).toBe(1000);
    expect(new Date(metrics.server.lastRequestTime).getTime()).toBe(fixedReferenceTime + 1000);

    // --- Test for 1 minute 1 second uptime ---
    dateNowSpy.mockReset();
    dateNowSpy
      .mockImplementationOnce(() => fixedReferenceTime)
      .mockImplementationOnce(() => fixedReferenceTime)
      .mockImplementationOnce(() => fixedReferenceTime + 61000)
      .mockImplementationOnce(() => fixedReferenceTime + 61000)
      .mockImplementationOnce(() => fixedReferenceTime + 61000);
    const toolInstance1m1s = new GetMetricsTool();

    result = await toolInstance1m1s.execute({ category: 'server' }, toolContext);
    metricsText = getResultText(result);
    expect(metricsText).toBeDefined();
    metrics = JSON.parse(metricsText!);
    expect(metrics.server.uptimeFormatted).toBe('1m 1s');
    expect(metrics.server.uptime).toBe(61000);
    expect(new Date(metrics.server.lastRequestTime).getTime()).toBe(fixedReferenceTime + 61000);

    // --- Test for 1 hour 1 minute 1 second uptime ---
    dateNowSpy.mockReset();
    dateNowSpy
      .mockImplementationOnce(() => fixedReferenceTime)
      .mockImplementationOnce(() => fixedReferenceTime)
      .mockImplementationOnce(() => fixedReferenceTime + 3661000)
      .mockImplementationOnce(() => fixedReferenceTime + 3661000)
      .mockImplementationOnce(() => fixedReferenceTime + 3661000);
    const toolInstance1h1m1s = new GetMetricsTool();

    result = await toolInstance1h1m1s.execute({ category: 'server' }, toolContext);
    metricsText = getResultText(result);
    expect(metricsText).toBeDefined();
    metrics = JSON.parse(metricsText!);
    expect(metrics.server.uptimeFormatted).toBe('1h 1m 1s');
    expect(metrics.server.uptime).toBe(3661000);
    expect(new Date(metrics.server.lastRequestTime).getTime()).toBe(fixedReferenceTime + 3661000);
  });
});
