// Enhanced Task Management Tools
// File: src/application/tools/task-management.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import { TokenTracker } from '../../utils/token-tracker.js';

// Schema for CreateTaskTool
const createTaskSchema = z.object({
  name: z.string().describe('Name or title of the task'),
  description: z.string().optional().describe('Detailed description of the task'),
  objective: z.string().optional().describe('Main objective or goal'),
  sessionId: z.string().optional().describe('Session ID to associate with task'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  estimatedTokens: z.number().optional().describe('Estimated tokens needed'),
  tags: z.array(z.string()).optional().describe('Additional tags for the task'),
  parentTaskKey: z.string().optional().describe('Parent task key if this is a subtask'),
  initialContext: z.record(z.any()).optional().describe('Initial context data for the task')
});

@injectable()
export class CreateTaskTool implements IMCPTool {
  name = 'create_task';
  description = 'Create a new task with proper structure and tracking';
  schema = createTaskSchema;

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {}

  async execute(params: z.infer<typeof createTaskSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const taskKey = this.generateTaskKey(params.name, params.sessionId);
      const now = new Date().toISOString();

      const taskValue = {
        // Core task fields
        name: params.name,
        description: params.description || '',
        objective: params.objective || params.description || params.name,

        // Task metadata
        taskId: taskKey,
        sessionId: params.sessionId || `session_${Date.now()}`,
        priority: params.priority,
        status: 'not_started' as const,
        progress: 0,

        // Tracking fields
        createdAt: now,
        updatedAt: now,
        startedAt: null as string | null,
        completedAt: null as string | null,

        // Progress tracking
        estimatedTokens: params.estimatedTokens || 0,
        usedTokens: 0,
        progressHistory: [],

        // Task structure
        subtasks: [],
        dependencies: [],
        blockers: [],
        completedItems: [],
        nextSteps: [],

        // Additional context
        tags: params.tags || [],
        parentTaskKey: params.parentTaskKey,
        ...params.initialContext
      };

      // Calculate initial token count
      const tokenCount = TokenTracker.estimateTokens(taskValue);

      // Store as enhanced context with proper type
      await this.db.storeEnhancedContext({
        key: taskKey,
        value: taskValue,
        type: 'task',
        contextType: 'task', // Ensure this is set!
        tokenCount,
        semanticTags: ['task', params.priority, 'active', ...(params.tags || [])],
        metadata: {
          taskStatus: 'not_started',
          priority: params.priority,
          sessionId: taskValue.sessionId
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Create relationships if needed
      if (params.parentTaskKey) {
        await this.db.createRelationship(params.parentTaskKey, taskKey, 'has_subtask', 0.9);
        await this.db.createRelationship(taskKey, params.parentTaskKey, 'subtask_of', 0.9);
      }

      if (params.sessionId) {
        await this.db.createRelationship(taskKey, params.sessionId, 'belongs_to_session', 0.8);
      }

      // Store a session checkpoint for the new task
      const checkpointKey = `checkpoint_${taskValue.sessionId}_${Date.now()}`;
      await this.db.storeEnhancedContext({
        key: checkpointKey,
        value: {
          operation: 'task_created',
          taskKey,
          taskName: params.name,
          sessionId: taskValue.sessionId,
          timestamp: now
        },
        type: 'checkpoint',
        contextType: 'checkpoint',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = {
        success: true,
        taskKey,
        sessionId: taskValue.sessionId,
        message: `Task '${params.name}' created successfully`,
        task: {
          key: taskKey,
          name: params.name,
          status: 'not_started',
          priority: params.priority,
          tokenCount
        }
      };

      context.logger.info({ taskKey, name: params.name }, 'Task created successfully');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to create task');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generateTaskKey(name: string, sessionId?: string): string {
    const sanitizedName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 30);

    const timestamp = Date.now();
    const sessionPart = sessionId ? sessionId.substring(0, 8) : 'task';

    return `task_${sessionPart}_${sanitizedName}_${timestamp}`;
  }
}

// Schema for MigrateTaskContextsTool
const migrateTaskContextsSchema = z.object({
  dryRun: z.boolean().optional().default(true).describe('Preview changes without applying them'),
  patterns: z
    .array(z.string())
    .optional()
    .default(['task_', 'todo_', 'project_'])
    .describe('Key patterns to identify task contexts'),
  limit: z.number().optional().default(100).describe('Maximum contexts to migrate in one run')
});

@injectable()
export class MigrateTaskContextsTool implements IMCPTool {
  name = 'migrate_task_contexts';
  description = 'Migrate existing contexts to proper task type for task system compatibility';
  schema = migrateTaskContextsSchema;

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {}

  async execute(params: z.infer<typeof migrateTaskContextsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const migrationCandidates: any[] = [];
      const migrated: any[] = [];
      const errors: any[] = [];

      // Search for contexts that might be tasks
      for (const pattern of params.patterns!) {
        const contexts = await this.db.queryEnhancedContext({
          keyPattern: pattern,
          limit: params.limit!
        });

        for (const ctx of contexts) {
          // Skip if already properly typed
          if (ctx.contextType === 'task') continue;

          // Analyze if this looks like a task
          const analysis = this.analyzeTaskContext(ctx);
          if (analysis.isLikelyTask) {
            migrationCandidates.push({
              key: ctx.key,
              currentType: ctx.type || ctx.contextType || 'unknown',
              confidence: analysis.confidence,
              reason: analysis.reason,
              context: ctx
            });
          }
        }
      }

      if (params.dryRun) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  dryRun: true,
                  candidatesFound: migrationCandidates.length,
                  candidates: migrationCandidates.map(c => ({
                    key: c.key,
                    currentType: c.currentType,
                    confidence: c.confidence,
                    reason: c.reason
                  })),
                  message: 'Run with dryRun: false to apply migrations'
                },
                null,
                2
              )
            }
          ]
        };
      }

      // Perform actual migration
      for (const candidate of migrationCandidates) {
        try {
          const ctx = candidate.context;
          const updatedContext = {
            ...ctx,
            type: 'task',
            contextType: 'task',
            metadata: {
              ...ctx.metadata,
              migratedAt: new Date().toISOString(),
              previousType: ctx.type || ctx.contextType,
              migrationConfidence: candidate.confidence
            },
            semanticTags: [...(ctx.semanticTags || []), 'task', 'migrated']
          };

          await this.db.storeEnhancedContext(updatedContext);
          migrated.push({
            key: candidate.key,
            previousType: candidate.currentType,
            confidence: candidate.confidence
          });

          context.logger.info({ key: candidate.key }, 'Context migrated to task type');
        } catch (error) {
          errors.push({
            key: candidate.key,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          context.logger.error({ error, key: candidate.key }, 'Failed to migrate context');
        }
      }

      const result = {
        success: errors.length === 0,
        candidatesFound: migrationCandidates.length,
        migrated: migrated.length,
        errors: errors.length,
        migratedContexts: migrated,
        errorDetails: errors
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
      context.logger.error({ error, params }, 'Failed to migrate task contexts');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to migrate task contexts: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private analyzeTaskContext(context: any): { isLikelyTask: boolean; confidence: number; reason: string } {
    const value = context.value as any;
    if (!value || typeof value !== 'object') {
      return { isLikelyTask: false, confidence: 0, reason: 'Not an object' };
    }

    let confidence = 0;
    const reasons: string[] = [];

    // Check key patterns
    const key = context.key.toLowerCase();
    if (key.includes('task') || key.includes('todo') || key.includes('project')) {
      confidence += 30;
      reasons.push('Key contains task-related terms');
    }

    // Check for task-like fields
    const taskFields = [
      'status',
      'progress',
      'objective',
      'goal',
      'description',
      'priority',
      'next_steps',
      'nextSteps'
    ];
    const foundFields = taskFields.filter(field => field in value);
    if (foundFields.length > 0) {
      confidence += foundFields.length * 15;
      reasons.push(`Contains task fields: ${foundFields.join(', ')}`);
    }

    // Check for progress indicators
    if ('progress' in value && typeof value.progress === 'number') {
      confidence += 20;
      reasons.push('Has numeric progress field');
    }

    // Check for status field with task-like values
    if ('status' in value) {
      const taskStatuses = ['not_started', 'in_progress', 'completed', 'pending', 'active', 'done'];
      if (taskStatuses.includes(String(value.status).toLowerCase())) {
        confidence += 25;
        reasons.push('Has task-like status value');
      }
    }

    // Check content for task-related keywords
    const content = JSON.stringify(value).toLowerCase();
    const taskKeywords = ['todo', 'task', 'complete', 'progress', 'objective', 'goal', 'milestone'];
    const foundKeywords = taskKeywords.filter(kw => content.includes(kw));
    if (foundKeywords.length > 0) {
      confidence += foundKeywords.length * 5;
      reasons.push(`Contains keywords: ${foundKeywords.join(', ')}`);
    }

    return {
      isLikelyTask: confidence >= 50,
      confidence: Math.min(confidence, 100),
      reason: reasons.join('; ')
    };
  }
}

// Schema for FixTaskSystemTool
const fixTaskSystemSchema = z.object({
  autoMigrate: z.boolean().optional().default(true).describe('Automatically migrate potential task contexts'),
  enhanceStoreContext: z.boolean().optional().default(true).describe('Add task detection to store_context'),
  testSystem: z.boolean().optional().default(true).describe('Test the task system after fixes')
});

@injectable()
export class FixTaskSystemTool implements IMCPTool {
  name = 'fix_task_system';
  description = 'Comprehensive fix for the task management system';
  schema = fixTaskSystemSchema;

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {}

  async execute(params: z.infer<typeof fixTaskSystemSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const results: any = {
        timestamp: new Date().toISOString(),
        steps: []
      };

      // Step 1: Run migration to fix existing contexts
      if (params.autoMigrate) {
        context.logger.info('Running task context migration...');
        const migrationTool = new MigrateTaskContextsTool(this.db);

        // First do a dry run
        const dryRunResult = await migrationTool.execute(
          { dryRun: true, patterns: ['task_', 'todo_', 'project_'], limit: 50 },
          context
        );
        const dryRunText = dryRunResult.content?.[0]?.text;
        const dryRunData = dryRunText ? JSON.parse(dryRunText) : { candidatesFound: 0 };
        results.steps.push({
          step: 'Migration Dry Run',
          candidatesFound: dryRunData.candidatesFound,
          status: 'completed'
        });

        // If candidates found, do actual migration
        if (dryRunData.candidatesFound > 0) {
          const migrationResult = await migrationTool.execute(
            { dryRun: false, patterns: ['task_', 'todo_', 'project_'], limit: 50 },
            context
          );
          const migrationText = migrationResult.content?.[0]?.text;
          const migrationData = migrationText
            ? JSON.parse(migrationText)
            : { migrated: [], errors: [], success: false };
          results.steps.push({
            step: 'Migration Execution',
            migrated: migrationData.migrated,
            errors: migrationData.errors,
            status: migrationData.success ? 'success' : 'partial'
          });
        }
      }

      // Step 2: Test the system
      if (params.testSystem) {
        // Create a test task
        const createTaskTool = new CreateTaskTool(this.db);
        const testTaskResult = await createTaskTool.execute(
          {
            name: 'Test Task for System Validation',
            description: 'Automated test task to validate task system functionality',
            priority: 'low',
            tags: ['test', 'system-validation']
          },
          context
        );

        const testTaskText = testTaskResult.content?.[0]?.text;
        const testTaskData = testTaskText ? JSON.parse(testTaskText) : { success: false, taskKey: '' };
        results.steps.push({
          step: 'Create Test Task',
          taskKey: testTaskData.taskKey,
          status: testTaskData.success ? 'success' : 'failed'
        });

        // Try to find the test task
        const findTasksTool = context.container.get<IMCPTool>('find_active_tasks');
        const findResult = await findTasksTool.execute({ limit: 10 }, context);
        const findText = findResult.content?.[0]?.text;
        const findData = findText ? JSON.parse(findText) : { tasks: [], activeTasks: 0 };

        const testTaskFound = findData.tasks.some((t: any) => t.key === testTaskData.taskKey);
        results.steps.push({
          step: 'Find Active Tasks Test',
          totalTasksFound: findData.activeTasks,
          testTaskFound,
          status: testTaskFound ? 'success' : 'failed'
        });
      }

      // Step 3: Store fix completion status
      await this.db.storeEnhancedContext({
        key: 'task_system_fix_status',
        value: {
          fixApplied: true,
          timestamp: results.timestamp,
          results
        },
        type: 'system',
        contextType: 'system',
        semanticTags: ['task-system', 'fix', 'complete'],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      results.summary = {
        success: results.steps.every((s: any) => s.status !== 'failed'),
        message: 'Task system fix completed',
        recommendation: 'Use create_task to create new tasks with proper structure'
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to fix task system');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to fix task system: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}
