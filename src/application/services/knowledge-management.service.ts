// Knowledge Management Service for Version Control and File Integration
// File: src/application/services/knowledge-management.service.ts

import { injectable, inject } from 'inversify';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import { logger } from '../../utils/logger.js';

// Version Management Interfaces
export interface VersionCacheOptions {
  maxVersions?: number;
  maxAge?: number; // hours
  compressionEnabled?: boolean;
  autoCleanup?: boolean;
}

export interface KnowledgeVersion {
  versionId: string;
  contextKey: string;
  version: number;
  content: unknown;
  checksum: string;
  createdAt: Date;
  createdBy?: string;
  changes: string[];
  parentVersion?: string;
  tags: string[];
}

export interface FreshnessCheckOptions {
  contextKeys?: string[];
  contextTypes?: string[];
  maxAge?: number; // hours
  checkExternalSources?: boolean;
  dependencies?: string[];
}

export interface FreshnessResult {
  contextKey: string;
  currentVersion: string;
  latestVersion: string;
  isUpToDate: boolean;
  ageHours: number;
  staleness: 'fresh' | 'aging' | 'stale' | 'outdated';
  recommendations: string[];
  dependencies: DependencyInfo[];
}

export interface DependencyInfo {
  dependencyKey: string;
  dependencyType: 'file' | 'context' | 'external' | 'computed';
  lastChecked: Date;
  isUpToDate: boolean;
  checksum?: string;
  location?: string;
}

export interface UpdateNotification {
  notificationId: string;
  contextKey: string;
  notificationType: 'version_available' | 'dependency_changed' | 'staleness_warning' | 'cache_expired';
  message: string;
  severity: 'info' | 'warning' | 'error';
  createdAt: Date;
  acknowledged: boolean;
  metadata: Record<string, unknown>;
}

// File Integration Interfaces
export interface FileChangeContext {
  fileId: string;
  filePath: string;
  changeType: 'created' | 'modified' | 'deleted' | 'renamed' | 'moved';
  timestamp: Date;
  checksum: string;
  size: number;
  contextGenerated: string;
  relatedContexts: string[];
  impact: 'low' | 'medium' | 'high';
}

export interface FileOperationContext {
  operationId: string;
  operation: 'read' | 'write' | 'create' | 'delete' | 'move' | 'copy';
  filePath: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  autoContext: boolean;
  generatedContexts: string[];
  metadata: Record<string, unknown>;
}

export interface FileHistoryContext {
  historyId: string;
  filePath: string;
  versions: Array<{
    version: number;
    timestamp: Date;
    checksum: string;
    contextKey: string;
    changes: string[];
  }>;
  totalVersions: number;
  oldestVersion: Date;
  newestVersion: Date;
  consolidatedContext: string;
}

@injectable()
export class KnowledgeManagementService {
  private versionCache = new Map<string, KnowledgeVersion[]>();
  private dependencyGraph = new Map<string, Set<string>>();


  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler
  ) {}

  // ===== VERSION MANAGEMENT METHODS =====

  /**
   * Manage version cache for knowledge items
   */
  async manageVersionCache(options: VersionCacheOptions = {}): Promise<{
    cached: number;
    cleaned: number;
    compressed: number;
    summary: {
      totalVersions: number;
      uniqueContexts: number;
      totalSize: number;
      oldestVersion: Date | null;
      newestVersion: Date | null;
    };
  }> {
    try {
      const maxVersions = options.maxVersions || 10;
      const maxAge = options.maxAge || 168; // 1 week
      const cutoffTime = new Date(Date.now() - maxAge * 60 * 60 * 1000);

      let cached = 0;
      let cleaned = 0;
      let compressed = 0;

      // Get all contexts that need version management
      const contextsQuery = `
        SELECT key, value, updated_at, context_type, semantic_tags
        FROM context_items 
        WHERE updated_at > ?
        ORDER BY updated_at DESC
      `;

      const contexts = await this.db.executeQuery(contextsQuery, [cutoffTime.toISOString()]) as any[];

      // Process each context for versioning
      for (const context of contexts) {
        try {
          // Generate version
          const version = await this.createVersion(context);
          
          // Get existing versions for this context
          let existingVersions = this.versionCache.get(context.key) || [];
          
          // Add new version
          existingVersions.unshift(version);
          cached++;

          // Clean old versions if exceeding limit
          if (existingVersions.length > maxVersions) {
            const removed = existingVersions.splice(maxVersions);
            cleaned += removed.length;
          }

          // Compress old versions if enabled
          if (options.compressionEnabled) {
            const compressedCount = this.compressOldVersions(existingVersions);
            compressed += compressedCount;
          }

          // Update cache
          this.versionCache.set(context.key, existingVersions);

          // Store in database
          await this.storeVersionInDatabase(version);

        } catch (error) {
          logger.warn({ error, contextKey: context.key }, 'Failed to process context version');
        }
      }

      // Auto cleanup if enabled
      if (options.autoCleanup) {
        const cleanupResult = await this.cleanupOldVersions(cutoffTime);
        cleaned += cleanupResult.cleaned;
      }

      // Generate summary
      const summary = this.generateVersionCacheSummary();

      logger.info({
        cached,
        cleaned,
        compressed,
        totalVersions: summary.totalVersions
      }, 'Version cache management completed');

      return {
        cached,
        cleaned,
        compressed,
        summary
      };

    } catch (error) {
      logger.error({ error, options }, 'Failed to manage version cache');
      throw error;
    }
  }

  /**
   * Check knowledge freshness and identify stale items
   */
  async checkKnowledgeFreshness(options: FreshnessCheckOptions = {}): Promise<FreshnessResult[]> {
    try {
      const maxAge = options.maxAge || 72; // 3 days default
      const results: FreshnessResult[] = [];

      // Build query for contexts to check
      let query = `
        SELECT key, value, updated_at, context_type, semantic_tags, created_at
        FROM context_items
        WHERE 1=1
      `;
      const params: unknown[] = [];

      // Add context key filter
      if (options.contextKeys && options.contextKeys.length > 0) {
        query += ` AND key IN (${options.contextKeys.map(() => '?').join(',')})`;
        params.push(...options.contextKeys);
      }

      // Add context type filter
      if (options.contextTypes && options.contextTypes.length > 0) {
        query += ` AND context_type IN (${options.contextTypes.map(() => '?').join(',')})`;
        params.push(...options.contextTypes);
      }

      query += ` ORDER BY updated_at DESC LIMIT 100`;

      const contexts = await this.db.executeQuery(query, params) as any[];

      // Check freshness for each context
      for (const context of contexts) {
        try {
          const freshnessResult = await this.analyzeFreshness(context, maxAge, options);
          results.push(freshnessResult);
        } catch (error) {
          logger.warn({ error, contextKey: context.key }, 'Failed to check context freshness');
        }
      }

      // Sort by staleness severity
      results.sort((a, b) => {
        const stalenessPriority = { outdated: 4, stale: 3, aging: 2, fresh: 1 };
        return stalenessPriority[b.staleness] - stalenessPriority[a.staleness];
      });

      logger.info({
        totalChecked: results.length,
        staleCount: results.filter(r => r.staleness !== 'fresh').length,
        outdatedCount: results.filter(r => r.staleness === 'outdated').length
      }, 'Knowledge freshness check completed');

      return results;

    } catch (error) {
      logger.error({ error, options }, 'Failed to check knowledge freshness');
      throw error;
    }
  }

  /**
   * Track dependencies between knowledge items
   */
  async trackDependencies(contextKey: string): Promise<{
    dependencies: DependencyInfo[];
    dependents: string[];
    circularDependencies: string[][];
    graph: {
      nodes: Array<{ id: string; type: string; level: number }>;
      edges: Array<{ source: string; target: string; type: string; strength: number }>;
    };
  }> {
    try {
      // Get context to analyze
      const context = await this.db.getEnhancedContext(contextKey);
      if (!context) {
        throw new Error(`Context not found: ${contextKey}`);
      }

      // Find direct dependencies
      const dependencies = await this.findDirectDependencies(context);
      
      // Find dependent contexts (what depends on this context)
      const dependents = await this.findDependentContexts(contextKey);

      // Check for circular dependencies
      const circularDependencies = await this.detectCircularDependencies(contextKey);

      // Build dependency graph
      const graph = await this.buildDependencyGraph(contextKey, dependencies, dependents);

      // Update internal dependency tracking
      this.updateDependencyGraph(contextKey, dependencies.map(d => d.dependencyKey));

      logger.info({
        contextKey,
        dependencyCount: dependencies.length,
        dependentCount: dependents.length,
        circularCount: circularDependencies.length
      }, 'Dependency tracking completed');

      return {
        dependencies,
        dependents,
        circularDependencies,
        graph
      };

    } catch (error) {
      logger.error({ error, contextKey }, 'Failed to track dependencies');
      throw error;
    }
  }

  /**
   * Generate update notifications for stale or changed items
   */
  async generateUpdateNotifications(): Promise<{
    notifications: UpdateNotification[];
    summary: {
      total: number;
      byType: Record<string, number>;
      bySeverity: Record<string, number>;
      unacknowledged: number;
    };
  }> {
    try {
      const notifications: UpdateNotification[] = [];

      // Check for version updates
      const versionNotifications = await this.checkForVersionUpdates();
      notifications.push(...versionNotifications);

      // Check for dependency changes
      const dependencyNotifications = await this.checkForDependencyChanges();
      notifications.push(...dependencyNotifications);

      // Check for staleness warnings
      const stalenessNotifications = await this.checkForStalenessWarnings();
      notifications.push(...stalenessNotifications);

      // Check for cache expiration
      const cacheNotifications = await this.checkForCacheExpiration();
      notifications.push(...cacheNotifications);

      // Store notifications
      for (const notification of notifications) {
        await this.storeNotification(notification);
      }

      // Generate summary
      const summary = {
        total: notifications.length,
        byType: notifications.reduce((acc, n) => {
          acc[n.notificationType] = (acc[n.notificationType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        bySeverity: notifications.reduce((acc, n) => {
          acc[n.severity] = (acc[n.severity] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        unacknowledged: notifications.filter(n => !n.acknowledged).length
      };

      logger.info({
        total: summary.total,
        unacknowledged: summary.unacknowledged,
        highPriority: notifications.filter(n => n.severity === 'error').length
      }, 'Update notifications generated');

      return { notifications, summary };

    } catch (error) {
      logger.error({ error }, 'Failed to generate update notifications');
      throw error;
    }
  }

  // ===== FILE INTEGRATION METHODS =====

  /**
   * Generate context from file changes
   */
  async generateFileChangeContext(filePath: string, changeType: FileChangeContext['changeType']): Promise<FileChangeContext> {
    try {
      const fileId = this.generateFileId(filePath);
      const timestamp = new Date();

      // Get file stats
      const fileStats = await this.getFileStats(filePath);
      
      // Generate context content
      const contextContent = await this.generateContextFromFileChange(filePath, changeType, fileStats);
      
      // Find related contexts
      const relatedContexts = await this.findRelatedFileContexts(filePath);
      
      // Assess impact
      const impact = this.assessFileChangeImpact(filePath, changeType, relatedContexts);

      const fileChangeContext: FileChangeContext = {
        fileId,
        filePath,
        changeType,
        timestamp,
        checksum: fileStats.checksum,
        size: fileStats.size,
        contextGenerated: contextContent,
        relatedContexts,
        impact
      };

      // Store the file change context
      await this.storeFileChangeContext(fileChangeContext);

      logger.info({
        filePath,
        changeType,
        impact,
        relatedContexts: relatedContexts.length
      }, 'File change context generated');

      return fileChangeContext;

    } catch (error) {
      logger.error({ error, filePath, changeType }, 'Failed to generate file change context');
      throw error;
    }
  }

  /**
   * Auto-generate context on file operations
   */
  async autoGenerateContextOnFileOp(
    operation: FileOperationContext['operation'],
    filePath: string,
    options: {
      userId?: string;
      sessionId?: string;
      autoContext?: boolean;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<FileOperationContext> {
    try {
      const operationId = this.generateOperationId();
      const timestamp = new Date();

      const fileOpContext: FileOperationContext = {
        operationId,
        operation,
        filePath,
        timestamp,
        userId: options.userId,
        sessionId: options.sessionId,
        autoContext: options.autoContext !== false,
        generatedContexts: [],
        metadata: options.metadata || {}
      };

      if (fileOpContext.autoContext) {
        // Generate contexts based on operation type
        const contexts = await this.generateContextsForOperation(operation, filePath, options);
        fileOpContext.generatedContexts = contexts;

        // Store generated contexts
        for (const contextKey of contexts) {
          await this.linkFileOperationToContext(operationId, contextKey);
        }
      }

      // Store the file operation context
      await this.storeFileOperationContext(fileOpContext);

      logger.info({
        operationId,
        operation,
        filePath,
        autoContext: fileOpContext.autoContext,
        generatedContexts: fileOpContext.generatedContexts.length
      }, 'Auto-context generation completed');

      return fileOpContext;

    } catch (error) {
      logger.error({ error, operation, filePath }, 'Failed to auto-generate context for file operation');
      throw error;
    }
  }

  /**
   * Generate context from file history
   */
  async generateFileHistoryContext(filePath: string, options: {
    maxVersions?: number;
    consolidate?: boolean;
    includeDeleted?: boolean;
  } = {}): Promise<FileHistoryContext> {
    try {
      const historyId = this.generateHistoryId(filePath);
      const maxVersions = options.maxVersions || 20;

      // Get file change history
      const changeHistory = await this.getFileChangeHistory(filePath, maxVersions);
      
      // Get versions with contexts
      const versions = [];
      for (const change of changeHistory) {
        const contextKey = await this.findContextForFileChange(change);
        if (contextKey) {
          versions.push({
            version: change.version,
            timestamp: change.timestamp,
            checksum: change.checksum,
            contextKey,
            changes: change.changes
          });
        }
      }

      // Generate consolidated context if requested
      let consolidatedContext = '';
      if (options.consolidate && versions.length > 0) {
        consolidatedContext = await this.consolidateFileContexts(versions);
      }

      const fileHistoryContext: FileHistoryContext = {
        historyId,
        filePath,
        versions,
        totalVersions: versions.length,
        oldestVersion: versions.length > 0 ? new Date(Math.min(...versions.map(v => v.timestamp.getTime()))) : new Date(),
        newestVersion: versions.length > 0 ? new Date(Math.max(...versions.map(v => v.timestamp.getTime()))) : new Date(),
        consolidatedContext
      };

      // Store the file history context
      await this.storeFileHistoryContext(fileHistoryContext);

      logger.info({
        historyId,
        filePath,
        totalVersions: versions.length,
        consolidatedLength: consolidatedContext.length
      }, 'File history context generated');

      return fileHistoryContext;

    } catch (error) {
      logger.error({ error, filePath }, 'Failed to generate file history context');
      throw error;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private async createVersion(context: any): Promise<KnowledgeVersion> {
    const versionId = `v_${context.key}_${Date.now()}`;
    const content = this.parseJsonSafely(context.value);
    const checksum = this.generateChecksum(JSON.stringify(content));
    
    return {
      versionId,
      contextKey: context.key,
      version: await this.getNextVersionNumber(context.key),
      content,
      checksum,
      createdAt: new Date(),
      changes: await this.detectChanges(context.key, content),
      parentVersion: await this.getLatestVersionId(context.key),
      tags: this.parseTagsSafely(context.semantic_tags)
    };
  }

  private compressOldVersions(versions: KnowledgeVersion[]): number {
    let compressed = 0;
    
    // Compress versions older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    for (const version of versions) {
      if (version.createdAt < thirtyDaysAgo && typeof version.content === 'object') {
        // Simple compression - summarize large objects
        if (JSON.stringify(version.content).length > 1000) {
          version.content = this.summarizeContent(version.content);
          compressed++;
        }
      }
    }
    
    return compressed;
  }

  private async cleanupOldVersions(cutoffTime: Date): Promise<{ cleaned: number }> {
    let cleaned = 0;
    
    for (const [contextKey, versions] of this.versionCache.entries()) {
      const filteredVersions = versions.filter(v => v.createdAt > cutoffTime);
      cleaned += versions.length - filteredVersions.length;
      
      if (filteredVersions.length === 0) {
        this.versionCache.delete(contextKey);
      } else {
        this.versionCache.set(contextKey, filteredVersions);
      }
    }
    
    return { cleaned };
  }

  private generateVersionCacheSummary() {
    const allVersions = Array.from(this.versionCache.values()).flat();
    
    return {
      totalVersions: allVersions.length,
      uniqueContexts: this.versionCache.size,
      totalSize: allVersions.reduce((sum, v) => sum + JSON.stringify(v.content).length, 0),
      oldestVersion: allVersions.length > 0 ? new Date(Math.min(...allVersions.map(v => v.createdAt.getTime()))) : null,
      newestVersion: allVersions.length > 0 ? new Date(Math.max(...allVersions.map(v => v.createdAt.getTime()))) : null
    };
  }

  private async analyzeFreshness(context: any, maxAge: number, _options: FreshnessCheckOptions): Promise<FreshnessResult> {
    const ageHours = (Date.now() - new Date(context.updated_at).getTime()) / (1000 * 60 * 60);
    
    let staleness: FreshnessResult['staleness'] = 'fresh';
    if (ageHours > maxAge * 2) {
      staleness = 'outdated';
    } else if (ageHours > maxAge) {
      staleness = 'stale';
    } else if (ageHours > maxAge * 0.5) {
      staleness = 'aging';
    }

    const dependencies = await this.findDirectDependencies(context);
    const recommendations = this.generateFreshnessRecommendations(staleness, ageHours, dependencies);

    return {
      contextKey: context.key,
      currentVersion: context.version || '1.0',
      latestVersion: await this.getLatestVersionNumber(context.key),
      isUpToDate: staleness === 'fresh',
      ageHours: Math.round(ageHours),
      staleness,
      recommendations,
      dependencies
    };
  }

  private async findDirectDependencies(context: any): Promise<DependencyInfo[]> {
    // Analyze context content for dependencies
    const content = this.parseJsonSafely(context.value);
    const dependencies: DependencyInfo[] = [];
    
    // Look for file references
    const fileRefs = this.extractFileReferences(content);
    for (const fileRef of fileRefs) {
      dependencies.push({
        dependencyKey: fileRef,
        dependencyType: 'file',
        lastChecked: new Date(),
        isUpToDate: await this.isFileUpToDate(fileRef),
        location: fileRef
      });
    }
    
    // Look for context references
    const contextRefs = this.extractContextReferences(content);
    for (const contextRef of contextRefs) {
      dependencies.push({
        dependencyKey: contextRef,
        dependencyType: 'context',
        lastChecked: new Date(),
        isUpToDate: await this.isContextUpToDate(contextRef)
      });
    }
    
    return dependencies;
  }

  private async findDependentContexts(contextKey: string): Promise<string[]> {
    // Find contexts that reference this context
    const query = `
      SELECT key FROM context_items 
      WHERE value LIKE ? OR semantic_tags LIKE ?
      AND key != ?
      LIMIT 50
    `;
    
    const results = await this.db.executeQuery(query, [
      `%${contextKey}%`,
      `%${contextKey}%`,
      contextKey
    ]) as any[];
    
    return results.map(r => r.key);
  }

  private async detectCircularDependencies(contextKey: string): Promise<string[][]> {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];
    
    const dfs = async (current: string, path: string[]) => {
      if (recursionStack.has(current)) {
        // Found a cycle
        const cycleStart = path.indexOf(current);
        cycles.push(path.slice(cycleStart));
        return;
      }
      
      if (visited.has(current)) {
        return;
      }
      
      visited.add(current);
      recursionStack.add(current);
      
      const dependencies = this.dependencyGraph.get(current) || new Set();
      for (const dep of dependencies) {
        await dfs(dep, [...path, current]);
      }
      
      recursionStack.delete(current);
    };
    
    await dfs(contextKey, []);
    return cycles;
  }

  private async buildDependencyGraph(contextKey: string, dependencies: DependencyInfo[], dependents: string[]) {
    const nodes = [{ id: contextKey, type: 'root', level: 0 }];
    const edges: Array<{ source: string; target: string; type: string; strength: number }> = [];
    
    // Add dependency nodes and edges
    dependencies.forEach((dep) => {
      nodes.push({ id: dep.dependencyKey, type: dep.dependencyType, level: 1 });
      edges.push({
        source: contextKey,
        target: dep.dependencyKey,
        type: dep.dependencyType,
        strength: dep.isUpToDate ? 1.0 : 0.5
      });
    });
    
    // Add dependent nodes and edges
    dependents.forEach((dependent) => {
      nodes.push({ id: dependent, type: 'dependent', level: -1 });
      edges.push({
        source: dependent,
        target: contextKey,
        type: 'references',
        strength: 1.0
      });
    });
    
    return { nodes, edges };
  }

  private updateDependencyGraph(contextKey: string, dependencies: string[]) {
    this.dependencyGraph.set(contextKey, new Set(dependencies));
  }

  private generateFreshnessRecommendations(staleness: string, ageHours: number, dependencies: DependencyInfo[]): string[] {
    const recommendations = [];
    
    if (staleness === 'outdated') {
      recommendations.push('Content is significantly outdated - immediate review recommended');
    } else if (staleness === 'stale') {
      recommendations.push('Content is stale - consider updating or validating');
    } else if (staleness === 'aging') {
      recommendations.push('Content is aging - monitor for further staleness');
    }
    
    const outdatedDeps = dependencies.filter(d => !d.isUpToDate);
    if (outdatedDeps.length > 0) {
      recommendations.push(`${outdatedDeps.length} dependencies are outdated`);
    }
    
    if (ageHours > 168) { // 1 week
      recommendations.push('Consider archiving if no longer relevant');
    }
    
    return recommendations;
  }

  // Notification helper methods
  private async checkForVersionUpdates(): Promise<UpdateNotification[]> {
    const notifications: UpdateNotification[] = [];
    
    // Check for contexts with available updates
    for (const [contextKey, versions] of this.versionCache.entries()) {
      if (versions.length > 1) {
        const latest = versions[0];
        const previous = versions[1];
        
        if (latest && previous && latest.createdAt.getTime() - previous.createdAt.getTime() < 24 * 60 * 60 * 1000) {
          notifications.push({
            notificationId: `update_${contextKey}_${Date.now()}`,
            contextKey,
            notificationType: 'version_available',
            message: `New version available for ${contextKey}`,
            severity: 'info',
            createdAt: new Date(),
            acknowledged: false,
            metadata: { latestVersion: latest.version, previousVersion: previous.version }
          });
        }
      }
    }
    
    return notifications;
  }

  private async checkForDependencyChanges(): Promise<UpdateNotification[]> {
    const notifications: UpdateNotification[] = [];
    
    for (const [contextKey, dependencies] of this.dependencyGraph.entries()) {
      for (const dependency of dependencies) {
        const isUpToDate = await this.isContextUpToDate(dependency);
        if (!isUpToDate) {
          notifications.push({
            notificationId: `dep_${contextKey}_${dependency}_${Date.now()}`,
            contextKey,
            notificationType: 'dependency_changed',
            message: `Dependency ${dependency} has changed`,
            severity: 'warning',
            createdAt: new Date(),
            acknowledged: false,
            metadata: { dependency }
          });
        }
      }
    }
    
    return notifications;
  }

  private async checkForStalenessWarnings(): Promise<UpdateNotification[]> {
    const freshnessResults = await this.checkKnowledgeFreshness({ maxAge: 72 });
    
    return freshnessResults
      .filter(result => result.staleness === 'stale' || result.staleness === 'outdated')
      .map(result => ({
        notificationId: `stale_${result.contextKey}_${Date.now()}`,
        contextKey: result.contextKey,
        notificationType: 'staleness_warning' as const,
        message: `Context ${result.contextKey} is ${result.staleness} (${result.ageHours} hours old)`,
        severity: result.staleness === 'outdated' ? 'error' as const : 'warning' as const,
        createdAt: new Date(),
        acknowledged: false,
        metadata: { staleness: result.staleness, ageHours: result.ageHours }
      }));
  }

  private async checkForCacheExpiration(): Promise<UpdateNotification[]> {
    const notifications: UpdateNotification[] = [];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const [contextKey, versions] of this.versionCache.entries()) {
      const oldVersions = versions.filter(v => v.createdAt < oneDayAgo);
      if (oldVersions.length > 5) {
        notifications.push({
          notificationId: `cache_${contextKey}_${Date.now()}`,
          contextKey,
          notificationType: 'cache_expired',
          message: `Cache for ${contextKey} has ${oldVersions.length} expired versions`,
          severity: 'info',
          createdAt: new Date(),
          acknowledged: false,
          metadata: { expiredVersions: oldVersions.length }
        });
      }
    }
    
    return notifications;
  }

  // File integration helper methods
  private generateFileId(filePath: string): string {
    return `file_${this.generateChecksum(filePath)}_${Date.now()}`;
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateHistoryId(filePath: string): string {
    return `hist_${this.generateChecksum(filePath)}_${Date.now()}`;
  }

  private async getFileStats(filePath: string): Promise<{ checksum: string; size: number }> {
    // Placeholder implementation - would integrate with actual file system
    return {
      checksum: this.generateChecksum(filePath + Date.now()),
      size: 1024 // placeholder
    };
  }

  private async generateContextFromFileChange(filePath: string, changeType: string, fileStats: any): Promise<string> {
    return `File ${filePath} was ${changeType} at ${new Date().toISOString()}. Size: ${fileStats.size} bytes.`;
  }

  private async findRelatedFileContexts(filePath: string): Promise<string[]> {
    const query = `
      SELECT key FROM context_items 
      WHERE value LIKE ?
      LIMIT 10
    `;
    
    const results = await this.db.executeQuery(query, [`%${filePath}%`]) as any[];
    return results.map(r => r.key);
  }

  private assessFileChangeImpact(_filePath: string, changeType: string, relatedContexts: string[]): 'low' | 'medium' | 'high' {
    if (relatedContexts.length > 5) return 'high';
    if (relatedContexts.length > 2 || changeType === 'deleted') return 'medium';
    return 'low';
  }

  // Storage methods
  private async storeVersionInDatabase(version: KnowledgeVersion): Promise<void> {
    const versionData = {
      versionId: version.versionId,
      contextKey: version.contextKey,
      version: version.version,
      content: JSON.stringify(version.content),
      checksum: version.checksum,
      createdAt: version.createdAt.toISOString(),
      changes: JSON.stringify(version.changes),
      parentVersion: version.parentVersion,
      tags: JSON.stringify(version.tags)
    };

    await this.db.storeContext(`version_${version.versionId}`, versionData, 'version');
  }

  private async storeNotification(notification: UpdateNotification): Promise<void> {
    await this.db.storeContext(`notification_${notification.notificationId}`, notification, 'notification');
  }

  private async storeFileChangeContext(fileChangeContext: FileChangeContext): Promise<void> {
    await this.db.storeContext(`file_change_${fileChangeContext.fileId}`, fileChangeContext, 'file_change');
  }

  private async storeFileOperationContext(fileOpContext: FileOperationContext): Promise<void> {
    await this.db.storeContext(`file_op_${fileOpContext.operationId}`, fileOpContext, 'file_operation');
  }

  private async storeFileHistoryContext(fileHistoryContext: FileHistoryContext): Promise<void> {
    await this.db.storeContext(`file_history_${fileHistoryContext.historyId}`, fileHistoryContext, 'file_history');
  }

  // Utility methods
  private parseJsonSafely(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private parseTagsSafely(tags: string): string[] {
    try {
      return JSON.parse(tags) || [];
    } catch {
      return [];
    }
  }

  private generateChecksum(content: string): string {
    // Simple checksum implementation
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private summarizeContent(content: unknown): string {
    if (typeof content === 'object' && content !== null) {
      const keys = Object.keys(content);
      return `[Compressed object with ${keys.length} keys: ${keys.slice(0, 3).join(', ')}...]`;
    }
    return String(content).substring(0, 100) + '...';
  }

  private async getNextVersionNumber(contextKey: string): Promise<number> {
    const existingVersions = this.versionCache.get(contextKey) || [];
    return existingVersions.length + 1;
  }

  private async getLatestVersionId(contextKey: string): Promise<string | undefined> {
    const existingVersions = this.versionCache.get(contextKey) || [];
    return existingVersions[0]?.versionId;
  }

  private async getLatestVersionNumber(contextKey: string): Promise<string> {
    const existingVersions = this.versionCache.get(contextKey) || [];
    return existingVersions[0]?.version.toString() || '1.0';
  }

  private async detectChanges(contextKey: string, newContent: unknown): Promise<string[]> {
    const existingVersions = this.versionCache.get(contextKey) || [];
    if (existingVersions.length === 0) {
      return ['Initial version'];
    }

    const lastVersion = existingVersions[0];
    const changes = [];

    // Simple change detection
    if (lastVersion && JSON.stringify(newContent) !== JSON.stringify(lastVersion.content)) {
      changes.push('Content modified');
    }

    return changes;
  }

  private extractFileReferences(content: unknown): string[] {
    const refs = [];
    const contentStr = JSON.stringify(content);
    
    // Look for file path patterns
    const filePatterns = [
      /[A-Za-z]:\\[^"\s]+\.[a-zA-Z0-9]+/g, // Windows paths
      /\/[^"\s]+\.[a-zA-Z0-9]+/g, // Unix paths
      /[^"\s]+\.(ts|js|json|md|txt|py|java|cpp|h)/g // File extensions
    ];

    for (const pattern of filePatterns) {
      const matches = contentStr.match(pattern);
      if (matches) {
        refs.push(...matches);
      }
    }

    return [...new Set(refs)]; // Remove duplicates
  }

  private extractContextReferences(content: unknown): string[] {
    const refs = [];
    const contentStr = JSON.stringify(content);
    
    // Look for context key patterns
    const contextPatterns = [
      /context_[a-zA-Z0-9_-]+/g,
      /task_[a-zA-Z0-9_-]+/g,
      /session_[a-zA-Z0-9_-]+/g
    ];

    for (const pattern of contextPatterns) {
      const matches = contentStr.match(pattern);
      if (matches) {
        refs.push(...matches);
      }
    }

    return [...new Set(refs)]; // Remove duplicates
  }

  private async isFileUpToDate(_filePath: string): Promise<boolean> {
    // Placeholder - would check actual file system
    return Math.random() > 0.3; // 70% chance file is up to date
  }

  private async isContextUpToDate(contextKey: string): Promise<boolean> {
    const context = await this.db.getEnhancedContext(contextKey);
    if (!context) return false;
    
    const ageHours = (Date.now() - context.updatedAt.getTime()) / (1000 * 60 * 60);
    return ageHours < 72; // Consider up to date if less than 3 days old
  }

  private async generateContextsForOperation(operation: string, filePath: string, options: any): Promise<string[]> {
    const contexts = [];
    
    // Generate operation-specific contexts
    const operationContext = `${operation}_context_${Date.now()}`;
    await this.db.storeContext(operationContext, {
      operation,
      filePath,
      timestamp: new Date().toISOString(),
      ...options
    }, 'file_operation_context');
    
    contexts.push(operationContext);
    return contexts;
  }

  private async linkFileOperationToContext(operationId: string, contextKey: string): Promise<void> {
    // Create relationship between file operation and generated context
    await this.db.storeContext(`link_${operationId}_${contextKey}`, {
      operationId,
      contextKey,
      linkedAt: new Date().toISOString()
    }, 'operation_context_link');
  }

  private async getFileChangeHistory(filePath: string, maxVersions: number): Promise<any[]> {
    // Placeholder implementation
    const history = [];
    for (let i = 0; i < Math.min(maxVersions, 5); i++) {
      history.push({
        version: i + 1,
        timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        checksum: this.generateChecksum(`${filePath}_v${i + 1}`),
        changes: [`Change ${i + 1} for ${filePath}`]
      });
    }
    return history;
  }

  private async findContextForFileChange(change: any): Promise<string | null> {
    // Look for existing context for this file change
    const query = `
      SELECT key FROM context_items 
      WHERE value LIKE ? AND context_type = 'file_change'
      LIMIT 1
    `;
    
    const results = await this.db.executeQuery(query, [`%${change.checksum}%`]) as any[];
    return results.length > 0 ? results[0].key : null;
  }

  private async consolidateFileContexts(versions: any[]): Promise<string> {
    const consolidated = versions.map(v => 
      `Version ${v.version} (${v.timestamp.toISOString()}): ${v.changes.join(', ')}`
    ).join('\n');
    
    return `File history consolidated from ${versions.length} versions:\n${consolidated}`;
  }
}
