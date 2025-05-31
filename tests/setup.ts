import 'reflect-metadata'; // Required for InversifyJS

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MCP_LOG_LEVEL = 'error'; // Default to error for cleaner test output
process.env.MCP_LOG_PRETTY = 'false';

// --- Global Mocks ---

// Local interface for Node.js errors to avoid global namespace issues
interface ErrnoException extends Error {
  errno?: number;
  code?: string;
  path?: string;
  syscall?: string;
}

// Mock 'node:fs'
const mockFsStore: Record<string, string | Buffer | Error> = {};
const mockFsStats: Record<string, Partial<import('node:fs').Stats>> = {};

const mockFsPromisesImpl = {
  readFile: jest.fn(async (path: string, options?: unknown) => {
    const encoding = (typeof options === 'string' ? options : (options as { encoding?: string })?.encoding) || 'utf8';
    if (mockFsStore[path] instanceof Error) {
      throw mockFsStore[path];
    }
    if (!mockFsStore[path] && !mockFsStats[path]) {
      // Check stats too for directories
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`) as ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    const rawData = mockFsStore[path]; // string | Buffer
    if (encoding === 'binary') {
      return Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData as string);
    }
    return Buffer.isBuffer(rawData) ? rawData.toString('utf8') : (rawData as string);
  }),
  writeFile: jest.fn(async (path: string, data: string | Buffer) => {
    mockFsStore[path] = data;
    mockFsStats[path] = {
      ...mockFsStats[path],
      size: data.length,
      mtime: new Date(),
      isFile: () => true,
      isDirectory: () => false
    };
  }),
  appendFile: jest.fn(async (path: string, data: string | Buffer) => {
    const currentData = mockFsStore[path];
    let newContentBuffer: Buffer;
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    if (currentData && !(currentData instanceof Error)) {
      const currentContentBuffer = Buffer.isBuffer(currentData) ? currentData : Buffer.from(currentData as string);
      newContentBuffer = Buffer.concat([currentContentBuffer, dataBuffer]);
    } else {
      newContentBuffer = dataBuffer;
    }
    mockFsStore[path] = newContentBuffer;
    mockFsStats[path] = {
      ...mockFsStats[path],
      size: newContentBuffer.length,
      mtime: new Date(),
      isFile: () => true
    };
  }),
  readdir: jest.fn(async (path: string, options?: { withFileTypes?: boolean }) => {
    if (mockFsStore[path] instanceof Error) {
      throw mockFsStore[path];
    }

    const isDirectory =
      mockFsStats[path]?.isDirectory?.() ||
      (Object.keys(mockFsStats).some(p => p.startsWith(`${path}/`) && mockFsStats[p]?.isDirectory?.()) &&
        !mockFsStats[path]?.isFile?.());

    if (!isDirectory && path !== '' && path !== '.') {
      // Allow listing CWD if not explicitly set as dir
      const error = new Error(`ENOTDIR: not a directory, scandir '${path}'`) as ErrnoException;
      error.code = 'ENOTDIR';
      if (!mockFsStats[path] && !Object.keys(mockFsStore).some(p => p.startsWith(`${path}/`))) {
        const enoentError = new Error(`ENOENT: no such file or directory, scandir '${path}'`) as ErrnoException;
        enoentError.code = 'ENOENT';
        throw enoentError;
      }
      // If it's a file, not a dir, throw ENOTDIR
      if (mockFsStats[path]?.isFile?.()) {
        throw error;
      }
    }

    const normalizedPath = path === '.' || path === '' ? '' : path.endsWith('/') ? path : `${path}/`;

    const entries = Object.keys(mockFsStore)
      .concat(Object.keys(mockFsStats).filter(p => mockFsStats[p]?.isDirectory?.())) // Include empty dirs
      .reduce(
        (acc, p) => {
          // Deduplicate
          if (p.startsWith(normalizedPath) && p !== normalizedPath) {
            const entryName = p.substring(normalizedPath.length);
            if (entryName.includes('/')) {
              return acc;
            } // Only direct children
            if (!acc.find(e => (typeof e === 'string' ? e : e.name) === entryName)) {
              if (options?.withFileTypes) {
                const stats = mockFsStats[p] || {};
                acc.push({
                  name: entryName,
                  isFile: () => stats.isFile?.() ?? !stats.isDirectory?.() ?? true,
                  isDirectory: () => stats.isDirectory?.() ?? false,
                  isSymbolicLink: () => stats.isSymbolicLink?.() ?? false
                } as import('node:fs').Dirent);
              } else {
                acc.push(entryName);
              }
            }
          }
          return acc;
        },
        [] as (string | import('node:fs').Dirent)[]
      );
    return entries;
  }),
  stat: jest.fn(async (path: string) => {
    if (mockFsStore[path] instanceof Error) {
      throw mockFsStore[path];
    }
    if (!mockFsStats[path] && !mockFsStore[path]) {
      const error = new Error(`ENOENT: no such file or directory, stat '${path}'`) as ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return {
      size: 0,
      isFile: () => true, // Default, overridden by __setFile/__setDirectory
      isDirectory: () => false, // Default
      isSymbolicLink: () => false,
      mtime: new Date(),
      mode: 0o644, // Default file mode
      ...mockFsStats[path]
    } as import('node:fs').Stats;
  }),
  mkdir: jest.fn(async (path: string, _options?: { recursive?: boolean }) => {
    // _options unused
    mockFsStats[path] = { ...mockFsStats[path], isDirectory: () => true, isFile: () => false, mode: 0o755 };
  }),
  unlink: jest.fn(async (path: string) => {
    delete mockFsStore[path];
    delete mockFsStats[path];
  }),
  rm: jest.fn(async (path: string, options?: { recursive?: boolean; force?: boolean }) => {
    delete mockFsStore[path];
    delete mockFsStats[path];
    if (options?.recursive) {
      Object.keys(mockFsStore)
        .filter(p => p.startsWith(`${path}/`))
        .forEach(p => {
          delete mockFsStore[p];
          delete mockFsStats[p];
        });
      Object.keys(mockFsStats)
        .filter(p => p.startsWith(`${path}/`))
        .forEach(p => delete mockFsStats[p]);
    }
  }),
  realpath: jest.fn(async (p: string) => p), // Simplified realpath
  access: jest.fn(async (path: string) => {
    if (mockFsStore[path] instanceof Error) {
      throw mockFsStore[path];
    }
    if (!mockFsStore[path] && !mockFsStats[path]) {
      const error = new Error(`ENOENT: no such file or directory, access '${path}'`) as ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
  }),
  open: jest.fn(async (path: string, flags: string) => {
    if (mockFsStore[path] instanceof Error) {
      throw mockFsStore[path];
    }
    if (!mockFsStore[path] && !mockFsStats[path] && flags.includes('r')) {
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`) as ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return {
      read: jest.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
        const data = (mockFsStore[path] as Buffer) || Buffer.from('');
        const bytesToRead = Math.min(length, data.length - position);
        data.copy(buffer, offset, position, position + bytesToRead);
        return { bytesRead: bytesToRead, buffer };
      }),
      close: jest.fn(async () => {})
    };
  }),
  __setFile: (path: string, content: string | Buffer, stats?: Partial<import('node:fs').Stats>) => {
    mockFsStore[path] = content;
    mockFsStats[path] = {
      size: content.length,
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false,
      mtime: new Date(),
      mode: 0o644,
      ...stats
    };
  },
  __setDirectory: (path: string, stats?: Partial<import('node:fs').Stats>) => {
    mockFsStats[path] = {
      size: 0,
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
      mtime: new Date(),
      mode: 0o755,
      ...stats
    };
  },
  __clearFs: () => {
    for (const key in mockFsStore) {
      delete mockFsStore[key];
    }
    for (const key in mockFsStats) {
      delete mockFsStats[key];
    }
  },
  __getStore: () => mockFsStore,
  __getStats: () => mockFsStats
};
jest.mock('node:fs', () => ({ promises: mockFsPromisesImpl }));

// Mock 'pino' logger
interface MockLogger {
  trace: jest.Mock;
  debug: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  fatal: jest.Mock;
  child: jest.Mock<() => MockLogger>;
  level: string;
}
const mockLoggerInstance: MockLogger = {
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockLoggerInstance),
  level: 'silent'
};
jest.mock('../src/utils/logger.js', () => ({
  logger: mockLoggerInstance
}));

// Mock 'better-sqlite3'
interface MockPreparedStmt {
  run: jest.Mock;
  get: jest.Mock;
  all: jest.Mock;
  bind: jest.Mock<() => MockPreparedStmt>;
}
interface MockDb {
  pragma: jest.Mock;
  exec: jest.Mock;
  prepare: jest.Mock<(sql: string) => MockPreparedStmt>;
  backup: jest.Mock;
  close: jest.Mock;
  transaction: jest.Mock<(fn: (...args: any[]) => any) => (...args: any[]) => any>;
}
const mockPreparedStmtInstance: MockPreparedStmt = {
  run: jest.fn(),
  get: jest.fn(),
  all: jest.fn(),
  bind: jest.fn(() => mockPreparedStmtInstance)
};
const mockDbInstance: MockDb = {
  pragma: jest.fn(),
  exec: jest.fn(),
  prepare: jest.fn((_sql: string) => mockPreparedStmtInstance),
  backup: jest.fn().mockResolvedValue({ totalPages: 0, remainingPages: 0 }),
  close: jest.fn(),
  transaction: jest.fn(
    fn =>
      (...args: any[]) =>
        fn(...args)
  )
};
const mockBetterSqlite3 = jest.fn(() => mockDbInstance);
jest.mock('better-sqlite3', () => mockBetterSqlite3);

// Mock 'yaml' parser
jest.mock('yaml', () => ({
  parse: jest.fn((str: string) => JSON.parse(str)),
  stringify: jest.fn((obj: unknown) => JSON.stringify(obj, null, 2))
}));

// Mock 'p-queue'
interface MockPQueue {
  add: jest.Mock<(task: () => Promise<unknown>) => Promise<unknown>>;
  pause: jest.Mock;
  start: jest.Mock;
  clear: jest.Mock;
  onIdle: jest.Mock<() => Promise<void>>;
  size: number;
  pending: number;
  isPaused: boolean;
  on: jest.Mock;
}
const mockPQueueInstance: MockPQueue = {
  add: jest.fn(async (task: () => Promise<unknown>) => task()),
  pause: jest.fn(),
  start: jest.fn(),
  clear: jest.fn(),
  onIdle: jest.fn().mockResolvedValue(undefined),
  size: 0,
  pending: 0,
  isPaused: false,
  on: jest.fn()
};
jest.mock('p-queue', () => {
  return jest.fn().mockImplementation(() => mockPQueueInstance);
});

// Mock 'convict'
interface MockConvictSchema {
  get: jest.Mock;
  getProperties: jest.Mock;
  load: jest.Mock;
  validate: jest.Mock;
  has: jest.Mock;
  set: jest.Mock;
  default: jest.Mock;
}
const mockConvictSchemaInstance: MockConvictSchema = {
  get: jest.fn(),
  getProperties: jest.fn(),
  load: jest.fn(),
  validate: jest.fn(),
  has: jest.fn(),
  set: jest.fn(),
  default: jest.fn()
};
const mockConvict = jest.fn(() => mockConvictSchemaInstance);
jest.mock('convict', () => mockConvict);

// Mock 'child_process'
interface MockSpawn {
  stdout: { on: jest.Mock; pipe: jest.Mock };
  stderr: { on: jest.Mock; pipe: jest.Mock };
  on: jest.Mock<(event: string, cb: (...args: any[]) => void) => void>;
  kill: jest.Mock;
  killed: boolean;
}
const mockSpawnInstance: MockSpawn = {
  stdout: { on: jest.fn(), pipe: jest.fn() },
  stderr: { on: jest.fn(), pipe: jest.fn() },
  on: jest.fn((_event, _cb) => {}),
  kill: jest.fn(),
  killed: false
};
const mockSpawn = jest.fn(() => mockSpawnInstance);
jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: mockSpawn
}));

// --- Global Test Hooks ---
beforeEach(() => {
  jest.clearAllMocks();
  mockFsPromisesImpl.__clearFs();
  mockPQueueInstance.size = 0;
  mockPQueueInstance.pending = 0;
  mockLoggerInstance.level = process.env.MCP_LOG_LEVEL || 'error';

  mockSpawnInstance.stdout.on.mockClear();
  mockSpawnInstance.stderr.on.mockClear();
  mockSpawnInstance.on.mockClear();
  mockSpawnInstance.kill.mockClear();
  mockSpawnInstance.killed = false;

  mockDbInstance.pragma.mockClear();
  mockDbInstance.exec.mockClear();
  mockPreparedStmtInstance.run.mockClear();
  mockPreparedStmtInstance.get.mockClear();
  mockPreparedStmtInstance.all.mockClear();
  mockDbInstance.prepare.mockClear().mockReturnValue(mockPreparedStmtInstance);
  mockDbInstance.backup.mockClear().mockResolvedValue({ totalPages: 0, remainingPages: 0 });
  mockDbInstance.close.mockClear();

  mockConvictSchemaInstance.get.mockClear();
  mockConvictSchemaInstance.getProperties.mockClear();
  mockConvictSchemaInstance.load.mockClear();
  mockConvictSchemaInstance.validate.mockClear();
});

afterEach(() => {
  jest.resetAllMocks();
});

// Expose mocks for individual test configuration
global.mockLogger = mockLoggerInstance;
global.mockFsAdapter = mockFsPromisesImpl;
global.mockDb = mockDbInstance;
global.mockBetterSqlite3Constructor = mockBetterSqlite3;
global.mockPQueue = mockPQueueInstance;
global.mockSpawnFn = mockSpawn;
global.mockChildProcess = mockSpawnInstance;
global.mockConvictFn = mockConvict;
global.mockConvictSchemaInstance = mockConvictSchemaInstance;

declare global {
  // eslint-disable-next-line no-var
  var mockLogger: MockLogger;
  // eslint-disable-next-line no-var
  var mockFsAdapter: typeof mockFsPromisesImpl;
  // eslint-disable-next-line no-var
  var mockDb: MockDb;
  // eslint-disable-next-line no-var
  var mockBetterSqlite3Constructor: typeof mockBetterSqlite3;
  // eslint-disable-next-line no-var
  var mockPQueue: MockPQueue;
  // eslint-disable-next-line no-var
  var mockSpawnFn: typeof mockSpawn;
  // eslint-disable-next-line no-var
  var mockChildProcess: MockSpawn;
  // eslint-disable-next-line no-var
  var mockConvictFn: typeof mockConvict;
  // eslint-disable-next-line no-var
  var mockConvictSchemaInstance: MockConvictSchema;
}
