// src/infrastructure/adapters/database.adapter.ts
import { injectable, inject } from 'inversify';
import Database from 'better-sqlite3';
import type { IDatabaseHandler, ContextItem, QueryOptions } from '@core/interfaces/database.interface.js';
import { logger } from '../../utils/logger.js';
import type { ServerConfig } from '@infrastructure/config/types.js';

@injectable()
export class DatabaseAdapter implements IDatabaseHandler {
  private db!: Database.Database;

  constructor(@inject('Config') private config: ServerConfig) {
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    const dbPath = this.config.database.path || './data/context.db';
    this.db = new Database(dbPath);

    // Configure for optimal performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 1000000');
    this.db.pragma('temp_store = memory');
    this.db.pragma('foreign_keys = ON');

    this.createTables();
    logger.info({ path: dbPath }, 'Database initialized');
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS context_items (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT DEFAULT 'generic',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      ) WITHOUT ROWID;

      CREATE INDEX IF NOT EXISTS idx_context_type ON context_items(type);
      CREATE INDEX IF NOT EXISTS idx_context_updated ON context_items(updated_at);

      CREATE TABLE IF NOT EXISTS smart_paths (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT CHECK (type IN ('item_bundle', 'query_template', 'file_set')),
        definition TEXT NOT NULL,
        usage_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_smart_path_type ON smart_paths(type);
      CREATE INDEX IF NOT EXISTS idx_smart_path_usage ON smart_paths(usage_count DESC);

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workspace_files (
        workspace_id TEXT,
        file_path TEXT,
        metadata TEXT,
        last_modified TEXT,
        PRIMARY KEY (workspace_id, file_path),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );
    `);
  }

  async storeContext(key: string, value: unknown, type?: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO context_items (key, value, type, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const serializedValue = JSON.stringify(value);
    stmt.run(key, serializedValue, type || 'generic');

    logger.debug({ key, type, valueLength: serializedValue.length }, 'Context item stored');
  }

  async getContext(key: string): Promise<unknown | null> {
    const stmt = this.db.prepare('SELECT value FROM context_items WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;

    if (!row) {
      logger.debug({ key }, 'Context item not found');
      return null;
    }

    try {
      const parsed = JSON.parse(row.value);
      logger.debug({ key, found: true }, 'Context item retrieved');
      return parsed;
    } catch (error) {
      logger.warn({ key, error }, 'Failed to parse context item value, returning as string');
      return row.value;
    }
  }

  async deleteContext(key: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM context_items WHERE key = ?');
    const result = stmt.run(key);
    return result.changes > 0;
  }

  async queryContext(options: QueryOptions): Promise<ContextItem[]> {
    let query = 'SELECT * FROM context_items WHERE 1=1';
    const params: unknown[] = [];

    if (options.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }

    if (options.keyPattern) {
      query += ' AND key LIKE ?';
      params.push(`%${options.keyPattern}%`);
    }

    query += ' ORDER BY updated_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as DatabaseRow[];

    return rows.map(row => {
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(row.value);
      } catch {
        parsedValue = row.value;
      }

      return {
        key: row.key,
        value: parsedValue,
        type: row.type,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      };
    });
  }

  async backup(backupPath: string): Promise<void> {
    await this.db.backup(backupPath);
    logger.info({ backupPath }, 'Database backup completed');
  }

  close(): void {
    this.db.close();
    logger.info('Database connection closed');
  }

  // Raw SQL methods for smart path management
  async executeQuery(sql: string, params: unknown[]): Promise<unknown[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as unknown[];
  }

  async executeCommand(sql: string, params: unknown[]): Promise<{ changes: number }> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return { changes: result.changes };
  }

  async getSingle(sql: string, params: unknown[]): Promise<unknown | null> {
    const stmt = this.db.prepare(sql);
    return (stmt.get(...params) as unknown) || null;
  }
}

// Database row interface
interface DatabaseRow {
  key: string;
  value: string;
  type: string;
  created_at: string;
  updated_at: string;
}
