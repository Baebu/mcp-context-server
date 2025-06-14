// Advanced Discovery Service for Cross-Chat and Multi-Modal Search
// File: src/application/services/advanced-discovery.service.ts

import { injectable, inject } from 'inversify';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import type { IEmbeddingService } from '../../core/interfaces/semantic-context.interface.js';
import { TokenTracker } from '../../utils/token-tracker.js';
import { logger } from '../../utils/logger.js';

export interface CrossChatSearchOptions {
  query: string;
  sessionIds?: string[];
  timeRange?: {
    from: Date;
    to: Date;
  };
  includeArchived?: boolean;
  similarity?: number;
  maxResults?: number;
}

export interface CrossChatSearchResult {
  contexts: Array<{
    key: string;
    sessionId: string;
    content: unknown;
    similarity: number;
    timestamp: Date;
    contextType: string;
    relevanceScore: number;
  }>;
  sessionSummary: Record<
    string,
    {
      contextCount: number;
      avgSimilarity: number;
      timeSpan: string;
    }
  >;
  totalMatches: number;
  searchMetadata: {
    query: string;
    searchTime: number;
    sessionsSearched: number;
  };
}

export interface MultiModalSearchOptions {
  textQuery?: string;
  semanticQuery?: string;
  structuralQuery?: {
    hasFields: string[];
    valuePatterns: Record<string, string>;
  };
  temporalQuery?: {
    createdAfter?: Date;
    updatedAfter?: Date;
    accessedAfter?: Date;
  };
  relationshipQuery?: {
    hasRelationships: boolean;
    relationshipTypes?: string[];
    relatedTo?: string[];
  };
  combineMode?: 'AND' | 'OR' | 'WEIGHTED';
  weights?: {
    text: number;
    semantic: number;
    structural: number;
    temporal: number;
    relationship: number;
  };
}

export interface TemporalContextSearchOptions {
  timeWindow: {
    start: Date;
    end: Date;
  };
  granularity: 'hour' | 'day' | 'week' | 'month';
  contextTypes?: string[];
  includeDeleted?: boolean;
  aggregateBy?: 'creation' | 'modification' | 'access';
}

export interface DependencySearchOptions {
  rootKey: string;
  direction: 'forward' | 'backward' | 'both';
  maxDepth: number;
  includeWeak?: boolean;
  relationshipTypes?: string[];
}

export interface IncompleteTaskFilter {
  sessionIds?: string[];
  minProgress?: number;
  maxAge?: number; // hours
  taskTypes?: string[];
  priorities?: string[];
}

// Session Intelligence Interfaces
export interface SessionBridgeOptions {
  sessionId: string;
  similarityThreshold?: number;
  maxBridges?: number;
  contextTypes?: string[];
  timeWindow?: number; // hours
}

export interface SessionBridge {
  sessionId: string;
  relatedSessionId: string;
  bridgeType: 'semantic' | 'temporal' | 'task_continuation' | 'project_related';
  strength: number;
  commonContexts: string[];
  summary: string;
}

export interface GlobalTaskTrackingOptions {
  includeCompleted?: boolean;
  sessionIds?: string[];
  taskTypes?: string[];
  priorities?: string[];
  timeRange?: {
    from: Date;
    to: Date;
  };
}

export interface GlobalTask {
  taskId: string;
  sessionId: string;
  title: string;
  description: string;
  progress: number;
  priority: string;
  status: 'active' | 'completed' | 'blocked' | 'cancelled';
  dependencies: string[];
  relatedTasks: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface ContextInheritanceOptions {
  sourceSessionId: string;
  targetSessionId: string;
  inheritanceTypes?: string[];
  maxContexts?: number;
  similarityThreshold?: number;
}

export interface WorkspaceContextSyncOptions {
  workspaceId: string;
  sessionIds?: string[];
  syncDirection?: 'to_workspace' | 'from_workspace' | 'bidirectional';
  contextTypes?: string[];
}

export interface ProjectStateSnapshot {
  snapshotId: string;
  projectId: string;
  sessionIds: string[];
  timestamp: Date;
  contexts: Array<{
    key: string;
    sessionId: string;
    contextType: string;
    summary: string;
  }>;
  tasks: GlobalTask[];
  relationships: Array<{
    source: string;
    target: string;
    type: string;
    strength: number;
  }>;
  metadata: {
    totalContexts: number;
    activeTasks: number;
    completedTasks: number;
    sessionCount: number;
  };
}

@injectable()
export class AdvancedDiscoveryService {
  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler,
    @inject('EmbeddingService') private embeddingService: IEmbeddingService
  ) {}

  /**
   * Search across multiple chat sessions with semantic understanding
   */
  async crossChatSearch(options: CrossChatSearchOptions): Promise<CrossChatSearchResult> {
    const startTime = Date.now();

    try {
      // Generate embedding for semantic search
      let queryEmbedding: number[] | undefined;
      try {
        queryEmbedding = await this.embeddingService.generateEmbedding(options.query);
      } catch (error) {
        logger.warn({ error }, 'Failed to generate query embedding, using text search only');
      }

      // Add session filter if provided
      let sessionFilter = '';
      const params: unknown[] = [];

      if (options.sessionIds && options.sessionIds.length > 0) {
        sessionFilter = ` AND (key LIKE '%session_%' AND (${options.sessionIds.map(_ => 'key LIKE ?').join(' OR ')}))`;
        params.push(...options.sessionIds.map(id => `%${id}%`));
      }

      // Time range filter
      let timeFilter = '';
      if (options.timeRange) {
        timeFilter = ' AND created_at BETWEEN ? AND ?';
        params.push(options.timeRange.from.toISOString(), options.timeRange.to.toISOString());
      }

      // Execute search query
      const searchQuery = `
        SELECT *,
               (CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as has_embedding
        FROM context_items
        WHERE (value LIKE ? OR semantic_tags LIKE ?)
        ${sessionFilter}
        ${timeFilter}
        ORDER BY updated_at DESC
        LIMIT ?
      `;

      const searchParams = [`%${options.query}%`, `%${options.query}%`, ...params, options.maxResults || 50];
      const rawResults = (await this.db.executeQuery(searchQuery, searchParams)) as any[];

      // Process results with semantic similarity if available
      const processedResults: CrossChatSearchResult['contexts'] = [];
      const sessionGroups = new Map<string, any[]>();

      for (const result of rawResults) {
        let similarity = 0.5; // Default similarity for text matches

        // Calculate semantic similarity if embeddings are available
        if (queryEmbedding && result.embedding) {
          try {
            const resultEmbedding = JSON.parse(result.embedding);
            similarity = this.calculateCosineSimilarity(queryEmbedding, resultEmbedding);
          } catch (error) {
            logger.debug({ error, key: result.key }, 'Failed to parse embedding for similarity calculation');
          }
        }

        // Filter by similarity threshold
        if (similarity < (options.similarity || 0.3)) {
          continue;
        }

        // Extract session ID
        const sessionId = this.extractSessionId(result.key, result.value);

        // Calculate relevance score
        const relevanceScore = this.calculateRelevanceScore(result, options.query, similarity);

        const processedResult = {
          key: result.key,
          sessionId,
          content: this.parseJsonSafelyAsObject(result.value),
          similarity,
          timestamp: new Date(result.updated_at),
          contextType: result.context_type || result.type,
          relevanceScore
        };

        processedResults.push(processedResult);

        // Group by session for summary
        if (!sessionGroups.has(sessionId)) {
          sessionGroups.set(sessionId, []);
        }
        sessionGroups.get(sessionId)!.push(processedResult);
      }

      // Sort by relevance score
      processedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Generate session summary
      const sessionSummary: Record<string, any> = {};
      for (const [sessionId, results] of sessionGroups.entries()) {
        const timestamps = results.map(r => r.timestamp.getTime());
        const avgSimilarity = results.reduce((sum, r) => sum + r.similarity, 0) / results.length;

        sessionSummary[sessionId] = {
          contextCount: results.length,
          avgSimilarity: Math.round(avgSimilarity * 100) / 100,
          timeSpan: this.formatTimeSpan(Math.min(...timestamps), Math.max(...timestamps))
        };
      }

      const searchResult: CrossChatSearchResult = {
        contexts: processedResults,
        sessionSummary,
        totalMatches: processedResults.length,
        searchMetadata: {
          query: options.query,
          searchTime: Date.now() - startTime,
          sessionsSearched: sessionGroups.size
        }
      };

      logger.info(
        {
          query: options.query,
          totalMatches: processedResults.length,
          sessionsSearched: sessionGroups.size,
          searchTime: Date.now() - startTime
        },
        'Cross-chat search completed'
      );

      return searchResult;
    } catch (error) {
      logger.error({ error, options }, 'Failed to execute cross-chat search');
      throw error;
    }
  }

  /**
   * Multi-modal search combining different search strategies
   */
  async multiModalSearch(options: MultiModalSearchOptions): Promise<any> {
    const startTime = Date.now();
    const results = new Map<string, any>();
    const scores = new Map<string, number>();

    try {
      // Text-based search
      if (options.textQuery) {
        const textResults = await this.executeTextSearch(options.textQuery);
        const weight = options.weights?.text || 1.0;

        for (const result of textResults) {
          results.set(result.key, result);
          scores.set(result.key, (scores.get(result.key) || 0) + result.score * weight);
        }
      }

      // Semantic search
      if (options.semanticQuery) {
        const semanticResults = await this.executeSemanticSearch(options.semanticQuery);
        const weight = options.weights?.semantic || 1.0;

        for (const result of semanticResults) {
          results.set(result.key, result);
          scores.set(result.key, (scores.get(result.key) || 0) + result.similarity * weight);
        }
      }

      // Structural search
      if (options.structuralQuery) {
        const structuralResults = await this.executeStructuralSearch(options.structuralQuery);
        const weight = options.weights?.structural || 1.0;

        for (const result of structuralResults) {
          results.set(result.key, result);
          scores.set(result.key, (scores.get(result.key) || 0) + weight);
        }
      }

      // Temporal search
      if (options.temporalQuery) {
        const temporalResults = await this.executeTemporalSearch(options.temporalQuery);
        const weight = options.weights?.temporal || 1.0;

        for (const result of temporalResults) {
          results.set(result.key, result);
          scores.set(result.key, (scores.get(result.key) || 0) + weight);
        }
      }

      // Relationship search
      if (options.relationshipQuery) {
        const relationshipResults = await this.executeRelationshipSearch(options.relationshipQuery);
        const weight = options.weights?.relationship || 1.0;

        for (const result of relationshipResults) {
          results.set(result.key, result);
          scores.set(result.key, (scores.get(result.key) || 0) + weight);
        }
      }

      // Combine results based on mode
      const combinedResults = Array.from(results.values()).map(result => ({
        ...result,
        combinedScore: scores.get(result.key) || 0
      }));

      // Filter based on combine mode
      let finalResults = combinedResults;
      if (options.combineMode === 'AND') {
        // Only include results that match multiple criteria
        const requiredCriteria = [
          options.textQuery,
          options.semanticQuery,
          options.structuralQuery,
          options.temporalQuery,
          options.relationshipQuery
        ].filter(Boolean).length;

        finalResults = combinedResults.filter(result => result.combinedScore >= requiredCriteria * 0.5);
      }

      // Sort by combined score
      finalResults.sort((a, b) => b.combinedScore - a.combinedScore);

      const response = {
        results: finalResults.slice(0, 50), // Limit results
        totalFound: finalResults.length,
        searchMetadata: {
          searchTime: Date.now() - startTime,
          modes: Object.keys(options).filter(key => options[key as keyof MultiModalSearchOptions] !== undefined),
          combineMode: options.combineMode || 'OR'
        },
        scoringBreakdown: {
          averageScore:
            finalResults.length > 0
              ? finalResults.reduce((sum, r) => sum + r.combinedScore, 0) / finalResults.length
              : 0,
          maxScore: Math.max(...finalResults.map(r => r.combinedScore), 0),
          minScore: Math.min(...finalResults.map(r => r.combinedScore), 0)
        }
      };

      logger.info(
        {
          modes: response.searchMetadata.modes.length,
          totalFound: finalResults.length,
          searchTime: response.searchMetadata.searchTime
        },
        'Multi-modal search completed'
      );

      return response;
    } catch (error) {
      logger.error({ error, options }, 'Failed to execute multi-modal search');
      throw error;
    }
  }

  /**
   * Search contexts within specific time windows with aggregation
   */
  async temporalContextSearch(options: TemporalContextSearchOptions): Promise<any> {
    try {
      const timeWindows = this.generateTimeWindows(options.timeWindow, options.granularity);
      const results = new Map<string, any[]>();

      for (const window of timeWindows) {
        const windowResults = await this.searchInTimeWindow(window, options);
        results.set(window.label, windowResults);
      }

      const aggregated = this.aggregateTemporalResults(results, options.aggregateBy || 'creation');

      const response = {
        timeWindows: Array.from(results.entries()).map(([label, contexts]) => ({
          period: label,
          contextCount: contexts.length,
          contexts: contexts.slice(0, 10), // Limit contexts per window
          summary: this.summarizeTimeWindow(contexts)
        })),
        aggregation: aggregated,
        totalContexts: Array.from(results.values()).flat().length,
        searchMetadata: {
          granularity: options.granularity,
          windowCount: timeWindows.length,
          timeSpan: this.formatTimeSpan(options.timeWindow.start.getTime(), options.timeWindow.end.getTime())
        }
      };

      logger.info(
        {
          granularity: options.granularity,
          windowCount: timeWindows.length,
          totalContexts: response.totalContexts
        },
        'Temporal context search completed'
      );

      return response;
    } catch (error) {
      logger.error({ error, options }, 'Failed to execute temporal context search');
      throw error;
    }
  }

  /**
   * Search for context dependencies and relationships
   */
  async dependencySearch(options: DependencySearchOptions): Promise<any> {
    try {
      const visited = new Set<string>();
      const dependencyTree = await this.buildDependencyTree(
        options.rootKey,
        options.direction,
        options.maxDepth,
        visited,
        options
      );

      const analysis = this.analyzeDependencyTree(dependencyTree);

      const response = {
        rootKey: options.rootKey,
        dependencyTree,
        analysis,
        searchMetadata: {
          direction: options.direction,
          maxDepth: options.maxDepth,
          totalNodes: analysis.totalNodes,
          maxBranchDepth: analysis.maxDepth
        }
      };

      logger.info(
        {
          rootKey: options.rootKey,
          totalNodes: analysis.totalNodes,
          maxDepth: analysis.maxDepth
        },
        'Dependency search completed'
      );

      return response;
    } catch (error) {
      logger.error({ error, options }, 'Failed to execute dependency search');
      throw error;
    }
  }

  /**
   * Filter and find incomplete tasks across sessions
   */
  async findIncompleteTasks(filter: IncompleteTaskFilter): Promise<any> {
    try {
      const query = this.buildIncompleteTaskQuery(filter);
      const results = (await this.db.executeQuery(query.sql, query.params)) as any[];

      const incompleteTasks = [];
      for (const result of results) {
        const context = this.parseJsonSafely(result.value);
        // Ensure context is an object before passing to TokenTracker
        const contextObj =
          typeof context === 'object' && context !== null ? (context as Record<string, unknown>) : { content: context };
        const analysis = TokenTracker.detectTaskCompletion(contextObj);

        if (!analysis.isComplete) {
          const task = {
            key: result.key,
            sessionId: this.extractSessionId(result.key, result.value),
            progress: analysis.completionPercentage,
            remainingTasks: analysis.remainingTasks,
            lastUpdated: new Date(result.updated_at),
            ageHours: Math.round((Date.now() - new Date(result.updated_at).getTime()) / (1000 * 60 * 60)),
            priority: this.extractPriority(context),
            contextType: result.context_type || result.type,
            summary: this.createTaskSummary(context)
          };

          incompleteTasks.push(task);
        }
      }

      // Sort by priority and age
      incompleteTasks.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
        const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;

        if (aPriority !== bPriority) {
          return bPriority - aPriority; // Higher priority first
        }

        return a.ageHours - b.ageHours; // Newer tasks first
      });

      const response = {
        incompleteTasks: incompleteTasks.slice(0, 50), // Limit results
        summary: {
          totalFound: incompleteTasks.length,
          byPriority: this.groupTasksByPriority(incompleteTasks),
          byAge: this.groupTasksByAge(incompleteTasks),
          averageProgress: Math.round(incompleteTasks.reduce((sum, t) => sum + t.progress, 0) / incompleteTasks.length)
        },
        recommendations: this.generateTaskRecommendations(incompleteTasks)
      };

      logger.info(
        {
          totalFound: incompleteTasks.length,
          averageProgress: response.summary.averageProgress
        },
        'Incomplete tasks search completed'
      );

      return response;
    } catch (error) {
      logger.error({ error, filter }, 'Failed to find incomplete tasks');
      throw error;
    }
  }

  // Private helper methods

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aValue = a[i] || 0;
      const bValue = b[i] || 0;
      dotProduct += aValue * bValue;
      normA += aValue * aValue;
      normB += bValue * bValue;
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private extractSessionId(key: string, value: string): string {
    // Try to extract session ID from key
    const keyMatch = key.match(/session_([a-zA-Z0-9_-]+)/);
    if (keyMatch && keyMatch[1]) return keyMatch[1];

    // Try to extract from value
    try {
      const parsed = JSON.parse(value);
      if (parsed.sessionId || parsed.session_id) {
        return parsed.sessionId || parsed.session_id;
      }
    } catch {
      // Ignore parse errors
    }

    return 'unknown';
  }

  private calculateRelevanceScore(result: any, query: string, similarity: number): number {
    let score = similarity * 100;

    // Boost score for recent contexts
    const ageHours = (Date.now() - new Date(result.updated_at).getTime()) / (1000 * 60 * 60);
    if (ageHours < 24) {
      score += 10;
    } else if (ageHours < 168) {
      // 1 week
      score += 5;
    }

    // Boost score for certain context types
    const contextType = result.context_type || result.type;
    if (contextType === 'task' || contextType === 'checkpoint') {
      score += 5;
    }

    // Boost score for query matches in key
    if (result.key.toLowerCase().includes(query.toLowerCase())) {
      score += 15;
    }

    return Math.round(score);
  }

  private parseJsonSafely(value: string): Record<string, unknown> | string {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : value;
    } catch {
      return value;
    }
  }

  private parseJsonSafelyAsObject(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private formatTimeSpan(startMs: number, endMs: number): string {
    const diffMs = endMs - startMs;
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    if (diffHours < 24) {
      return `${diffHours} hours`;
    } else if (diffHours < 168) {
      return `${Math.round(diffHours / 24)} days`;
    } else {
      return `${Math.round(diffHours / 168)} weeks`;
    }
  }

  private async executeTextSearch(query: string): Promise<any[]> {
    const results = (await this.db.executeQuery(
      'SELECT * FROM context_items WHERE value LIKE ? ORDER BY updated_at DESC LIMIT 50',
      [`%${query}%`]
    )) as any[];

    return results.map(r => ({
      key: r.key,
      content: this.parseJsonSafely(r.value),
      score: 0.8, // Fixed score for text matches
      searchType: 'text'
    }));
  }

  private async executeSemanticSearch(_query: string): Promise<any[]> {
    // This would use the semantic search functionality
    // For now, return empty array as placeholder
    return [];
  }

  private async executeStructuralSearch(_structuralQuery: any): Promise<any[]> {
    // Implement structural search logic
    return [];
  }

  private async executeTemporalSearch(_temporalQuery: any): Promise<any[]> {
    // Implement temporal search logic
    return [];
  }

  private async executeRelationshipSearch(_relationshipQuery: any): Promise<any[]> {
    // Implement relationship search logic
    return [];
  }

  private generateTimeWindows(
    timeWindow: { start: Date; end: Date },
    granularity: string
  ): Array<{ start: Date; end: Date; label: string }> {
    const windows = [];
    const start = new Date(timeWindow.start);
    const end = new Date(timeWindow.end);

    // Simple implementation - create fixed windows
    const windowSize =
      granularity === 'hour'
        ? 3600000
        : granularity === 'day'
          ? 86400000
          : granularity === 'week'
            ? 604800000
            : 2592000000; // month

    let current = start;
    let index = 0;

    while (current < end && index < 100) {
      // Limit windows
      const windowEnd = new Date(Math.min(current.getTime() + windowSize, end.getTime()));
      windows.push({
        start: new Date(current),
        end: windowEnd,
        label: `${granularity}_${index}`
      });
      current = windowEnd;
      index++;
    }

    return windows;
  }

  private async searchInTimeWindow(window: any, options: TemporalContextSearchOptions): Promise<any[]> {
    const query = `
      SELECT * FROM context_items
      WHERE created_at BETWEEN ? AND ?
      ${options.contextTypes ? 'AND context_type IN (' + options.contextTypes.map(() => '?').join(',') + ')' : ''}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const params = [window.start.toISOString(), window.end.toISOString()];
    if (options.contextTypes) {
      params.push(...options.contextTypes);
    }

    const results = (await this.db.executeQuery(query, params)) as any[];
    return results.map(r => ({
      key: r.key,
      content: this.parseJsonSafely(r.value),
      timestamp: new Date(r.created_at),
      contextType: r.context_type || r.type
    }));
  }

  private aggregateTemporalResults(results: Map<string, any[]>, aggregateBy: string): any {
    // Simple aggregation implementation
    const total = Array.from(results.values()).flat().length;
    const byPeriod = Array.from(results.entries()).map(([period, contexts]) => ({
      period,
      count: contexts.length
    }));

    return {
      total,
      byPeriod,
      aggregateBy
    };
  }

  private summarizeTimeWindow(contexts: any[]): any {
    return {
      contextCount: contexts.length,
      contextTypes: [...new Set(contexts.map(c => c.contextType))],
      timeSpan:
        contexts.length > 0
          ? this.formatTimeSpan(
              Math.min(...contexts.map(c => c.timestamp.getTime())),
              Math.max(...contexts.map(c => c.timestamp.getTime()))
            )
          : '0 hours'
    };
  }

  private async buildDependencyTree(
    rootKey: string,
    direction: string,
    maxDepth: number,
    visited: Set<string>,
    options: DependencySearchOptions,
    currentDepth: number = 0
  ): Promise<any> {
    if (currentDepth >= maxDepth || visited.has(rootKey)) {
      return null;
    }

    visited.add(rootKey);

    // Get context
    const context = await this.db.getEnhancedContext(rootKey);
    if (!context) {
      return null;
    }

    // Get relationships
    const relationships = await this.db.getRelationships(rootKey);

    const node = {
      key: rootKey,
      depth: currentDepth,
      context: {
        type: context.contextType,
        updated: context.updatedAt
      },
      dependencies: [] as Array<{
        relationship: string;
        strength: number;
        node: any;
      }>
    };

    // Build child nodes
    for (const rel of relationships) {
      if (options.relationshipTypes && !options.relationshipTypes.includes(rel.relationshipType)) {
        continue;
      }

      if (!options.includeWeak && (rel.strength || 1.0) < 0.5) {
        continue;
      }

      // For ContextRelationship, the targetKey is the related item
      const targetKey = rel.targetKey;
      const childNode = await this.buildDependencyTree(
        targetKey,
        direction,
        maxDepth,
        visited,
        options,
        currentDepth + 1
      );

      if (childNode) {
        node.dependencies.push({
          relationship: rel.relationshipType,
          strength: rel.strength || 1.0,
          node: childNode
        });
      }
    }

    return node;
  }

  private analyzeDependencyTree(tree: any): any {
    if (!tree) {
      return { totalNodes: 0, maxDepth: 0, relationshipTypes: [] };
    }

    const analysis = {
      totalNodes: 1,
      maxDepth: tree.depth,
      relationshipTypes: new Set<string>()
    };

    const traverse = (node: any) => {
      if (node.depth > analysis.maxDepth) {
        analysis.maxDepth = node.depth;
      }

      for (const dep of node.dependencies) {
        analysis.relationshipTypes.add(dep.relationship);
        analysis.totalNodes++;
        traverse(dep.node);
      }
    };

    traverse(tree);

    return {
      ...analysis,
      relationshipTypes: Array.from(analysis.relationshipTypes)
    };
  }

  private buildIncompleteTaskQuery(filter: IncompleteTaskFilter): { sql: string; params: unknown[] } {
    let sql = `
      SELECT * FROM context_items
      WHERE (context_type = 'task' OR type = 'task' OR key LIKE '%task%')
    `;
    const params: unknown[] = [];

    if (filter.sessionIds && filter.sessionIds.length > 0) {
      sql += ` AND (${filter.sessionIds.map(() => 'key LIKE ?').join(' OR ')})`;
      params.push(...filter.sessionIds.map(id => `%${id}%`));
    }

    if (filter.maxAge) {
      sql += ` AND updated_at > ?`;
      params.push(new Date(Date.now() - filter.maxAge * 60 * 60 * 1000).toISOString());
    }

    sql += ` ORDER BY updated_at DESC LIMIT 100`;

    return { sql, params };
  }

  private extractPriority(context: any): string {
    if (typeof context === 'object' && context !== null) {
      return context.priority || context.urgency || 'medium';
    }
    return 'medium';
  }

  private createTaskSummary(context: any): string {
    if (typeof context === 'object' && context !== null) {
      return context.summary || context.description || context.name || 'Task';
    }
    return 'Task';
  }

  private groupTasksByPriority(tasks: any[]): Record<string, number> {
    return tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {});
  }

  private groupTasksByAge(tasks: any[]): Record<string, number> {
    return tasks.reduce((acc, task) => {
      const ageGroup = task.ageHours < 24 ? 'recent' : task.ageHours < 168 ? 'week' : 'old';
      acc[ageGroup] = (acc[ageGroup] || 0) + 1;
      return acc;
    }, {});
  }

  private generateTaskRecommendations(tasks: any[]): string[] {
    const recommendations = [];

    const highPriorityTasks = tasks.filter(t => t.priority === 'high').length;
    if (highPriorityTasks > 0) {
      recommendations.push(`${highPriorityTasks} high priority tasks need attention`);
    }

    const staleTasks = tasks.filter(t => t.ageHours > 168).length;
    if (staleTasks > 0) {
      recommendations.push(`${staleTasks} tasks are over a week old - consider review or archival`);
    }

    const lowProgressTasks = tasks.filter(t => t.progress < 25).length;
    if (lowProgressTasks > 0) {
      recommendations.push(
        `${lowProgressTasks} tasks have very low progress - may need resources or re-prioritization`
      );
    }

    return recommendations;
  }

  // ===== SESSION INTELLIGENCE METHODS =====

  /**
   * Find session bridges - connections between related sessions
   */
  async findSessionBridges(options: SessionBridgeOptions): Promise<SessionBridge[]> {
    try {
      const bridges: SessionBridge[] = [];

      // Get contexts from the target session
      const sessionContexts = await this.getSessionContexts(options.sessionId);
      if (sessionContexts.length === 0) {
        return bridges;
      }

      // Get all other sessions within time window
      const timeWindow = options.timeWindow || 168; // 1 week default
      const cutoffTime = new Date(Date.now() - timeWindow * 60 * 60 * 1000);

      const otherSessionsQuery = `
        SELECT DISTINCT
          CASE
            WHEN key LIKE '%session_%' THEN SUBSTR(key, INSTR(key, 'session_') + 8)
            ELSE 'unknown'
          END as session_id,
          COUNT(*) as context_count,
          MAX(updated_at) as last_activity
        FROM context_items
        WHERE updated_at > ?
        AND (key LIKE '%session_%' OR value LIKE '%sessionId%')
        GROUP BY session_id
        HAVING session_id != ? AND session_id != 'unknown'
        ORDER BY last_activity DESC
        LIMIT 20
      `;

      const otherSessions = (await this.db.executeQuery(otherSessionsQuery, [
        cutoffTime.toISOString(),
        options.sessionId
      ])) as any[];

      // Check each other session for bridges
      for (const otherSession of otherSessions) {
        const otherContexts = await this.getSessionContexts(otherSession.session_id);

        // Find semantic bridges
        const semanticBridge = await this.findSemanticBridge(
          options.sessionId,
          otherSession.session_id,
          sessionContexts,
          otherContexts,
          options.similarityThreshold || 0.6
        );

        if (semanticBridge) {
          bridges.push(semanticBridge);
        }

        // Find task continuation bridges
        const taskBridge = await this.findTaskContinuationBridge(
          options.sessionId,
          otherSession.session_id,
          sessionContexts,
          otherContexts
        );

        if (taskBridge) {
          bridges.push(taskBridge);
        }

        // Find temporal bridges (sessions close in time with related activity)
        const temporalBridge = await this.findTemporalBridge(
          options.sessionId,
          otherSession.session_id,
          sessionContexts,
          otherContexts
        );

        if (temporalBridge) {
          bridges.push(temporalBridge);
        }
      }

      // Sort by strength and limit results
      bridges.sort((a, b) => b.strength - a.strength);
      return bridges.slice(0, options.maxBridges || 10);
    } catch (error) {
      logger.error({ error, options }, 'Failed to find session bridges');
      throw error;
    }
  }

  /**
   * Global task tracking across all sessions
   */
  async trackGlobalTasks(options: GlobalTaskTrackingOptions): Promise<{
    tasks: GlobalTask[];
    summary: any;
    insights: string[];
  }> {
    try {
      const tasks: GlobalTask[] = [];

      // Build query for task contexts
      let query = `
        SELECT * FROM context_items
        WHERE (context_type = 'task' OR type = 'task' OR key LIKE '%task%' OR value LIKE '%task%')
      `;
      const params: unknown[] = [];

      // Add session filter
      if (options.sessionIds && options.sessionIds.length > 0) {
        query += ` AND (${options.sessionIds.map(() => 'key LIKE ?').join(' OR ')})`;
        params.push(...options.sessionIds.map(id => `%${id}%`));
      }

      // Add time range filter
      if (options.timeRange) {
        query += ` AND created_at BETWEEN ? AND ?`;
        params.push(options.timeRange.from.toISOString(), options.timeRange.to.toISOString());
      }

      query += ` ORDER BY updated_at DESC LIMIT 200`;

      const results = (await this.db.executeQuery(query, params)) as any[];

      // Process each result into GlobalTask format
      for (const result of results) {
        const context = this.parseJsonSafelyAsObject(result.value);
        const taskAnalysis = TokenTracker.detectTaskCompletion(context);

        // Skip completed tasks if not requested
        if (!options.includeCompleted && taskAnalysis.isComplete) {
          continue;
        }

        // Filter by priority if specified
        const priority = this.extractPriority(context);
        if (options.priorities && !options.priorities.includes(priority)) {
          continue;
        }

        // Find related tasks
        const relatedTasks = await this.findRelatedTasks(result.key, context);

        const globalTask: GlobalTask = {
          taskId: result.key,
          sessionId: this.extractSessionId(result.key, result.value),
          title: this.extractTaskTitle(context),
          description: this.extractTaskDescription(context),
          progress: taskAnalysis.completionPercentage,
          priority,
          status: this.determineTaskStatus(context, taskAnalysis),
          dependencies: this.extractTaskDependencies(context),
          relatedTasks,
          createdAt: new Date(result.created_at),
          updatedAt: new Date(result.updated_at),
          completedAt: taskAnalysis.isComplete ? new Date(result.updated_at) : undefined
        };

        tasks.push(globalTask);
      }

      // Generate summary and insights
      const summary = this.generateTaskSummary(tasks);
      const insights = this.generateTaskInsights(tasks);

      logger.info(
        {
          totalTasks: tasks.length,
          activeTasks: summary.activeTasks,
          completedTasks: summary.completedTasks
        },
        'Global task tracking completed'
      );

      return { tasks, summary, insights };
    } catch (error) {
      logger.error({ error, options }, 'Failed to track global tasks');
      throw error;
    }
  }

  /**
   * Context inheritance between sessions
   */
  async inheritContext(options: ContextInheritanceOptions): Promise<{
    inherited: Array<{
      sourceKey: string;
      targetKey: string;
      contextType: string;
      inheritanceType: string;
    }>;
    summary: {
      total: number;
      byType: Record<string, number>;
      byInheritanceType: Record<string, number>;
    };
  }> {
    try {
      // Get source session contexts
      const sourceContexts = await this.getSessionContexts(options.sourceSessionId);

      // Filter by inheritance types if specified
      let contextsToInherit = sourceContexts;
      if (options.inheritanceTypes && options.inheritanceTypes.length > 0) {
        contextsToInherit = sourceContexts.filter(ctx => {
          const contextType = ctx.context_type || ctx.type;
          return options.inheritanceTypes!.includes(contextType);
        });
      }

      // Sort by relevance and limit
      contextsToInherit.sort((a, b) => {
        const aTime = new Date(a.updated_at).getTime();
        const bTime = new Date(b.updated_at).getTime();
        return bTime - aTime; // Most recent first
      });

      if (options.maxContexts) {
        contextsToInherit = contextsToInherit.slice(0, options.maxContexts);
      }

      const inherited = [];
      const summary = {
        total: 0,
        byType: {} as Record<string, number>,
        byInheritanceType: {} as Record<string, number>
      };

      // Process each context for inheritance
      for (const sourceContext of contextsToInherit) {
        const contextType = sourceContext.context_type || sourceContext.type || 'unknown';

        // Determine inheritance type
        const inheritanceType = this.determineInheritanceType(sourceContext);

        // Create inherited context key
        const targetKey = `inherited_${options.targetSessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create inherited context
        const parsedContext = this.parseJsonSafely(sourceContext.value);
        const inheritedContext = {
          ...(typeof parsedContext === 'object' ? (parsedContext as Record<string, unknown>) : {}),
          _inheritedFrom: sourceContext.key,
          _inheritedAt: new Date().toISOString(),
          _inheritanceType: inheritanceType,
          _sourceSessionId: options.sourceSessionId,
          _targetSessionId: options.targetSessionId
        };

        // Store inherited context
        await this.db.storeContext(targetKey, inheritedContext, contextType);

        // Create relationship
        await this.db.createRelationship(sourceContext.key, targetKey, 'inherited_to', 0.9);

        inherited.push({
          sourceKey: sourceContext.key,
          targetKey,
          contextType,
          inheritanceType
        });

        // Update summary
        summary.total++;
        summary.byType[contextType] = (summary.byType[contextType] || 0) + 1;
        summary.byInheritanceType[inheritanceType] = (summary.byInheritanceType[inheritanceType] || 0) + 1;
      }

      logger.info(
        {
          sourceSessionId: options.sourceSessionId,
          targetSessionId: options.targetSessionId,
          inherited: summary.total
        },
        'Context inheritance completed'
      );

      return { inherited, summary };
    } catch (error) {
      logger.error({ error, options }, 'Failed to inherit context');
      throw error;
    }
  }

  /**
   * Workspace context synchronization
   */
  async syncWorkspaceContext(options: WorkspaceContextSyncOptions): Promise<{
    synced: Array<{
      contextKey: string;
      syncDirection: string;
      workspaceId: string;
      sessionId?: string;
    }>;
    summary: {
      total: number;
      toWorkspace: number;
      fromWorkspace: number;
      bidirectional: number;
    };
  }> {
    try {
      const synced = [];
      const summary = {
        total: 0,
        toWorkspace: 0,
        fromWorkspace: 0,
        bidirectional: 0
      };

      // Get workspace contexts
      const workspaceQuery = `
        SELECT * FROM context_items
        WHERE key LIKE ? OR value LIKE ?
        ORDER BY updated_at DESC
      `;

      const workspaceContexts = (await this.db.executeQuery(workspaceQuery, [
        `%workspace_${options.workspaceId}%`,
        `%"workspaceId":"${options.workspaceId}"%`
      ])) as any[];

      // Get session contexts if specified
      let sessionContexts: any[] = [];
      if (options.sessionIds && options.sessionIds.length > 0) {
        for (const sessionId of options.sessionIds) {
          const sessionCtx = await this.getSessionContexts(sessionId);
          sessionContexts.push(...sessionCtx);
        }
      }

      // Sync based on direction
      if (options.syncDirection === 'to_workspace' || options.syncDirection === 'bidirectional') {
        // Sync from sessions to workspace
        for (const sessionContext of sessionContexts) {
          const contextType = sessionContext.context_type || sessionContext.type;

          // Filter by context types if specified
          if (options.contextTypes && !options.contextTypes.includes(contextType)) {
            continue;
          }

          // Create workspace context
          const workspaceKey = `workspace_${options.workspaceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const parsedSessionContext = this.parseJsonSafely(sessionContext.value);
          const workspaceContext = {
            ...(typeof parsedSessionContext === 'object' ? (parsedSessionContext as Record<string, unknown>) : {}),
            _syncedFrom: sessionContext.key,
            _syncedAt: new Date().toISOString(),
            _workspaceId: options.workspaceId,
            _sessionId: this.extractSessionId(sessionContext.key, sessionContext.value)
          };

          await this.db.storeContext(workspaceKey, workspaceContext, contextType);

          synced.push({
            contextKey: workspaceKey,
            syncDirection: 'to_workspace',
            workspaceId: options.workspaceId,
            sessionId: workspaceContext._sessionId
          });

          summary.total++;
          summary.toWorkspace++;
        }
      }

      if (options.syncDirection === 'from_workspace' || options.syncDirection === 'bidirectional') {
        // Sync from workspace to sessions
        for (const workspaceContext of workspaceContexts) {
          const contextType = workspaceContext.context_type || workspaceContext.type;

          // Filter by context types if specified
          if (options.contextTypes && !options.contextTypes.includes(contextType)) {
            continue;
          }

          // If specific sessions are specified, sync to those
          const targetSessions = options.sessionIds || ['current'];

          for (const sessionId of targetSessions) {
            const sessionKey = `session_${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const parsedWorkspaceContext = this.parseJsonSafely(workspaceContext.value);
            const sessionContext = {
              ...(typeof parsedWorkspaceContext === 'object'
                ? (parsedWorkspaceContext as Record<string, unknown>)
                : {}),
              _syncedFrom: workspaceContext.key,
              _syncedAt: new Date().toISOString(),
              _workspaceId: options.workspaceId,
              _sessionId: sessionId
            };

            await this.db.storeContext(sessionKey, sessionContext, contextType);

            synced.push({
              contextKey: sessionKey,
              syncDirection: 'from_workspace',
              workspaceId: options.workspaceId,
              sessionId
            });

            summary.total++;
            summary.fromWorkspace++;
          }
        }
      }

      if (options.syncDirection === 'bidirectional') {
        summary.bidirectional = summary.toWorkspace + summary.fromWorkspace;
      }

      logger.info(
        {
          workspaceId: options.workspaceId,
          syncDirection: options.syncDirection,
          synced: summary.total
        },
        'Workspace context sync completed'
      );

      return { synced, summary };
    } catch (error) {
      logger.error({ error, options }, 'Failed to sync workspace context');
      throw error;
    }
  }

  /**
   * Create project state snapshot
   */
  async createProjectStateSnapshot(projectId: string, sessionIds: string[]): Promise<ProjectStateSnapshot> {
    try {
      const snapshotId = `snapshot_${projectId}_${Date.now()}`;
      const timestamp = new Date();

      // Collect all contexts from specified sessions
      const contexts = [];
      const tasks = [];
      const relationships = [];

      for (const sessionId of sessionIds) {
        // Get session contexts
        const sessionContexts = await this.getSessionContexts(sessionId);

        for (const context of sessionContexts) {
          const contextType = context.context_type || context.type || 'unknown';

          contexts.push({
            key: context.key,
            sessionId,
            contextType,
            summary: this.createContextSummary(context)
          });

          // Extract tasks
          if (contextType === 'task' || context.key.includes('task')) {
            const taskData = this.parseJsonSafelyAsObject(context.value);
            const taskAnalysis = TokenTracker.detectTaskCompletion(taskData);

            const globalTask: GlobalTask = {
              taskId: context.key,
              sessionId,
              title: this.extractTaskTitle(taskData),
              description: this.extractTaskDescription(taskData),
              progress: taskAnalysis.completionPercentage,
              priority: this.extractPriority(taskData),
              status: this.determineTaskStatus(taskData, taskAnalysis),
              dependencies: this.extractTaskDependencies(taskData),
              relatedTasks: await this.findRelatedTasks(context.key, taskData),
              createdAt: new Date(context.created_at),
              updatedAt: new Date(context.updated_at),
              completedAt: taskAnalysis.isComplete ? new Date(context.updated_at) : undefined
            };

            tasks.push(globalTask);
          }
        }

        // Get relationships for this session
        const sessionRelationships = await this.getSessionRelationships(sessionId);
        relationships.push(...sessionRelationships);
      }

      // Calculate metadata
      const activeTasks = tasks.filter(t => t.status === 'active').length;
      const completedTasks = tasks.filter(t => t.status === 'completed').length;

      const snapshot: ProjectStateSnapshot = {
        snapshotId,
        projectId,
        sessionIds,
        timestamp,
        contexts,
        tasks,
        relationships,
        metadata: {
          totalContexts: contexts.length,
          activeTasks,
          completedTasks,
          sessionCount: sessionIds.length
        }
      };

      // Store the snapshot
      await this.db.storeContext(snapshotId, snapshot, 'project_snapshot');

      logger.info(
        {
          snapshotId,
          projectId,
          sessionCount: sessionIds.length,
          totalContexts: contexts.length,
          activeTasks,
          completedTasks
        },
        'Project state snapshot created'
      );

      return snapshot;
    } catch (error) {
      logger.error({ error, projectId, sessionIds }, 'Failed to create project state snapshot');
      throw error;
    }
  }

  // ===== SESSION INTELLIGENCE HELPER METHODS =====

  private async getSessionContexts(sessionId: string): Promise<any[]> {
    const query = `
      SELECT * FROM context_items
      WHERE key LIKE ? OR value LIKE ?
      ORDER BY updated_at DESC
      LIMIT 100
    `;

    return (await this.db.executeQuery(query, [`%session_${sessionId}%`, `%"sessionId":"${sessionId}"%`])) as any[];
  }

  private async findSemanticBridge(
    sessionId: string,
    otherSessionId: string,
    sessionContexts: any[],
    otherContexts: any[],
    threshold: number
  ): Promise<SessionBridge | null> {
    const commonContexts = [];
    let totalSimilarity = 0;
    let comparisons = 0;

    // Compare contexts for semantic similarity
    for (const context1 of sessionContexts.slice(0, 10)) {
      // Limit for performance
      for (const context2 of otherContexts.slice(0, 10)) {
        try {
          const similarity = await this.calculateContextSimilarity(context1, context2);
          if (similarity >= threshold) {
            commonContexts.push(context1.key);
            totalSimilarity += similarity;
            comparisons++;
          }
        } catch (error) {
          // Skip if similarity calculation fails
          continue;
        }
      }
    }

    if (commonContexts.length === 0) {
      return null;
    }

    const averageSimilarity = totalSimilarity / comparisons;

    return {
      sessionId,
      relatedSessionId: otherSessionId,
      bridgeType: 'semantic',
      strength: averageSimilarity,
      commonContexts,
      summary: `Semantic similarity found with ${commonContexts.length} related contexts`
    };
  }

  private async findTaskContinuationBridge(
    sessionId: string,
    otherSessionId: string,
    sessionContexts: any[],
    otherContexts: any[]
  ): Promise<SessionBridge | null> {
    const taskContexts = sessionContexts.filter(ctx => {
      const type = ctx.context_type || ctx.type;
      return type === 'task' || ctx.key.includes('task');
    });

    const otherTaskContexts = otherContexts.filter(ctx => {
      const type = ctx.context_type || ctx.type;
      return type === 'task' || ctx.key.includes('task');
    });

    if (taskContexts.length === 0 || otherTaskContexts.length === 0) {
      return null;
    }

    const continuationContexts = [];
    let strength = 0;

    // Look for task continuation patterns
    for (const task1 of taskContexts) {
      const task1Data = this.parseJsonSafely(task1.value);
      const task1Title = this.extractTaskTitle(task1Data);

      for (const task2 of otherTaskContexts) {
        const task2Data = this.parseJsonSafely(task2.value);
        const task2Title = this.extractTaskTitle(task2Data);

        // Check for title similarity or continuation keywords
        if (this.isTaskContinuation(task1Title, task2Title, task1Data, task2Data)) {
          continuationContexts.push(task1.key);
          strength += 0.8;
        }
      }
    }

    if (continuationContexts.length === 0) {
      return null;
    }

    return {
      sessionId,
      relatedSessionId: otherSessionId,
      bridgeType: 'task_continuation',
      strength: Math.min(strength, 1.0),
      commonContexts: continuationContexts,
      summary: `Task continuation found with ${continuationContexts.length} related tasks`
    };
  }

  private async findTemporalBridge(
    sessionId: string,
    otherSessionId: string,
    sessionContexts: any[],
    otherContexts: any[]
  ): Promise<SessionBridge | null> {
    if (sessionContexts.length === 0 || otherContexts.length === 0) {
      return null;
    }

    // Get time ranges for both sessions
    const sessionTimes = sessionContexts.map(ctx => new Date(ctx.updated_at).getTime());
    const otherTimes = otherContexts.map(ctx => new Date(ctx.updated_at).getTime());

    const sessionStart = Math.min(...sessionTimes);
    const sessionEnd = Math.max(...sessionTimes);
    const otherStart = Math.min(...otherTimes);
    const otherEnd = Math.max(...otherTimes);

    // Check for temporal overlap or proximity
    const overlap = Math.max(0, Math.min(sessionEnd, otherEnd) - Math.max(sessionStart, otherStart));
    const sessionDuration = sessionEnd - sessionStart;
    const otherDuration = otherEnd - otherStart;
    const totalDuration = Math.max(sessionDuration, otherDuration);

    if (totalDuration === 0) {
      return null;
    }

    const overlapRatio = overlap / totalDuration;

    // Also check for sessions that are close in time (within 1 hour)
    const timeDiff = Math.abs(sessionStart - otherStart);
    const proximityScore = Math.max(0, 1 - timeDiff / (60 * 60 * 1000)); // 1 hour proximity

    const strength = Math.max(overlapRatio, proximityScore);

    if (strength < 0.3) {
      return null;
    }

    return {
      sessionId,
      relatedSessionId: otherSessionId,
      bridgeType: 'temporal',
      strength,
      commonContexts: [],
      summary: `Temporal relationship found with ${Math.round(strength * 100)}% time correlation`
    };
  }

  private async calculateContextSimilarity(context1: any, context2: any): Promise<number> {
    // Simple text-based similarity for now
    const text1 = JSON.stringify(this.parseJsonSafely(context1.value)).toLowerCase();
    const text2 = JSON.stringify(this.parseJsonSafely(context2.value)).toLowerCase();

    // Calculate Jaccard similarity
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private async findRelatedTasks(taskKey: string, taskData: any): Promise<string[]> {
    // Simple implementation - look for tasks with similar titles or mentioned dependencies
    const taskTitle = this.extractTaskTitle(taskData);
    const query = `
      SELECT key FROM context_items
      WHERE (context_type = 'task' OR type = 'task' OR key LIKE '%task%')
      AND key != ?
      AND value LIKE ?
      LIMIT 10
    `;

    const results = (await this.db.executeQuery(query, [taskKey, `%${taskTitle}%`])) as any[];
    return results.map(r => r.key);
  }

  private extractTaskTitle(taskData: any): string {
    if (typeof taskData === 'object' && taskData !== null) {
      return taskData.title || taskData.name || taskData.summary || 'Untitled Task';
    }
    return 'Untitled Task';
  }

  private extractTaskDescription(taskData: any): string {
    if (typeof taskData === 'object' && taskData !== null) {
      return taskData.description || taskData.details || taskData.summary || '';
    }
    return '';
  }

  private extractTaskDependencies(taskData: any): string[] {
    if (typeof taskData === 'object' && taskData !== null) {
      return taskData.dependencies || taskData.blockedBy || [];
    }
    return [];
  }

  private determineTaskStatus(taskData: any, taskAnalysis: any): 'active' | 'completed' | 'blocked' | 'cancelled' {
    if (taskAnalysis.isComplete) {
      return 'completed';
    }

    if (typeof taskData === 'object' && taskData !== null) {
      const status = taskData.status || taskData.state;
      if (status === 'blocked' || status === 'cancelled') {
        return status;
      }
    }

    return 'active';
  }

  private generateTaskSummary(tasks: GlobalTask[]): any {
    const summary = {
      total: tasks.length,
      activeTasks: tasks.filter(t => t.status === 'active').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      blockedTasks: tasks.filter(t => t.status === 'blocked').length,
      byPriority: this.groupTasksByPriority(tasks),
      bySession: tasks.reduce(
        (acc, task) => {
          acc[task.sessionId] = (acc[task.sessionId] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      averageProgress: Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length)
    };

    return summary;
  }

  private generateTaskInsights(tasks: GlobalTask[]): string[] {
    const insights = [];

    const highPriorityActive = tasks.filter(t => t.priority === 'high' && t.status === 'active').length;
    if (highPriorityActive > 0) {
      insights.push(`${highPriorityActive} high-priority tasks are currently active`);
    }

    const blockedTasks = tasks.filter(t => t.status === 'blocked').length;
    if (blockedTasks > 0) {
      insights.push(`${blockedTasks} tasks are blocked and need attention`);
    }

    const nearCompletionTasks = tasks.filter(t => t.progress > 80 && t.status === 'active').length;
    if (nearCompletionTasks > 0) {
      insights.push(`${nearCompletionTasks} tasks are near completion (>80% progress)`);
    }

    const stalledTasks = tasks.filter(t => {
      const daysSinceUpdate = (Date.now() - t.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
      return t.status === 'active' && daysSinceUpdate > 7;
    }).length;

    if (stalledTasks > 0) {
      insights.push(`${stalledTasks} tasks haven't been updated in over a week`);
    }

    const sessionCount = new Set(tasks.map(t => t.sessionId)).size;
    insights.push(`Tasks are spread across ${sessionCount} different sessions`);

    return insights;
  }

  private determineInheritanceType(context: any): string {
    const contextType = context.context_type || context.type;

    if (contextType === 'task') return 'task_inheritance';
    if (contextType === 'knowledge' || contextType === 'reference') return 'knowledge_inheritance';
    if (contextType === 'checkpoint' || contextType === 'state') return 'state_inheritance';
    if (contextType === 'decision' || contextType === 'outcome') return 'decision_inheritance';

    return 'general_inheritance';
  }

  private createContextSummary(context: any): string {
    const contextData = this.parseJsonSafely(context.value);
    if (typeof contextData === 'object' && contextData !== null) {
      const data = contextData as Record<string, unknown>;
      return (data.summary as string) || (data.description as string) || (data.title as string) || 'Context';
    }
    return 'Context';
  }

  private async getSessionRelationships(sessionId: string): Promise<
    Array<{
      source: string;
      target: string;
      type: string;
      strength: number;
    }>
  > {
    const query = `
      SELECT source_key, target_key, relationship_type, strength
      FROM context_relationships
      WHERE source_key LIKE ? OR target_key LIKE ?
    `;

    const results = (await this.db.executeQuery(query, [`%session_${sessionId}%`, `%session_${sessionId}%`])) as any[];

    return results.map(r => ({
      source: r.source_key,
      target: r.target_key,
      type: r.relationship_type,
      strength: r.strength || 1.0
    }));
  }

  private isTaskContinuation(title1: string, title2: string, _data1: any, _data2: any): boolean {
    // Simple heuristics for task continuation
    const title1Lower = title1.toLowerCase();
    const title2Lower = title2.toLowerCase();

    // Check for similar titles
    const titleSimilarity = this.calculateStringSimilarity(title1Lower, title2Lower);
    if (titleSimilarity > 0.6) {
      return true;
    }

    // Check for continuation keywords
    const continuationKeywords = ['continue', 'follow-up', 'next', 'part', 'phase', 'step'];
    for (const keyword of continuationKeywords) {
      if (title1Lower.includes(keyword) || title2Lower.includes(keyword)) {
        return true;
      }
    }

    return false;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}
