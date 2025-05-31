// Replace the entire contents of tests/setup.ts with this proper test setup:

import 'reflect-metadata';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.MCP_LOG_LEVEL = 'error';

// Mock file system operations for tests
const mockFs = {
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    mkdir: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn(),
    realpath: jest.fn(),
    access: jest.fn(),
    open: jest.fn()
  }
};

jest.mock('node:fs', () => mockFs);

// Mock pino logger to avoid import issues in tests
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn()
  })),
  level: 'silent'
};

jest.mock('../src/utils/logger.js', () => ({
  logger: mockLogger
}));

// Mock better-sqlite3 for database tests
const mockDatabase = jest.fn().mockImplementation(() => ({
  pragma: jest.fn(),
  exec: jest.fn(),
  prepare: jest.fn(() => ({
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn()
  })),
  backup: jest.fn(),
  close: jest.fn()
}));

jest.mock('better-sqlite3', () => mockDatabase);

// Mock YAML parser
jest.mock('yaml', () => ({
  parse: jest.fn(),
  stringify: jest.fn()
}));

// Mock p-queue
jest.mock('p-queue', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    pause: jest.fn(),
    start: jest.fn(),
    clear: jest.fn(),
    onIdle: jest.fn().mockResolvedValue(undefined),
    size: 0,
    pending: 0,
    isPaused: false,
    on: jest.fn()
  }));
});

// Global test setup
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.resetAllMocks();
});

// Suppress console output during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  };
}
