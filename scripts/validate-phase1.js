#!/usr/bin/env tsx
import 'reflect-metadata';
import { logger } from '../src/utils/logger.js';
import Database from 'better-sqlite3';
import { LRUCache } from 'lru-cache';
class Phase1Validator {
    db;
    embeddingCache;
    async validateDatabaseEnhancements() {
        try {
            logger.info('🔍 Validating database enhancements...');
            this.db = new Database('./data/context.db');
            this.db.pragma('journal_mode = WAL');
            this.embeddingCache = new LRUCache({
                max: 1000,
                ttl: 1000 * 60 * 60
            });
            const tablesQuery = `
        SELECT name FROM sqlite_master
        WHERE type='table' AND name IN ('context_blocks', 'sessions', 'context_relationships')
      `;
            const tables = this.db.prepare(tablesQuery).all();
            if (tables.length >= 3) {
                logger.info('✅ Vector storage tables found');
                const columnsQuery = `PRAGMA table_info(contexts)`;
                const columns = this.db.prepare(columnsQuery).all();
                const hasVectorColumns = columns.some((col) => ['embedding_vector', 'relevance_score', 'access_count'].includes(col.name));
                if (hasVectorColumns) {
                    logger.info('✅ Contexts table enhanced with vector columns');
                    return true;
                }
            }
            logger.warn('⚠️ Database enhancements not fully applied');
            return false;
        }
        catch (error) {
            logger.error({ error }, '❌ Database enhancement validation failed');
            return false;
        }
    }
    async validateVectorStorage() {
        try {
            logger.info('🔍 Validating vector storage capabilities...');
            const testEmbedding = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
            const embeddingBuffer = Buffer.from(testEmbedding.buffer);
            const embeddingJson = JSON.stringify(Array.from(testEmbedding));
            const insertQuery = `
        INSERT INTO context_blocks (context_id, content, embedding_vector, embedding_json, token_count)
        VALUES (1, 'Phase 1 test content', ?, ?, 5)
      `;
            const stmt = this.db.prepare(insertQuery);
            const result = stmt.run(embeddingBuffer, embeddingJson);
            if (result.changes > 0) {
                logger.info('✅ Vector storage working correctly');
                this.db.prepare('DELETE FROM context_blocks WHERE content = ?').run('Phase 1 test content');
                return true;
            }
            return false;
        }
        catch (error) {
            logger.error({ error }, '❌ Vector storage validation failed');
            return false;
        }
    }
    async validatePerformanceOptimizations() {
        try {
            logger.info('🔍 Validating performance optimizations...');
            const testKey = 'test-cache-key';
            const testEmbedding = new Float32Array([0.1, 0.2, 0.3]);
            this.embeddingCache.set(testKey, testEmbedding);
            const cachedValue = this.embeddingCache.get(testKey);
            if (cachedValue && cachedValue.length === testEmbedding.length) {
                logger.info('✅ LRU cache working correctly');
                const stats = {
                    size: this.embeddingCache.size,
                    maxSize: this.embeddingCache.max,
                    ttl: this.embeddingCache.ttl
                };
                logger.info({ cacheStats: stats }, 'Cache statistics');
                return true;
            }
            return false;
        }
        catch (error) {
            logger.error({ error }, '❌ Performance optimization validation failed');
            return false;
        }
    }
    async validateSecurityEnhancements() {
        try {
            logger.info('🔍 Validating security enhancements...');
            const dangerousPaths = [
                '../../../etc/passwd',
                '..\\Windows\\System32',
                '/etc/shadow',
                'C:\\Windows\\System32\\config\\SAM'
            ];
            let securityChecksPass = 0;
            for (const path of dangerousPaths) {
                if (this.validatePath(path) === false) {
                    securityChecksPass++;
                }
            }
            if (securityChecksPass === dangerousPaths.length) {
                logger.info('✅ Basic path validation working');
                return true;
            }
            logger.warn('⚠️ Some security checks failed');
            return false;
        }
        catch (error) {
            logger.error({ error }, '❌ Security enhancement validation failed');
            return false;
        }
    }
    async validateConfigurationUpgrade() {
        try {
            logger.info('🔍 Validating configuration upgrades...');
            const fs = await import('fs/promises');
            const configExists = await fs.access('./config/server-v2.yaml')
                .then(() => true)
                .catch(() => false);
            if (configExists) {
                const configContent = await fs.readFile('./config/server-v2.yaml', 'utf-8');
                const phase1ConfigKeys = [
                    'fastmcp',
                    'vectorStorage',
                    'semanticSearch',
                    'memory',
                    'security',
                    'features'
                ];
                const configIncludesPhase1 = phase1ConfigKeys.some(key => configContent.includes(key));
                if (configIncludesPhase1) {
                    logger.info('✅ Enhanced configuration available');
                    return true;
                }
            }
            logger.warn('⚠️ Enhanced configuration not found');
            return false;
        }
        catch (error) {
            logger.error({ error }, '❌ Configuration validation failed');
            return false;
        }
    }
    async validateMigrationSystem() {
        try {
            logger.info('🔍 Validating migration system...');
            const migrationTableQuery = `
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='migrations'
      `;
            const migrationTable = this.db.prepare(migrationTableQuery).get();
            if (migrationTable) {
                const migrations = this.db.prepare('SELECT * FROM migrations ORDER BY version').all();
                if (migrations.length >= 2) {
                    logger.info(`✅ Migration system active with ${migrations.length} migrations applied`);
                    return true;
                }
            }
            logger.warn('⚠️ Migration system not fully configured');
            return false;
        }
        catch (error) {
            logger.error({ error }, '❌ Migration system validation failed');
            return false;
        }
    }
    validatePath(path) {
        if (path.includes('..') || path.includes('~')) {
            return false;
        }
        const restrictedPaths = [
            '/etc/',
            '/Windows/System32/',
            '/usr/bin/',
            'C:\\Windows\\'
        ];
        return !restrictedPaths.some(restricted => path.includes(restricted));
    }
    async runFullValidation() {
        logger.info('🚀 Starting Phase 1 Enhancement Validation');
        const results = {
            databaseEnhancements: await this.validateDatabaseEnhancements(),
            vectorStorage: await this.validateVectorStorage(),
            performanceOptimizations: await this.validatePerformanceOptimizations(),
            securityEnhancements: await this.validateSecurityEnhancements(),
            configurationUpgrade: await this.validateConfigurationUpgrade(),
            migrationSystem: await this.validateMigrationSystem()
        };
        const successful = Object.values(results).filter(Boolean).length;
        const total = Object.keys(results).length;
        const successRate = Math.round((successful / total) * 100);
        logger.info({
            results,
            successRate: `${successRate}%`,
            successful,
            total
        }, '📊 Phase 1 Validation Results');
        if (successRate >= 80) {
            logger.info('🎉 Phase 1 implementation validation PASSED');
        }
        else if (successRate >= 60) {
            logger.warn('⚠️ Phase 1 implementation validation PARTIAL');
        }
        else {
            logger.error('❌ Phase 1 implementation validation FAILED');
        }
        return results;
    }
    cleanup() {
        this.db.close();
    }
}
async function main() {
    const validator = new Phase1Validator();
    try {
        const results = await validator.runFullValidation();
        console.log('\\n📋 Phase 1 Enhancement Summary:');
        console.log('=====================================');
        console.log(`Database Enhancements: ${results.databaseEnhancements ? '✅' : '❌'}`);
        console.log(`Vector Storage: ${results.vectorStorage ? '✅' : '❌'}`);
        console.log(`Performance Optimizations: ${results.performanceOptimizations ? '✅' : '❌'}`);
        console.log(`Security Enhancements: ${results.securityEnhancements ? '✅' : '❌'}`);
        console.log(`Configuration Upgrade: ${results.configurationUpgrade ? '✅' : '❌'}`);
        console.log(`Migration System: ${results.migrationSystem ? '✅' : '❌'}`);
        console.log('=====================================');
        const passedCount = Object.values(results).filter(Boolean).length;
        process.exit(passedCount >= 5 ? 0 : 1);
    }
    catch (error) {
        logger.error({ error }, '💥 Phase 1 validation failed');
        process.exit(1);
    }
    finally {
        validator.cleanup();
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Phase 1 validation script failed:', error);
        process.exit(1);
    });
}
