import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
class MigrationRunner {
    db;
    migrationsDir;
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.migrationsDir = join(__dirname, '..', 'migrations');
        this.initializeMigrationsTable();
    }
    initializeMigrationsTable() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        description TEXT,
        executed_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    }
    loadMigrations() {
        const migrations = [];
        try {
            const migrationFile = join(this.migrationsDir, '001_add_semantic_columns.sql');
            const sql = readFileSync(migrationFile, 'utf-8');
            migrations.push({
                id: '001',
                filename: '001_add_semantic_columns.sql',
                description: 'Add semantic search capabilities to context_items table',
                sql
            });
            return migrations;
        }
        catch (error) {
            console.error('Error loading migrations:', error);
            return [];
        }
    }
    getExecutedMigrations() {
        const rows = this.db.prepare('SELECT id FROM migrations').all();
        return new Set(rows.map(row => row.id));
    }
    executeMigration(migration) {
        const transaction = this.db.transaction(() => {
            try {
                this.db.exec(migration.sql);
                this.db.prepare(`
          INSERT INTO migrations (id, filename, description, executed_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `).run(migration.id, migration.filename, migration.description);
                console.log(`✅ Migration ${migration.id} executed: ${migration.description}`);
                return true;
            }
            catch (error) {
                console.error(`❌ Migration ${migration.id} failed:`, error);
                throw error;
            }
        });
        try {
            transaction();
            return true;
        }
        catch (error) {
            return false;
        }
    }
    async run() {
        const migrations = this.loadMigrations();
        const executedMigrations = this.getExecutedMigrations();
        let executed = 0;
        let failed = 0;
        let skipped = 0;
        console.log(`\n🚀 Starting database migrations...`);
        console.log(`Found ${migrations.length} migration(s)`);
        for (const migration of migrations) {
            if (executedMigrations.has(migration.id)) {
                console.log(`⏭️  Skipping migration ${migration.id} (already executed)`);
                skipped++;
                continue;
            }
            console.log(`\n🔄 Executing migration ${migration.id}: ${migration.description}`);
            if (this.executeMigration(migration)) {
                executed++;
            }
            else {
                failed++;
            }
        }
        console.log(`\n📊 Migration summary:`);
        console.log(`  - Executed: ${executed}`);
        console.log(`  - Skipped: ${skipped}`);
        console.log(`  - Failed: ${failed}`);
        return { executed, failed, skipped };
    }
    close() {
        this.db.close();
    }
}
async function main() {
    const dbPath = process.env.DB_PATH || join(__dirname, '..', 'data', 'context.db');
    console.log(`Using database: ${dbPath}`);
    const runner = new MigrationRunner(dbPath);
    try {
        const result = await runner.run();
        if (result.failed > 0) {
            console.error(`\n❌ ${result.failed} migration(s) failed!`);
            process.exit(1);
        }
        else {
            console.log(`\n✅ All migrations completed successfully!`);
            process.exit(0);
        }
    }
    catch (error) {
        console.error('\n💥 Migration process failed:', error);
        process.exit(1);
    }
    finally {
        runner.close();
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
export { MigrationRunner };
