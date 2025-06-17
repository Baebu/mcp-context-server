// Enhanced Task Management Tools V2
// File: src/application/tools/task-management-v2.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import type { IWorkspaceManager } from '../../core/interfaces/workspace.interface.js';
import { logger } from '../../utils/logger.js';
import { TokenTracker } from '../../utils/token-tracker.js';

// Task schema for standardized structure
const taskSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'paused', 'cancelled']).default('not_started'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  progress: z.number().min(0).max(100).default(0),
  dueDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  assignee: z.string().optional(),
  workspaceId: z.string().optional(),
  sessionId: z.string().optional(),
  parentTaskId: z.string().optional(),
  subtasks: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional(),
  recurring: z
    .object({
      enabled: z.boolean(),
      pattern: z.enum(['daily', 'weekly', 'monthly', 'custom']).optional(),
      interval: z.number().optional(),
      nextDue: z.string().optional()
    })
    .optional(),
  metadata: z.record(z.any()).optional()
});

// Schema for CreateTaskTool
const createTaskSchema = z.object({
  title: z.string().describe('Task title'),
  description: z.string().optional().describe('Task description'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  dueDate: z.string().optional().describe('Due date in ISO format'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
  assignee: z.string().optional().describe('Assigned to'),
  parentTaskId: z.string().optional().describe('Parent task ID for subtasks'),
  workspaceId: z.string().optional().describe('Workspace ID (uses current if not specified)'),
  recurring: z
    .object({
      pattern: z.enum(['daily', 'weekly', 'monthly']),
      interval: z.number().optional().default(1)
    })
    .optional()
    .describe('Recurring task configuration')
});

@injectable()
export class CreateTaskTool implements IMCPTool {
  name = 'create_task';
  description = 'Create a new task with standardized structure and automatic tagging';
  schema = createTaskSchema;

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler,
    @inject('WorkspaceManagerService') private workspaceManager: IWorkspaceManager
  ) {}

  async execute(params: z.infer<typeof createTaskSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Generate task ID
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Get current workspace if not specified
      const workspaceId = params.workspaceId || (await this.getCurrentWorkspaceId());

      // Build task object
      const task: z.infer<typeof taskSchema> = {
        id: taskId,
        title: params.title,
        description: params.description,
        status: 'not_started',
        priority: params.priority || 'medium',
        progress: 0,
        dueDate: params.dueDate,
        tags: params.tags || [],
        assignee: params.assignee,
        workspaceId,
        sessionId: context.sessionId || 'unknown' || 'unknown',
        parentTaskId: params.parentTaskId,
        subtasks: [],
        dependencies: [],
        attachments: [],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: context.sessionId || 'system'
        }
      };

      // Add recurring configuration if specified
      if (params.recurring) {
        task.recurring = {
          enabled: true,
          pattern: params.recurring.pattern,
          interval: params.recurring.interval || 1,
          nextDue: this.calculateNextDue(params.recurring.pattern, params.recurring.interval || 1)
        };
      }

      // Prepare tags for semantic search
      const semanticTags = [
        'task',
        'active',
        task.status,
        task.priority,
        ...(params.tags || []),
        workspaceId ? `workspace:${workspaceId}` : '',
        `created:${new Date().toISOString().split('T')[0]}`
      ].filter(Boolean);

      // Store task in context system
      await this.db.storeEnhancedContext({
        key: taskId,
        value: task,
        type: 'task',
        semanticTags: semanticTags,
        metadata: {
          taskTitle: task.title,
          taskStatus: task.status,
          taskPriority: task.priority,
          workspaceId,
          sessionId: context.sessionId || 'unknown'
        },
        embedding: undefined,
        tokenCount: TokenTracker.estimateTokens(task),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Create relationships
      if (params.parentTaskId) {
        await this.db.createRelationship(taskId, params.parentTaskId, 'subtask_of', 1.0);
      }

      if (workspaceId) {
        await this.db.createRelationship(taskId, workspaceId, 'belongs_to_workspace', 0.9);
      }

      logger.info({ taskId, title: task.title }, 'Task created successfully');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                taskId,
                task,
                message: `Task "${task.title}" created successfully`
              },
              null,
              2
            )
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

  private async getCurrentWorkspaceId(): Promise<string | undefined> {
    try {
      const activeWorkspace = await this.workspaceManager.getActiveWorkspace();
      return activeWorkspace?.id;
    } catch {
      return undefined;
    }
  }

  private calculateNextDue(pattern: string, interval: number): string {
    const now = new Date();
    switch (pattern) {
      case 'daily':
        now.setDate(now.getDate() + interval);
        break;
      case 'weekly':
        now.setDate(now.getDate() + 7 * interval);
        break;
      case 'monthly':
        now.setMonth(now.getMonth() + interval);
        break;
    }
    return now.toISOString();
  }
}

// Schema for ListTasksTool
const listTasksSchema = z.object({
  status: z.enum(['all', 'not_started', 'in_progress', 'completed', 'paused', 'cancelled']).optional().default('all'),
  priority: z.enum(['all', 'low', 'medium', 'high', 'critical']).optional().default('all'),
  assignee: z.string().optional(),
  workspaceId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  searchQuery: z.string().optional(),
  includeSubtasks: z.boolean().optional().default(false),
  sortBy: z.enum(['created', 'updated', 'due', 'priority', 'progress']).optional().default('updated'),
  limit: z.number().optional().default(20)
});

@injectable()
export class ListTasksTool implements IMCPTool {
  name = 'list_tasks';
  description = 'List tasks with advanced filtering and search capabilities';
  schema = listTasksSchema;

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler
    // @inject('WorkspaceManagerService') private workspaceManager: IWorkspaceManager - Removed unused injection
  ) {}

  async execute(params: z.infer<typeof listTasksSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      let tasks: any[] = [];

      // If search query provided, use semantic search
      if (params.searchQuery) {
        // Use queryEnhancedContext with proper options
        const searchResults = await this.db.queryEnhancedContext({
          contextType: 'task',
          tags: ['task'],
          limit: params.limit! * 2,
          sortBy: 'updated',
          sortOrder: 'desc'
        });

        tasks = await Promise.all(
          searchResults.map(async result => {
            const ctx = await this.db.getEnhancedContext(result.key);
            return ctx || null;
          })
        );
        tasks = tasks.filter(Boolean);
      } else {
        // Use tag-based search for better performance
        const searchTags = ['task'];
        if (params.status && params.status !== 'all') searchTags.push(params.status);
        if (params.priority && params.priority !== 'all') searchTags.push(params.priority);
        if (params.tags) searchTags.push(...params.tags);

        const contexts = await this.db.queryEnhancedContext({
          tags: searchTags,
          contextType: 'task',
          limit: params.limit! * 2
        });

        tasks = contexts;
      }

      // Apply filters
      const filteredTasks = await this.filterTasks(tasks, params);

      // Sort tasks
      const sortedTasks = this.sortTasks(filteredTasks, params.sortBy!);

      // Limit results
      const finalTasks = sortedTasks.slice(0, params.limit!);

      // Format results
      const formattedTasks = await this.formatTaskResults(finalTasks, params.includeSubtasks!);

      const result = {
        totalFound: filteredTasks.length,
        returned: formattedTasks.length,
        filters: {
          status: params.status,
          priority: params.priority,
          assignee: params.assignee,
          workspaceId: params.workspaceId,
          tags: params.tags
        },
        tasks: formattedTasks,
        summary: this.generateTaskSummary(formattedTasks)
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
      context.logger.error({ error, params }, 'Failed to list tasks');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private async filterTasks(tasks: any[], params: z.infer<typeof listTasksSchema>): Promise<any[]> {
    return tasks.filter(task => {
      const taskValue = task.value as z.infer<typeof taskSchema>;

      // Status filter
      if (params.status && params.status !== 'all' && taskValue.status !== params.status) {
        return false;
      }

      // Priority filter
      if (params.priority && params.priority !== 'all' && taskValue.priority !== params.priority) {
        return false;
      }

      // Assignee filter
      if (params.assignee && taskValue.assignee !== params.assignee) {
        return false;
      }

      // Workspace filter
      if (params.workspaceId && taskValue.workspaceId !== params.workspaceId) {
        return false;
      }

      // Due date filters
      if (params.dueBefore && taskValue.dueDate) {
        if (new Date(taskValue.dueDate) > new Date(params.dueBefore)) {
          return false;
        }
      }

      if (params.dueAfter && taskValue.dueDate) {
        if (new Date(taskValue.dueDate) < new Date(params.dueAfter)) {
          return false;
        }
      }

      return true;
    });
  }

  private sortTasks(tasks: any[], sortBy: string): any[] {
    return tasks.sort((a, b) => {
      const aValue = a.value as z.infer<typeof taskSchema>;
      const bValue = b.value as z.infer<typeof taskSchema>;

      switch (sortBy) {
        case 'created':
          return (
            new Date(bValue.metadata?.createdAt || 0).getTime() - new Date(aValue.metadata?.createdAt || 0).getTime()
          );

        case 'updated':
          return (
            new Date(bValue.metadata?.updatedAt || 0).getTime() - new Date(aValue.metadata?.updatedAt || 0).getTime()
          );

        case 'due':
          if (!aValue.dueDate && !bValue.dueDate) return 0;
          if (!aValue.dueDate) return 1;
          if (!bValue.dueDate) return -1;
          return new Date(aValue.dueDate).getTime() - new Date(bValue.dueDate).getTime();

        case 'priority':
          const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          return priorityOrder[aValue.priority] - priorityOrder[bValue.priority];

        case 'progress':
          return bValue.progress - aValue.progress;

        default:
          return 0;
      }
    });
  }

  private async formatTaskResults(tasks: any[], includeSubtasks: boolean): Promise<any[]> {
    const formatted = [];

    for (const task of tasks) {
      const taskValue = task.value as z.infer<typeof taskSchema>;
      const formattedTask: any = {
        id: taskValue.id,
        title: taskValue.title,
        description: taskValue.description,
        status: taskValue.status,
        priority: taskValue.priority,
        progress: taskValue.progress,
        dueDate: taskValue.dueDate,
        assignee: taskValue.assignee,
        tags: taskValue.tags,
        workspaceId: taskValue.workspaceId,
        createdAt: taskValue.metadata?.createdAt,
        updatedAt: taskValue.metadata?.updatedAt,
        overdue: this.isOverdue(taskValue.dueDate),
        daysUntilDue: this.daysUntilDue(taskValue.dueDate)
      };

      if (includeSubtasks && taskValue.subtasks && taskValue.subtasks.length > 0) {
        formattedTask.subtasks = await this.getSubtasks(taskValue.subtasks);
      }

      formatted.push(formattedTask);
    }

    return formatted;
  }

  private async getSubtasks(subtaskIds: string[]): Promise<any[]> {
    const subtasks = [];
    for (const id of subtaskIds) {
      const subtask = await this.db.getEnhancedContext(id);
      if (subtask) {
        const subtaskValue = subtask.value as z.infer<typeof taskSchema>;
        subtasks.push({
          id: subtaskValue.id,
          title: subtaskValue.title,
          status: subtaskValue.status,
          progress: subtaskValue.progress
        });
      }
    }
    return subtasks;
  }

  private isOverdue(dueDate?: string): boolean {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  }

  private daysUntilDue(dueDate?: string): number | null {
    if (!dueDate) return null;
    const days = Math.floor((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  }

  private generateTaskSummary(tasks: any[]): any {
    const summary = {
      total: tasks.length,
      byStatus: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      overdue: 0,
      dueSoon: 0,
      averageProgress: 0
    };

    let totalProgress = 0;

    for (const task of tasks) {
      // Status counts
      summary.byStatus[task.status] = (summary.byStatus[task.status] || 0) + 1;

      // Priority counts
      summary.byPriority[task.priority] = (summary.byPriority[task.priority] || 0) + 1;

      // Overdue and due soon
      if (task.overdue) summary.overdue++;
      if (task.daysUntilDue !== null && task.daysUntilDue >= 0 && task.daysUntilDue <= 3) {
        summary.dueSoon++;
      }

      // Progress
      totalProgress += task.progress;
    }

    if (tasks.length > 0) {
      summary.averageProgress = Math.round(totalProgress / tasks.length);
    }

    return summary;
  }
}

// Schema for UpdateTaskTool
const updateTaskSchema = z.object({
  taskId: z.string().describe('Task ID to update'),
  updates: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['not_started', 'in_progress', 'completed', 'paused', 'cancelled']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      progress: z.number().min(0).max(100).optional(),
      dueDate: z.string().optional(),
      assignee: z.string().optional(),
      tags: z.array(z.string()).optional(),
      addTags: z.array(z.string()).optional(),
      removeTags: z.array(z.string()).optional(),
      notes: z.string().optional()
    })
    .describe('Fields to update')
});

@injectable()
export class UpdateTaskTool implements IMCPTool {
  name = 'update_task';
  description = 'Update task properties and track changes';
  schema = updateTaskSchema;

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {}

  async execute(params: z.infer<typeof updateTaskSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Get existing task
      const existingContext = await this.db.getEnhancedContext(params.taskId);
      if (!existingContext || existingContext.type !== 'task') {
        return {
          content: [
            {
              type: 'text',
              text: `Task not found: ${params.taskId}`
            }
          ]
        };
      }

      const existingTask = existingContext.value as z.infer<typeof taskSchema>;
      const previousStatus = existingTask.status;
      const previousProgress = existingTask.progress;

      // Apply updates
      const updatedTask = { ...existingTask };

      if (params.updates.title !== undefined) updatedTask.title = params.updates.title;
      if (params.updates.description !== undefined) updatedTask.description = params.updates.description;
      if (params.updates.status !== undefined) updatedTask.status = params.updates.status;
      if (params.updates.priority !== undefined) updatedTask.priority = params.updates.priority;
      if (params.updates.progress !== undefined) updatedTask.progress = params.updates.progress;
      if (params.updates.dueDate !== undefined) updatedTask.dueDate = params.updates.dueDate;
      if (params.updates.assignee !== undefined) updatedTask.assignee = params.updates.assignee;

      // Handle tags
      if (params.updates.tags !== undefined) {
        updatedTask.tags = params.updates.tags;
      } else {
        if (params.updates.addTags) {
          updatedTask.tags = [...new Set([...(updatedTask.tags || []), ...params.updates.addTags])];
        }
        if (params.updates.removeTags) {
          updatedTask.tags = (updatedTask.tags || []).filter(tag => !params.updates.removeTags!.includes(tag));
        }
      }

      // Update metadata
      updatedTask.metadata = {
        ...updatedTask.metadata,
        updatedAt: new Date().toISOString(),
        updatedBy: context.sessionId || 'system',
        changeHistory: [
          ...(updatedTask.metadata?.changeHistory || []),
          {
            timestamp: new Date().toISOString(),
            changes: params.updates,
            notes: params.updates.notes,
            previousStatus,
            previousProgress
          }
        ].slice(-20) // Keep last 20 changes
      };

      // Auto-complete if progress is 100
      if (updatedTask.progress === 100 && updatedTask.status !== 'completed') {
        updatedTask.status = 'completed';
      }

      // Update tags for search
      const updatedTags = [
        'task',
        updatedTask.status,
        updatedTask.priority,
        ...(updatedTask.tags || []),
        updatedTask.workspaceId ? `workspace:${updatedTask.workspaceId}` : '',
        `updated:${new Date().toISOString().split('T')[0]}`
      ].filter(Boolean);

      // Store updated task
      await this.db.storeEnhancedContext({
        ...existingContext,
        value: updatedTask,
        semanticTags: updatedTags,
        metadata: {
          ...existingContext.metadata,
          taskTitle: updatedTask.title,
          taskStatus: updatedTask.status,
          taskPriority: updatedTask.priority
        },
        tokenCount: TokenTracker.estimateTokens(updatedTask)
      });

      // Handle recurring tasks
      if (updatedTask.status === 'completed' && updatedTask.recurring?.enabled) {
        await this.createNextRecurringTask(updatedTask);
      }

      logger.info(
        {
          taskId: params.taskId,
          updates: params.updates
        },
        'Task updated successfully'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                taskId: params.taskId,
                previousStatus,
                previousProgress,
                updatedTask,
                message: `Task "${updatedTask.title}" updated successfully`
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to update task');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private async createNextRecurringTask(completedTask: z.infer<typeof taskSchema>): Promise<void> {
    if (!completedTask.recurring) return;

    const createTaskTool = new CreateTaskTool(this.db, null as any); // We don't need workspace manager here

    const nextTask = {
      title: completedTask.title,
      description: completedTask.description,
      priority: completedTask.priority,
      dueDate: completedTask.recurring.nextDue,
      tags: completedTask.tags,
      assignee: completedTask.assignee,
      workspaceId: completedTask.workspaceId,
      recurring: {
        pattern: completedTask.recurring.pattern as 'daily' | 'weekly' | 'monthly',
        interval: completedTask.recurring.interval || 1
      }
    };

    await createTaskTool.execute(nextTask, { sessionId: 'system', logger } as any);

    logger.info(
      {
        completedTaskId: completedTask.id,
        nextDue: completedTask.recurring.nextDue
      },
      'Created next recurring task'
    );
  }
}

// Schema for CompleteTaskTool
const completeTaskSchema = z.object({
  taskId: z.string().describe('Task ID to complete'),
  notes: z.string().optional().describe('Completion notes'),
  createFollowUp: z.boolean().optional().default(false).describe('Create a follow-up task'),
  followUpTitle: z.string().optional().describe('Title for follow-up task'),
  followUpDays: z.number().optional().default(7).describe('Days until follow-up is due')
});

@injectable()
export class CompleteTaskTool implements IMCPTool {
  name = 'complete_task';
  description = 'Mark a task as completed with optional follow-up creation';
  schema = completeTaskSchema;

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {}

  async execute(params: z.infer<typeof completeTaskSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Update task to completed
      const updateTool = new UpdateTaskTool(this.db);
      await updateTool.execute(
        {
          taskId: params.taskId,
          updates: {
            status: 'completed',
            progress: 100,
            notes: params.notes
          }
        },
        context
      );

      // Create follow-up if requested
      let followUpTask = null;
      if (params.createFollowUp) {
        const existingContext = await this.db.getEnhancedContext(params.taskId);
        if (existingContext) {
          const existingTask = existingContext.value as z.infer<typeof taskSchema>;

          const followUpDueDate = new Date();
          followUpDueDate.setDate(followUpDueDate.getDate() + params.followUpDays);

          const createTaskTool = new CreateTaskTool(this.db, null as any);
          const followUpResult = await createTaskTool.execute(
            {
              title: params.followUpTitle || `Follow-up: ${existingTask.title}`,
              description: `Follow-up task for: ${existingTask.title}\n\nOriginal task completed on: ${new Date().toISOString()}`,
              priority: existingTask.priority,
              dueDate: followUpDueDate.toISOString(),
              tags: [...(existingTask.tags || []), 'follow-up'],
              assignee: existingTask.assignee,
              workspaceId: existingTask.workspaceId
            },
            context
          );

          const followUpData = JSON.parse(followUpResult.content?.[0]?.text || '{}');
          followUpTask = followUpData.task;

          // Create relationship
          await this.db.createRelationship(followUpData.taskId, params.taskId, 'follow_up_of', 0.9);
        }
      }

      const result = {
        success: true,
        taskId: params.taskId,
        completedAt: new Date().toISOString(),
        notes: params.notes,
        followUpCreated: params.createFollowUp,
        followUpTask
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
      context.logger.error({ error, params }, 'Failed to complete task');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Schema for TaskTemplatesTool
const taskTemplatesSchema = z.object({
  action: z.enum(['create', 'list', 'apply', 'delete']).describe('Action to perform'),
  templateName: z.string().optional().describe('Template name'),
  template: z
    .object({
      name: z.string(),
      description: z.string(),
      defaultTitle: z.string(),
      defaultDescription: z.string().optional(),
      defaultPriority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      defaultTags: z.array(z.string()).optional(),
      subtaskTemplates: z
        .array(
          z.object({
            title: z.string(),
            description: z.string().optional()
          })
        )
        .optional(),
      customFields: z.record(z.any()).optional()
    })
    .optional()
    .describe('Template definition for create action'),
  taskTitle: z.string().optional().describe('Task title when applying template'),
  customizations: z.record(z.any()).optional().describe('Customizations when applying template')
});

@injectable()
export class TaskTemplatesTool implements IMCPTool {
  name = 'task_templates';
  description = 'Manage and apply task templates for common workflows';
  schema = taskTemplatesSchema;

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {}

  async execute(params: z.infer<typeof taskTemplatesSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      switch (params.action) {
        case 'create':
          return await this.createTemplate(params, context);
        case 'list':
          return await this.listTemplates(context);
        case 'apply':
          return await this.applyTemplate(params, context);
        case 'delete':
          return await this.deleteTemplate(params, context);
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to execute task template action');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute template action: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private async createTemplate(params: z.infer<typeof taskTemplatesSchema>, context: ToolContext): Promise<ToolResult> {
    if (!params.template) {
      throw new Error('Template definition required for create action');
    }

    const templateId = `task_template_${params.template.name.toLowerCase().replace(/\s+/g, '_')}`;

    await this.db.storeEnhancedContext({
      key: templateId,
      value: params.template,
      type: 'task_template',
      semanticTags: ['task_template', params.template.name],
      metadata: {
        templateName: params.template.name,
        createdAt: new Date().toISOString(),
        createdBy: context.sessionId || 'system'
      },
      embedding: undefined,
      tokenCount: TokenTracker.estimateTokens(params.template),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              templateId,
              template: params.template,
              message: `Task template "${params.template.name}" created successfully`
            },
            null,
            2
          )
        }
      ]
    };
  }

  private async listTemplates(_context: ToolContext): Promise<ToolResult> {
    const templates = await this.db.queryEnhancedContext({
      contextType: 'task_template',
      limit: 50
    });

    const formattedTemplates = templates.map(t => ({
      id: t.key,
      name: (t.value as any).name,
      description: (t.value as any).description,
      defaultPriority: (t.value as any).defaultPriority,
      subtaskCount: (t.value as any).subtaskTemplates?.length || 0,
      createdAt: t.metadata?.createdAt
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              count: formattedTemplates.length,
              templates: formattedTemplates
            },
            null,
            2
          )
        }
      ]
    };
  }

  private async applyTemplate(params: z.infer<typeof taskTemplatesSchema>, context: ToolContext): Promise<ToolResult> {
    if (!params.templateName) {
      throw new Error('Template name required for apply action');
    }

    const templateId = `task_template_${params.templateName.toLowerCase().replace(/\s+/g, '_')}`;
    const templateContext = await this.db.getEnhancedContext(templateId);

    if (!templateContext) {
      throw new Error(`Template not found: ${params.templateName}`);
    }

    const template = templateContext.value as any;
    const createTaskTool = new CreateTaskTool(this.db, null as any);

    // Create main task
    const mainTaskResult = await createTaskTool.execute(
      {
        title: params.taskTitle || template.defaultTitle,
        description: template.defaultDescription,
        priority: template.defaultPriority || 'medium',
        tags: template.defaultTags || []
      },
      context
    );

    const mainTaskData = JSON.parse(mainTaskResult.content?.[0]?.text || '{}');
    const createdTasks = [mainTaskData.task];

    // Create subtasks if defined
    if (template.subtaskTemplates && template.subtaskTemplates.length > 0) {
      for (const subtaskTemplate of template.subtaskTemplates) {
        const subtaskResult = await createTaskTool.execute(
          {
            title: subtaskTemplate.title,
            description: subtaskTemplate.description,
            priority: template.defaultPriority || 'medium',
            parentTaskId: mainTaskData.taskId,
            tags: [...(template.defaultTags || []), 'subtask']
          },
          context
        );

        const subtaskData = JSON.parse(subtaskResult.content?.[0]?.text || '{}');
        createdTasks.push(subtaskData.task);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              template: params.templateName,
              mainTaskId: mainTaskData.taskId,
              createdTasks,
              message: `Applied template "${params.templateName}" successfully`
            },
            null,
            2
          )
        }
      ]
    };
  }

  private async deleteTemplate(params: z.infer<typeof taskTemplatesSchema>, context: ToolContext): Promise<ToolResult> {
    if (!params.templateName) {
      throw new Error('Template name required for delete action');
    }

    const templateId = `task_template_${params.templateName.toLowerCase().replace(/\s+/g, '_')}`;

    // For now, we'll mark it as deleted since we don't have a delete method
    const templateContext = await this.db.getEnhancedContext(templateId);
    if (!templateContext) {
      throw new Error(`Template not found: ${params.templateName}`);
    }

    await this.db.storeEnhancedContext({
      ...templateContext,
      type: 'deleted_task_template',
      metadata: {
        ...templateContext.metadata,
        deletedAt: new Date().toISOString(),
        deletedBy: context.sessionId || 'system'
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              templateId,
              message: `Task template "${params.templateName}" deleted successfully`
            },
            null,
            2
          )
        }
      ]
    };
  }
}
