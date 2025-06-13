// System Health Consolidated Tool
// File: src/application/tools/system-health.tool.ts

import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import type { IWorkspaceManager } from '@core/interfaces/workspace.interface.js';
import { SemanticDatabaseExtension } from '../../infrastructure/adapters/semantic-database.extension.js';

const getSystemHealthSchema = z.object({
  category: z.enum(['server', 'database', 'filesystem', 'security', 'workspace', 'semantic', 'all']).default('all').describe('Specific health category to check'),
  includeRecommendations: z.boolean().default(true).describe('Include health recommendations'),
  detailed: z.boolean().default(false).describe('Include detailed statistics and diagnostics')
});

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
}



@injectable()
export class GetSystemHealthTool implements IMCPTool<z.infer<typeof getSystemHealthSchema>> {
  name = 'get_system_health';
  description = 'Get comprehensive system health metrics and diagnostics';
  schema = getSystemHealthSchema;

  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;

  constructor() {
    // Initialize counters
  }

  async execute(
    params: z.infer<typeof getSystemHealthSchema>,
    context: ToolContext
  ): Promise<ToolResult> {
    this.requestCount++;
    const lastRequestTime = Date.now();

    try {
      const healthData: any = {
        timestamp: new Date().toISOString(),
        category: params.category,
        overview: {
          systemStatus: 'operational',
          uptime: Date.now() - this.startTime,
          uptimeFormatted: this.formatUptime(Date.now() - this.startTime)
        }
      };

      // Collect health data based on category
      if (params.category === 'all' || params.category === 'server') {
        healthData.server = await this.getServerHealth(lastRequestTime, context);
      }

      if (params.category === 'all' || params.category === 'database') {
        healthData.database = await this.getDatabaseHealth(context, params.detailed);
      }

      if (params.category === 'all' || params.category === 'filesystem') {
        healthData.filesystem = await this.getFilesystemHealth(context);
      }

      if (params.category === 'all' || params.category === 'security') {
        healthData.security = await this.getSecurityHealth(context);
      }

      if (params.category === 'all' || params.category === 'workspace') {
        healthData.workspace = await this.getWorkspaceHealth(context, params.detailed);
      }

      if (params.category === 'all' || params.category === 'semantic') {
        healthData.semantic = await this.getSemanticHealth(context);
      }

      // Generate recommendations
      if (params.includeRecommendations) {
        healthData.recommendations = this.generateHealthRecommendations(healthData);
      }

      // Determine overall health status
      healthData.overview.systemStatus = this.determineOverallHealth(healthData);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(healthData, null, 2)
          }
        ]
      };
    } catch (error) {
      this.errorCount++;
      context.logger.error({ error, params }, 'System health check failed');
      throw error;
    }
  }

  private async getServerHealth(lastRequestTime: number, _context: ToolContext) {
    return {
      uptime: Date.now() - this.startTime,
      uptimeFormatted: this.formatUptime(Date.now() - this.startTime),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      lastRequestTime: new Date(lastRequestTime).toISOString(),
      memoryUsage: {
        ...process.memoryUsage(),
        rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      cpuUsage: process.cpuUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch
    };
  }

  private async getDatabaseHealth(context: ToolContext, detailed: boolean = false) {
    const db = context.container.get('DatabaseHandler') as ExtendedDatabaseHandler;
    const health: any = {
      connectionStatus: 'connected',
      tableStats: {}
    };

    try {
      // Get basic table counts
      const tables = ['context_items', 'smart_paths', 'workspaces', 'workspace_files'];
      for (const table of tables) {
        try {
          const result = await db.executeQuery(`SELECT COUNT(*) as count FROM ${table}`, []);
          health.tableStats[table] = this.safeGetCount(result);
        } catch (error) {
          health.tableStats[table] = 'error';
        }
      }

      // Get database file size
      try {
        const dbPath = context.config.database.path;
        const fs = await import('node:fs/promises');
        const dbStats = await fs.stat(dbPath);
        health.databaseSize = {
          bytes: dbStats.size,
          human: this.formatBytes(dbStats.size)
        };
      } catch {
        health.databaseSize = 'Unable to determine';
      }

      // Check integrity if available
      if (db.performIntegrityCheck && detailed) {
        try {
          const integrityResult = await db.performIntegrityCheck();
          health.integrityCheck = {
            isHealthy: integrityResult.isHealthy,
            issues: integrityResult.issues,
            checkedAt: integrityResult.checkedAt.toISOString()
          };
        } catch (error) {
          health.integrityCheck = 'unavailable';
        }
      } else if (db.getLastIntegrityCheck) {
        const lastCheck = db.getLastIntegrityCheck();
        if (lastCheck) {
          health.lastIntegrityCheck = {
            isHealthy: lastCheck.isHealthy,
            checkedAt: lastCheck.checkedAt.toISOString(),
            issueCount: lastCheck.issues.length
          };
        }
      }

      // Get backup information
      if (db.listBackups) {
        try {
          const backups = await db.listBackups();
          health.backups = {
            count: backups.length,
            lastBackup: backups.length > 0 ? backups[0]?.timestamp.toISOString() : null,
            totalSize: backups.reduce((sum, backup) => sum + backup.size, 0)
          };
        } catch {
          health.backups = 'unavailable';
        }
      }

    } catch (error) {
      health.connectionStatus = 'error';
      health.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return health;
  }

  private async getFilesystemHealth(_context: ToolContext) {
    // Basic filesystem health metrics
    return {
      readOperations: 0, // Would need to track these in practice
      writeOperations: 0,
      totalBytesRead: 0,
      totalBytesWritten: 0,
      tempDirectory: process.env.TMPDIR || '/tmp',
      workingDirectory: process.cwd()
    };
  }

  private async getSecurityHealth(context: ToolContext) {
    return {
      validationCount: 0, // Would need to track these in practice
      blockedOperations: 0,
      safeZoneViolations: 0,
      safeZoneMode: context.config.security?.safeZoneMode || 'unknown',
      autoExpandSafezones: context.config.security?.autoExpandSafezones || false
    };
  }

  private async getWorkspaceHealth(context: ToolContext, detailed: boolean = false) {
    try {
      const workspaceManager = context.container.get<IWorkspaceManager>('WorkspaceManager');
      const workspaces = await workspaceManager.listWorkspaces();
      const activeWorkspace = workspaceManager.getActiveWorkspace();

      const health: any = {
        totalWorkspaces: workspaces.length,
        activeWorkspace: activeWorkspace ? {
          id: activeWorkspace.id,
          name: activeWorkspace.name,
          type: activeWorkspace.config.type
        } : null
      };

      if (detailed && activeWorkspace) {
        try {
          const stats = await workspaceManager.getWorkspaceStats(activeWorkspace.id);
          health.activeWorkspaceStats = {
            fileCount: stats.fileCount,
            totalSize: stats.totalSize,
            totalSizeHuman: this.formatBytes(stats.totalSize),
            lastSyncAt: (stats as any).lastSyncAt?.toISOString() || null
          };
        } catch (error) {
          health.activeWorkspaceStats = 'unavailable';
        }
      }

      return health;
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getSemanticHealth(context: ToolContext) {
    try {
      const db = context.container.get<IDatabaseHandler>('DatabaseHandler');
      const dbInstance = db.getDatabase();
      const semanticDb = new SemanticDatabaseExtension(dbInstance);

      const stats = await semanticDb.getSemanticStats();

      return {
        totalContextItems: stats.totalItems,
        itemsWithEmbeddings: stats.itemsWithEmbeddings,
        embeddingCoverage: stats.embeddingCoverage,
        embeddingCoverageStatus: stats.embeddingCoverage > 80 ? 'excellent' : 
                                stats.embeddingCoverage > 50 ? 'good' : 'needs_improvement',
        totalRelationships: stats.totalRelationships,
        status: 'operational'
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Semantic search unavailable'
      };
    }
  }

  private generateHealthRecommendations(healthData: any): string[] {
    const recommendations: string[] = [];

    // Server recommendations
    if (healthData.server) {
      if (healthData.server.errorCount > 0) {
        recommendations.push(`🚨 ${healthData.server.errorCount} server errors detected - check logs`);
      }
      
      if (healthData.server.memoryUsage.rss_mb > 1000) {
        recommendations.push('💾 High memory usage detected - consider restarting server');
      }

      if (healthData.server.uptime > 7 * 24 * 60 * 60 * 1000) {
        recommendations.push('⏰ Server has been running for over a week - consider scheduled restart');
      }
    }

    // Database recommendations
    if (healthData.database) {
      if (healthData.database.connectionStatus === 'error') {
        recommendations.push('🚨 Database connection issues detected - immediate attention required');
      }

      if (healthData.database.tableStats.context_items > 10000) {
        recommendations.push('📊 Large number of context items - consider archiving old data');
      }

      if (healthData.database.backups?.count === 0) {
        recommendations.push('💾 No database backups found - create backup for data safety');
      }

      if (healthData.database.lastIntegrityCheck && !healthData.database.lastIntegrityCheck.isHealthy) {
        recommendations.push('⚠️ Last database integrity check found issues - investigate immediately');
      }
    }

    // Workspace recommendations
    if (healthData.workspace) {
      if (healthData.workspace.totalWorkspaces === 0) {
        recommendations.push('📁 No workspaces configured - create a workspace to get started');
      }

      if (!healthData.workspace.activeWorkspace) {
        recommendations.push('📁 No active workspace - switch to a workspace for better organization');
      }
    }

    // Semantic recommendations
    if (healthData.semantic) {
      if (healthData.semantic.embeddingCoverage < 50) {
        recommendations.push('🔍 Low semantic search coverage - run update_missing_embeddings');
      }

      if (healthData.semantic.totalRelationships === 0 && healthData.semantic.totalContextItems > 10) {
        recommendations.push('🔗 No semantic relationships found - create relationships for better search');
      }
    }

    // Overall system recommendations
    if (recommendations.length === 0) {
      recommendations.push('✅ System health looks good - all components operating normally');
    }

    return recommendations;
  }

  private determineOverallHealth(healthData: any): string {
    let issueCount = 0;
    let criticalIssues = 0;

    // Check for critical issues
    if (healthData.database?.connectionStatus === 'error') criticalIssues++;
    if (healthData.server?.errorCount > 5) criticalIssues++;
    if (healthData.database?.lastIntegrityCheck && !healthData.database.lastIntegrityCheck.isHealthy) criticalIssues++;

    // Check for minor issues
    if (healthData.server?.errorCount > 0) issueCount++;
    if (healthData.database?.backups?.count === 0) issueCount++;
    if (healthData.semantic?.embeddingCoverage < 50) issueCount++;
    if (!healthData.workspace?.activeWorkspace) issueCount++;

    if (criticalIssues > 0) return 'critical';
    if (issueCount > 2) return 'degraded';
    if (issueCount > 0) return 'operational_with_warnings';
    return 'operational';
  }

  // Helper methods
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

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
