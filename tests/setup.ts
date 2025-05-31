import 'reflect-metadata';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.MCP_LOG_LEVEL = 'error';

// Mock file system operations for tests
jest.mock('node:fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    mkdir: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn(),
    realpath: jest.fn(),
    access: jest.fn()
  }
}));

// Mock pino logger to avoid import issues in tests
jest.mock('../src/utils/logger.js', () => ({
  logger: {
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
  }
}));

// Mock better-sqlite3 for database tests
jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => ({
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
});
