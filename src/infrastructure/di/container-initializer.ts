// src/infrastructure/di/container-initializer.ts - Updated with Process Management
import type { Container } from 'inversify';
import type { IToolRegistry } from '../../core/interfaces/tool-registry.interface.js';
import type { IResourceRegistry } from '../../core/interfaces/resource-registry.interface.js';
import type { IPromptRegistry } from '../../core/interfaces/prompt-registry.interface.js';
import type { IEmbeddingService } from '../../core/interfaces/semantic-context.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import type { DatabaseAdapter } from '../adapters/database.adapter.js';

// Tools
import { ReadFileTool, ListDirectoryTool, WriteFileTool } from '../../application/tools/file-operations.tool.js';

// Enhanced File Operations Tools
import {
  SearchFilesTool,
  FindFilesTool,
  ContentEditFileTool
} from '../../application/tools/enhanced-file-operations.tool.js';

// Backup Management Tools
import {
  ListBackupsTool,
  BackupStatsTool,
  RestoreBackupTool,
  ViewBackupTool,
  CleanupBackupsTool
} from '../../application/tools/backup-management.tool.js';

// Other Tools
import { ExecuteCommandTool } from '../../application/tools/command-execution.tool.js';

// Database operation tools (now consolidated and enhanced)
import {
  StoreContextTool, // Now represents the enhanced version
  GetContextTool
} from '../../application/tools/database-operations.tool.js'; // Consolidated path

import {
  CreateSmartPathTool,
  ExecuteSmartPathTool,
  ListSmartPathsTool
} from '../../application/tools/smart-path.tool.js';

import { ParseFileTool } from '../../application/tools/file-parsing.tool.js';
import { SecurityDiagnosticsTool } from '../../application/tools/security-diagnostics.tool.js';
import { ProcessManagementTool } from '../../application/tools/process-management.tool.js';

// New Consolidated Tools
import { GetSystemHealthTool } from '../../application/tools/system-health.tool.js';
import { GetProjectOverviewTool } from '../../application/tools/project-overview.tool.js';

// Workspace Tools
import {
  CreateWorkspaceTool,
  ListWorkspacesTool,
  SwitchWorkspaceTool,
  SyncWorkspaceTool,
  TrackFileTool,
  DeleteWorkspaceTool,
  ExportWorkspaceTemplateTool
} from '../../application/tools/workspace-management.tools.js';

// Semantic Tools
import {
  SemanticSearchTool,
  FindRelatedContextTool,
  CreateContextRelationshipTool,
  UpdateEmbeddingsTool
} from '../../application/tools/semantic-search.tool.js';

// Removed: EnhancedStoreContextTool and EnhancedQueryContextTool imports

// Resources
import { ProjectFilesResource } from '../../application/resources/project-files.resource.js';

// Prompts
import { ContextSummaryPrompt } from '../../application/prompts/context-summary.prompt.js';
import { logger } from '../../utils/logger.js';

export class ContainerInitializer {
  static async initialize(container: Container): Promise<void> {
    logger.info('Initializing container with enhanced process management...');

    // Ensure Database Migrations are applied first
    const databaseHandler = container.get<IDatabaseHandler>('DatabaseHandler') as DatabaseAdapter;
    if (typeof databaseHandler.applyInitialMigrations === 'function') {
      await databaseHandler.applyInitialMigrations();
    } else {
      logger.warn(
        'DatabaseAdapter does not have applyInitialMigrations method. Skipping automatic semantic migration during DI initialization.'
      );
    }

    // Initialize semantic services
    await this.initializeSemanticServices(container);

    // Initialize and register tools
    await this.initializeTools(container);

    // Initialize and register resources
    await this.initializeResources(container);

    // Initialize and register prompts
    await this.initializePrompts(container);

    logger.info('Container initialization complete with enhanced process management');
  }

  private static async initializeSemanticServices(container: Container): Promise<void> {
    try {
      logger.info('Initializing semantic services...');
      const embeddingService = container.get<IEmbeddingService>('EmbeddingService');
      await embeddingService.initialize();
      logger.info('Semantic services initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize semantic services');
      // Don't throw - allow server to start without semantic features
    }
  }

  private static async initializeTools(container: Container): Promise<void> {
    const toolRegistry = container.get<IToolRegistry>('ToolRegistry');

    // File operations (consent removed)
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileTool());
    toolRegistry.register(new ListDirectoryTool());

    // Enhanced file operations (consolidated)
    toolRegistry.register(container.get<SearchFilesTool>(SearchFilesTool));
    toolRegistry.register(container.get<FindFilesTool>(FindFilesTool));
    toolRegistry.register(container.get<ContentEditFileTool>(ContentEditFileTool));

    // Backup management tools (NEW)
    toolRegistry.register(container.get<ListBackupsTool>(ListBackupsTool));
    toolRegistry.register(container.get<BackupStatsTool>(BackupStatsTool));
    toolRegistry.register(container.get<RestoreBackupTool>(RestoreBackupTool));
    toolRegistry.register(container.get<ViewBackupTool>(ViewBackupTool));
    toolRegistry.register(container.get<CleanupBackupsTool>(CleanupBackupsTool));

    // Command execution (consent removed)
    toolRegistry.register(new ExecuteCommandTool());

    // Process management (NEW)
    toolRegistry.register(container.get<ProcessManagementTool>(ProcessManagementTool));

    // Database operations (consolidated and enhanced by default)
    toolRegistry.register(container.get<StoreContextTool>(StoreContextTool)); // Use container.get for injectable classes
    toolRegistry.register(new GetContextTool()); // GetContextTool has no injected dependencies in its constructor, so 'new' is fine

    // Removed: QueryContextTool (consolidated into semantic search), EnhancedStoreContextTool and EnhancedQueryContextTool registrations

    // Semantic search tools
    toolRegistry.register(container.get<SemanticSearchTool>(SemanticSearchTool));
    toolRegistry.register(container.get<FindRelatedContextTool>(FindRelatedContextTool));
    toolRegistry.register(container.get<CreateContextRelationshipTool>(CreateContextRelationshipTool));
    toolRegistry.register(container.get<UpdateEmbeddingsTool>(UpdateEmbeddingsTool));
    // SemanticStatsTool removed - functionality consolidated into system-health.tool.ts

    // Smart path operations
    toolRegistry.register(new CreateSmartPathTool());
    toolRegistry.register(new ExecuteSmartPathTool());
    toolRegistry.register(new ListSmartPathsTool());

    // Workspace management
    toolRegistry.register(new CreateWorkspaceTool());
    toolRegistry.register(new ListWorkspacesTool());
    toolRegistry.register(new SwitchWorkspaceTool());
    toolRegistry.register(new SyncWorkspaceTool());
    toolRegistry.register(new TrackFileTool());
    toolRegistry.register(new DeleteWorkspaceTool());
    toolRegistry.register(new ExportWorkspaceTemplateTool());
    // GetWorkspaceStatsTool removed - functionality consolidated into system-health.tool.ts

    // File parsing
    toolRegistry.register(container.get<ParseFileTool>(ParseFileTool));

    // System monitoring (consolidated)
    toolRegistry.register(new SecurityDiagnosticsTool()); // Now includes enhanced security functionality
    toolRegistry.register(container.get<GetSystemHealthTool>(GetSystemHealthTool)); // Consolidated system health tool
    toolRegistry.register(container.get<GetProjectOverviewTool>(GetProjectOverviewTool)); // New project overview tool
    // GetMetricsTool, DatabaseHealthTool, EnhancedSecurityDiagnosticsTool - functionality consolidated into system-health.tool.ts

    try {
      const allTools = await toolRegistry.getAllTools();
      logger.info(`Registered ${allTools.length} tools including process management capabilities`);
    } catch (error) {
      logger.warn({ error }, 'Could not get tool count, but registration completed');
    }
  }

  private static async initializeResources(container: Container): Promise<void> {
    const resourceRegistry = container.get<IResourceRegistry>('ResourceRegistry');

    // Project files
    resourceRegistry.register(container.get<ProjectFilesResource>(ProjectFilesResource));

    try {
      const allResources = await resourceRegistry.getAllResources();
      logger.info(`Registered ${allResources.length} resources`);
    } catch (error) {
      logger.warn({ error }, 'Could not get resource count, but registration completed');
    }
  }

  private static async initializePrompts(container: Container): Promise<void> {
    const promptRegistry = container.get<IPromptRegistry>('PromptRegistry');

    // Context summary
    promptRegistry.register(new ContextSummaryPrompt());

    try {
      const allPrompts = await promptRegistry.getAllPrompts();
      logger.info(`Registered ${allPrompts.length} prompts`);
    } catch (error) {
      logger.warn({ error }, 'Could not get prompt count, but registration completed');
    }
  }
}
