// Task State Management Tools
// File: src/application/tools/task-state-management.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
// import { AutoStateManagerService } from '../services/auto-state-manager.service.js'; // Removed unused import
import { TokenTracker } from '../../utils/token-tracker.js';
import { logger } from '../../utils/logger.js';

// Schema for FindActiveTasksTool
const findActiveTasksSchema = z.object({
  sessionId: z.string().optional().describe('Session ID to filter tasks (optional)'),
  includeCompleted: z.boolean().optional().default(false).describe('Include completed tasks in results'),
  maxAge: z.number().optional().default(48).describe('Maximum age in hours for active tasks'),
  limit: z.number().optional().default(20).describe('Maximum number of tasks to return')
});

@injectable()
export class FindActiveTasksTool implements IMCPTool {
  name = 'find_active_tasks';
  description = 'Find active tasks and their current state across sessions';
  schema = findActiveTasksSchema;

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler
  ) {}

  async execute(params: z.infer<typeof findActiveTasksSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const cutoffTime = new Date(Date.now() - (params.maxAge! * 60 * 60 * 1000));

      // Use semantic search to find task-related contexts
      const searchQueries = [
        'task active current',
        'task in progress working',
        'task state checkpoint handoff',
        'task todo pending'
      ];

      const allResults: any[] = [];

      // Search for tasks using semantic search
      for (const query of searchQueries) {
        // Use queryEnhancedContext with proper options
        const searchResults = await this.db.queryEnhancedContext({
          keyPattern: query,
          tags: ['task', 'task_state', 'checkpoint', 'handoff'],
          limit: params.limit! * 2,
          sortBy: 'updated',
          sortOrder: 'desc'
        });

        for (const result of searchResults) {
          const ctx = await this.db.getEnhancedContext(result.key);
          if (ctx && ctx.updatedAt >= cutoffTime) {
            allResults.push(ctx);
          }
        }
      }

      // Also query by specific patterns for better coverage
      const taskContexts = await this.db.queryEnhancedContext({
        tags: ['task', 'active'],
        sortBy: 'updated',
        sortOrder: 'desc',
        limit: params.limit!
      });

      const stateContexts = await this.db.queryEnhancedContext({
        keyPattern: 'checkpoint_',
        sortBy: 'updated',
        sortOrder: 'desc',
        limit: params.limit!
      });

      const handoffContexts = await this.db.queryEnhancedContext({
        keyPattern: 'task_state_',
        sortBy: 'updated',
        sortOrder: 'desc',
        limit: params.limit!
      });

      // Combine all results and remove duplicates
      const allContexts = [...allResults, ...taskContexts, ...stateContexts, ...handoffContexts];
      const uniqueContexts = this.deduplicateContexts(allContexts);
      const activeTasks: any[] = [];

      for (const ctx of uniqueContexts) {
        if (ctx.updatedAt < cutoffTime) continue;

        const contextValue = ctx.value as any;
        const sessionId = contextValue.sessionId || contextValue.session_id || 'unknown';

        // Filter by session if specified
        if (params.sessionId && sessionId !== params.sessionId) continue;

        // Analyze task completion
        const taskAnalysis = TokenTracker.detectTaskCompletion(contextValue);

        // Skip completed tasks unless requested
        if (!params.includeCompleted && taskAnalysis.isComplete) continue;

        const taskInfo = {
          key: ctx.key,
          sessionId,
          type: ctx.contextType || ctx.type,
          lastUpdated: ctx.updatedAt,
          isComplete: taskAnalysis.isComplete,
          completionPercentage: taskAnalysis.completionPercentage,
          remainingTasks: taskAnalysis.remainingTasks,
          context: this.extractTaskSummary(contextValue),
          tokenCount: ctx.tokenCount || 0,
          accessCount: ctx.accessCount || 0
        };

        activeTasks.push(taskInfo);
      }

      // Remove duplicates and sort by relevance
      const uniqueTasks = this.deduplicateAndRankTasks(activeTasks);
      const finalTasks = uniqueTasks.slice(0, params.limit!);

      const result = {
        activeTasks: finalTasks.length,
        maxAge: params.maxAge,
        includeCompleted: params.includeCompleted,
        tasks: finalTasks,
        summary: {
          totalFound: uniqueTasks.length,
          completed: finalTasks.filter(t => t.isComplete).length,
          inProgress: finalTasks.filter(t => !t.isComplete).length,
          highPriority: finalTasks.filter(t => t.completionPercentage > 0 && !t.isComplete).length
        }
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to find active tasks');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to find active tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private extractTaskSummary(contextValue: any): any {
    // Extract key information for task summary
    const summary: any = {};

    // Common task fields
    const taskFields = ['name', 'title', 'description', 'objective', 'goal', 'current_task', 'next_steps', 'progress'];
    for (const field of taskFields) {
      if (contextValue[field]) {
        summary[field] = TokenTracker.compressContextValue(contextValue[field], 200);
      }
    }

    // State information
    if (contextValue.current_state || contextValue.state) {
      const state = contextValue.current_state || contextValue.state;
      summary.currentState = TokenTracker.compressContextValue(state, 300);
    }

    return Object.keys(summary).length > 0 ? summary : contextValue;
  }

  private deduplicateAndRankTasks(tasks: any[]): any[] {
    // Group by session ID and key patterns
    const taskGroups = new Map<string, any[]>();

    for (const task of tasks) {
      const groupKey = `${task.sessionId}_${task.type}`;
      if (!taskGroups.has(groupKey)) {
        taskGroups.set(groupKey, []);
      }
      taskGroups.get(groupKey)!.push(task);
    }

    // Take the most recent from each group and rank by relevance
    const uniqueTasks: any[] = [];
    for (const group of taskGroups.values()) {
      // Sort by last updated and take the most recent
      group.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
      uniqueTasks.push(group[0]);
    }

    // Rank by relevance (incomplete tasks with progress are higher priority)
    return uniqueTasks.sort((a, b) => {
      if (a.isComplete !== b.isComplete) {
        return a.isComplete ? 1 : -1; // Incomplete tasks first
      }
      if (a.completionPercentage !== b.completionPercentage) {
        return b.completionPercentage - a.completionPercentage; // Higher progress first
      }
      return b.lastUpdated.getTime() - a.lastUpdated.getTime(); // More recent first
    });
  }

  private deduplicateContexts(contexts: any[]): any[] {
    const seen = new Map<string, any>();

    for (const ctx of contexts) {
      const key = ctx.key;
      if (!seen.has(key) || (ctx.similarity && ctx.similarity > (seen.get(key).similarity || 0))) {
        seen.set(key, ctx);
      }
    }

    return Array.from(seen.values());
  }
}

// Schema for TaskCompletionDetectionTool
const taskCompletionDetectionSchema = z.object({
  contextKey: z.string().describe('Key of the context to analyze for completion'),
  sessionId: z.string().optional().describe('Session ID for additional context'),
  updateStatus: z.boolean().optional().default(false).describe('Update the task status in database')
});

@injectable()
export class TaskCompletionDetectionTool implements IMCPTool {
  name = 'task_completion_detection';
  description = 'Analyze a task context to detect completion status and remaining work';
  schema = taskCompletionDetectionSchema;

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler
  ) {}

  async execute(params: z.infer<typeof taskCompletionDetectionSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Get the context to analyze
      const contextEntry = await this.db.getEnhancedContext(params.contextKey);
      if (!contextEntry) {
        return {
          content: [
            {
              type: 'text',
              text: `Context not found: ${params.contextKey}`
            }
          ]
        };
      }

      // Analyze task completion
      const taskAnalysis = TokenTracker.detectTaskCompletion(contextEntry.value as Record<string, unknown>);

      // Get related contexts if session ID provided
      let relatedContexts: any[] = [];
      if (params.sessionId) {
        const related = await this.db.queryEnhancedContext({
          keyPattern: params.sessionId,
          limit: 10
        });
        relatedContexts = related.map(ctx => ({
          key: ctx.key,
          type: ctx.contextType,
          lastUpdated: ctx.updatedAt
        }));
      }

      // Generate recommendations
      const recommendations = this.generateTaskRecommendations(taskAnalysis, contextEntry.value as any);

      const result = {
        contextKey: params.contextKey,
        sessionId: params.sessionId,
        analysis: {
          isComplete: taskAnalysis.isComplete,
          completionPercentage: Math.round(taskAnalysis.completionPercentage),
          remainingTasks: taskAnalysis.remainingTasks,
          lastUpdated: contextEntry.updatedAt,
          tokenCount: contextEntry.tokenCount || 0
        },
        recommendations,
        relatedContexts,
        statusUpdated: false
      };

      // Update status if requested
      if (params.updateStatus) {
        const updatedEntry = {
          ...contextEntry,
          metadata: {
            ...contextEntry.metadata,
            taskStatus: taskAnalysis.isComplete ? 'completed' : 'in_progress',
            completionPercentage: taskAnalysis.completionPercentage,
            analyzedAt: new Date().toISOString()
          }
        };

        await this.db.storeEnhancedContext(updatedEntry);
        result.statusUpdated = true;

        context.logger.info({
          contextKey: params.contextKey,
          isComplete: taskAnalysis.isComplete,
          completionPercentage: taskAnalysis.completionPercentage
        }, 'Task status updated');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to detect task completion');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to analyze task completion: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generateTaskRecommendations(taskAnalysis: any, contextValue: any): string[] {
    const recommendations: string[] = [];

    if (taskAnalysis.isComplete) {
      recommendations.push('Task appears to be complete');
      recommendations.push('Review final results for quality assurance');
      recommendations.push('Document outcomes and lessons learned');
      recommendations.push('Archive or clean up related contexts');
    } else {
      recommendations.push(`Task is ${Math.round(taskAnalysis.completionPercentage)}% complete`);

      if (taskAnalysis.remainingTasks.length > 0) {
        recommendations.push('Focus on remaining tasks:');
        taskAnalysis.remainingTasks.slice(0, 3).forEach((task: string) => {
          recommendations.push(`- ${task}`);
        });
      }

      if (taskAnalysis.completionPercentage > 50) {
        recommendations.push('Task is more than halfway complete - maintain momentum');
      } else if (taskAnalysis.completionPercentage < 20) {
        recommendations.push('Task is in early stages - establish clear next steps');
      }

      recommendations.push('Consider creating checkpoint for progress tracking');
    }

    // Check for stalled tasks
    if (contextValue.lastOperation && contextValue.checkpointedAt) {
      const lastActivity = new Date(contextValue.checkpointedAt);
      const hoursSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);

      if (hoursSinceActivity > 24) {
        recommendations.push('Task may be stalled - review and re-prioritize');
      }
    }

    return recommendations;
  }
}

// Schema for TaskGenealogyTool
const taskGenealogySchema = z.object({
  contextKey: z.string().describe('Key of the context to trace genealogy for'),
  depth: z.number().optional().default(5).describe('Maximum depth of genealogy to trace'),
  includeRelated: z.boolean().optional().default(true).describe('Include related contexts in genealogy')
});

@injectable()
export class TaskGenealogyTool implements IMCPTool {
  name = 'task_genealogy';
  description = 'Trace the genealogy and relationships of a task context';
  schema = taskGenealogySchema;

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler
  ) {}

  async execute(params: z.infer<typeof taskGenealogySchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const genealogy = await this.traceGenealogy(params.contextKey, params.depth!, new Set());

      // Get relationships if available
      let relationships: any[] = [];
      if (params.includeRelated) {
        relationships = await this.db.getRelationships(params.contextKey);
      }

      const result = {
        rootContext: params.contextKey,
        genealogy,
        relationships,
        totalContexts: genealogy.length,
        maxDepth: Math.max(...genealogy.map(g => g.depth)),
        analysis: this.analyzeGenealogy(genealogy)
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to trace task genealogy');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to trace genealogy: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private async traceGenealogy(contextKey: string, maxDepth: number, visited: Set<string>, currentDepth: number = 0): Promise<any[]> {
    if (currentDepth >= maxDepth || visited.has(contextKey)) {
      return [];
    }

    visited.add(contextKey);
    const genealogy: any[] = [];

    try {
      const context = await this.db.getEnhancedContext(contextKey);
      if (!context) {
        return genealogy;
      }

      const entry = {
        key: contextKey,
        depth: currentDepth,
        type: context.contextType || context.type,
        created: context.createdAt,
        updated: context.updatedAt,
        tokenCount: context.tokenCount || 0,
        summary: this.createContextSummary(context.value as any)
      };

      genealogy.push(entry);

      // Look for related contexts based on common patterns
      const relatedKeys = this.findRelatedKeys(context.value as any, contextKey);

      for (const relatedKey of relatedKeys) {
        if (!visited.has(relatedKey)) {
          const childGenealogy = await this.traceGenealogy(relatedKey, maxDepth, visited, currentDepth + 1);
          genealogy.push(...childGenealogy);
        }
      }

      // Check relationships
      const relationships = await this.db.getRelationships(contextKey);
      for (const rel of relationships) {
        if (!visited.has(rel.targetKey)) {
          const relatedGenealogy = await this.traceGenealogy(rel.targetKey, maxDepth, visited, currentDepth + 1);
          genealogy.push(...relatedGenealogy);
        }
      }

    } catch (error) {
      logger.warn({ error, contextKey }, 'Failed to trace context in genealogy');
    }

    return genealogy;
  }

  private findRelatedKeys(contextValue: any, currentKey: string): string[] {
    const relatedKeys: string[] = [];
    const text = JSON.stringify(contextValue).toLowerCase();

    // Look for key patterns in the content
    const keyPatterns = [
      /task_state_[a-zA-Z0-9_-]+/g,
      /checkpoint_[a-zA-Z0-9_-]+/g,
      /session_[a-zA-Z0-9_-]+/g,
      /phase_[0-9]+_[a-zA-Z0-9_-]+/g
    ];

    for (const pattern of keyPatterns) {
      const matches = text.match(pattern) || [];
      for (const match of matches) {
        if (match !== currentKey.toLowerCase()) {
          relatedKeys.push(match);
        }
      }
    }

    // Look for explicit references
    if (contextValue.relatedContexts) {
      if (Array.isArray(contextValue.relatedContexts)) {
        relatedKeys.push(...contextValue.relatedContexts);
      }
    }

    if (contextValue.previousContext) {
      relatedKeys.push(contextValue.previousContext);
    }

    if (contextValue.parentContext) {
      relatedKeys.push(contextValue.parentContext);
    }

    return [...new Set(relatedKeys)]; // Remove duplicates
  }

  private createContextSummary(contextValue: any): any {
    const summary: any = {};

    const importantFields = ['name', 'title', 'objective', 'status', 'progress', 'phase', 'operation'];
    for (const field of importantFields) {
      if (contextValue[field]) {
        summary[field] = TokenTracker.compressContextValue(contextValue[field], 100);
      }
    }

    if (Object.keys(summary).length === 0) {
      // If no structured fields, create a basic summary
      const text = JSON.stringify(contextValue);
      summary.preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
    }

    return summary;
  }

  private analyzeGenealogy(genealogy: any[]): any {
    const analysis = {
      totalContexts: genealogy.length,
      depthDistribution: {} as Record<number, number>,
      typeDistribution: {} as Record<string, number>,
      timeSpan: {
        earliest: null as Date | null,
        latest: null as Date | null,
        spanHours: 0
      },
      tokenDistribution: {
        total: 0,
        average: 0,
        largest: 0
      }
    };

    for (const item of genealogy) {
      // Depth distribution
      analysis.depthDistribution[item.depth] = (analysis.depthDistribution[item.depth] || 0) + 1;

      // Type distribution
      analysis.typeDistribution[item.type] = (analysis.typeDistribution[item.type] || 0) + 1;

      // Time span
      const created = new Date(item.created);
      if (!analysis.timeSpan.earliest || created < analysis.timeSpan.earliest) {
        analysis.timeSpan.earliest = created;
      }
      if (!analysis.timeSpan.latest || created > analysis.timeSpan.latest) {
        analysis.timeSpan.latest = created;
      }

      // Token distribution
      analysis.tokenDistribution.total += item.tokenCount || 0;
      if (item.tokenCount > analysis.tokenDistribution.largest) {
        analysis.tokenDistribution.largest = item.tokenCount;
      }
    }

    if (genealogy.length > 0) {
      analysis.tokenDistribution.average = Math.round(analysis.tokenDistribution.total / genealogy.length);
    }

    if (analysis.timeSpan.earliest && analysis.timeSpan.latest) {
      analysis.timeSpan.spanHours = Math.round(
        (analysis.timeSpan.latest.getTime() - analysis.timeSpan.earliest.getTime()) / (1000 * 60 * 60)
      );
    }

    return analysis;
  }
}

// Schema for UpdateTaskProgressTool
const updateTaskProgressSchema = z.object({
  contextKey: z.string().describe('Key of the task context to update'),
  progress: z.number().min(0).max(100).describe('Progress percentage (0-100)'),
  status: z.enum(['not_started', 'in_progress', 'completed', 'paused', 'cancelled']).describe('Task status'),
  notes: z.string().optional().describe('Progress notes or updates'),
  nextSteps: z.array(z.string()).optional().describe('Next steps for the task'),
  completedItems: z.array(z.string()).optional().describe('Items completed in this update')
});

@injectable()
export class UpdateTaskProgressTool implements IMCPTool {
  name = 'update_task_progress';
  description = 'Update the progress and status of a task context';
  schema = updateTaskProgressSchema;

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler
  ) {}

  async execute(params: z.infer<typeof updateTaskProgressSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Get existing context
      const existingContext = await this.db.getEnhancedContext(params.contextKey);
      if (!existingContext) {
        return {
          content: [
            {
              type: 'text',
              text: `Task context not found: ${params.contextKey}`
            }
          ]
        };
      }

      // Update the context with new progress information
      const currentValue = existingContext.value as any;
      const updatedValue = {
        ...currentValue,
        progress: params.progress,
        status: params.status,
        lastUpdated: new Date().toISOString(),
        progressHistory: [
          ...(currentValue.progressHistory || []),
          {
            timestamp: new Date().toISOString(),
            progress: params.progress,
            status: params.status,
            notes: params.notes
          }
        ].slice(-10) // Keep last 10 progress updates
      };

      if (params.notes) {
        updatedValue.notes = params.notes;
      }

      if (params.nextSteps) {
        updatedValue.nextSteps = params.nextSteps;
      }

      if (params.completedItems) {
        updatedValue.completedItems = [
          ...(currentValue.completedItems || []),
          ...params.completedItems
        ];
      }

      // Update metadata
      const updatedMetadata = {
        ...existingContext.metadata,
        progress: params.progress,
        status: params.status,
        lastProgressUpdate: new Date().toISOString()
      };

      // Calculate token count for updated value
      const tokenCount = TokenTracker.estimateTokens(updatedValue);

      const updatedContext = {
        ...existingContext,
        value: updatedValue,
        metadata: updatedMetadata,
        tokenCount
      };

      await this.db.storeEnhancedContext(updatedContext);

      // Create relationship if task is completed
      if (params.status === 'completed') {
        await this.createCompletionRelationship(params.contextKey, currentValue);
      }

      const result = {
        contextKey: params.contextKey,
        updated: true,
        previousProgress: currentValue.progress || 0,
        newProgress: params.progress,
        previousStatus: currentValue.status || 'unknown',
        newStatus: params.status,
        tokenCount,
        progressHistory: updatedValue.progressHistory
      };

      context.logger.info({
        contextKey: params.contextKey,
        progress: params.progress,
        status: params.status
      }, 'Task progress updated');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to update task progress');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to update task progress: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private async createCompletionRelationship(contextKey: string, contextValue: any): Promise<void> {
    try {
      // Create relationship to mark completion
      const completionKey = `completion_${Date.now()}`;
      await this.db.createRelationship(contextKey, completionKey, 'completed_as', 1.0);

      // If there's a session ID, create relationship to session
      if (contextValue.sessionId) {
        await this.db.createRelationship(contextKey, contextValue.sessionId, 'belongs_to_session', 0.8);
      }

      logger.debug({ contextKey, completionKey }, 'Completion relationships created');
    } catch (error) {
      logger.warn({ error, contextKey }, 'Failed to create completion relationship');
    }
  }
}
