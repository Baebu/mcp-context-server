// Database Migration Executor - Fixed TypeScript Issues
// File: src/infrastructure/migrations/migration-executor.ts

import Database from 'better-sqlite3';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger.js';

export class MigrationExecutor {
  constructor(private db: Database.Database) {}

  /**
   * Apply semantic database migration
   */
  async applySemantic(): Promise<void> {
    try {
      // Create migrations tracking table if it doesn't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Check if semantic migration already applied
      const existing = this.db
        .prepare('SELECT version FROM migrations WHERE version = ? AND name = ?')
        .get(2, 'add_semantic_columns');

      if (existing) {
        logger.info('Semantic migration already applied');
        return;
      }

      // Read migration SQL file
      const migrationPath = path.join(__dirname, '002_add_semantic_columns.sql');
      const migrationSql = await fs.readFile(migrationPath, 'utf-8');

      // Apply migration in transaction
      const transaction = this.db.transaction(() => {
        // Execute migration SQL
        this.db.exec(migrationSql);

        // Record migration as applied
        this.db
          .prepare(
            `
          INSERT INTO migrations (version, name)
          VALUES (?, ?)
        `
          )
          .run(2, 'add_semantic_columns');
      });

      transaction();

      logger.info('Semantic database migration applied successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to apply semantic migration');
      throw error;
    }
  }

  /**
   * Check current database schema status
   */
  getSchemaInfo(): Record<string, unknown> {
    try {
      // Get context_items table info
      const contextColumns = this.db
        .prepare(
          `
        PRAGMA table_info(context_items)
      `
        )
        .all();

      // Get applied migrations
      const migrations = this.db
        .prepare(
          `
        SELECT * FROM migrations ORDER BY version
      `
        )
        .all();

      // Check if semantic columns exist
      const hasEmbedding = contextColumns.some((col: any) => col.name === 'embedding');
      const hasSemanticTags = contextColumns.some((col: any) => col.name === 'semantic_tags');
      const hasContextType = contextColumns.some((col: any) => col.name === 'context_type');

      return {
        contextColumns: contextColumns.length,
        appliedMigrations: migrations.length,
        semanticSupport: {
          hasEmbedding,
          hasSemanticTags,
          hasContextType,
          isComplete: hasEmbedding && hasSemanticTags && hasContextType
        },
        migrations
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get schema info');
      return {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
