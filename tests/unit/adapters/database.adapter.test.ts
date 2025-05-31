import { DatabaseAdapter } from '../../../src/infrastructure/adapters/database.adapter';
import type { ServerConfig } from '../../../src/infrastructure/config/types';
import type { ContextItem, QueryOptions } from '../../../src/core/interfaces/database.interface';
import { logger } from '../../../src/utils/logger'; // Mocked

// Use the globally mocked better-sqlite3
const mockDb = global.mockDb;
const mockBetterSqlite3 = global.mockBetterSqlite3Constructor;
const mockPreparedStmt = mockDb.prepare(''); // Get the prepared statement mock

jest.mock('../../../src/utils/logger');

describe('DatabaseAdapter', () => {
  let dbAdapter: DatabaseAdapter;
  let mockConfig: ServerConfig;

  beforeEach(() => {
    // Reset mocks for each test
    jest.clearAllMocks();
    mockBetterSqlite3.mockClear().mockReturnValue(mockDb); // Ensure constructor returns our mockDb
    mockDb.pragma.mockClear();
    mockDb.exec.mockClear();
    mockPreparedStmt.run.mockClear();
    mockPreparedStmt.get.mockClear();
    mockPreparedStmt.all.mockClear();
    mockDb.prepare.mockClear().mockReturnValue(mockPreparedStmt);
    mockDb.backup.mockClear().mockResolvedValue({ totalPages: 1, remainingPages: 0 });
    mockDb.close.mockClear();

    mockConfig = {
      server: { name: 'test', version: '1.0' },
      security: {
        allowedCommands: [],
        safezones: [],
        maxExecutionTime: 1,
        maxFileSize: 1,
        unsafeArgumentPatterns: []
      },
      database: {
        path: ':memory:', // Use in-memory for tests, though it's mocked
        backupInterval: 0
      },
      logging: { level: 'error', pretty: false },
      performance: { maxConcurrency: 1, queueSize: 1 }
    };
    dbAdapter = new DatabaseAdapter(mockConfig);
  });

  it('should initialize the database and create tables on construction', () => {
    expect(mockBetterSqlite3).toHaveBeenCalledWith(':memory:');
    expect(mockDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
    expect(mockDb.pragma).toHaveBeenCalledWith('synchronous = NORMAL');
    // ... other pragma calls
    expect(mockDb.exec).toHaveBeenCalledTimes(1); // For CREATE TABLE statements
    expect(logger.info).toHaveBeenCalledWith({ path: ':memory:' }, 'Database initialized');
  });

  describe('storeContext', () => {
    it('should store a context item', async () => {
      const item = { message: 'Hello' };
      await dbAdapter.storeContext('testKey', item, 'greeting');
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO context_items'));
      expect(mockPreparedStmt.run).toHaveBeenCalledWith('testKey', JSON.stringify(item), 'greeting');
      expect(logger.debug).toHaveBeenCalledWith(
        { key: 'testKey', type: 'greeting', valueLength: JSON.stringify(item).length },
        'Context item stored'
      );
    });

    it('should use "generic" type if not provided', async () => {
      await dbAdapter.storeContext('testKey2', { data: 123 });
      expect(mockPreparedStmt.run).toHaveBeenCalledWith('testKey2', JSON.stringify({ data: 123 }), 'generic');
    });
  });

  describe('getContext', () => {
    it('should retrieve an existing context item', async () => {
      const storedValue = { message: 'Found me' };
      mockPreparedStmt.get.mockReturnValue({ value: JSON.stringify(storedValue) });
      const result = await dbAdapter.getContext('existKey');
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT value FROM context_items WHERE key = ?')
      );
      expect(mockPreparedStmt.get).toHaveBeenCalledWith('existKey');
      expect(result).toEqual(storedValue);
      expect(logger.debug).toHaveBeenCalledWith({ key: 'existKey', found: true }, 'Context item retrieved');
    });

    it('should return null if context item does not exist', async () => {
      mockPreparedStmt.get.mockReturnValue(undefined);
      const result = await dbAdapter.getContext('nonExistKey');
      expect(result).toBeNull();
      expect(logger.debug).toHaveBeenCalledWith({ key: 'nonExistKey' }, 'Context item not found');
    });

    it('should return raw string if JSON parsing fails', async () => {
      const unparsableValue = 'this is not json';
      mockPreparedStmt.get.mockReturnValue({ value: unparsableValue });
      const result = await dbAdapter.getContext('unparsableKey');
      expect(result).toBe(unparsableValue);
      expect(logger.warn).toHaveBeenCalledWith(
        { key: 'unparsableKey', error: expect.any(SyntaxError) }, // JSON.parse throws SyntaxError
        'Failed to parse context item value, returning as string'
      );
    });
  });

  describe('deleteContext', () => {
    it('should delete a context item and return true if successful', async () => {
      mockPreparedStmt.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 });
      const result = await dbAdapter.deleteContext('deleteKey');
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM context_items WHERE key = ?'));
      expect(mockPreparedStmt.run).toHaveBeenCalledWith('deleteKey');
      expect(result).toBe(true);
    });

    it('should return false if no item was deleted', async () => {
      mockPreparedStmt.run.mockReturnValue({ changes: 0, lastInsertRowid: 0 });
      const result = await dbAdapter.deleteContext('noKeyToDelete');
      expect(result).toBe(false);
    });
  });

  describe('queryContext', () => {
    const mockDbRows: Array<{ key: string; value: string; type: string; created_at: string; updated_at: string }> = [
      {
        key: 'key1',
        value: JSON.stringify({ data: 'val1' }),
        type: 'typeA',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        key: 'key2',
        value: JSON.stringify({ data: 'val2' }),
        type: 'typeB',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    it('should query context items without options', async () => {
      mockPreparedStmt.all.mockReturnValue(mockDbRows);
      const result = await dbAdapter.queryContext({} as QueryOptions);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM context_items WHERE 1=1 ORDER BY updated_at DESC')
      );
      expect(mockPreparedStmt.all).toHaveBeenCalledWith();
      expect(result.length).toBe(2);
      expect(result[0].key).toBe('key1');
    });

    it('should query context items with type filter', async () => {
      mockPreparedStmt.all.mockReturnValue([mockDbRows[0]]);
      await dbAdapter.queryContext({ type: 'typeA' });
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('AND type = ?'));
      expect(mockPreparedStmt.all).toHaveBeenCalledWith('typeA');
    });

    it('should query context items with keyPattern filter', async () => {
      mockPreparedStmt.all.mockReturnValue(mockDbRows);
      await dbAdapter.queryContext({ keyPattern: 'key' });
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('AND key LIKE ?'));
      expect(mockPreparedStmt.all).toHaveBeenCalledWith('%key%');
    });

    it('should query context items with limit', async () => {
      mockPreparedStmt.all.mockReturnValue([mockDbRows[0]]);
      await dbAdapter.queryContext({ limit: 1 });
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('LIMIT ?'));
      expect(mockPreparedStmt.all).toHaveBeenCalledWith(1);
    });

    it('should handle combined filters', async () => {
      mockPreparedStmt.all.mockReturnValue([mockDbRows[0]]);
      await dbAdapter.queryContext({ type: 'typeA', keyPattern: 'k1', limit: 5 });
      expect(mockPreparedStmt.all).toHaveBeenCalledWith('typeA', '%k1%', 5);
    });

    it('should parse JSON values correctly', async () => {
      mockPreparedStmt.all.mockReturnValue([mockDbRows[0]]);
      const result: ContextItem[] = await dbAdapter.queryContext({} as QueryOptions);
      expect(result[0].value).toEqual({ data: 'val1' });
    });

    it('should return raw value if JSON parsing fails for a row', async () => {
      const rowsWithBadJson = [
        { ...mockDbRows[0] },
        {
          key: 'badKey',
          value: 'not json',
          type: 'typeC',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];
      mockPreparedStmt.all.mockReturnValue(rowsWithBadJson);
      const result: ContextItem[] = await dbAdapter.queryContext({} as QueryOptions);
      expect(result[1].value).toBe('not json');
    });
  });

  describe('backup', () => {
    it('should perform a database backup', async () => {
      const backupPath = './backup.db';
      await dbAdapter.backup(backupPath);
      expect(mockDb.backup).toHaveBeenCalledWith(backupPath);
      expect(logger.info).toHaveBeenCalledWith({ backupPath }, 'Database backup completed');
    });
  });

  describe('close', () => {
    it('should close the database connection', () => {
      dbAdapter.close();
      expect(mockDb.close).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Database connection closed');
    });
  });

  describe('Raw SQL Methods', () => {
    const sql = 'SELECT * FROM test_table WHERE id = ?';
    const params = [1];

    it('executeQuery should execute a SELECT query', async () => {
      const mockResultRows = [{ col1: 'data' }];
      mockPreparedStmt.all.mockReturnValue(mockResultRows);
      const result = await dbAdapter.executeQuery(sql, params);
      expect(mockDb.prepare).toHaveBeenCalledWith(sql);
      expect(mockPreparedStmt.all).toHaveBeenCalledWith(...params);
      expect(result).toEqual(mockResultRows);
    });

    it('executeCommand should execute a non-SELECT command', async () => {
      const mockChanges = 1;
      mockPreparedStmt.run.mockReturnValue({ changes: mockChanges, lastInsertRowid: 0 });
      const result = await dbAdapter.executeCommand(sql, params);
      expect(mockDb.prepare).toHaveBeenCalledWith(sql);
      expect(mockPreparedStmt.run).toHaveBeenCalledWith(...params);
      expect(result).toEqual({ changes: mockChanges });
    });

    it('getSingle should retrieve a single row', async () => {
      const mockSingleRow = { col1: 'single_data' };
      mockPreparedStmt.get.mockReturnValue(mockSingleRow);
      const result = await dbAdapter.getSingle(sql, params);
      expect(mockDb.prepare).toHaveBeenCalledWith(sql);
      expect(mockPreparedStmt.get).toHaveBeenCalledWith(...params);
      expect(result).toEqual(mockSingleRow);
    });

    it('getSingle should return null if no row found', async () => {
      mockPreparedStmt.get.mockReturnValue(undefined);
      const result = await dbAdapter.getSingle(sql, params);
      expect(result).toBeNull();
    });
  });

  describe('Table Creation SQL Robustness', () => {
    it('should include all expected tables and indices in creation SQL', () => {
      // Re-initialize to capture the exec call
      dbAdapter = new DatabaseAdapter(mockConfig);
      const creationSql = mockDb.exec.mock.calls[0][0] as string;

      // Context Items Table
      expect(creationSql).toContain('CREATE TABLE IF NOT EXISTS context_items');
      expect(creationSql).toContain('key TEXT PRIMARY KEY');
      expect(creationSql).toContain('value TEXT NOT NULL');
      expect(creationSql).toContain("type TEXT DEFAULT 'generic'");
      expect(creationSql).toContain('WITHOUT ROWID');
      expect(creationSql).toContain('CREATE INDEX IF NOT EXISTS idx_context_type ON context_items(type)');
      expect(creationSql).toContain('CREATE INDEX IF NOT EXISTS idx_context_updated ON context_items(updated_at)');

      // Smart Paths Table
      expect(creationSql).toContain('CREATE TABLE IF NOT EXISTS smart_paths');
      expect(creationSql).toContain('id TEXT PRIMARY KEY');
      expect(creationSql).toContain("type TEXT CHECK (type IN ('item_bundle', 'query_template', 'file_set'))");
      expect(creationSql).toContain('usage_count INTEGER DEFAULT 0');
      expect(creationSql).toContain('CREATE INDEX IF NOT EXISTS idx_smart_path_type ON smart_paths(type)');
      expect(creationSql).toContain('CREATE INDEX IF NOT EXISTS idx_smart_path_usage ON smart_paths(usage_count DESC)');

      // Workspaces Table
      expect(creationSql).toContain('CREATE TABLE IF NOT EXISTS workspaces');
      expect(creationSql).toContain('id TEXT PRIMARY KEY');
      expect(creationSql).toContain('name TEXT NOT NULL');

      // Workspace Files Table
      expect(creationSql).toContain('CREATE TABLE IF NOT EXISTS workspace_files');
      expect(creationSql).toContain('PRIMARY KEY (workspace_id, file_path)');
      expect(creationSql).toContain('FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE');
    });
  });
});
