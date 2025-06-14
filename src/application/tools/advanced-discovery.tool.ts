// Advanced Discovery Tools for Enhanced Search Capabilities
// File: src/application/tools/advanced-discovery.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import { AdvancedDiscoveryService } from '../services/advanced-discovery.service.js';
import type {
  CrossChatSearchOptions,
  MultiModalSearchOptions,
  TemporalContextSearchOptions,
  DependencySearchOptions,
  IncompleteTaskFilter,
  SessionBridgeOptions,
  GlobalTaskTrackingOptions,
  ContextInheritanceOptions,
  WorkspaceContextSyncOptions
} from '../services/advanced-discovery.service.js';

// Schema for CrossChatSearchTool
const crossChatSearchSchema = z.object({
  query: z.string().describe('Search query to execute across chat sessions'),
  sessionIds: z.array(z.string()).optional().describe('Specific session IDs to search (optional)'),
  timeRange: z
    .object({
      from: z.string().describe('Start date (ISO string)'),
      to: z.string().describe('End date (ISO string)')
    })
    .optional()
    .describe('Time range filter'),
  includeArchived: z.boolean().optional().default(false).describe('Include archived sessions'),
  similarity: z.number().min(0).max(1).optional().default(0.3).describe('Minimum similarity threshold'),
  maxResults: z.number().optional().default(50).describe('Maximum number of results to return')
});

@injectable()
export class CrossChatSearchTool implements IMCPTool {
  name = 'cross_chat_search';
  description = 'Search for contexts across multiple chat sessions with semantic understanding';
  schema = crossChatSearchSchema;

  constructor(@inject(AdvancedDiscoveryService) private discoveryService: AdvancedDiscoveryService) {}

  async execute(params: z.infer<typeof crossChatSearchSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: CrossChatSearchOptions = {
        query: params.query,
        sessionIds: params.sessionIds,
        timeRange: params.timeRange
          ? {
              from: new Date(params.timeRange.from),
              to: new Date(params.timeRange.to)
            }
          : undefined,
        includeArchived: params.includeArchived,
        similarity: params.similarity,
        maxResults: params.maxResults
      };

      const result = await this.discoveryService.crossChatSearch(options);

      const response = {
        searchQuery: params.query,
        results: {
          totalMatches: result.totalMatches,
          sessionsSearched: result.searchMetadata.sessionsSearched,
          searchTime: result.searchMetadata.searchTime,
          contexts: result.contexts.map(ctx => ({
            key: ctx.key,
            sessionId: ctx.sessionId,
            similarity: Math.round(ctx.similarity * 100) / 100,
            relevanceScore: ctx.relevanceScore,
            timestamp: ctx.timestamp,
            contextType: ctx.contextType,
            preview: this.createContentPreview(ctx.content)
          }))
        },
        sessionSummary: result.sessionSummary,
        insights: this.generateSearchInsights(result)
      };

      context.logger.info(
        {
          query: params.query,
          totalMatches: result.totalMatches,
          sessionsSearched: result.searchMetadata.sessionsSearched
        },
        'Cross-chat search completed'
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
      context.logger.error({ error, query: params.query }, 'Failed to execute cross-chat search');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute cross-chat search: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private createContentPreview(content: unknown): string {
    if (typeof content === 'string') {
      return content.length > 200 ? content.substring(0, 200) + '...' : content;
    } else if (typeof content === 'object' && content !== null) {
      const jsonStr = JSON.stringify(content);
      return jsonStr.length > 200 ? jsonStr.substring(0, 200) + '...' : jsonStr;
    }
    return String(content);
  }

  private generateSearchInsights(result: any): string[] {
    const insights: string[] = [];

    if (result.totalMatches === 0) {
      insights.push('No matches found - try broadening your search terms');
      return insights;
    }

    if (result.searchMetadata.sessionsSearched > 3) {
      insights.push(`Search spanned ${result.searchMetadata.sessionsSearched} different sessions`);
    }

    const avgSimilarity =
      result.contexts.reduce((sum: number, ctx: any) => sum + ctx.similarity, 0) / result.contexts.length;
    if (avgSimilarity > 0.8) {
      insights.push('High relevance matches found');
    } else if (avgSimilarity < 0.5) {
      insights.push('Lower relevance matches - consider refining search terms');
    }

    const recentMatches = result.contexts.filter((ctx: any) => {
      const age = Date.now() - new Date(ctx.timestamp).getTime();
      return age < 24 * 60 * 60 * 1000; // 24 hours
    }).length;

    if (recentMatches > 0) {
      insights.push(`${recentMatches} recent matches found (within 24 hours)`);
    }

    return insights;
  }
}

// Schema for MultiModalSearchTool
const multiModalSearchSchema = z.object({
  textQuery: z.string().optional().describe('Text-based search query'),
  semanticQuery: z.string().optional().describe('Semantic search query'),
  structuralQuery: z
    .object({
      hasFields: z.array(z.string()).optional(),
      valuePatterns: z.record(z.string()).optional()
    })
    .optional()
    .describe('Structural search criteria'),
  temporalQuery: z
    .object({
      createdAfter: z.string().optional(),
      updatedAfter: z.string().optional(),
      accessedAfter: z.string().optional()
    })
    .optional()
    .describe('Temporal search criteria'),
  relationshipQuery: z
    .object({
      hasRelationships: z.boolean().optional(),
      relationshipTypes: z.array(z.string()).optional(),
      relatedTo: z.array(z.string()).optional()
    })
    .optional()
    .describe('Relationship search criteria'),
  combineMode: z
    .enum(['AND', 'OR', 'WEIGHTED'])
    .optional()
    .default('OR')
    .describe('How to combine different search modes'),
  weights: z
    .object({
      text: z.number().optional().default(1.0),
      semantic: z.number().optional().default(1.0),
      structural: z.number().optional().default(1.0),
      temporal: z.number().optional().default(1.0),
      relationship: z.number().optional().default(1.0)
    })
    .optional()
    .describe('Weights for different search modes')
});

@injectable()
export class MultiModalSearchTool implements IMCPTool {
  name = 'multi_modal_search';
  description = 'Search contexts using multiple search strategies simultaneously';
  schema = multiModalSearchSchema;

  constructor(@inject(AdvancedDiscoveryService) private discoveryService: AdvancedDiscoveryService) {}

  async execute(params: z.infer<typeof multiModalSearchSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Validate that at least one search criteria is provided
      const hasSearchCriteria =
        params.textQuery ||
        params.semanticQuery ||
        params.structuralQuery ||
        params.temporalQuery ||
        params.relationshipQuery;

      if (!hasSearchCriteria) {
        return {
          content: [
            {
              type: 'text',
              text: 'At least one search criteria must be provided (textQuery, semanticQuery, structuralQuery, temporalQuery, or relationshipQuery)'
            }
          ]
        };
      }

      const options: MultiModalSearchOptions = {
        textQuery: params.textQuery,
        semanticQuery: params.semanticQuery,
        structuralQuery: params.structuralQuery
          ? {
              hasFields: params.structuralQuery.hasFields || [],
              valuePatterns: params.structuralQuery.valuePatterns || {}
            }
          : undefined,
        temporalQuery: params.temporalQuery
          ? {
              createdAfter: params.temporalQuery.createdAfter ? new Date(params.temporalQuery.createdAfter) : undefined,
              updatedAfter: params.temporalQuery.updatedAfter ? new Date(params.temporalQuery.updatedAfter) : undefined,
              accessedAfter: params.temporalQuery.accessedAfter
                ? new Date(params.temporalQuery.accessedAfter)
                : undefined
            }
          : undefined,
        relationshipQuery: params.relationshipQuery
          ? {
              hasRelationships: params.relationshipQuery.hasRelationships ?? false,
              relationshipTypes: params.relationshipQuery.relationshipTypes,
              relatedTo: params.relationshipQuery.relatedTo
            }
          : undefined,
        combineMode: params.combineMode,
        weights: params.weights
      };

      const result = await this.discoveryService.multiModalSearch(options);

      const response = {
        searchCriteria: {
          modes: options,
          combineMode: params.combineMode,
          activeModes: result.searchMetadata.modes
        },
        results: {
          totalFound: result.totalFound,
          returned: result.results.length,
          searchTime: result.searchMetadata.searchTime,
          contexts: result.results.map((ctx: any) => ({
            key: ctx.key,
            combinedScore: Math.round(ctx.combinedScore * 100) / 100,
            searchType: ctx.searchType,
            preview: this.createContentPreview(ctx.content)
          }))
        },
        scoring: result.scoringBreakdown,
        recommendations: this.generateMultiModalRecommendations(result, options)
      };

      context.logger.info(
        {
          activeModes: result.searchMetadata.modes.length,
          totalFound: result.totalFound,
          combineMode: params.combineMode
        },
        'Multi-modal search completed'
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
      context.logger.error({ error }, 'Failed to execute multi-modal search');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute multi-modal search: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private createContentPreview(content: unknown): string {
    if (typeof content === 'string') {
      return content.length > 150 ? content.substring(0, 150) + '...' : content;
    } else if (typeof content === 'object' && content !== null) {
      const jsonStr = JSON.stringify(content);
      return jsonStr.length > 150 ? jsonStr.substring(0, 150) + '...' : jsonStr;
    }
    return String(content);
  }

  private generateMultiModalRecommendations(result: any, options: MultiModalSearchOptions): string[] {
    const recommendations: string[] = [];

    if (result.totalFound === 0) {
      recommendations.push('No results found - try adjusting search criteria or weights');
      if (options.combineMode === 'AND') {
        recommendations.push('Consider using OR mode to get broader results');
      }
      return recommendations;
    }

    if (result.scoringBreakdown.averageScore < 1.0 && options.combineMode === 'OR') {
      recommendations.push('Low average scores - consider using WEIGHTED mode for better ranking');
    }

    if (result.searchMetadata.modes.length === 1) {
      recommendations.push('Using only one search mode - consider combining multiple modes for better results');
    }

    if (result.totalFound > 100) {
      recommendations.push('Many results found - consider adding more specific criteria to narrow down');
    }

    return recommendations;
  }
}

// Schema for TemporalContextSearchTool
const temporalContextSearchSchema = z.object({
  timeWindow: z
    .object({
      start: z.string().describe('Start time (ISO string)'),
      end: z.string().describe('End time (ISO string)')
    })
    .describe('Time window to search within'),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day').describe('Time granularity for aggregation'),
  contextTypes: z.array(z.string()).optional().describe('Filter by context types'),
  includeDeleted: z.boolean().optional().default(false).describe('Include deleted contexts'),
  aggregateBy: z
    .enum(['creation', 'modification', 'access'])
    .optional()
    .default('creation')
    .describe('Timestamp field to aggregate by')
});

@injectable()
export class TemporalContextSearchTool implements IMCPTool {
  name = 'temporal_context_search';
  description = 'Search and analyze contexts within specific time windows with temporal aggregation';
  schema = temporalContextSearchSchema;

  constructor(@inject(AdvancedDiscoveryService) private discoveryService: AdvancedDiscoveryService) {}

  async execute(params: z.infer<typeof temporalContextSearchSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: TemporalContextSearchOptions = {
        timeWindow: {
          start: new Date(params.timeWindow.start),
          end: new Date(params.timeWindow.end)
        },
        granularity: params.granularity,
        contextTypes: params.contextTypes,
        includeDeleted: params.includeDeleted,
        aggregateBy: params.aggregateBy
      };

      const result = await this.discoveryService.temporalContextSearch(options);

      const response = {
        searchPeriod: {
          start: params.timeWindow.start,
          end: params.timeWindow.end,
          granularity: params.granularity,
          totalContexts: result.totalContexts
        },
        timeWindows: result.timeWindows,
        aggregation: result.aggregation,
        analysis: {
          peakActivity: this.findPeakActivity(result.timeWindows),
          activityPattern: this.analyzeActivityPattern(result.timeWindows),
          contextTypeDistribution: this.analyzeContextTypes(result.timeWindows)
        },
        insights: this.generateTemporalInsights(result)
      };

      context.logger.info(
        {
          granularity: params.granularity,
          totalContexts: result.totalContexts,
          windowCount: result.searchMetadata.windowCount
        },
        'Temporal context search completed'
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
      context.logger.error({ error, timeWindow: params.timeWindow }, 'Failed to execute temporal context search');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute temporal context search: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private findPeakActivity(timeWindows: any[]): any {
    if (timeWindows.length === 0) return null;

    const peak = timeWindows.reduce((max, window) => (window.contextCount > max.contextCount ? window : max));

    return {
      period: peak.period,
      contextCount: peak.contextCount,
      percentage: Math.round((peak.contextCount / timeWindows.reduce((sum, w) => sum + w.contextCount, 0)) * 100)
    };
  }

  private analyzeActivityPattern(timeWindows: any[]): string {
    if (timeWindows.length < 3) return 'insufficient_data';

    const counts = timeWindows.map(w => w.contextCount);
    const isIncreasing = counts.every((count, i) => i === 0 || count >= counts[i - 1]);
    const isDecreasing = counts.every((count, i) => i === 0 || count <= counts[i - 1]);

    if (isIncreasing) return 'increasing';
    if (isDecreasing) return 'decreasing';

    const variance = this.calculateVariance(counts);
    return variance > counts.reduce((sum, c) => sum + c, 0) / counts.length ? 'variable' : 'stable';
  }

  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((sum, d) => sum + d, 0) / numbers.length;
  }

  private analyzeContextTypes(timeWindows: any[]): Record<string, number> {
    const typeCount: Record<string, number> = {};

    timeWindows.forEach(window => {
      window.summary.contextTypes.forEach((type: string) => {
        typeCount[type] = (typeCount[type] || 0) + 1;
      });
    });

    return typeCount;
  }

  private generateTemporalInsights(result: any): string[] {
    const insights: string[] = [];

    if (result.totalContexts === 0) {
      insights.push('No contexts found in the specified time window');
      return insights;
    }

    insights.push(
      `Total of ${result.totalContexts} contexts found across ${result.searchMetadata.windowCount} time windows`
    );

    const peak = this.findPeakActivity(result.timeWindows);
    if (peak) {
      insights.push(
        `Peak activity in ${peak.period} with ${peak.contextCount} contexts (${peak.percentage}% of total)`
      );
    }

    const avgContextsPerWindow = Math.round(result.totalContexts / result.searchMetadata.windowCount);
    insights.push(`Average ${avgContextsPerWindow} contexts per ${result.searchMetadata.granularity}`);

    return insights;
  }
}

// Schema for DependencySearchTool
const dependencySearchSchema = z.object({
  rootKey: z.string().describe('Root context key to start dependency search from'),
  direction: z.enum(['forward', 'backward', 'both']).default('forward').describe('Direction to search dependencies'),
  maxDepth: z.number().min(1).max(10).default(5).describe('Maximum depth to search'),
  includeWeak: z.boolean().optional().default(false).describe('Include weak relationships (strength < 0.5)'),
  relationshipTypes: z.array(z.string()).optional().describe('Filter by specific relationship types')
});

@injectable()
export class DependencySearchTool implements IMCPTool {
  name = 'dependency_search';
  description = 'Search for context dependencies and relationships starting from a root context';
  schema = dependencySearchSchema;

  constructor(@inject(AdvancedDiscoveryService) private discoveryService: AdvancedDiscoveryService) {}

  async execute(params: z.infer<typeof dependencySearchSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: DependencySearchOptions = {
        rootKey: params.rootKey,
        direction: params.direction,
        maxDepth: params.maxDepth,
        includeWeak: params.includeWeak,
        relationshipTypes: params.relationshipTypes
      };

      const result = await this.discoveryService.dependencySearch(options);

      const response = {
        rootKey: params.rootKey,
        searchParameters: {
          direction: params.direction,
          maxDepth: params.maxDepth,
          includeWeak: params.includeWeak,
          relationshipTypes: params.relationshipTypes
        },
        dependencyTree: result.dependencyTree,
        analysis: result.analysis,
        visualization: this.createDependencyVisualization(result.dependencyTree),
        recommendations: this.generateDependencyRecommendations(result)
      };

      context.logger.info(
        {
          rootKey: params.rootKey,
          totalNodes: result.analysis.totalNodes,
          maxDepth: result.analysis.maxDepth
        },
        'Dependency search completed'
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
      context.logger.error({ error, rootKey: params.rootKey }, 'Failed to execute dependency search');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute dependency search: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private createDependencyVisualization(tree: any): any {
    if (!tree) return null;

    const flatten = (node: any, level: number = 0): any[] => {
      const result = [
        {
          key: node.key,
          level,
          type: node.context.type,
          childCount: node.dependencies.length
        }
      ];

      node.dependencies.forEach((dep: any) => {
        result.push(...flatten(dep.node, level + 1));
      });

      return result;
    };

    const flatNodes = flatten(tree);

    return {
      totalLevels: Math.max(...flatNodes.map(n => n.level)) + 1,
      nodesByLevel: flatNodes.reduce(
        (acc, node) => {
          acc[node.level] = (acc[node.level] || 0) + 1;
          return acc;
        },
        {} as Record<number, number>
      ),
      leafNodes: flatNodes.filter(n => n.childCount === 0).length,
      branchingFactor: flatNodes.length > 1 ? (flatNodes.length - 1) / Math.max(...flatNodes.map(n => n.level), 1) : 0
    };
  }

  private generateDependencyRecommendations(result: any): string[] {
    const recommendations: string[] = [];

    if (!result.dependencyTree) {
      recommendations.push('No dependencies found - context may be isolated or not exist');
      return recommendations;
    }

    if (result.analysis.totalNodes === 1) {
      recommendations.push('Root context has no dependencies');
      return recommendations;
    }

    if (result.analysis.maxDepth >= 5) {
      recommendations.push('Deep dependency tree detected - consider reviewing for circular dependencies');
    }

    if (result.analysis.relationshipTypes.length > 5) {
      recommendations.push('Many relationship types found - consider standardizing relationship vocabulary');
    }

    recommendations.push(`Found ${result.analysis.totalNodes - 1} dependent contexts`);

    return recommendations;
  }
}

// Schema for IncompleteTaskFilterTool
const incompleteTaskFilterSchema = z.object({
  sessionIds: z.array(z.string()).optional().describe('Filter by specific session IDs'),
  minProgress: z.number().min(0).max(100).optional().default(0).describe('Minimum progress percentage'),
  maxAge: z.number().optional().default(168).describe('Maximum age in hours'),
  taskTypes: z.array(z.string()).optional().describe('Filter by task types'),
  priorities: z.array(z.string()).optional().describe('Filter by priorities (high, medium, low)')
});

@injectable()
export class IncompleteTaskFilterTool implements IMCPTool {
  name = 'incomplete_task_filter';
  description = 'Find and analyze incomplete tasks across sessions with filtering options';
  schema = incompleteTaskFilterSchema;

  constructor(@inject(AdvancedDiscoveryService) private discoveryService: AdvancedDiscoveryService) {}

  async execute(params: z.infer<typeof incompleteTaskFilterSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const filter: IncompleteTaskFilter = {
        sessionIds: params.sessionIds,
        minProgress: params.minProgress,
        maxAge: params.maxAge,
        taskTypes: params.taskTypes,
        priorities: params.priorities
      };

      const result = await this.discoveryService.findIncompleteTasks(filter);

      const response = {
        filter: params,
        results: {
          totalFound: result.summary.totalFound,
          returned: result.incompleteTasks.length,
          averageProgress: result.summary.averageProgress
        },
        tasks: result.incompleteTasks.map((task: any) => ({
          key: task.key,
          sessionId: task.sessionId,
          progress: task.progress,
          priority: task.priority,
          ageHours: task.ageHours,
          summary: task.summary,
          remainingTasksCount: task.remainingTasks.length,
          lastUpdated: task.lastUpdated
        })),
        analysis: {
          byPriority: result.summary.byPriority,
          byAge: result.summary.byAge,
          sessionDistribution: this.analyzeSessionDistribution(result.incompleteTasks)
        },
        recommendations: result.recommendations,
        actionItems: this.generateActionItems(result.incompleteTasks)
      };

      context.logger.info(
        {
          totalFound: result.summary.totalFound,
          averageProgress: result.summary.averageProgress,
          highPriority: result.summary.byPriority.high || 0
        },
        'Incomplete task search completed'
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
      context.logger.error({ error, filter: params }, 'Failed to filter incomplete tasks');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to filter incomplete tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private analyzeSessionDistribution(tasks: any[]): Record<string, number> {
    return tasks.reduce((acc, task) => {
      acc[task.sessionId] = (acc[task.sessionId] || 0) + 1;
      return acc;
    }, {});
  }

  private generateActionItems(tasks: any[]): string[] {
    const actionItems: string[] = [];

    const urgentTasks = tasks.filter(t => t.priority === 'high' && t.ageHours < 24);
    if (urgentTasks.length > 0) {
      actionItems.push(`Focus on ${urgentTasks.length} urgent high-priority tasks`);
    }

    const stalledTasks = tasks.filter(t => t.progress < 10 && t.ageHours > 48);
    if (stalledTasks.length > 0) {
      actionItems.push(`Review ${stalledTasks.length} stalled tasks with minimal progress`);
    }

    const nearCompletionTasks = tasks.filter(t => t.progress > 80);
    if (nearCompletionTasks.length > 0) {
      actionItems.push(`Push to complete ${nearCompletionTasks.length} tasks that are near completion`);
    }

    return actionItems;
  }
}

// ===== SESSION INTELLIGENCE TOOLS =====

// Schema for SessionBridgesTool
const sessionBridgesSchema = z.object({
  sessionId: z.string().describe('Session ID to find bridges for'),
  similarityThreshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.6)
    .describe('Minimum similarity threshold for semantic bridges'),
  maxBridges: z.number().optional().default(10).describe('Maximum number of bridges to return'),
  contextTypes: z.array(z.string()).optional().describe('Filter by specific context types'),
  timeWindow: z.number().optional().default(168).describe('Time window in hours to search for related sessions')
});

@injectable()
export class SessionBridgesTool implements IMCPTool {
  name = 'session_bridges';
  description = 'Find connections and relationships between chat sessions';
  schema = sessionBridgesSchema;

  constructor(@inject(AdvancedDiscoveryService) private discoveryService: AdvancedDiscoveryService) {}

  async execute(params: z.infer<typeof sessionBridgesSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: SessionBridgeOptions = {
        sessionId: params.sessionId,
        similarityThreshold: params.similarityThreshold,
        maxBridges: params.maxBridges,
        contextTypes: params.contextTypes,
        timeWindow: params.timeWindow
      };

      const bridges = await this.discoveryService.findSessionBridges(options);

      const response = {
        sessionId: params.sessionId,
        bridgesFound: bridges.length,
        bridges: bridges.map(bridge => ({
          relatedSessionId: bridge.relatedSessionId,
          bridgeType: bridge.bridgeType,
          strength: Math.round(bridge.strength * 100) / 100,
          commonContexts: bridge.commonContexts.length,
          summary: bridge.summary
        })),
        analysis: {
          strongestBridge:
            bridges.length > 0 && bridges[0]
              ? {
                  sessionId: bridges[0].relatedSessionId,
                  strength: bridges[0].strength,
                  type: bridges[0].bridgeType
                }
              : null,
          bridgeTypes: this.analyzeBridgeTypes(bridges),
          averageStrength:
            bridges.length > 0
              ? Math.round((bridges.reduce((sum, b) => sum + b.strength, 0) / bridges.length) * 100) / 100
              : 0
        },
        recommendations: this.generateBridgeRecommendations(bridges)
      };

      context.logger.info(
        {
          sessionId: params.sessionId,
          bridgesFound: bridges.length,
          strongestType: bridges[0]?.bridgeType
        },
        'Session bridges analysis completed'
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
      context.logger.error({ error, sessionId: params.sessionId }, 'Failed to find session bridges');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to find session bridges: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private analyzeBridgeTypes(bridges: any[]): Record<string, number> {
    return bridges.reduce((acc, bridge) => {
      acc[bridge.bridgeType] = (acc[bridge.bridgeType] || 0) + 1;
      return acc;
    }, {});
  }

  private generateBridgeRecommendations(bridges: any[]): string[] {
    const recommendations = [];

    if (bridges.length === 0) {
      recommendations.push('No session bridges found - this session appears to be isolated');
      return recommendations;
    }

    const strongBridges = bridges.filter(b => b.strength > 0.7).length;
    if (strongBridges > 0) {
      recommendations.push(`${strongBridges} strong bridges found - consider reviewing related sessions for context`);
    }

    const taskBridges = bridges.filter(b => b.bridgeType === 'task_continuation').length;
    if (taskBridges > 0) {
      recommendations.push(`${taskBridges} task continuation bridges - check for incomplete work in related sessions`);
    }

    const semanticBridges = bridges.filter(b => b.bridgeType === 'semantic').length;
    if (semanticBridges > 0) {
      recommendations.push(`${semanticBridges} semantic bridges - related sessions may contain relevant information`);
    }

    return recommendations;
  }
}

// Schema for GlobalTaskTrackingTool
const globalTaskTrackingSchema = z.object({
  includeCompleted: z.boolean().optional().default(false).describe('Include completed tasks in results'),
  sessionIds: z.array(z.string()).optional().describe('Filter by specific session IDs'),
  taskTypes: z.array(z.string()).optional().describe('Filter by task types'),
  priorities: z.array(z.string()).optional().describe('Filter by priorities (high, medium, low)'),
  timeRange: z
    .object({
      from: z.string().describe('Start date (ISO string)'),
      to: z.string().describe('End date (ISO string)')
    })
    .optional()
    .describe('Time range filter')
});

@injectable()
export class GlobalTaskTrackingTool implements IMCPTool {
  name = 'global_task_tracking';
  description = 'Track and analyze tasks across all chat sessions globally';
  schema = globalTaskTrackingSchema;

  constructor(@inject(AdvancedDiscoveryService) private discoveryService: AdvancedDiscoveryService) {}

  async execute(params: z.infer<typeof globalTaskTrackingSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: GlobalTaskTrackingOptions = {
        includeCompleted: params.includeCompleted,
        sessionIds: params.sessionIds,
        taskTypes: params.taskTypes,
        priorities: params.priorities,
        timeRange: params.timeRange
          ? {
              from: new Date(params.timeRange.from),
              to: new Date(params.timeRange.to)
            }
          : undefined
      };

      const result = await this.discoveryService.trackGlobalTasks(options);

      const response = {
        taskSummary: {
          totalTasks: result.tasks.length,
          activeTasks: result.summary.activeTasks,
          completedTasks: result.summary.completedTasks,
          blockedTasks: result.summary.blockedTasks,
          averageProgress: result.summary.averageProgress
        },
        taskDistribution: {
          byPriority: result.summary.byPriority,
          bySession: result.summary.bySession,
          recentTasks: result.tasks.filter(t => {
            const daysSinceUpdate = (Date.now() - t.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
            return daysSinceUpdate < 7;
          }).length
        },
        criticalTasks: result.tasks
          .filter(t => t.priority === 'high' && t.status === 'active')
          .map(t => ({
            taskId: t.taskId,
            sessionId: t.sessionId,
            title: t.title,
            progress: t.progress,
            daysSinceUpdate: Math.round((Date.now() - t.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
          })),
        insights: result.insights,
        actionItems: this.generateGlobalTaskActionItems(result.tasks),
        recommendations: this.generateGlobalTaskRecommendations(result.summary)
      };

      context.logger.info(
        {
          totalTasks: result.tasks.length,
          activeTasks: result.summary.activeTasks,
          criticalTasks: response.criticalTasks.length
        },
        'Global task tracking completed'
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
      context.logger.error({ error, options: params }, 'Failed to track global tasks');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to track global tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generateGlobalTaskActionItems(tasks: any[]): string[] {
    const actionItems = [];

    const urgentTasks = tasks.filter(
      t =>
        t.priority === 'high' && t.status === 'active' && (Date.now() - t.updatedAt.getTime()) / (1000 * 60 * 60) < 24
    ).length;

    if (urgentTasks > 0) {
      actionItems.push(`URGENT: ${urgentTasks} high-priority tasks need immediate attention`);
    }

    const blockedTasks = tasks.filter(t => t.status === 'blocked').length;
    if (blockedTasks > 0) {
      actionItems.push(`Unblock ${blockedTasks} blocked tasks to improve workflow`);
    }

    const nearCompletionTasks = tasks.filter(t => t.progress > 90 && t.status === 'active').length;
    if (nearCompletionTasks > 0) {
      actionItems.push(`Push to complete ${nearCompletionTasks} tasks that are >90% done`);
    }

    const stalledTasks = tasks.filter(t => {
      const daysSinceUpdate = (Date.now() - t.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
      return t.status === 'active' && daysSinceUpdate > 14;
    }).length;

    if (stalledTasks > 0) {
      actionItems.push(`Review ${stalledTasks} tasks that haven't been updated in 2+ weeks`);
    }

    return actionItems;
  }

  private generateGlobalTaskRecommendations(summary: any): string[] {
    const recommendations = [];

    if (summary.activeTasks > summary.completedTasks * 2) {
      recommendations.push(
        'High ratio of active to completed tasks - consider focusing on completion over starting new tasks'
      );
    }

    if (summary.blockedTasks > summary.activeTasks * 0.2) {
      recommendations.push('High percentage of blocked tasks - investigate and resolve blockers');
    }

    if (summary.averageProgress < 30) {
      recommendations.push('Low average progress across tasks - consider breaking down large tasks');
    }

    const sessionCount = Object.keys(summary.bySession).length;
    if (sessionCount > 10) {
      recommendations.push(`Tasks are spread across ${sessionCount} sessions - consider consolidating related work`);
    }

    return recommendations;
  }
}

// Schema for ContextInheritanceTool
const contextInheritanceSchema = z.object({
  sourceSessionId: z.string().describe('Source session ID to inherit context from'),
  targetSessionId: z.string().describe('Target session ID to inherit context to'),
  inheritanceTypes: z
    .array(z.string())
    .optional()
    .describe('Types of contexts to inherit (task, knowledge, state, etc.)'),
  maxContexts: z.number().optional().default(20).describe('Maximum number of contexts to inherit'),
  similarityThreshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.5)
    .describe('Minimum similarity threshold for inheritance')
});

@injectable()
export class ContextInheritanceTool implements IMCPTool {
  name = 'context_inheritance';
  description = 'Inherit relevant context from one session to another';
  schema = contextInheritanceSchema;

  constructor(@inject(AdvancedDiscoveryService) private discoveryService: AdvancedDiscoveryService) {}

  async execute(params: z.infer<typeof contextInheritanceSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: ContextInheritanceOptions = {
        sourceSessionId: params.sourceSessionId,
        targetSessionId: params.targetSessionId,
        inheritanceTypes: params.inheritanceTypes,
        maxContexts: params.maxContexts,
        similarityThreshold: params.similarityThreshold
      };

      const result = await this.discoveryService.inheritContext(options);

      const response = {
        inheritance: {
          sourceSessionId: params.sourceSessionId,
          targetSessionId: params.targetSessionId,
          totalInherited: result.summary.total,
          byType: result.summary.byType,
          byInheritanceType: result.summary.byInheritanceType
        },
        inheritedContexts: result.inherited.map(ctx => ({
          sourceKey: ctx.sourceKey,
          targetKey: ctx.targetKey,
          contextType: ctx.contextType,
          inheritanceType: ctx.inheritanceType
        })),
        analysis: {
          mostInheritedType: this.findMostInheritedType(result.summary.byType),
          inheritanceEfficiency: result.summary.total / (params.maxContexts || 20),
          diversityScore: Object.keys(result.summary.byType).length
        },
        recommendations: this.generateInheritanceRecommendations(result.summary, params)
      };

      context.logger.info(
        {
          sourceSessionId: params.sourceSessionId,
          targetSessionId: params.targetSessionId,
          inherited: result.summary.total
        },
        'Context inheritance completed'
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
      context.logger.error({ error, sourceSession: params.sourceSessionId }, 'Failed to inherit context');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to inherit context: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private findMostInheritedType(byType: Record<string, number>): string | null {
    const entries = Object.entries(byType);
    if (entries.length === 0) return null;

    return entries.reduce((max, current) => (current[1] > max[1] ? current : max))[0];
  }

  private generateInheritanceRecommendations(summary: any, params: any): string[] {
    const recommendations = [];

    if (summary.total === 0) {
      recommendations.push('No contexts were inherited - check if source session exists and has relevant content');
      return recommendations;
    }

    if (summary.total < (params.maxContexts || 20) * 0.5) {
      recommendations.push(
        'Low inheritance rate - consider lowering similarity threshold or expanding inheritance types'
      );
    }

    const taskInheritance = summary.byInheritanceType.task_inheritance || 0;
    if (taskInheritance > 0) {
      recommendations.push(`${taskInheritance} tasks inherited - review for completion status and dependencies`);
    }

    const knowledgeInheritance = summary.byInheritanceType.knowledge_inheritance || 0;
    if (knowledgeInheritance > 0) {
      recommendations.push(
        `${knowledgeInheritance} knowledge contexts inherited - verify relevance to current session`
      );
    }

    recommendations.push(`Successfully inherited ${summary.total} contexts from source session`);

    return recommendations;
  }
}

// Schema for WorkspaceContextSyncTool
const workspaceContextSyncSchema = z.object({
  workspaceId: z.string().describe('Workspace ID to sync with'),
  sessionIds: z.array(z.string()).optional().describe('Specific session IDs to sync (optional)'),
  syncDirection: z
    .enum(['to_workspace', 'from_workspace', 'bidirectional'])
    .default('bidirectional')
    .describe('Direction of synchronization'),
  contextTypes: z.array(z.string()).optional().describe('Filter by specific context types to sync')
});

@injectable()
export class WorkspaceContextSyncTool implements IMCPTool {
  name = 'workspace_context_sync';
  description = 'Synchronize context between sessions and workspaces';
  schema = workspaceContextSyncSchema;

  constructor(@inject(AdvancedDiscoveryService) private discoveryService: AdvancedDiscoveryService) {}

  async execute(params: z.infer<typeof workspaceContextSyncSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: WorkspaceContextSyncOptions = {
        workspaceId: params.workspaceId,
        sessionIds: params.sessionIds,
        syncDirection: params.syncDirection,
        contextTypes: params.contextTypes
      };

      const result = await this.discoveryService.syncWorkspaceContext(options);

      const response = {
        syncOperation: {
          workspaceId: params.workspaceId,
          direction: params.syncDirection,
          sessionIds: params.sessionIds || ['current'],
          contextTypes: params.contextTypes || ['all']
        },
        results: {
          totalSynced: result.summary.total,
          toWorkspace: result.summary.toWorkspace,
          fromWorkspace: result.summary.fromWorkspace,
          bidirectional: result.summary.bidirectional
        },
        syncedContexts: result.synced.map(sync => ({
          contextKey: sync.contextKey,
          syncDirection: sync.syncDirection,
          workspaceId: sync.workspaceId,
          sessionId: sync.sessionId
        })),
        analysis: {
          syncEfficiency: result.summary.total > 0 ? 100 : 0,
          directionBreakdown: {
            toWorkspacePercent:
              result.summary.total > 0 ? Math.round((result.summary.toWorkspace / result.summary.total) * 100) : 0,
            fromWorkspacePercent:
              result.summary.total > 0 ? Math.round((result.summary.fromWorkspace / result.summary.total) * 100) : 0
          }
        },
        recommendations: this.generateSyncRecommendations(result.summary, params)
      };

      context.logger.info(
        {
          workspaceId: params.workspaceId,
          syncDirection: params.syncDirection,
          totalSynced: result.summary.total
        },
        'Workspace context sync completed'
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
      context.logger.error({ error, workspaceId: params.workspaceId }, 'Failed to sync workspace context');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to sync workspace context: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generateSyncRecommendations(summary: any, params: any): string[] {
    const recommendations = [];

    if (summary.total === 0) {
      recommendations.push('No contexts were synced - check if workspace and sessions exist with relevant content');
      return recommendations;
    }

    if (params.syncDirection === 'bidirectional') {
      recommendations.push(
        `Bidirectional sync completed: ${summary.toWorkspace} to workspace, ${summary.fromWorkspace} from workspace`
      );
    } else {
      recommendations.push(
        `Unidirectional sync completed: ${summary.total} contexts synced ${params.syncDirection.replace('_', ' ')}`
      );
    }

    if (summary.toWorkspace > 0) {
      recommendations.push('Workspace updated with latest session contexts - team members can access current state');
    }

    if (summary.fromWorkspace > 0) {
      recommendations.push('Session updated with workspace contexts - check for relevant updates');
    }

    return recommendations;
  }
}

// Schema for ProjectStateSnapshotTool
const projectStateSnapshotSchema = z.object({
  projectId: z.string().describe('Project ID to create snapshot for'),
  sessionIds: z.array(z.string()).describe('Session IDs to include in the snapshot')
});

@injectable()
export class ProjectStateSnapshotTool implements IMCPTool {
  name = 'project_state_snapshot';
  description = 'Create a comprehensive snapshot of project state across multiple sessions';
  schema = projectStateSnapshotSchema;

  constructor(@inject(AdvancedDiscoveryService) private discoveryService: AdvancedDiscoveryService) {}

  async execute(params: z.infer<typeof projectStateSnapshotSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const snapshot = await this.discoveryService.createProjectStateSnapshot(params.projectId, params.sessionIds);

      const response = {
        snapshot: {
          snapshotId: snapshot.snapshotId,
          projectId: snapshot.projectId,
          timestamp: snapshot.timestamp,
          sessionIds: snapshot.sessionIds
        },
        projectState: {
          totalContexts: snapshot.metadata.totalContexts,
          activeTasks: snapshot.metadata.activeTasks,
          completedTasks: snapshot.metadata.completedTasks,
          sessionCount: snapshot.metadata.sessionCount,
          totalRelationships: snapshot.relationships.length
        },
        contextSummary: {
          byType: this.summarizeContextsByType(snapshot.contexts),
          recentContexts: snapshot.contexts.filter(_ctx => {
            // This is a simplified check since we don't have timestamp in the context summary
            return true; // Would need to add timestamp to context summary for proper filtering
          }).length
        },
        taskSummary: {
          byStatus: this.summarizeTasksByStatus(snapshot.tasks),
          byPriority: this.summarizeTasksByPriority(snapshot.tasks),
          bySession: this.summarizeTasksBySession(snapshot.tasks)
        },
        insights: this.generateSnapshotInsights(snapshot),
        recommendations: this.generateSnapshotRecommendations(snapshot)
      };

      context.logger.info(
        {
          snapshotId: snapshot.snapshotId,
          projectId: params.projectId,
          sessionCount: params.sessionIds.length,
          totalContexts: snapshot.metadata.totalContexts
        },
        'Project state snapshot created'
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
      context.logger.error({ error, projectId: params.projectId }, 'Failed to create project state snapshot');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create project state snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private summarizeContextsByType(contexts: any[]): Record<string, number> {
    return contexts.reduce((acc, ctx) => {
      acc[ctx.contextType] = (acc[ctx.contextType] || 0) + 1;
      return acc;
    }, {});
  }

  private summarizeTasksByStatus(tasks: any[]): Record<string, number> {
    return tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});
  }

  private summarizeTasksByPriority(tasks: any[]): Record<string, number> {
    return tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {});
  }

  private summarizeTasksBySession(tasks: any[]): Record<string, number> {
    return tasks.reduce((acc, task) => {
      acc[task.sessionId] = (acc[task.sessionId] || 0) + 1;
      return acc;
    }, {});
  }

  private generateSnapshotInsights(snapshot: any): string[] {
    const insights = [];

    const completionRate =
      (snapshot.metadata.completedTasks / (snapshot.metadata.activeTasks + snapshot.metadata.completedTasks)) * 100;

    if (completionRate > 70) {
      insights.push(`High task completion rate: ${Math.round(completionRate)}%`);
    } else if (completionRate < 30) {
      insights.push(`Low task completion rate: ${Math.round(completionRate)}% - many tasks in progress`);
    }

    const contextsPerSession = snapshot.metadata.totalContexts / snapshot.metadata.sessionCount;
    insights.push(`Average ${Math.round(contextsPerSession)} contexts per session`);

    if (snapshot.relationships.length > snapshot.metadata.totalContexts * 0.5) {
      insights.push('High interconnectedness - contexts are well linked');
    } else {
      insights.push('Low interconnectedness - consider creating more relationships between contexts');
    }

    const sessionCount = snapshot.metadata.sessionCount;
    if (sessionCount > 5) {
      insights.push(`Project spans ${sessionCount} sessions - good session organization`);
    } else if (sessionCount === 1) {
      insights.push('Project contained in single session - consider breaking into multiple focused sessions');
    }

    return insights;
  }

  private generateSnapshotRecommendations(snapshot: any): string[] {
    const recommendations = [];

    if (snapshot.metadata.activeTasks > snapshot.metadata.completedTasks * 2) {
      recommendations.push('High ratio of active to completed tasks - focus on completion');
    }

    if (snapshot.relationships.length < snapshot.metadata.totalContexts * 0.3) {
      recommendations.push('Create more relationships between contexts to improve discoverability');
    }

    recommendations.push(
      `Snapshot captured ${snapshot.metadata.totalContexts} contexts across ${snapshot.metadata.sessionCount} sessions`
    );
    recommendations.push('Use this snapshot for project reviews, handoffs, or resuming work');

    if (snapshot.metadata.activeTasks > 0) {
      recommendations.push(`${snapshot.metadata.activeTasks} active tasks remain - continue tracking progress`);
    }

    return recommendations;
  }
}
