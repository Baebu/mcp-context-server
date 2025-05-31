// Enhanced Database Adapter with Integrity Checks and Automated Backups
// File: src/infrastructure/adapters/database.adapter.ts

import { injectable, inject } from 'inversify';
import Database from 'better-sqlite3';
import { promises as fs } from 'node:fs';
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
    this.initializeDatabase();
    this.schedulePeriodicBackups();
  }

  private initializeDatabase(): void {
    const dbPath = this.config.database.path || './data/context.db';

    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    try {
      require('fs').mkdirSync(dbDir, { recursive: true });
    } catch (error) {
      logger.warn({ error, dbDir }, 'Failed to create database directory');
    }

    this.db = new Database(dbPath);

    // Configure for optimal performance and reliability
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 1000000');
    this.db.pragma('temp_store = memory');
    this.db.pragma('foreign_keys = ON');

    // Enable WAL checkpoint optimization
    this.db.pragma('wal_autocheckpoint = 1000');

    this.createTables();

    // Perform initial integrity check
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

      -- NEW: Table for tracking database operations and health
      CREATE TABLE IF NOT EXISTS db_health_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_type TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT,
        checked_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // NEW: Comprehensive integrity check
  async performIntegrityCheck(): Promise<IntegrityCheckResult> {
    const result: IntegrityCheckResult = {
      isHealthy: true,
      issues: [],
      checkedAt: new Date()
    };

    try {
      // 1. SQLite built-in integrity check
      const integrityResult = this.db.pragma('integrity_check');
      if (Array.isArray(integrityResult)) {
        const issues = integrityResult.filter(
          item => typeof item === 'object' && 'integrity_check' in item && item.integrity_check !== 'ok'
        );
        if (issues.length > 0) {
          result.isHealthy = false;
          result.issues.push(...issues.map(issue => String(issue.integrity_check)));
        }
      }

      // 2. Foreign key constraint check
      const fkResult = this.db.pragma('foreign_key_check');
      if (Array.isArray(fkResult) && fkResult.length > 0) {
        result.isHealthy = false;
        result.issues.push(`Foreign key violations: ${fkResult.length}`);
      }

      // 3. Check for orphaned records
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

      // 4. Check for data consistency
      const contextItemsCount = this.db.prepare('SELECT COUNT(*) as count FROM context_items').get() as {
        count: number;
      };
      if (contextItemsCount.count < 0) {
        // This shouldn't happen, but just in case
        result.isHealthy = false;
        result.issues.push('Invalid context items count');
      }

      // Log the check
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
      result.issues.push(`Integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.error({ error }, 'Database integrity check failed');
    }

    return result;
  }

  // NEW: Get the last integrity check result
  getLastIntegrityCheck(): IntegrityCheckResult | null {
    return this.lastIntegrityCheck || null;
  }

  // NEW: Automated backup scheduling
  private schedulePeriodicBackups(): void {
    const backupInterval = this.config.database.backupInterval;

    if (!backupInterval || backupInterval <= 0) {
      logger.info('Automated database backups disabled');
      return;
    }

    const intervalMs = backupInterval * 60 * 1000; // Convert minutes to milliseconds

    this.backupTimer = setInterval(async () => {
      try {
        await this.performAutomatedBackup();
      } catch (error) {
        logger.error({ error }, 'Automated backup failed');
      }
    }, intervalMs);

    logger.info({ intervalMinutes: backupInterval }, 'Automated database backups scheduled');
  }

  // NEW: Perform automated backup
  private async performAutomatedBackup(): Promise<BackupInfo> {
    const timestamp = new Date();
    const backupDir = path.join(path.dirname(this.config.database.path), 'backups');
    const backupFilename = `context-${timestamp.toISOString().replace(/[:.]/g, '-')}.db`;
    const backupPath = path.join(backupDir, backupFilename);

    // Ensure backup directory exists
    await fs.mkdir(backupDir, { recursive: true });

    // Perform the backup
    await this.backup(backupPath);

    // Get backup file size
    const stats = await fs.stat(backupPath);

    const backupInfo: BackupInfo = {
      path: backupPath,
      timestamp,
      size: stats.size
    };

    // Clean up old backups (keep last 10)
    await this.cleanupOldBackups(backupDir);

    logger.info(
      {
        backupPath,
        sizeBytes: stats.size,
        timestamp: timestamp.toISOString()
      },
      'Automated database backup completed'
    );

    return backupInfo;
  }

  // NEW: Clean up old backup files
  private async cleanupOldBackups(backupDir: string, keepCount: number = 10): Promise<void> {
    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('context-') && file.endsWith('.db'))
        .map(file => ({
          name: file,
          path: path.join(backupDir, file)
        }));

      if (backupFiles.length <= keepCount) {
        return; // No cleanup needed
      }

      // Sort by name (which includes timestamp) and keep the most recent ones
      backupFiles.sort((a, b) => b.name.localeCompare(a.name));
      const filesToDelete = backupFiles.slice(keepCount);

      for (const file of filesToDelete) {
        await fs.unlink(file.path);
        logger.debug({ deletedBackup: file.name }, 'Cleaned up old backup file');
      }

      logger.info(
        {
          deletedCount: filesToDelete.length,
          keptCount: keepCount
        },
        'Old backup files cleaned up'
      );
    } catch (error) {
      logger.warn({ error, backupDir }, 'Failed to cleanup old backup files');
    }
  }

  // NEW: List available backups
  async listBackups(): Promise<BackupInfo[]> {
    const backupDir = path.join(path.dirname(this.config.database.path), 'backups');

    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files.filter(file => file.startsWith('context-') && file.endsWith('.db'));

      const backups: BackupInfo[] = [];

      for (const file of backupFiles) {
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);

        // Extract timestamp from filename
        const timestampStr = file.replace('context-', '').replace('.db', '').replace(/-/g, ':');
        let timestamp: Date;
        try {
          timestamp = new Date(timestampStr);
        } catch {
          timestamp = stats.mtime; // Fallback to file modification time
        }

        backups.push({
          path: filePath,
          timestamp,
          size: stats.size
        });
      }

      // Sort by timestamp (newest first)
      backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return backups;
    } catch (error) {
      logger.warn({ error, backupDir }, 'Failed to list backups');
      return [];
    }
  }

  // NEW: Restore from backup
  async restoreFromBackup(backupPath: string): Promise<void> {
    // Verify backup file exists and is valid
    await fs.access(backupPath);

    // Test the backup database integrity before restoring
    const testDb = new Database(backupPath, { readonly: true });
    try {
      const integrityResult = testDb.pragma('integrity_check');
      testDb.close();

      if (Array.isArray(integrityResult)) {
        const issues = integrityResult.filter(
          item => typeof item === 'object' && 'integrity_check' in item && item.integrity_check !== 'ok'
        );
        if (issues.length > 0) {
          throw new Error(`Backup file has integrity issues: ${issues.join(', ')}`);
        }
      }
    } catch (error) {
      testDb.close();
      throw new Error(`Backup file validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Close current database
    this.close();

    // Create backup of current database before restore
    const currentBackupPath = `${this.config.database.path}.pre-restore-${Date.now()}.bak`;
    try {
      await fs.copyFile(this.config.database.path, currentBackupPath);
      logger.info({ backupPath: currentBackupPath }, 'Created backup of current database before restore');
    } catch (error) {
      logger.warn({ error }, 'Failed to backup current database before restore');
    }

    // Restore from backup
    await fs.copyFile(backupPath, this.config.database.path);

    // Reinitialize database
    this.initializeDatabase();

    logger.info({ restoredFrom: backupPath }, 'Database restored from backup');
  }

  // Enhanced existing methods with additional error handling and logging

  async storeContext(key: string, value: unknown, type?: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO context_items (key, value, type, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `);

      const serializedValue = JSON.stringify(value);

      // Basic validation
      if (serializedValue.length > 1048576) {
        // 1MB limit
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
        const parsed = JSON.parse(row.value);
        logger.debug({ key, found: true }, 'Context item retrieved');
        return parsed;
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
    } catch (error) {
      logger.error({ error, options }, 'Failed to query context items');
      throw error;
    }
  }

  async backup(backupPath: string): Promise<void> {
    try {
      await this.db.backup(backupPath);
      logger.info({ backupPath }, 'Database backup completed');
    } catch (error) {
      logger.error({ error, backupPath }, 'Database backup failed');
      throw error;
    }
  }

  close(): void {
    // Clear backup timer
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = undefined;
    }

    if (this.db) {
      this.db.close();
      logger.info('Database connection closed');
    }
  }

  // Raw SQL methods for smart path management with enhanced error handling
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

// Database row interface
interface DatabaseRow {
  key: string;
  value: string;
  type: string;
  created_at: string;
  updated_at: string;
}
