// Database Migration Executor - Fixed TypeScript Issues
// File: src/infrastructure/migrations/migration-executor.ts

import Database from 'better-sqlite3';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { fileURLToPath } from 'node:url'; // Added for robust path resolution

// Determine the directory of the current module.
// This is important for locating SQL files whether running from src or dist.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MigrationExecutor {
  constructor(private db: Database.Database) {}

  /**
   * Apply all pending database migrations in sequential order.
   */
  async applyAllPending(): Promise<void> {
    try {
      // Create migrations tracking table if it doesn't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Read all migration SQL files from the directory
      const migrationFiles = await this.getMigrationFiles();

      // Sort files by version number (e.g., 001_, 002_)
      migrationFiles.sort((a, b) => {
        const versionA = parseInt(a.split('_')[0] || '0', 10);
        const versionB = parseInt(b.split('_')[0] || '0', 10);
        return versionA - versionB;
      });

      for (const file of migrationFiles) {
        const versionName = file.replace(/\.sql$/, ''); // e.g., "001_initial_semantic_features"
        const versionNumber = parseInt(file.split('_')[0] || '0', 10);

        const existing = this.db.prepare('SELECT version FROM migrations WHERE version = ?').get(versionNumber);

        if (existing) {
          logger.info(`Migration ${versionName} (v${versionNumber}) already applied.`);
          continue; // Skip already applied migrations
        }

        logger.info(`Applying migration: ${versionName} (v${versionNumber})...`);

        const migrationSql = await fs.readFile(path.join(__dirname, file), 'utf-8');

        // Apply migration in a transaction
        const transaction = this.db.transaction(() => {
          this.db.exec(migrationSql);
          this.db
            .prepare(
              `
            INSERT INTO migrations (version, name)
            VALUES (?, ?)
          `
            )
            .run(versionNumber, versionName);
        });

        transaction();
        logger.info(`Migration ${versionName} (v${versionNumber}) applied successfully.`);
      }

      logger.info('All pending database migrations applied successfully');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        },
        'Failed to apply database migrations'
      );
      throw error; // Re-throw to ensure failure is handled upstream
    }
  }

  private async getMigrationFiles(): Promise<string[]> {
    const files = await fs.readdir(__dirname);
    return files.filter(file => file.match(/^\d{3}_.*\.sql$/)); // Only match NNN_name.sql files
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

      // Check if semantic columns exist (from 001_initial_semantic_features.sql)
      const hasEmbedding = contextColumns.some((col: any) => col.name === 'embedding');
      const hasSemanticTags = contextColumns.some((col: any) => col.name === 'semantic_tags');
      const hasContextType = contextColumns.some((col: any) => col.name === 'context_type');

      // Check if vector storage columns exist (from 002_vector_storage_and_enhanced_context.sql)
      const hasEmbeddingVector = contextColumns.some((col: any) => col.name === 'embedding_vector');
      const hasRelevanceScore = contextColumns.some((col: any) => col.name === 'relevance_score');

      return {
        contextColumns: contextColumns.length,
        appliedMigrations: migrations.length,
        semanticSupport: {
          hasEmbedding,
          hasSemanticTags,
          hasContextType,
          hasVectorStorage: hasEmbeddingVector && hasRelevanceScore,
          isComplete: hasEmbedding && hasSemanticTags && hasContextType && hasEmbeddingVector && hasRelevanceScore // Assuming all are needed for "complete"
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
