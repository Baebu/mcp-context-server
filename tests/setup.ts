import 'reflect-metadata';
import { logger } from '../src/utils/logger.js';

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
    realpath: jest.fn()
  }
}));

// Suppress logs during tests
logger.level = 'silent';
