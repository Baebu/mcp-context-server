// src/application/tools/workspace-management.tools.ts
import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IWorkspaceManager } from '@core/interfaces/workspace.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js'; // Added import

// Create Workspace Tool
const createWorkspaceSchema = z.object({
  name: z.string().describe('Name for the workspace'),
  rootPath: z.string().describe('Root directory path for the workspace'),
  type: z.enum(['project', 'scratch', 'shared']).optional().default('project'),
  gitEnabled: z.boolean().optional().describe('Enable git integration'),
  patterns: z
    .object({
      include: z.array(z.string()).optional().describe('File patterns to include'),
      exclude: z.array(z.string()).optional().describe('File patterns to exclude')
    })
    .optional(),
  contextPrefix: z.string().optional().describe('Prefix for context keys in this workspace'),
  template: z.string().optional().describe('Template ID to use for initialization')
});

@injectable()
export class CreateWorkspaceTool implements IMCPTool {
  name = 'create_workspace';
  description = 'Create a new workspace for organizing project files and context';
  schema = createWorkspaceSchema;

  async execute(params: z.infer<typeof createWorkspaceSchema>, context: ToolContext): Promise<ToolResult> {
    const workspaceManager = context.container.get<IWorkspaceManager>('WorkspaceManager');

    try {
      let workspace;

      if (params.template) {
        // Create from template
        workspace = await workspaceManager.createFromTemplate(params.name, params.template);
      } else {
        // Create new workspace
        const config = {
          rootPath: params.rootPath,
          type: params.type,
          gitEnabled: params.gitEnabled,
          patterns: params.patterns,
          contextPrefix: params.contextPrefix || `ws:${params.name.toLowerCase().replace(/\s+/g, '-')}:`
        };

        workspace = await workspaceManager.createWorkspace(params.name, config);
      }

      // Automatically set as active workspace
      await workspaceManager.setActiveWorkspace(workspace.id);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                workspace: {
                  id: workspace.id,
                  name: workspace.name,
                  rootPath: workspace.config.rootPath,
                  type: workspace.config.type,
                  gitEnabled: workspace.config.gitEnabled,
                  contextPrefix: workspace.config.contextPrefix
                },
                message: `Workspace '${workspace.name}' created and set as active`
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to create workspace');
      throw error;
    }
  }
}

// List Workspaces Tool
const listWorkspacesSchema = z.object({
  includeStats: z.boolean().optional().default(false).describe('Include detailed statistics for each workspace')
});

@injectable()
export class ListWorkspacesTool implements IMCPTool {
  name = 'list_workspaces';
  description = 'List all available workspaces';
  schema = listWorkspacesSchema;

  async execute(params: z.infer<typeof listWorkspacesSchema>, context: ToolContext): Promise<ToolResult> {
    const workspaceManager = context.container.get<IWorkspaceManager>('WorkspaceManager');

    try {
      const workspaces = await workspaceManager.listWorkspaces();
      const activeWorkspace = workspaceManager.getActiveWorkspace();

      const workspaceList = await Promise.all(
        workspaces.map(async ws => {
          const base = {
            id: ws.id,
            name: ws.name,
            rootPath: ws.config.rootPath,
            type: ws.config.type,
            isActive: ws.id === activeWorkspace?.id,
            createdAt: ws.createdAt,
            lastAccessedAt: ws.lastAccessedAt
          };

          if (params.includeStats) {
            const stats = await workspaceManager.getWorkspaceStats(ws.id);
            return { ...base, stats };
          }

          return base;
        })
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                workspaces: workspaceList,
                activeWorkspace: activeWorkspace?.id,
                totalCount: workspaces.length
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to list workspaces');
      throw error;
    }
  }
}

// Switch Workspace Tool
const switchWorkspaceSchema = z.object({
  workspaceId: z.string().describe('ID of the workspace to switch to'),
  syncFiles: z.boolean().optional().default(true).describe('Sync files before switching')
});

@injectable()
export class SwitchWorkspaceTool implements IMCPTool {
  name = 'switch_workspace';
  description = 'Switch to a different workspace';
  schema = switchWorkspaceSchema;

  async execute(params: z.infer<typeof switchWorkspaceSchema>, context: ToolContext): Promise<ToolResult> {
    const workspaceManager = context.container.get<IWorkspaceManager>('WorkspaceManager');

    try {
      const workspace = await workspaceManager.getWorkspace(params.workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${params.workspaceId}`);
      }

      // Sync current workspace before switching
      const currentWorkspace = workspaceManager.getActiveWorkspace();
      if (currentWorkspace && params.syncFiles) {
        await workspaceManager.syncWorkspace(currentWorkspace.id);
      }

      // Switch workspace
      await workspaceManager.setActiveWorkspace(params.workspaceId);

      // Sync new workspace
      if (params.syncFiles) {
        const syncStats = await workspaceManager.syncWorkspace(params.workspaceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  workspace: {
                    id: workspace.id,
                    name: workspace.name,
                    rootPath: workspace.config.rootPath
                  },
                  syncStats,
                  message: `Switched to workspace '${workspace.name}'`
                },
                null,
                2
              )
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                workspace: {
                  id: workspace.id,
                  name: workspace.name,
                  rootPath: workspace.config.rootPath
                },
                message: `Switched to workspace '${workspace.name}'`
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to switch workspace');
      throw error;
    }
  }
}

// Sync Workspace Tool
const syncWorkspaceSchema = z.object({
  workspaceId: z.string().optional().describe('ID of workspace to sync (defaults to active workspace)')
});

@injectable()
export class SyncWorkspaceTool implements IMCPTool {
  name = 'sync_workspace';
  description = 'Synchronize workspace files and track changes';
  schema = syncWorkspaceSchema;

  async execute(params: z.infer<typeof syncWorkspaceSchema>, context: ToolContext): Promise<ToolResult> {
    const workspaceManager = context.container.get<IWorkspaceManager>('WorkspaceManager');

    try {
      const workspaceId = params.workspaceId || workspaceManager.getActiveWorkspace()?.id;
      if (!workspaceId) {
        throw new Error('No workspace specified and no active workspace');
      }

      const workspace = await workspaceManager.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      const syncStats = await workspaceManager.syncWorkspace(workspaceId);
      const stats = await workspaceManager.getWorkspaceStats(workspaceId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                workspace: {
                  id: workspace.id,
                  name: workspace.name
                },
                syncStats,
                workspaceStats: stats,
                message: `Synchronized ${syncStats.added} new, ${syncStats.updated} updated, ${syncStats.removed} removed files`
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to sync workspace');
      throw error;
    }
  }
}

// Track File Tool
const trackFileSchema = z.object({
  filePath: z.string().describe('File path to track (relative to workspace root)'),
  workspaceId: z.string().optional().describe('Workspace ID (defaults to active workspace)')
});

@injectable()
export class TrackFileTool implements IMCPTool {
  name = 'track_file';
  description = 'Track a file in the current workspace';
  schema = trackFileSchema;

  async execute(params: z.infer<typeof trackFileSchema>, context: ToolContext): Promise<ToolResult> {
    const workspaceManager = context.container.get<IWorkspaceManager>('WorkspaceManager');

    try {
      const workspaceId = params.workspaceId || workspaceManager.getActiveWorkspace()?.id;
      if (!workspaceId) {
        throw new Error('No workspace specified and no active workspace');
      }

      await workspaceManager.trackFile(workspaceId, params.filePath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                workspaceId,
                filePath: params.filePath,
                message: `File '${params.filePath}' is now tracked in workspace`
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to track file');
      throw error;
    }
  }
}

// GetWorkspaceStatsTool REMOVED - Functionality consolidated into system-health.tool.ts

// Delete Workspace Tool
const deleteWorkspaceSchema = z.object({
  workspaceId: z.string().describe('ID of the workspace to delete'),
  confirmName: z.string().describe('Type the workspace name to confirm deletion')
});

@injectable()
export class DeleteWorkspaceTool implements IMCPTool {
  name = 'delete_workspace';
  description = 'Delete a workspace and all associated data';
  schema = deleteWorkspaceSchema;

  async execute(params: z.infer<typeof deleteWorkspaceSchema>, context: ToolContext): Promise<ToolResult> {
    const workspaceManager = context.container.get<IWorkspaceManager>('WorkspaceManager');

    try {
      const workspace = await workspaceManager.getWorkspace(params.workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${params.workspaceId}`);
      }

      // Verify workspace name for safety
      if (workspace.name !== params.confirmName) {
        throw new Error(
          `Workspace name confirmation failed. Expected '${workspace.name}', got '${params.confirmName}'`
        );
      }

      // Cannot delete active workspace
      const activeWorkspace = workspaceManager.getActiveWorkspace();
      if (activeWorkspace?.id === params.workspaceId) {
        throw new Error('Cannot delete the active workspace. Switch to another workspace first.');
      }

      const deleted = await workspaceManager.deleteWorkspace(params.workspaceId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: deleted,
                workspaceId: params.workspaceId,
                workspaceName: workspace.name,
                message: deleted
                  ? `Workspace '${workspace.name}' and all associated data deleted`
                  : `Failed to delete workspace '${workspace.name}'`
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to delete workspace');
      throw error;
    }
  }
}

// Export Workspace as Template Tool
const exportWorkspaceTemplateSchema = z.object({
  workspaceId: z.string().optional().describe('Workspace ID to export (defaults to active workspace)'),
  includeLargeFiles: z.boolean().optional().default(false).describe('Include files larger than 100KB')
});

@injectable()
export class ExportWorkspaceTemplateTool implements IMCPTool {
  name = 'export_workspace_template';
  description = 'Export a workspace as a reusable template';
  schema = exportWorkspaceTemplateSchema;

  async execute(params: z.infer<typeof exportWorkspaceTemplateSchema>, context: ToolContext): Promise<ToolResult> {
    const workspaceManager = context.container.get<IWorkspaceManager>('WorkspaceManager');

    try {
      const workspaceId = params.workspaceId || workspaceManager.getActiveWorkspace()?.id;
      if (!workspaceId) {
        throw new Error('No workspace specified and no active workspace');
      }

      const template = await workspaceManager.exportAsTemplate(workspaceId);

      // Store template in context for later use
      const db = context.container.get<IDatabaseHandler>('DatabaseHandler');
      await db.storeContext(`template:${template.id}`, template, 'workspace_template');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                template: {
                  id: template.id,
                  name: template.name,
                  description: template.description,
                  fileCount: Object.keys(template.structure || {}).length,
                  contextItemCount: template.initialContext?.length || 0,
                  setupCommandCount: template.setupCommands?.length || 0
                },
                message: `Workspace exported as template '${template.name}' with ID: ${template.id}`
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to export workspace template');
      throw error;
    }
  }
}
