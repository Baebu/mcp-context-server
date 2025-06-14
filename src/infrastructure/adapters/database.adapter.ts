// Enhanced Database Adapter with Integrity Checks and Automated Backups
// File: src/infrastructure/adapters/database.adapter.ts

import { injectable, inject } from 'inversify';
import Database from 'better-sqlite3';
import { promises as fs, mkdirSync as fsMkdirSync } from 'node:fs'; // Added fsMkdirSync
import path from 'node:path';
import type { IDatabaseHandler, ContextItem, QueryOptions } from '../../core/interfaces/database.interface.js';
import { logger } from '../../utils/logger.js';
import type { ServerConfig } from '@infrastructure/config/schema.js'; // Corrected import
import { MigrationExecutor } from '../migrations/migration-executor.js'; // Added import

interface IntegrityCheckResult {
  isHealthy: boolean;
  issues: string[];
  checkedAt: Date;
}

interface BackupInfo {
  path: string;
  timestamp: Date;
  size: number;
}

@injectable()
export class DatabaseAdapter implements IDatabaseHandler {
  private db!: Database.Database;
  private backupTimer?: ReturnType<typeof setInterval>;
  private lastIntegrityCheck?: IntegrityCheckResult;

  /**
   * Get access to the underlying database instance for advanced operations
   * Used by semantic extensions and other advanced database operations
   */
  getDatabase(): Database.Database {
    // Implements the interface method
    return this.db;
  }

  constructor(@inject('Config') private config: ServerConfig) {
    this.initializeDatabase(); // This is synchronous
    this.schedulePeriodicBackups(); // This involves async ops but schedules them
  }

  private initializeDatabase(): void {
    // config.database.path is already resolved to absolute by loadConfig
    const dbPath = this.config.database.path;

    // Ensure directory exists (synchronously, as this is in constructor path)
    const dbDir = path.dirname(dbPath);
    try {
      // Using require('fs').mkdirSync was fine, but to use imported module:
      fsMkdirSync(dbDir, { recursive: true });
    } catch (error) {
      // Log as warning if dir already exists, error otherwise
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') {
        logger.error({ error, dbDir }, 'Failed to create database directory during initialization.');
        // This could be a fatal error depending on policy.
        // For now, we let better-sqlite3 potentially fail if dir is truly inaccessible.
      } else {
        logger.debug({ dbDir }, 'Database directory already exists.');
      }
    }

    this.db = new Database(dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 1000000');
    this.db.pragma('temp_store = memory');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('wal_autocheckpoint = 1000');

    this.createTables();

    // Perform initial integrity check asynchronously without blocking constructor
    this.performIntegrityCheck()
      .then(result => {
        if (!result.isHealthy) {
          logger.error({ issues: result.issues }, 'Database integrity issues detected during initialization');
        } else {
          logger.info('Database initialized and integrity verified');
        }
      })
      .catch(error => {
        logger.error({ error }, 'Failed to perform initial integrity check');
      });

    logger.info({ path: dbPath }, 'Database initialized with resilience features');
  }

  private createTables(): void {
    // Create the basic context_items table first
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS context_items (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT DEFAULT 'generic',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      ) WITHOUT ROWID;
    `);

    // Create basic indexes that work with the minimal schema
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_context_type ON context_items(type);
      CREATE INDEX IF NOT EXISTS idx_context_updated ON context_items(updated_at);
    `);

    // Try to create enhanced schema indexes individually - these will fail gracefully if columns don't exist
    const enhancedIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_context_token_count ON context_items(token_count)',
      'CREATE INDEX IF NOT EXISTS idx_context_accessed ON context_items(accessed_at)',
      'CREATE INDEX IF NOT EXISTS idx_context_access_count ON context_items(access_count)',
      'CREATE INDEX IF NOT EXISTS idx_context_semantic_type ON context_items(context_type)'
    ];

    for (const indexSql of enhancedIndexes) {
      try {
        this.db.exec(indexSql);
      } catch (error) {
        // This index will be created after migrations add the column
        logger.debug(`Enhanced index not created yet (column may not exist): ${indexSql}`);
      }
    }
    // Create additional tables (these don't depend on the enhanced columns)
    this.db.exec(`
      -- Token tracking and budgeting tables
      CREATE TABLE IF NOT EXISTS token_budgets (
        session_id TEXT PRIMARY KEY,
        total_tokens INTEGER DEFAULT 0,
        used_tokens INTEGER DEFAULT 0,
        remaining_tokens INTEGER DEFAULT 0,
        max_tokens INTEGER DEFAULT 200000,
        handoff_threshold INTEGER DEFAULT 180000,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS token_usage_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        operation TEXT,
        context_key TEXT,
        tokens_used INTEGER,
        cumulative_tokens INTEGER,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES token_budgets(session_id)
      );

      CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage_log(session_id);
      CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage_log(timestamp);

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

      CREATE TABLE IF NOT EXISTS db_health_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_type TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT,
        checked_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create context relationships table without foreign key constraints initially
    // The foreign keys will be added by migrations once the enhanced schema is in place
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS context_relationships (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_key TEXT NOT NULL,
          target_key TEXT NOT NULL,
          relationship_type TEXT NOT NULL,
          strength REAL DEFAULT 1.0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_key, target_key, relationship_type)
        );

        CREATE INDEX IF NOT EXISTS idx_relationships_source ON context_relationships(source_key);
        CREATE INDEX IF NOT EXISTS idx_relationships_target ON context_relationships(target_key);
        CREATE INDEX IF NOT EXISTS idx_relationships_type ON context_relationships(relationship_type);
      `);
    } catch (error) {
      // This will be created by migrations if it fails
      logger.debug('Context relationships table creation deferred to migrations');
    }
  }

  async applyInitialMigrations(): Promise<void> {
    try {
      const migrationExecutor = new MigrationExecutor(this.db);
      await migrationExecutor.applyAllPending(); // Changed to applyAllPending
      logger.info('All pending database migrations applied successfully via DatabaseAdapter.');
    } catch (error) {
      logger.error({ error }, 'Failed to apply database migrations via DatabaseAdapter.');
      throw error; // Re-throw the error to halt server startup if migrations fail
    }
  }

  async performIntegrityCheck(): Promise<IntegrityCheckResult> {
    const result: IntegrityCheckResult = {
      isHealthy: true,
      issues: [],
      checkedAt: new Date()
    };

    try {
      const integrityResult = this.db.pragma('integrity_check');
      if (Array.isArray(integrityResult)) {
        const issues = integrityResult.filter(
          item =>
            typeof item === 'object' &&
            item !== null &&
            'integrity_check' in item &&
            (item as { integrity_check: string }).integrity_check !== 'ok'
        );
        if (issues.length > 0) {
          result.isHealthy = false;
          result.issues.push(...issues.map(issue => String((issue as { integrity_check: string }).integrity_check)));
        }
      }

      const fkResult = this.db.pragma('foreign_key_check');
      if (Array.isArray(fkResult) && fkResult.length > 0) {
        result.isHealthy = false;
        result.issues.push(`Foreign key violations: ${fkResult.length}`);
      }

      const orphanedWorkspaceFiles = this.db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM workspace_files wf
        LEFT JOIN workspaces w ON wf.workspace_id = w.id
        WHERE w.id IS NULL
      `
        )
        .get() as { count: number };

      if (orphanedWorkspaceFiles.count > 0) {
        result.isHealthy = false;
        result.issues.push(`Orphaned workspace files: ${orphanedWorkspaceFiles.count}`);
      }

      const contextItemsCount = this.db.prepare('SELECT COUNT(*) as count FROM context_items').get() as {
        count: number;
      };
      if (contextItemsCount.count < 0) {
        result.isHealthy = false;
        result.issues.push('Invalid context items count');
      }

      this.db
        .prepare(
          `
        INSERT INTO db_health_log (check_type, status, details)
        VALUES (?, ?, ?)
      `
        )
        .run('integrity_check', result.isHealthy ? 'healthy' : 'issues_found', JSON.stringify(result.issues));

      this.lastIntegrityCheck = result;

      if (result.isHealthy) {
        logger.debug('Database integrity check passed');
      } else {
        logger.warn({ issues: result.issues }, 'Database integrity issues detected');
      }
    } catch (error) {
      result.isHealthy = false;
      const message = error instanceof Error ? error.message : String(error);
      result.issues.push(`Integrity check failed: ${message}`);
      logger.error({ error: message }, 'Database integrity check failed');
    }

    return result;
  }

  getLastIntegrityCheck(): IntegrityCheckResult | null {
    return this.lastIntegrityCheck || null;
  }

  private schedulePeriodicBackups(): void {
    const backupInterval = this.config.database.backupInterval;

    if (!backupInterval || backupInterval <= 0) {
      logger.info('Automated database backups disabled');
      return;
    }

    const intervalMs = backupInterval * 60 * 1000;

    this.backupTimer = setInterval(async () => {
      try {
        await this.performAutomatedBackup();
      } catch (error) {
        logger.error({ error }, 'Automated backup failed');
      }
    }, intervalMs);

    logger.info({ intervalMinutes: backupInterval }, 'Automated database backups scheduled');
  }

  private async performAutomatedBackup(): Promise<BackupInfo> {
    const timestamp = new Date();
    // Use the server's working directory (which might have been changed by config) as the base for relative backup paths
    const serverWorkingDirectory = this.config.server.workingDirectory || process.cwd();
    const backupDir = path.resolve(serverWorkingDirectory, path.dirname(this.config.database.path), 'backups');

    const backupFilename = `context-${timestamp.toISOString().replace(/[:.]/g, '-')}.db`;
    const backupPath = path.join(backupDir, backupFilename);

    await fs.mkdir(backupDir, { recursive: true });
    await this.backup(backupPath); // backupPath is now absolute or relative to serverWorkingDirectory
    const stats = await fs.stat(backupPath);

    const backupInfo: BackupInfo = { path: backupPath, timestamp, size: stats.size };
    await this.cleanupOldBackups(backupDir);

    logger.info(
      { backupPath, sizeBytes: stats.size, timestamp: timestamp.toISOString() },
      'Automated database backup completed'
    );
    return backupInfo;
  }

  private async cleanupOldBackups(backupDir: string, keepCount: number = 10): Promise<void> {
    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('context-') && file.endsWith('.db'))
        .map(file => ({
          name: file,
          path: path.join(backupDir, file)
        }));

      if (backupFiles.length <= keepCount) return;

      backupFiles.sort((a, b) => b.name.localeCompare(a.name));
      const filesToDelete = backupFiles.slice(keepCount);

      for (const file of filesToDelete) {
        await fs.unlink(file.path);
        logger.debug({ deletedBackup: file.name }, 'Cleaned up old backup file');
      }
      logger.info(
        {
          deletedCount: filesToDelete.length,
          keepCount // Corrected from keptCount to keepCount
        },
        'Old backup files cleaned up'
      );
    } catch (error) {
      logger.warn({ error, backupDir }, 'Failed to cleanup old backup files');
    }
  }

  async listBackups(): Promise<BackupInfo[]> {
    // Use the server's working directory as the base for relative backup paths
    const serverWorkingDirectory = this.config.server.workingDirectory || process.cwd();
    const backupDir = path.resolve(serverWorkingDirectory, path.dirname(this.config.database.path), 'backups');

    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files.filter(file => file.startsWith('context-') && file.endsWith('.db'));
      const backups: BackupInfo[] = [];

      for (const file of backupFiles) {
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);
        const timestampStr = file.replace('context-', '').replace('.db', '').replace(/-/g, ':');
        let timestamp: Date;
        try {
          timestamp = new Date(timestampStr);
          if (isNaN(timestamp.getTime())) throw new Error('Invalid date from filename');
        } catch {
          timestamp = stats.mtime;
        }
        backups.push({ path: filePath, timestamp, size: stats.size });
      }
      backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      return backups;
    } catch (error) {
      logger.warn({ error, backupDir }, 'Failed to list backups');
      return [];
    }
  }

  async restoreFromBackup(backupPath: string): Promise<void> {
    const absoluteBackupPath = path.resolve(this.config.server.workingDirectory || process.cwd(), backupPath);
    await fs.access(absoluteBackupPath);

    const testDb = new Database(absoluteBackupPath, { readonly: true });
    try {
      const integrityResult = testDb.pragma('integrity_check');
      if (Array.isArray(integrityResult)) {
        const issues = integrityResult.filter(
          item =>
            typeof item === 'object' &&
            item !== null &&
            'integrity_check' in item &&
            (item as { integrity_check: string }).integrity_check !== 'ok'
        );
        if (issues.length > 0) {
          throw new Error(`Backup file has integrity issues: ${issues.join(', ')}`);
        }
      }
    } catch (error) {
      throw new Error(`Backup file validation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      testDb.close();
    }

    this.close(); // Close current DB

    const currentDbPath = this.config.database.path; // This is already absolute
    const preRestoreBackupPath = `${currentDbPath}.pre-restore-${Date.now()}.bak`;
    try {
      await fs.copyFile(currentDbPath, preRestoreBackupPath);
      logger.info({ backupPath: preRestoreBackupPath }, 'Created backup of current database before restore');
    } catch (error) {
      logger.warn({ error }, 'Failed to backup current database before restore');
    }

    await fs.copyFile(absoluteBackupPath, currentDbPath);
    this.initializeDatabase(); // Reinitialize with the restored DB
    logger.info({ restoredFrom: absoluteBackupPath }, 'Database restored from backup');
  }

  async storeContext(key: string, value: unknown, type?: string): Promise<void> {
    let serializedValue: string;
    try {
      serializedValue = JSON.stringify(value);
    } catch (error) {
      throw new Error(
        `Failed to serialize context value for key '${key}': ${error instanceof Error ? error.message : String(error)}. Value must be JSON-serializable.`
      );
    }

    if (Buffer.byteLength(serializedValue, 'utf8') > 1048576) {
      // 1MB limit
      throw new Error(
        `Context value for key '${key}' too large (${(Buffer.byteLength(serializedValue, 'utf8') / 1024 / 1024).toFixed(2)}MB). Max 1MB.`
      );
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO context_items (key, value, type, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `);
      stmt.run(key, serializedValue, type || 'generic');
      logger.debug({ key, type, valueLength: serializedValue.length }, 'Context item stored');
    } catch (error) {
      logger.error({ error, key, type }, 'Failed to store context item');
      throw error;
    }
  }

  async getContext(key: string): Promise<unknown | null> {
    try {
      const stmt = this.db.prepare('SELECT value FROM context_items WHERE key = ?');
      const row = stmt.get(key) as { value: string } | undefined;

      if (!row) {
        logger.debug({ key }, 'Context item not found');
        return null;
      }
      try {
        return JSON.parse(row.value);
      } catch (error) {
        logger.warn({ key, error }, 'Failed to parse context item value, returning as string');
        return row.value;
      }
    } catch (error) {
      logger.error({ error, key }, 'Failed to get context item');
      throw error;
    }
  }

  async deleteContext(key: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM context_items WHERE key = ?');
      const result = stmt.run(key);
      logger.debug({ key, deleted: result.changes > 0 }, 'Context item deletion attempted');
      return result.changes > 0;
    } catch (error) {
      logger.error({ error, key }, 'Failed to delete context item');
      throw error;
    }
  }

  async queryContext(options: QueryOptions): Promise<ContextItem[]> {
    try {
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
      const rows = stmt.all(...params) as Array<{
        key: string;
        value: string;
        type: string;
        created_at: string;
        updated_at: string;
      }>;

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
    } catch (error) {
      logger.error({ error, options }, 'Failed to query context items');
      throw error;
    }
  }

  async backup(backupPath: string): Promise<void> {
    // Ensure backupPath is absolute based on the server's CWD,
    // as better-sqlite3 resolves paths relative to CWD for its backup operations.
    const serverWorkingDirectory = this.config.server.workingDirectory || process.cwd();
    const absoluteBackupPath = path.resolve(serverWorkingDirectory, backupPath);

    try {
      const destDir = path.dirname(absoluteBackupPath);
      await fs.mkdir(destDir, { recursive: true }); // Ensure directory exists
      await this.db.backup(absoluteBackupPath); // Use the now absolute path
      logger.info({ backupPath: absoluteBackupPath }, 'Database backup completed');
    } catch (error) {
      logger.error({ error, backupPath: absoluteBackupPath }, 'Database backup failed');
      throw error;
    }
  }

  /**
   * Get the underlying database instance for advanced operations
   * Used by semantic extensions and other advanced database operations
   */
  getDatabaseInstance(): Database.Database {
    // This was a duplicate, getDatabase() is the one from interface
    return this.db;
  }

  close(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = undefined;
    }
    if (this.db) {
      this.db.close();
      logger.info('Database connection closed');
    }
  }

  async executeQuery(sql: string, params: unknown[]): Promise<unknown[]> {
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.all(...params) as unknown[];
      logger.debug({ sql, paramCount: params.length, resultCount: result.length }, 'Raw SQL query executed');
      return result;
    } catch (error) {
      logger.error({ error, sql, paramCount: params.length }, 'Raw SQL query failed');
      throw error;
    }
  }

  async executeCommand(sql: string, params: unknown[]): Promise<{ changes: number }> {
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...params);
      logger.debug({ sql, paramCount: params.length, changes: result.changes }, 'Raw SQL command executed');
      return { changes: result.changes };
    } catch (error) {
      logger.error({ error, sql, paramCount: params.length }, 'Raw SQL command failed');
      throw error;
    }
  }

  async getSingle(sql: string, params: unknown[]): Promise<unknown | null> {
    try {
      const stmt = this.db.prepare(sql);
      const result = (stmt.get(...params) as unknown) || null;
      logger.debug({ sql, paramCount: params.length, found: result !== null }, 'Raw SQL single query executed');
      return result;
    } catch (error) {
      logger.error({ error, sql, paramCount: params.length }, 'Raw SQL single query failed');
      throw error;
    }
  }

  // Enhanced Context Methods
  async storeEnhancedContext(
    entry: import('../../core/interfaces/database.interface.js').EnhancedContextEntry
  ): Promise<void> {
    try {
      const embeddingJson = entry.embedding ? JSON.stringify(entry.embedding) : null;
      const tagsJson = entry.semanticTags ? JSON.stringify(entry.semanticTags) : null;
      const metadataJson = entry.metadata ? JSON.stringify(entry.metadata) : null;
      const relationshipsJson = entry.relationships ? JSON.stringify(entry.relationships) : null;

      let serializedValue: string;
      try {
        serializedValue = JSON.stringify(entry.value);
      } catch (error) {
        throw new Error(
          `Failed to serialize enhanced context value for key '${entry.key}': ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO context_items
        (key, value, type, embedding, semantic_tags, context_type, token_count, metadata, relationships, updated_at, accessed_at, access_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, COALESCE((SELECT access_count FROM context_items WHERE key = ?), 0) + 1)
      `);

      stmt.run(
        entry.key,
        serializedValue,
        entry.type,
        embeddingJson,
        tagsJson,
        entry.contextType || entry.type,
        entry.tokenCount || 0,
        metadataJson,
        relationshipsJson,
        entry.key // For the COALESCE query
      );

      logger.debug({ key: entry.key, type: entry.type, hasEmbedding: !!entry.embedding }, 'Enhanced context stored');
    } catch (error) {
      logger.error({ error, key: entry.key }, 'Failed to store enhanced context');
      throw error;
    }
  }

  async getEnhancedContext(
    key: string
  ): Promise<import('../../core/interfaces/database.interface.js').EnhancedContextEntry | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM context_items WHERE key = ?
      `);
      const row = stmt.get(key) as any;

      if (!row) {
        return null;
      }

      // Update access tracking
      const updateStmt = this.db.prepare(`
        UPDATE context_items
        SET accessed_at = CURRENT_TIMESTAMP, access_count = access_count + 1
        WHERE key = ?
      `);
      updateStmt.run(key);

      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(row.value);
      } catch {
        parsedValue = row.value;
      }

      const entry: import('../../core/interfaces/database.interface.js').EnhancedContextEntry = {
        key: row.key,
        value: parsedValue,
        type: row.type,
        embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
        semanticTags: row.semantic_tags ? JSON.parse(row.semantic_tags) : undefined,
        contextType: row.context_type,
        tokenCount: row.token_count,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        relationships: row.relationships ? JSON.parse(row.relationships) : undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        accessedAt: row.accessed_at ? new Date(row.accessed_at) : undefined,
        accessCount: row.access_count
      };

      return entry;
    } catch (error) {
      logger.error({ error, key }, 'Failed to get enhanced context');
      throw error;
    }
  }

  async queryEnhancedContext(
    options: import('../../core/interfaces/database.interface.js').EnhancedQueryOptions
  ): Promise<import('../../core/interfaces/database.interface.js').EnhancedContextEntry[]> {
    try {
      let query = 'SELECT * FROM context_items WHERE 1=1';
      const params: unknown[] = [];

      if (options.type) {
        query += ' AND type = ?';
        params.push(options.type);
      }
      if (options.contextType) {
        query += ' AND context_type = ?';
        params.push(options.contextType);
      }
      if (options.keyPattern) {
        query += ' AND key LIKE ?';
        params.push(`%${options.keyPattern}%`);
      }
      if (options.hasEmbedding !== undefined) {
        query += options.hasEmbedding ? ' AND embedding IS NOT NULL' : ' AND embedding IS NULL';
      }
      if (options.tags && options.tags.length > 0) {
        query += ' AND semantic_tags IS NOT NULL';
        // Check if any of the provided tags exist in the semantic_tags JSON
        for (const tag of options.tags) {
          query += ' AND semantic_tags LIKE ?';
          params.push(`%"${tag}"%`);
        }
      }
      if (options.minTokenCount !== undefined) {
        query += ' AND token_count >= ?';
        params.push(options.minTokenCount);
      }
      if (options.maxTokenCount !== undefined) {
        query += ' AND token_count <= ?';
        params.push(options.maxTokenCount);
      }

      // Sorting
      const sortBy = options.sortBy || 'updated';
      const sortOrder = options.sortOrder || 'desc';
      const sortColumn =
        {
          created: 'created_at',
          updated: 'updated_at',
          accessed: 'accessed_at',
          tokenCount: 'token_count',
          accessCount: 'access_count'
        }[sortBy] || 'updated_at';

      query += ` ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;

      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];

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
          embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
          semanticTags: row.semantic_tags ? JSON.parse(row.semantic_tags) : undefined,
          contextType: row.context_type,
          tokenCount: row.token_count,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          relationships: row.relationships ? JSON.parse(row.relationships) : undefined,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
          accessedAt: row.accessed_at ? new Date(row.accessed_at) : undefined,
          accessCount: row.access_count
        };
      });
    } catch (error) {
      logger.error({ error, options }, 'Failed to query enhanced context');
      throw error;
    }
  }

  // Token Budget Methods
  async createTokenBudget(
    sessionId: string,
    maxTokens: number = 200000
  ): Promise<import('../../core/interfaces/database.interface.js').TokenBudget> {
    try {
      const handoffThreshold = Math.floor(maxTokens * 0.9); // 90% of max tokens

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO token_budgets
        (session_id, total_tokens, used_tokens, remaining_tokens, max_tokens, handoff_threshold, updated_at)
        VALUES (?, 0, 0, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run(sessionId, maxTokens, maxTokens, handoffThreshold);

      const budget: import('../../core/interfaces/database.interface.js').TokenBudget = {
        sessionId,
        totalTokens: 0,
        usedTokens: 0,
        remainingTokens: maxTokens,
        maxTokens,
        handoffThreshold,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      logger.debug({ sessionId, maxTokens, handoffThreshold }, 'Token budget created');
      return budget;
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to create token budget');
      throw error;
    }
  }

  async getTokenBudget(
    sessionId: string
  ): Promise<import('../../core/interfaces/database.interface.js').TokenBudget | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM token_budgets WHERE session_id = ?');
      const row = stmt.get(sessionId) as any;

      if (!row) {
        return null;
      }

      return {
        sessionId: row.session_id,
        totalTokens: row.total_tokens,
        usedTokens: row.used_tokens,
        remainingTokens: row.remaining_tokens,
        maxTokens: row.max_tokens,
        handoffThreshold: row.handoff_threshold,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      };
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to get token budget');
      throw error;
    }
  }

  async updateTokenUsage(sessionId: string, operation: string, tokensUsed: number, contextKey?: string): Promise<void> {
    try {
      // Update the budget
      const updateBudgetStmt = this.db.prepare(`
        UPDATE token_budgets
        SET used_tokens = used_tokens + ?,
            remaining_tokens = max_tokens - (used_tokens + ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE session_id = ?
      `);
      updateBudgetStmt.run(tokensUsed, tokensUsed, sessionId);

      // Log the usage
      const insertLogStmt = this.db.prepare(`
        INSERT INTO token_usage_log (session_id, operation, context_key, tokens_used, cumulative_tokens)
        VALUES (?, ?, ?, ?, (SELECT used_tokens FROM token_budgets WHERE session_id = ?))
      `);
      insertLogStmt.run(sessionId, operation, contextKey, tokensUsed, sessionId);

      logger.debug({ sessionId, operation, tokensUsed, contextKey }, 'Token usage updated');
    } catch (error) {
      logger.error({ error, sessionId, operation, tokensUsed }, 'Failed to update token usage');
      throw error;
    }
  }

  async getTokenUsageHistory(
    sessionId: string,
    limit: number = 50
  ): Promise<import('../../core/interfaces/database.interface.js').TokenUsageEntry[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM token_usage_log
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);
      const rows = stmt.all(sessionId, limit) as any[];

      return rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        operation: row.operation,
        contextKey: row.context_key,
        tokensUsed: row.tokens_used,
        cumulativeTokens: row.cumulative_tokens,
        timestamp: new Date(row.timestamp)
      }));
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to get token usage history');
      throw error;
    }
  }

  async checkHandoffThreshold(sessionId: string): Promise<{ needsHandoff: boolean; remainingTokens: number }> {
    try {
      const budget = await this.getTokenBudget(sessionId);
      if (!budget) {
        return { needsHandoff: false, remainingTokens: 0 };
      }

      const needsHandoff = budget.usedTokens >= budget.handoffThreshold;
      return {
        needsHandoff,
        remainingTokens: budget.remainingTokens
      };
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to check handoff threshold');
      throw error;
    }
  }

  // Context Relationship Methods
  async createRelationship(
    sourceKey: string,
    targetKey: string,
    relationshipType: string,
    strength: number = 1.0
  ): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO context_relationships
        (source_key, target_key, relationship_type, strength)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(sourceKey, targetKey, relationshipType, strength);
      logger.debug({ sourceKey, targetKey, relationshipType, strength }, 'Context relationship created');
    } catch (error) {
      logger.error({ error, sourceKey, targetKey, relationshipType }, 'Failed to create context relationship');
      throw error;
    }
  }

  async getRelationships(
    key: string
  ): Promise<import('../../core/interfaces/database.interface.js').ContextRelationship[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT target_key, relationship_type, strength, created_at
        FROM context_relationships
        WHERE source_key = ?
        ORDER BY strength DESC, created_at DESC
      `);
      const rows = stmt.all(key) as any[];

      return rows.map(row => ({
        targetKey: row.target_key,
        relationshipType: row.relationship_type,
        strength: row.strength,
        createdAt: new Date(row.created_at)
      }));
    } catch (error) {
      logger.error({ error, key }, 'Failed to get context relationships');
      throw error;
    }
  }

  async deleteRelationship(sourceKey: string, targetKey: string, relationshipType: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM context_relationships
        WHERE source_key = ? AND target_key = ? AND relationship_type = ?
      `);
      const result = stmt.run(sourceKey, targetKey, relationshipType);
      logger.debug(
        { sourceKey, targetKey, relationshipType, deleted: result.changes > 0 },
        'Context relationship deletion attempted'
      );
      return result.changes > 0;
    } catch (error) {
      logger.error({ error, sourceKey, targetKey, relationshipType }, 'Failed to delete context relationship');
      throw error;
    }
  }
}
