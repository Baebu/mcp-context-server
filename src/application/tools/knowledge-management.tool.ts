// Knowledge Management Tools for Version Control and File Integration
// File: src/application/tools/knowledge-management.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import { KnowledgeManagementService } from '../services/knowledge-management.service.js';
import type { VersionCacheOptions, FreshnessCheckOptions } from '../services/knowledge-management.service.js';

// ===== VERSION MANAGEMENT TOOLS =====

// Schema for VersionCacheManagementTool
const versionCacheManagementSchema = z.object({
  maxVersions: z.number().optional().default(10).describe('Maximum number of versions to keep per context'),
  maxAge: z.number().optional().default(168).describe('Maximum age in hours for versions'),
  compressionEnabled: z.boolean().optional().default(true).describe('Enable compression of old versions'),
  autoCleanup: z.boolean().optional().default(true).describe('Enable automatic cleanup of old versions')
});

@injectable()
export class VersionCacheManagementTool implements IMCPTool {
  name = 'version_cache_management';
  description = 'Manage version cache for knowledge items with automatic cleanup and compression';
  schema = versionCacheManagementSchema;

  constructor(@inject(KnowledgeManagementService) private knowledgeService: KnowledgeManagementService) {}

  async execute(params: z.infer<typeof versionCacheManagementSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: VersionCacheOptions = {
        maxVersions: params.maxVersions,
        maxAge: params.maxAge,
        compressionEnabled: params.compressionEnabled,
        autoCleanup: params.autoCleanup
      };

      const result = await this.knowledgeService.manageVersionCache(options);

      const response = {
        cacheManagement: {
          options,
          results: {
            cached: result.cached,
            cleaned: result.cleaned,
            compressed: result.compressed
          }
        },
        cacheSummary: result.summary,
        efficiency: {
          cacheUtilization:
            result.summary.totalVersions > 0 ? Math.round((result.cached / (result.cached + result.cleaned)) * 100) : 0,
          compressionRatio: result.compressed > 0 ? Math.round((result.compressed / result.cached) * 100) : 0,
          cleanupEfficiency: result.cleaned > 0 ? Math.round((result.cleaned / result.summary.totalVersions) * 100) : 0
        },
        recommendations: this.generateCacheRecommendations(result, options),
        nextActions: this.generateCacheActionItems(result)
      };

      context.logger.info(
        {
          cached: result.cached,
          cleaned: result.cleaned,
          compressed: result.compressed,
          totalVersions: result.summary.totalVersions
        },
        'Version cache management completed'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, options: params }, 'Failed to manage version cache');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to manage version cache: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generateCacheRecommendations(result: any, options: VersionCacheOptions): string[] {
    const recommendations = [];

    if (result.summary.totalVersions === 0) {
      recommendations.push('No versions found in cache - ensure contexts are being versioned properly');
      return recommendations;
    }

    if (result.cleaned > result.cached * 0.5) {
      recommendations.push('High cleanup ratio - consider increasing maxVersions or maxAge settings');
    }

    if (result.compressed === 0 && options.compressionEnabled) {
      recommendations.push('No versions were compressed - content may be already optimized');
    }

    if (result.summary.totalSize > 10000000) {
      // 10MB
      recommendations.push('Large cache size detected - consider more aggressive compression or cleanup');
    }

    recommendations.push(
      `Successfully managed ${result.summary.totalVersions} versions across ${result.summary.uniqueContexts} contexts`
    );

    return recommendations;
  }

  private generateCacheActionItems(result: any): string[] {
    const actionItems = [];

    if (result.summary.totalVersions > 1000) {
      actionItems.push('Monitor cache performance - large number of versions detected');
    }

    if (result.cleaned > 100) {
      actionItems.push(`${result.cleaned} versions cleaned up - review cleanup policies if needed`);
    }

    if (result.compressed > 0) {
      actionItems.push(`${result.compressed} versions compressed to save space`);
    }

    return actionItems;
  }
}

// Schema for KnowledgeFreshnessCheckTool
const knowledgeFreshnessCheckSchema = z.object({
  contextKeys: z.array(z.string()).optional().describe('Specific context keys to check (optional)'),
  contextTypes: z.array(z.string()).optional().describe('Filter by context types'),
  maxAge: z.number().optional().default(72).describe('Maximum age in hours before considering stale'),
  checkExternalSources: z.boolean().optional().default(false).describe('Check external sources for updates'),
  dependencies: z.array(z.string()).optional().describe('Specific dependencies to check')
});

@injectable()
export class KnowledgeFreshnessCheckTool implements IMCPTool {
  name = 'knowledge_freshness_check';
  description = 'Check knowledge freshness and identify stale or outdated items';
  schema = knowledgeFreshnessCheckSchema;

  constructor(@inject(KnowledgeManagementService) private knowledgeService: KnowledgeManagementService) {}

  async execute(params: z.infer<typeof knowledgeFreshnessCheckSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: FreshnessCheckOptions = {
        contextKeys: params.contextKeys,
        contextTypes: params.contextTypes,
        maxAge: params.maxAge,
        checkExternalSources: params.checkExternalSources,
        dependencies: params.dependencies
      };

      const results = await this.knowledgeService.checkKnowledgeFreshness(options);

      const response = {
        freshnessCheck: {
          options,
          totalChecked: results.length,
          summary: this.summarizeFreshnessResults(results)
        },
        results: results.map(result => ({
          contextKey: result.contextKey,
          staleness: result.staleness,
          ageHours: result.ageHours,
          isUpToDate: result.isUpToDate,
          recommendations: result.recommendations,
          dependencyIssues: result.dependencies.filter(d => !d.isUpToDate).length
        })),
        criticalItems: results.filter(r => r.staleness === 'outdated' || r.staleness === 'stale'),
        insights: this.generateFreshnessInsights(results),
        actionPlan: this.generateFreshnessActionPlan(results)
      };

      context.logger.info(
        {
          totalChecked: results.length,
          stale: response.freshnessCheck.summary.stale,
          outdated: response.freshnessCheck.summary.outdated,
          critical: response.criticalItems.length
        },
        'Knowledge freshness check completed'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, options: params }, 'Failed to check knowledge freshness');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to check knowledge freshness: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private summarizeFreshnessResults(results: any[]) {
    return {
      fresh: results.filter(r => r.staleness === 'fresh').length,
      aging: results.filter(r => r.staleness === 'aging').length,
      stale: results.filter(r => r.staleness === 'stale').length,
      outdated: results.filter(r => r.staleness === 'outdated').length,
      averageAge: Math.round(results.reduce((sum, r) => sum + r.ageHours, 0) / results.length),
      dependencyIssues: results.reduce((sum, r) => sum + r.dependencies.filter((d: any) => !d.isUpToDate).length, 0)
    };
  }

  private generateFreshnessInsights(results: any[]): string[] {
    const insights = [];

    const outdatedCount = results.filter(r => r.staleness === 'outdated').length;
    if (outdatedCount > 0) {
      insights.push(`${outdatedCount} contexts are significantly outdated and need immediate attention`);
    }

    const staleCount = results.filter(r => r.staleness === 'stale').length;
    if (staleCount > 0) {
      insights.push(`${staleCount} contexts are stale and should be reviewed`);
    }

    const avgAge = Math.round(results.reduce((sum, r) => sum + r.ageHours, 0) / results.length);
    insights.push(`Average content age: ${avgAge} hours`);

    const withDependencyIssues = results.filter(r => r.dependencies.some((d: any) => !d.isUpToDate)).length;
    if (withDependencyIssues > 0) {
      insights.push(`${withDependencyIssues} contexts have outdated dependencies`);
    }

    return insights;
  }

  private generateFreshnessActionPlan(results: any[]): string[] {
    const actionPlan = [];

    const criticalItems = results.filter(r => r.staleness === 'outdated');
    if (criticalItems.length > 0) {
      actionPlan.push(`PRIORITY: Review and update ${criticalItems.length} outdated contexts`);
    }

    const staleItems = results.filter(r => r.staleness === 'stale');
    if (staleItems.length > 0) {
      actionPlan.push(`Review ${staleItems.length} stale contexts for relevance and accuracy`);
    }

    const dependencyItems = results.filter(r => r.dependencies.some((d: any) => !d.isUpToDate));
    if (dependencyItems.length > 0) {
      actionPlan.push(`Update dependencies for ${dependencyItems.length} contexts`);
    }

    return actionPlan;
  }
}

// Schema for DependencyTrackingTool
const dependencyTrackingSchema = z.object({
  contextKey: z.string().describe('Context key to track dependencies for')
});

@injectable()
export class DependencyTrackingTool implements IMCPTool {
  name = 'dependency_tracking';
  description = 'Track dependencies between knowledge items and detect circular dependencies';
  schema = dependencyTrackingSchema;

  constructor(@inject(KnowledgeManagementService) private knowledgeService: KnowledgeManagementService) {}

  async execute(params: z.infer<typeof dependencyTrackingSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const result = await this.knowledgeService.trackDependencies(params.contextKey);

      const response = {
        contextKey: params.contextKey,
        dependencyAnalysis: {
          totalDependencies: result.dependencies.length,
          totalDependents: result.dependents.length,
          circularDependencies: result.circularDependencies.length,
          dependencyTypes: this.analyzeDependencyTypes(result.dependencies)
        },
        dependencies: result.dependencies.map(dep => ({
          key: dep.dependencyKey,
          type: dep.dependencyType,
          isUpToDate: dep.isUpToDate,
          lastChecked: dep.lastChecked,
          location: dep.location || 'N/A'
        })),
        dependents: result.dependents,
        circularDependencies: result.circularDependencies,
        graph: result.graph,
        healthScore: this.calculateDependencyHealthScore(result),
        recommendations: this.generateDependencyRecommendations(result),
        riskAssessment: this.assessDependencyRisks(result)
      };

      context.logger.info(
        {
          contextKey: params.contextKey,
          dependencies: result.dependencies.length,
          dependents: result.dependents.length,
          circular: result.circularDependencies.length
        },
        'Dependency tracking completed'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, contextKey: params.contextKey }, 'Failed to track dependencies');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to track dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private analyzeDependencyTypes(dependencies: any[]) {
    return dependencies.reduce((acc, dep) => {
      acc[dep.dependencyType] = (acc[dep.dependencyType] || 0) + 1;
      return acc;
    }, {});
  }

  private calculateDependencyHealthScore(result: any): number {
    let score = 100;

    // Reduce score for outdated dependencies
    const outdatedDependencies = result.dependencies.filter((d: any) => !d.isUpToDate).length;
    score -= outdatedDependencies * 10;

    // Reduce score for circular dependencies
    score -= result.circularDependencies.length * 20;

    // Reduce score for too many dependencies (complexity)
    if (result.dependencies.length > 10) {
      score -= (result.dependencies.length - 10) * 5;
    }

    return Math.max(0, score);
  }

  private generateDependencyRecommendations(result: any): string[] {
    const recommendations = [];

    if (result.circularDependencies.length > 0) {
      recommendations.push(`Fix ${result.circularDependencies.length} circular dependencies to prevent infinite loops`);
    }

    const outdatedDeps = result.dependencies.filter((d: any) => !d.isUpToDate);
    if (outdatedDeps.length > 0) {
      recommendations.push(`Update ${outdatedDeps.length} outdated dependencies`);
    }

    if (result.dependencies.length > 15) {
      recommendations.push('High number of dependencies - consider refactoring to reduce complexity');
    }

    if (result.dependents.length === 0) {
      recommendations.push('No dependents found - consider if this context is still needed');
    }

    return recommendations;
  }

  private assessDependencyRisks(result: any): { level: string; risks: string[] } {
    const risks = [];
    let level = 'low';

    if (result.circularDependencies.length > 0) {
      risks.push('Circular dependencies can cause infinite loops and system instability');
      level = 'high';
    }

    const criticalOutdated = result.dependencies.filter(
      (d: any) => !d.isUpToDate && d.dependencyType === 'file'
    ).length;

    if (criticalOutdated > 0) {
      risks.push(`${criticalOutdated} critical file dependencies are outdated`);
      level = level === 'high' ? 'high' : 'medium';
    }

    if (result.dependencies.length > 20) {
      risks.push('High dependency count increases maintenance burden and failure risk');
      level = level === 'high' ? 'high' : 'medium';
    }

    return { level, risks };
  }
}

// Schema for UpdateNotificationsTool
const updateNotificationsSchema = z.object({
  acknowledgeAll: z.boolean().optional().default(false).describe('Acknowledge all existing notifications'),
  filterBySeverity: z.enum(['info', 'warning', 'error']).optional().describe('Filter notifications by severity'),
  filterByType: z.string().optional().describe('Filter notifications by type')
});

@injectable()
export class UpdateNotificationsTool implements IMCPTool {
  name = 'update_notifications';
  description = 'Generate and manage update notifications for knowledge items';
  schema = updateNotificationsSchema;

  constructor(@inject(KnowledgeManagementService) private knowledgeService: KnowledgeManagementService) {}

  async execute(params: z.infer<typeof updateNotificationsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const result = await this.knowledgeService.generateUpdateNotifications();

      // Filter notifications if requested
      let filteredNotifications = result.notifications;

      if (params.filterBySeverity) {
        filteredNotifications = filteredNotifications.filter(n => n.severity === params.filterBySeverity);
      }

      if (params.filterByType) {
        filteredNotifications = filteredNotifications.filter(n => n.notificationType === params.filterByType);
      }

      const response = {
        notificationManagement: {
          totalGenerated: result.notifications.length,
          filtered: filteredNotifications.length,
          acknowledgeAll: params.acknowledgeAll
        },
        summary: result.summary,
        notifications: filteredNotifications.map(notification => ({
          id: notification.notificationId,
          contextKey: notification.contextKey,
          type: notification.notificationType,
          severity: notification.severity,
          message: notification.message,
          createdAt: notification.createdAt,
          acknowledged: notification.acknowledged,
          ageMinutes: Math.round((Date.now() - notification.createdAt.getTime()) / (1000 * 60))
        })),
        priorityNotifications: filteredNotifications.filter(n => n.severity === 'error'),
        insights: this.generateNotificationInsights(result.summary, filteredNotifications),
        actionItems: this.generateNotificationActionItems(filteredNotifications)
      };

      context.logger.info(
        {
          totalGenerated: result.notifications.length,
          filtered: filteredNotifications.length,
          priority: response.priorityNotifications.length,
          unacknowledged: result.summary.unacknowledged
        },
        'Update notifications processed'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to process update notifications');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to process update notifications: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generateNotificationInsights(summary: any, _notifications: any[]): string[] {
    const insights = [];

    if (summary.unacknowledged > 0) {
      insights.push(`${summary.unacknowledged} unacknowledged notifications need attention`);
    }

    const errorCount = summary.bySeverity.error || 0;
    if (errorCount > 0) {
      insights.push(`${errorCount} critical notifications require immediate action`);
    }

    const versionUpdates = summary.byType.version_available || 0;
    if (versionUpdates > 0) {
      insights.push(`${versionUpdates} contexts have new versions available`);
    }

    const dependencyIssues = summary.byType.dependency_changed || 0;
    if (dependencyIssues > 0) {
      insights.push(`${dependencyIssues} dependency changes detected`);
    }

    return insights;
  }

  private generateNotificationActionItems(notifications: any[]): string[] {
    const actionItems = [];

    const criticalNotifications = notifications.filter(n => n.severity === 'error');
    if (criticalNotifications.length > 0) {
      actionItems.push(`Address ${criticalNotifications.length} critical issues immediately`);
    }

    const versionNotifications = notifications.filter(n => n.notificationType === 'version_available');
    if (versionNotifications.length > 0) {
      actionItems.push(`Review and apply ${versionNotifications.length} available version updates`);
    }

    const staleNotifications = notifications.filter(n => n.notificationType === 'staleness_warning');
    if (staleNotifications.length > 0) {
      actionItems.push(`Update ${staleNotifications.length} stale knowledge items`);
    }

    return actionItems;
  }
}

// ===== FILE INTEGRATION TOOLS =====

// Schema for FileChangeContextTool
const fileChangeContextSchema = z.object({
  filePath: z.string().describe('Path to the file that changed'),
  changeType: z.enum(['created', 'modified', 'deleted', 'renamed', 'moved']).describe('Type of file change')
});

@injectable()
export class FileChangeContextTool implements IMCPTool {
  name = 'file_change_context';
  description = 'Generate context from file changes and assess their impact';
  schema = fileChangeContextSchema;

  constructor(@inject(KnowledgeManagementService) private knowledgeService: KnowledgeManagementService) {}

  async execute(params: z.infer<typeof fileChangeContextSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const fileChangeContext = await this.knowledgeService.generateFileChangeContext(
        params.filePath,
        params.changeType
      );

      const response = {
        fileChange: {
          filePath: params.filePath,
          changeType: params.changeType,
          fileId: fileChangeContext.fileId,
          timestamp: fileChangeContext.timestamp
        },
        fileInfo: {
          size: fileChangeContext.size,
          checksum: fileChangeContext.checksum,
          impact: fileChangeContext.impact
        },
        contextAnalysis: {
          contextGenerated: fileChangeContext.contextGenerated.length > 0,
          contextLength: fileChangeContext.contextGenerated.length,
          relatedContexts: fileChangeContext.relatedContexts.length,
          impactAssessment: fileChangeContext.impact
        },
        relatedContexts: fileChangeContext.relatedContexts,
        recommendations: this.generateFileChangeRecommendations(fileChangeContext),
        nextActions: this.generateFileChangeActions(fileChangeContext)
      };

      context.logger.info(
        {
          filePath: params.filePath,
          changeType: params.changeType,
          impact: fileChangeContext.impact,
          relatedContexts: fileChangeContext.relatedContexts.length
        },
        'File change context generated'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, filePath: params.filePath }, 'Failed to generate file change context');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to generate file change context: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generateFileChangeRecommendations(fileChangeContext: any): string[] {
    const recommendations = [];

    if (fileChangeContext.impact === 'high') {
      recommendations.push('High impact change detected - review all related contexts for accuracy');
    }

    if (fileChangeContext.changeType === 'deleted') {
      recommendations.push('File deleted - update or remove references in related contexts');
    }

    if (fileChangeContext.relatedContexts.length > 5) {
      recommendations.push(
        `${fileChangeContext.relatedContexts.length} related contexts found - systematic review recommended`
      );
    }

    if (fileChangeContext.changeType === 'created') {
      recommendations.push('New file created - consider creating documentation or reference contexts');
    }

    return recommendations;
  }

  private generateFileChangeActions(fileChangeContext: any): string[] {
    const actions = [];

    if (fileChangeContext.impact === 'high' || fileChangeContext.impact === 'medium') {
      actions.push('Update dependent contexts to reflect file changes');
    }

    if (fileChangeContext.changeType === 'moved' || fileChangeContext.changeType === 'renamed') {
      actions.push('Update file path references in related contexts');
    }

    if (fileChangeContext.relatedContexts.length > 0) {
      actions.push(`Review ${fileChangeContext.relatedContexts.length} related contexts for relevance`);
    }

    return actions;
  }
}

// Schema for AutoContextOnFileOpsTool
const autoContextOnFileOpsSchema = z.object({
  operation: z.enum(['read', 'write', 'create', 'delete', 'move', 'copy']).describe('File operation type'),
  filePath: z.string().describe('Path to the file being operated on'),
  userId: z.string().optional().describe('User ID performing the operation'),
  sessionId: z.string().optional().describe('Session ID for the operation'),
  autoContext: z.boolean().optional().default(true).describe('Enable automatic context generation'),
  metadata: z.record(z.unknown()).optional().describe('Additional metadata for the operation')
});

@injectable()
export class AutoContextOnFileOpsTool implements IMCPTool {
  name = 'auto_context_on_file_ops';
  description = 'Automatically generate context when file operations are performed';
  schema = autoContextOnFileOpsSchema;

  constructor(@inject(KnowledgeManagementService) private knowledgeService: KnowledgeManagementService) {}

  async execute(params: z.infer<typeof autoContextOnFileOpsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const fileOpContext = await this.knowledgeService.autoGenerateContextOnFileOp(params.operation, params.filePath, {
        userId: params.userId,
        sessionId: params.sessionId,
        autoContext: params.autoContext,
        metadata: params.metadata
      });

      const response = {
        fileOperation: {
          operationId: fileOpContext.operationId,
          operation: params.operation,
          filePath: params.filePath,
          timestamp: fileOpContext.timestamp,
          autoContextEnabled: fileOpContext.autoContext
        },
        contextGeneration: {
          contextsGenerated: fileOpContext.generatedContexts.length,
          contextKeys: fileOpContext.generatedContexts,
          generationSuccessful: fileOpContext.generatedContexts.length > 0
        },
        operationDetails: {
          userId: fileOpContext.userId || 'anonymous',
          sessionId: fileOpContext.sessionId || 'no-session',
          metadata: fileOpContext.metadata
        },
        analysis: {
          operationType: this.analyzeOperationType(params.operation),
          contextRelevance: this.assessContextRelevance(params.operation, fileOpContext.generatedContexts.length),
          impact: this.assessOperationImpact(params.operation, params.filePath)
        },
        recommendations: this.generateFileOpRecommendations(fileOpContext),
        insights: this.generateFileOpInsights(fileOpContext)
      };

      context.logger.info(
        {
          operationId: fileOpContext.operationId,
          operation: params.operation,
          filePath: params.filePath,
          contextsGenerated: fileOpContext.generatedContexts.length,
          autoContext: fileOpContext.autoContext
        },
        'Auto-context generation completed'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error(
        { error, operation: params.operation, filePath: params.filePath },
        'Failed to auto-generate context'
      );
      return {
        content: [
          {
            type: 'text',
            text: `Failed to auto-generate context: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private analyzeOperationType(operation: string): { category: string; description: string } {
    const operationTypes = {
      read: { category: 'access', description: 'File content was accessed for reading' },
      write: { category: 'modification', description: 'File content was modified' },
      create: { category: 'creation', description: 'New file was created' },
      delete: { category: 'removal', description: 'File was permanently removed' },
      move: { category: 'organization', description: 'File was moved to a different location' },
      copy: { category: 'duplication', description: 'File was copied to another location' }
    };

    return (
      operationTypes[operation as keyof typeof operationTypes] || {
        category: 'unknown',
        description: 'Operation type not recognized'
      }
    );
  }

  private assessContextRelevance(operation: string, contextCount: number): string {
    if (contextCount === 0) return 'none';

    const significantOperations = ['create', 'delete', 'write'];
    if (significantOperations.includes(operation) && contextCount > 0) return 'high';

    return contextCount > 1 ? 'medium' : 'low';
  }

  private assessOperationImpact(operation: string, filePath: string): 'low' | 'medium' | 'high' {
    // High impact operations
    if (['delete', 'move'].includes(operation)) return 'high';

    // Medium impact for important file types
    if (operation === 'write' && /\.(ts|js|json|config|env)$/i.test(filePath)) return 'medium';

    // Low impact for read operations or other file types
    return 'low';
  }

  private generateFileOpRecommendations(fileOpContext: any): string[] {
    const recommendations = [];

    if (!fileOpContext.autoContext) {
      recommendations.push('Auto-context is disabled - consider enabling for better tracking');
    }

    if (fileOpContext.generatedContexts.length === 0) {
      recommendations.push('No contexts generated - verify auto-context configuration');
    }

    if (fileOpContext.operation === 'delete') {
      recommendations.push('File deletion detected - ensure related contexts are updated');
    }

    if (!fileOpContext.sessionId) {
      recommendations.push('No session ID provided - context organization may be impacted');
    }

    return recommendations;
  }

  private generateFileOpInsights(fileOpContext: any): string[] {
    const insights = [];

    insights.push(`${fileOpContext.operation.toUpperCase()} operation performed on file`);

    if (fileOpContext.generatedContexts.length > 0) {
      insights.push(`${fileOpContext.generatedContexts.length} contexts automatically generated`);
    }

    if (fileOpContext.sessionId) {
      insights.push(`Operation linked to session: ${fileOpContext.sessionId}`);
    }

    if (fileOpContext.userId) {
      insights.push(`Operation performed by user: ${fileOpContext.userId}`);
    }

    return insights;
  }
}

// Schema for FileHistoryContextTool
const fileHistoryContextSchema = z.object({
  filePath: z.string().describe('Path to the file to analyze history for'),
  maxVersions: z.number().optional().default(20).describe('Maximum number of versions to include'),
  consolidate: z.boolean().optional().default(true).describe('Generate consolidated context from history'),
  includeDeleted: z.boolean().optional().default(false).describe('Include deleted file versions')
});

@injectable()
export class FileHistoryContextTool implements IMCPTool {
  name = 'file_history_context';
  description = 'Generate comprehensive context from file history and versions';
  schema = fileHistoryContextSchema;

  constructor(@inject(KnowledgeManagementService) private knowledgeService: KnowledgeManagementService) {}

  async execute(params: z.infer<typeof fileHistoryContextSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const fileHistoryContext = await this.knowledgeService.generateFileHistoryContext(params.filePath, {
        maxVersions: params.maxVersions,
        consolidate: params.consolidate,
        includeDeleted: params.includeDeleted
      });

      const response = {
        fileHistory: {
          historyId: fileHistoryContext.historyId,
          filePath: params.filePath,
          totalVersions: fileHistoryContext.totalVersions,
          timeSpan: this.calculateTimeSpan(fileHistoryContext.oldestVersion, fileHistoryContext.newestVersion)
        },
        versions: fileHistoryContext.versions.map(version => ({
          version: version.version,
          timestamp: version.timestamp,
          checksum: version.checksum,
          contextKey: version.contextKey,
          changesCount: version.changes.length,
          ageHours: Math.round((Date.now() - version.timestamp.getTime()) / (1000 * 60 * 60))
        })),
        consolidatedContext: {
          generated: params.consolidate && fileHistoryContext.consolidatedContext.length > 0,
          length: fileHistoryContext.consolidatedContext.length,
          preview: fileHistoryContext.consolidatedContext.substring(0, 200) + '...'
        },
        analysis: {
          versionFrequency: this.analyzeVersionFrequency(fileHistoryContext.versions),
          changePatterns: this.analyzeChangePatterns(fileHistoryContext.versions),
          activityPeriods: this.identifyActivityPeriods(fileHistoryContext.versions)
        },
        insights: this.generateHistoryInsights(fileHistoryContext),
        recommendations: this.generateHistoryRecommendations(fileHistoryContext)
      };

      context.logger.info(
        {
          historyId: fileHistoryContext.historyId,
          filePath: params.filePath,
          totalVersions: fileHistoryContext.totalVersions,
          consolidated: params.consolidate
        },
        'File history context generated'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, filePath: params.filePath }, 'Failed to generate file history context');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to generate file history context: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private calculateTimeSpan(oldest: Date, newest: Date): string {
    const diffMs = newest.getTime() - oldest.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Same day';
    if (diffDays === 1) return '1 day';
    if (diffDays < 7) return `${diffDays} days`;
    if (diffDays < 30) return `${Math.round(diffDays / 7)} weeks`;
    return `${Math.round(diffDays / 30)} months`;
  }

  private analyzeVersionFrequency(versions: any[]): { rate: string; pattern: string } {
    if (versions.length < 2) return { rate: 'insufficient-data', pattern: 'single-version' };

    const intervals = [];
    for (let i = 1; i < versions.length; i++) {
      const interval = versions[i - 1].timestamp.getTime() - versions[i].timestamp.getTime();
      intervals.push(interval);
    }

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const avgHours = avgInterval / (1000 * 60 * 60);

    let rate = 'low';
    if (avgHours < 1) rate = 'very-high';
    else if (avgHours < 24) rate = 'high';
    else if (avgHours < 168) rate = 'medium'; // 1 week

    const variance = this.calculateVariance(intervals);
    const pattern = variance > avgInterval * 0.5 ? 'irregular' : 'regular';

    return { rate, pattern };
  }

  private analyzeChangePatterns(versions: any[]): { types: Record<string, number>; trends: string } {
    const changeTypes = versions.reduce((acc, version) => {
      version.changes.forEach((change: string) => {
        const type = this.categorizeChange(change);
        acc[type] = (acc[type] || 0) + 1;
      });
      return acc;
    }, {});

    // Simple trend analysis
    const recentVersions = versions.slice(0, Math.min(5, versions.length));
    const olderVersions = versions.slice(Math.min(5, versions.length));

    const recentChangeCount = recentVersions.reduce((sum, v) => sum + v.changes.length, 0);
    const olderChangeCount = olderVersions.reduce((sum, v) => sum + v.changes.length, 0);

    let trends = 'stable';
    if (recentChangeCount > olderChangeCount * 1.5) trends = 'increasing';
    else if (recentChangeCount < olderChangeCount * 0.5) trends = 'decreasing';

    return { types: changeTypes, trends };
  }

  private identifyActivityPeriods(
    versions: any[]
  ): Array<{ period: string; versionCount: number; changeIntensity: string }> {
    // Group versions by time periods
    const periods = new Map<string, any[]>();

    versions.forEach(version => {
      const monthKey = version.timestamp.toISOString().substring(0, 7); // YYYY-MM
      if (!periods.has(monthKey)) {
        periods.set(monthKey, []);
      }
      periods.get(monthKey)!.push(version);
    });

    return Array.from(periods.entries()).map(([period, periodVersions]) => {
      const totalChanges = periodVersions.reduce((sum, v) => sum + v.changes.length, 0);
      let intensity = 'low';
      if (totalChanges > 20) intensity = 'high';
      else if (totalChanges > 10) intensity = 'medium';

      return {
        period,
        versionCount: periodVersions.length,
        changeIntensity: intensity
      };
    });
  }

  private generateHistoryInsights(fileHistoryContext: any): string[] {
    const insights = [];

    if (fileHistoryContext.totalVersions === 0) {
      insights.push('No version history found for this file');
      return insights;
    }

    insights.push(`File has ${fileHistoryContext.totalVersions} tracked versions`);

    const timeSpan = this.calculateTimeSpan(fileHistoryContext.oldestVersion, fileHistoryContext.newestVersion);
    insights.push(`Version history spans ${timeSpan}`);

    if (fileHistoryContext.versions.length > 10) {
      insights.push('Frequently modified file - high development activity');
    }

    const recentVersions = fileHistoryContext.versions.filter((v: any) => {
      const ageHours = (Date.now() - v.timestamp.getTime()) / (1000 * 60 * 60);
      return ageHours < 168; // 1 week
    });

    if (recentVersions.length > 0) {
      insights.push(`${recentVersions.length} versions from the past week`);
    }

    return insights;
  }

  private generateHistoryRecommendations(fileHistoryContext: any): string[] {
    const recommendations = [];

    if (fileHistoryContext.totalVersions > 50) {
      recommendations.push('Consider archiving old versions to reduce storage and improve performance');
    }

    if (fileHistoryContext.consolidatedContext.length > 10000) {
      recommendations.push('Large consolidated context - consider summarizing or splitting');
    }

    if (fileHistoryContext.versions.length < 5) {
      recommendations.push('Limited version history - consider more frequent checkpoints');
    }

    const recentActivity = fileHistoryContext.versions.filter((v: any) => {
      const ageHours = (Date.now() - v.timestamp.getTime()) / (1000 * 60 * 60);
      return ageHours < 24;
    }).length;

    if (recentActivity > 5) {
      recommendations.push('High recent activity - monitor for stability and quality');
    }

    return recommendations;
  }

  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((sum, d) => sum + d, 0) / numbers.length;
  }

  private categorizeChange(change: string): string {
    const changeStr = change.toLowerCase();
    if (changeStr.includes('add') || changeStr.includes('create')) return 'addition';
    if (changeStr.includes('delete') || changeStr.includes('remove')) return 'deletion';
    if (changeStr.includes('modify') || changeStr.includes('update')) return 'modification';
    if (changeStr.includes('fix') || changeStr.includes('bug')) return 'fix';
    return 'other';
  }
}
