// Quick fix to apply semantic database migration
// Save as: scripts/apply-migration.mjs

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  const dbPath = join(__dirname, '..', 'data', 'context.db');
  const migrationPath = join(__dirname, '..', 'migrations', '001_add_semantic_columns.sql');

  console.log('🚀 Applying semantic search migration...');
  console.log(`Database: ${dbPath}`);
  console.log(`Migration: ${migrationPath}`);

  try {
    // Read migration SQL
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Open database
    const db = new Database(dbPath);

    // Apply migration in transaction
    const transaction = db.transaction(() => {
      db.exec(migrationSQL);

      // Record migration
      db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id TEXT PRIMARY KEY,
          filename TEXT NOT NULL,
          description TEXT,
          executed_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      db.prepare(
        `
        INSERT OR REPLACE INTO migrations (id, filename, description)
        VALUES ('001', '001_add_semantic_columns.sql', 'Add semantic search capabilities')
      `
      ).run();
    });

    transaction();
    db.close();

    console.log('✅ Semantic search migration applied successfully!');
    console.log('🔍 You can now use semantic search tools');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
