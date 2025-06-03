#!/usr/bin/env tsx
import { promises as fs } from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { logger } from '../src/utils/logger.js';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

class MigrationManager {
  private db: Database.Database;
  private migrationsPath: string;

  constructor(dbPath: string, migrationsPath: string) {
    this.db = new Database(dbPath);
    this.migrationsPath = migrationsPath;
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    
    // Ensure migrations table exists
    this.initializeMigrationsTable();
  }

  private initializeMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getMigrations(): Promise<Migration[]> {
    const files = await fs.readdir(this.migrationsPath);
    const migrationFiles = files
      .filter(file => file.endsWith('.sql'))
      .sort();

    const migrations: Migration[] = [];

    for (const file of migrationFiles) {
      const filePath = path.join(this.migrationsPath, file);
      const sql = await fs.readFile(filePath, 'utf-8');
      
      // Extract version from filename (e.g., 001_initial.sql -> 1)
      const versionMatch = file.match(/^(\d+)_/);
      const version = versionMatch ? parseInt(versionMatch[1], 10) : 0;
      
      const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '');
      
      migrations.push({ version, name, sql });
    }

    return migrations;
  }

  getAppliedMigrations(): number[] {
    const stmt = this.db.prepare('SELECT version FROM migrations ORDER BY version');
    const rows = stmt.all() as Array<{ version: number }>;
    return rows.map(row => row.version);
  }

  async migrate(): Promise<{ applied: number; skipped: number; errors: string[] }> {
    const migrations = await this.getMigrations();
    const appliedVersions = new Set(this.getAppliedMigrations());
    
    let applied = 0;
    let skipped = 0;
    const errors: string[] = [];

    logger.info({ 
      totalMigrations: migrations.length,
      appliedMigrations: appliedVersions.size 
    }, 'Starting database migrations');

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        logger.debug({ version: migration.version, name: migration.name }, 'Skipping already applied migration');
        skipped++;
        continue;
      }

      try {
        logger.info({ version: migration.version, name: migration.name }, 'Applying migration');
        
        // Start transaction
        const transaction = this.db.transaction(() => {
          // Execute the migration SQL
          this.db.exec(migration.sql);
          
          // Record the migration as applied
          const insertStmt = this.db.prepare(`
            INSERT INTO migrations (version, name, applied_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
          `);
          insertStmt.run(migration.version, migration.name);
        });

        transaction();
        applied++;
        
        logger.info({ version: migration.version, name: migration.name }, 'Migration applied successfully');
      } catch (error) {
        const errorMsg = `Migration ${migration.version} (${migration.name}) failed: ${error}`;
        logger.error({ error, version: migration.version, name: migration.name }, 'Migration failed');
        errors.push(errorMsg);
      }
    }

    logger.info({ applied, skipped, errors: errors.length }, 'Migration process completed');
    
    return { applied, skipped, errors };
  }

  async rollback(targetVersion: number): Promise<void> {
    logger.warn({ targetVersion }, 'Rolling back migrations is not implemented');
    throw new Error('Migration rollback is not implemented. Please restore from backup.');
  }

  close(): void {
    this.db.close();
  }
}

async function main() {
  const dbPath = process.env.DB_PATH || './data/context.db';
  const migrationsPath = process.env.MIGRATIONS_PATH || './migrations';
  
  // Ensure data directory exists
  const dataDir = path.dirname(dbPath);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
    logger.info({ dataDir }, 'Created data directory');
  }

  const migrationManager = new MigrationManager(dbPath, migrationsPath);
  
  try {
    const result = await migrationManager.migrate();
    
    if (result.errors.length > 0) {
      logger.error({ errors: result.errors }, 'Some migrations failed');
      process.exit(1);
    }
    
    if (result.applied === 0 && result.skipped > 0) {
      logger.info('All migrations already applied');
    } else if (result.applied > 0) {
      logger.info({ applied: result.applied }, 'Migrations completed successfully');
    }
    
    process.exit(0);
  } catch (error) {
    logger.fatal({ error }, 'Migration process failed');
    process.exit(1);
  } finally {
    migrationManager.close();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
}

export { MigrationManager };
