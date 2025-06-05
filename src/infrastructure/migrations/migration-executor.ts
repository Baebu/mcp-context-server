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
      // Adjust path to correctly locate SQL file from either src or dist
      let migrationPath = path.join(__dirname, '002_add_semantic_columns.sql');

      // If running from dist, __dirname will be .../dist/infrastructure/migrations
      // We need to go up three levels to project root, then to src/infrastructure/migrations
      if (!existsSync(migrationPath) && __dirname.includes(path.sep + 'dist' + path.sep)) {
        migrationPath = path.resolve(
          __dirname,
          '..',
          '..',
          '..',
          'src',
          'infrastructure',
          'migrations',
          '002_add_semantic_columns.sql'
        );
        logger.debug({ newPath: migrationPath }, 'Adjusted migration path for dist environment');
      } else if (!existsSync(migrationPath)) {
        // Fallback for other scenarios or if the above doesn't work, try relative to a known root if possible
        // This part might need adjustment based on actual deployment structure if the above isn't robust enough
        logger.warn({ migrationPath }, 'Migration SQL file not found at primary path, attempting fallback.');
      }

      logger.info({ migrationPathAttempted: migrationPath }, 'Attempting to read migration file for semantic schema.');
      if (!existsSync(migrationPath)) {
        throw new Error(`Migration SQL file not found: 002_add_semantic_columns.sql. Attempted path: ${migrationPath}`);
      }

      const migrationSql = await fs.readFile(migrationPath, 'utf-8');
      logger.debug('Successfully read migration SQL file.');

      // Apply migration in transaction
      const transaction = this.db.transaction(() => {
        // Execute migration SQL
        logger.info('Executing semantic migration SQL...');
        this.db.exec(migrationSql);
        logger.info('Semantic migration SQL executed.');

        // Record migration as applied
        this.db
          .prepare(
            `
          INSERT INTO migrations (version, name)
          VALUES (?, ?)
        `
          )
          .run(2, 'add_semantic_columns');
        logger.info('Migration recorded in migrations table.');
      });

      transaction();

      logger.info('Semantic database migration applied successfully');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        },
        'Failed to apply semantic migration'
      );
      throw error; // Re-throw to ensure failure is handled upstream
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

// Helper to check file existence, as fs.existsSync is synchronous
// and we are in an async function context for readFile.
// For the path resolution logic, sync check is okay.
import { existsSync } from 'node:fs';
