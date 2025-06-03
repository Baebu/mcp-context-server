// src/infrastructure/di/container-initializer.ts - Updated with Enhanced File Operations
import type { Container } from 'inversify';
import type { IToolRegistry } from '../../core/interfaces/tool-registry.interface.js';
import type { IResourceRegistry } from '../../core/interfaces/resource-registry.interface.js';
import type { IPromptRegistry } from '../../core/interfaces/prompt-registry.interface.js';
import type { IEmbeddingService } from '../../core/interfaces/semantic-context.interface.js';

// Tools
import {
  ReadFileTool,
  ListDirectoryTool,
  WriteFileToolWithConsent
} from '../../application/tools/file-operations.tool.js';

// Enhanced File Operations Tools
import {
  EditFileTool,
  BatchEditFileTool,
  SearchFilesTool,
  FindFilesTool
} from '../../application/tools/enhanced-file-operations.tool.js';

// Other Tools
import { ExecuteCommandToolWithConsent } from '../../application/tools/command-execution.tool.js';
import {
  StoreContextTool,
  GetContextTool,
  QueryContextTool
} from '../../application/tools/database-operations.tool.js';
import {
  CreateSmartPathTool,
  ExecuteSmartPathTool,
  ListSmartPathsTool
} from '../../application/tools/smart-path.tool.js';
import { ParseFileTool } from '../../application/tools/file-parsing.tool.js';
import { GetMetricsTool } from '../../application/tools/metrics.tool.js';
import { SecurityDiagnosticsTool } from '../../application/tools/security-diagnostics.tool.js';
import { DatabaseHealthTool } from '../../application/tools/database-health.tool.js';

// Workspace Tools
import {
  CreateWorkspaceTool,
  ListWorkspacesTool,
  SwitchWorkspaceTool,
  SyncWorkspaceTool,
  TrackFileTool,
  GetWorkspaceStatsTool,
  DeleteWorkspaceTool,
  ExportWorkspaceTemplateTool
} from '../../application/tools/workspace-management.tools.js';

// Semantic Tools
import {
  SemanticSearchTool,
  FindRelatedContextTool,
  CreateContextRelationshipTool,
  UpdateEmbeddingsTool,
  SemanticStatsTool
} from '../../application/tools/semantic-search.tool.js';
import {
  EnhancedStoreContextTool,
  EnhancedQueryContextTool
} from '../../application/tools/enhanced-database-operations.tool.js';

// Resources
import { ProjectFilesResource } from '../../application/resources/project-files.resource.js';

// Prompts
import { ContextSummaryPrompt } from '../../application/prompts/context-summary.prompt.js';

// UI Bridges
import { ConsentUIBridge } from '../../presentation/consent-ui-bridge.js';

import { logger } from '../../utils/logger.js';

export class ContainerInitializer {
  static async initialize(container: Container): Promise<void> {
    logger.info('Initializing container with semantic search capabilities...');

    // Initialize consent UI bridge
    const consentUIBridge = container.get<ConsentUIBridge>(ConsentUIBridge);
    consentUIBridge.start();

    // Initialize embedding service
    await this.initializeSemanticServices(container);

    // Initialize and register tools
    await this.initializeTools(container);

    // Initialize and register resources
    await this.initializeResources(container);

    // Initialize and register prompts
    await this.initializePrompts(container);

    logger.info('Container initialization complete with semantic search capabilities');
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

    // File operations (enhanced with consent)
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileToolWithConsent());
    toolRegistry.register(new ListDirectoryTool());

    // Enhanced file operations (NEW)
    toolRegistry.register(container.get<EditFileTool>(EditFileTool));
    toolRegistry.register(container.get<BatchEditFileTool>(BatchEditFileTool));
    toolRegistry.register(container.get<SearchFilesTool>(SearchFilesTool));
    toolRegistry.register(container.get<FindFilesTool>(FindFilesTool));

    // Command execution (enhanced with consent)
    toolRegistry.register(new ExecuteCommandToolWithConsent());

    // Database operations (original tools)
    toolRegistry.register(new StoreContextTool());
    toolRegistry.register(new GetContextTool());
    toolRegistry.register(new QueryContextTool());

    // Enhanced database operations with semantic features
    toolRegistry.register(container.get<EnhancedStoreContextTool>(EnhancedStoreContextTool));
    toolRegistry.register(container.get<EnhancedQueryContextTool>(EnhancedQueryContextTool));

    // Semantic search tools
    toolRegistry.register(container.get<SemanticSearchTool>(SemanticSearchTool));
    toolRegistry.register(container.get<FindRelatedContextTool>(FindRelatedContextTool));
    toolRegistry.register(container.get<CreateContextRelationshipTool>(CreateContextRelationshipTool));
    toolRegistry.register(container.get<UpdateEmbeddingsTool>(UpdateEmbeddingsTool));
    toolRegistry.register(container.get<SemanticStatsTool>(SemanticStatsTool));

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
    toolRegistry.register(new GetWorkspaceStatsTool());
    toolRegistry.register(new DeleteWorkspaceTool());
    toolRegistry.register(new ExportWorkspaceTemplateTool());

    // File parsing
    toolRegistry.register(container.get<ParseFileTool>(ParseFileTool));

    // System monitoring
    toolRegistry.register(new GetMetricsTool());
    toolRegistry.register(new SecurityDiagnosticsTool());
    toolRegistry.register(new DatabaseHealthTool());

    try {
      const allTools = await toolRegistry.getAllTools();
      logger.info(`Registered ${allTools.length} tools including semantic search capabilities`);
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
