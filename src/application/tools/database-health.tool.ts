// Database Health Diagnostics Tool
// File: src/application/tools/database-health.tool.ts

import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';

const databaseHealthSchema = z.object({
  action: z
    .enum(['check-integrity', 'list-backups', 'create-backup', 'restore-backup', 'get-stats', 'cleanup-old-backups'])
    .describe('Database health action to perform'),
  backupPath: z.string().optional().describe('Path for backup operations'),
  keepCount: z.number().optional().default(10).describe('Number of backups to keep during cleanup')
});

interface DatabaseStats {
  contextItems: number;
  smartPaths: number;
  workspaces: number;
  workspaceFiles: number;
  databaseSize: string;
  lastBackup?: string;
  lastIntegrityCheck?: {
    isHealthy: boolean;
    checkedAt: string;
    issues: string[];
  };
}

interface ExtendedDatabaseHandler extends IDatabaseHandler {
  performIntegrityCheck?: () => Promise<{
    isHealthy: boolean;
    issues: string[];
    checkedAt: Date;
  }>;
  getLastIntegrityCheck?: () => {
    isHealthy: boolean;
    issues: string[];
    checkedAt: Date;
  } | null;
  listBackups?: () => Promise<
    Array<{
      path: string;
      timestamp: Date;
      size: number;
    }>
  >;
  restoreFromBackup?: (backupPath: string) => Promise<void>;
}

@injectable()
export class DatabaseHealthTool implements IMCPTool {
  name = 'database_health';
  description = 'Monitor database health, manage backups, and perform integrity checks';
  schema = databaseHealthSchema;

  // Helper method to safely get count from query results
  private safeGetCount(results: unknown[]): number {
    if (!results || !Array.isArray(results) || results.length === 0) {
      return 0;
    }
    const first = results[0];
    if (typeof first === 'object' && first !== null && 'count' in first) {
      const count = (first as { count: unknown }).count;
      return typeof count === 'number' ? count : 0;
    }
    return 0;
  }

  async execute(params: z.infer<typeof databaseHealthSchema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get('DatabaseHandler') as ExtendedDatabaseHandler;

    try {
      switch (params.action) {
        case 'check-integrity':
          return await this.checkIntegrity(db, context);

        case 'list-backups':
          return await this.listBackups(db, context);

        case 'create-backup':
          return await this.createBackup(db, params.backupPath, context);

        case 'restore-backup':
          if (!params.backupPath) {
            throw new Error('backupPath is required for restore-backup action');
          }
          return await this.restoreBackup(db, params.backupPath, context);

        case 'get-stats':
          return await this.getDatabaseStats(db, context);

        case 'cleanup-old-backups':
          return await this.cleanupOldBackups(db, params.keepCount || 10, context);

        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      context.logger.error({ error, params }, 'Database health operation failed');
      throw error;
    }
  }

  private async checkIntegrity(db: ExtendedDatabaseHandler, context: ToolContext): Promise<ToolResult> {
    if (!db.performIntegrityCheck) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'Integrity check not supported by current database adapter',
                suggestion: 'Upgrade to enhanced database adapter for full health monitoring'
              },
              null,
              2
            )
          }
        ]
      };
    }

    const result = await db.performIntegrityCheck();

    const response = {
      action: 'integrity-check',
      timestamp: new Date().toISOString(),
      result: {
        isHealthy: result.isHealthy,
        issues: result.issues,
        checkedAt: result.checkedAt.toISOString()
      },
      recommendations: this.generateHealthRecommendations(result)
    };

    context.logger.info(
      {
        isHealthy: result.isHealthy,
        issueCount: result.issues.length
      },
      'Database integrity check completed'
    );

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  private async listBackups(db: ExtendedDatabaseHandler, context: ToolContext): Promise<ToolResult> {
    if (!db.listBackups) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'Backup management not supported by current database adapter',
                backups: []
              },
              null,
              2
            )
          }
        ]
      };
    }

    const backups = await db.listBackups();

    const response = {
      action: 'list-backups',
      timestamp: new Date().toISOString(),
      backups: backups.map(backup => ({
        path: backup.path,
        timestamp: backup.timestamp.toISOString(),
        sizeBytes: backup.size,
        sizeHuman: this.formatBytes(backup.size),
        age: this.formatAge(backup.timestamp)
      })),
      totalBackups: backups.length,
      recommendations:
        backups.length === 0
          ? [
              'No backups found. Consider creating a backup for data safety.',
              'Enable automated backups in server configuration (database.backupInterval).'
            ]
          : backups.length > 20
            ? [
                'Many backup files detected. Consider cleanup to save disk space.',
                'Use cleanup-old-backups action to remove older backups.'
              ]
            : []
    };

    context.logger.info({ backupCount: backups.length }, 'Listed database backups');

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  private async createBackup(
    db: ExtendedDatabaseHandler,
    backupPath: string | undefined,
    context: ToolContext
  ): Promise<ToolResult> {
    // Generate backup path if not provided
    if (!backupPath) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = `./data/backups/manual-backup-${timestamp}.db`;
    }

    await db.backup(backupPath);

    // Get backup file size
    const fs = await import('node:fs/promises');
    const stats = await fs.stat(backupPath);

    const response = {
      action: 'create-backup',
      timestamp: new Date().toISOString(),
      backup: {
        path: backupPath,
        sizeBytes: stats.size,
        sizeHuman: this.formatBytes(stats.size),
        createdAt: new Date().toISOString()
      },
      success: true,
      message: 'Database backup created successfully'
    };

    context.logger.info({ backupPath, sizeBytes: stats.size }, 'Manual database backup created');

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  private async restoreBackup(
    db: ExtendedDatabaseHandler,
    backupPath: string,
    context: ToolContext
  ): Promise<ToolResult> {
    if (!db.restoreFromBackup) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'Backup restoration not supported by current database adapter',
                action: 'restore-backup'
              },
              null,
              2
            )
          }
        ]
      };
    }

    // WARNING: This is a destructive operation
    context.logger.warn({ backupPath }, 'DESTRUCTIVE: Database restore operation initiated');

    await db.restoreFromBackup(backupPath);

    const response = {
      action: 'restore-backup',
      timestamp: new Date().toISOString(),
      restoredFrom: backupPath,
      success: true,
      message: 'Database restored successfully. Server may need restart for full effect.',
      warnings: [
        'All data since the backup was created has been lost',
        'Consider restarting the MCP server to ensure clean state',
        'Verify data integrity after restoration'
      ]
    };

    context.logger.warn({ backupPath }, 'Database restored from backup - data loss occurred');

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  private async getDatabaseStats(db: ExtendedDatabaseHandler, context: ToolContext): Promise<ToolResult> {
    // Get table counts
    const stats: DatabaseStats = {
      contextItems: 0,
      smartPaths: 0,
      workspaces: 0,
      workspaceFiles: 0,
      databaseSize: 'Unknown'
    };

    try {
      // Get context items count
      const contextResult = await db.executeQuery('SELECT COUNT(*) as count FROM context_items', []);
      stats.contextItems = this.safeGetCount(contextResult);

      // Get smart paths count
      const smartPathsResult = await db.executeQuery('SELECT COUNT(*) as count FROM smart_paths', []);
      stats.smartPaths = this.safeGetCount(smartPathsResult);

      // Get workspaces count
      const workspacesResult = await db.executeQuery('SELECT COUNT(*) as count FROM workspaces', []);
      stats.workspaces = this.safeGetCount(workspacesResult);

      // Get workspace files count
      const workspaceFilesResult = await db.executeQuery('SELECT COUNT(*) as count FROM workspace_files', []);
      stats.workspaceFiles = this.safeGetCount(workspaceFilesResult);

      // Get database file size
      const dbPath = context.config.database.path;
      const fs = await import('node:fs/promises');
      try {
        const dbStats = await fs.stat(dbPath);
        stats.databaseSize = this.formatBytes(dbStats.size);
      } catch {
        stats.databaseSize = 'Unable to determine';
      }

      // Get last integrity check
      if (db.getLastIntegrityCheck) {
        const lastCheck = db.getLastIntegrityCheck();
        if (lastCheck) {
          stats.lastIntegrityCheck = {
            isHealthy: lastCheck.isHealthy,
            checkedAt: lastCheck.checkedAt.toISOString(),
            issues: lastCheck.issues
          };
        }
      }

      // Get last backup info
      if (db.listBackups) {
        const backups = await db.listBackups();
        if (backups && backups.length > 0) {
          stats.lastBackup = backups[0]?.timestamp.toISOString();
        }
      }
    } catch (error) {
      context.logger.warn({ error }, 'Some database statistics could not be retrieved');
    }

    const response = {
      action: 'get-stats',
      timestamp: new Date().toISOString(),
      statistics: stats,
      health: {
        hasRecentBackup: stats.lastBackup
          ? Date.now() - new Date(stats.lastBackup).getTime() < 7 * 24 * 60 * 60 * 1000
          : false,
        hasRecentIntegrityCheck: stats.lastIntegrityCheck
          ? Date.now() - new Date(stats.lastIntegrityCheck.checkedAt).getTime() < 24 * 60 * 60 * 1000
          : false,
        isHealthy: stats.lastIntegrityCheck?.isHealthy ?? null
      },
      recommendations: this.generateStatsRecommendations(stats)
    };

    context.logger.info({ stats }, 'Database statistics retrieved');

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  private async cleanupOldBackups(
    db: ExtendedDatabaseHandler,
    keepCount: number,
    context: ToolContext
  ): Promise<ToolResult> {
    if (!db.listBackups) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'Backup management not supported by current database adapter'
              },
              null,
              2
            )
          }
        ]
      };
    }

    const backups = await db.listBackups();

    if (backups.length <= keepCount) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                action: 'cleanup-old-backups',
                message: `No cleanup needed. Current backup count (${backups.length}) is within limit (${keepCount})`,
                backupCount: backups.length,
                keepCount
              },
              null,
              2
            )
          }
        ]
      };
    }

    // Sort by timestamp (newest first) and identify files to delete
    const sortedBackups = backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const toDelete = sortedBackups.slice(keepCount);

    const fs = await import('node:fs/promises');
    const deleted = [];

    for (const backup of toDelete) {
      try {
        await fs.unlink(backup.path);
        deleted.push({
          path: backup.path,
          timestamp: backup.timestamp.toISOString(),
          size: backup.size
        });
      } catch (error) {
        context.logger.warn({ error, backupPath: backup.path }, 'Failed to delete backup file');
      }
    }

    const response = {
      action: 'cleanup-old-backups',
      timestamp: new Date().toISOString(),
      summary: {
        totalBackups: backups.length,
        keptBackups: backups.length - deleted.length,
        deletedBackups: deleted.length,
        keepCount
      },
      deletedFiles: deleted,
      success: true,
      message: `Cleaned up ${deleted.length} old backup files, keeping ${keepCount} most recent`
    };

    context.logger.info(
      {
        deletedCount: deleted.length,
        keptCount: keepCount
      },
      'Cleaned up old database backups'
    );

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  private generateHealthRecommendations(result: { isHealthy: boolean; issues: string[] }): string[] {
    const recommendations = [];

    if (!result.isHealthy) {
      recommendations.push('🚨 Database integrity issues detected - immediate attention required');
      recommendations.push('💾 Create a backup before attempting any repairs');
      recommendations.push('🔄 Consider running VACUUM command to rebuild database');

      if (result.issues.some(issue => issue.includes('foreign key'))) {
        recommendations.push('🔗 Foreign key violations detected - check data consistency');
      }

      if (result.issues.some(issue => issue.includes('orphaned'))) {
        recommendations.push('🧹 Orphaned records detected - consider cleanup operations');
      }
    } else {
      recommendations.push('✅ Database integrity is healthy');
      recommendations.push('📋 Schedule regular integrity checks for ongoing monitoring');
    }

    return recommendations;
  }

  private generateStatsRecommendations(stats: DatabaseStats): string[] {
    const recommendations = [];

    if (stats.contextItems > 10000) {
      recommendations.push('📊 Large number of context items - consider archiving old data');
    }

    if (stats.smartPaths > 100) {
      recommendations.push('🛣️ Many smart paths defined - review for duplicates or unused paths');
    }

    if (!stats.lastBackup) {
      recommendations.push('💾 No recent backups found - create backup for data safety');
    }

    if (!stats.lastIntegrityCheck) {
      recommendations.push('🔍 No integrity check history - run integrity check');
    } else if (!stats.lastIntegrityCheck.isHealthy) {
      recommendations.push('⚠️ Last integrity check found issues - investigate and resolve');
    }

    return recommendations;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private formatAge(timestamp: Date): string {
    const now = new Date();
    const ageMs = now.getTime() - timestamp.getTime();
    const ageMinutes = Math.floor(ageMs / (1000 * 60));
    const ageHours = Math.floor(ageMinutes / 60);
    const ageDays = Math.floor(ageHours / 24);

    if (ageDays > 0) {
      return `${ageDays} day${ageDays !== 1 ? 's' : ''} ago`;
    } else if (ageHours > 0) {
      return `${ageHours} hour${ageHours !== 1 ? 's' : ''} ago`;
    } else {
      return `${ageMinutes} minute${ageMinutes !== 1 ? 's' : ''} ago`;
    }
  }
}
