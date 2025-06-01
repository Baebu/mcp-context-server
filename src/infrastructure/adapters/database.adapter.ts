// Enhanced Database Adapter with Integrity Checks and Automated Backups
// File: src/infrastructure/adapters/database.adapter.ts

import { injectable, inject } from 'inversify';
import Database from 'better-sqlite3';
import { promises as fs, mkdirSync as fsMkdirSync } from 'node:fs'; // Added fsMkdirSync
import path from 'node:path';
import type { IDatabaseHandler, ContextItem, QueryOptions } from '@core/interfaces/database.interface.js';
import { logger } from '../../utils/logger.js';
import type { ServerConfig } from '@infrastructure/config/types.js';

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

      CREATE TABLE IF NOT EXISTS db_health_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_type TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT,
        checked_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
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
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO context_items (key, value, type, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `);
      const serializedValue = JSON.stringify(value);
      if (serializedValue.length > 1048576) {
        throw new Error('Context value too large (max 1MB)');
      }
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
}
