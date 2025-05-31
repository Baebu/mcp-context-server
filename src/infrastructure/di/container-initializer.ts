// src/infrastructure/di/container-initializer.ts - Updated
import type { Container } from 'inversify';
import type { IToolRegistry } from '../../core/interfaces/tool-registry.interface.js';
import type { IResourceRegistry } from '../../core/interfaces/resource-registry.interface.js';
import type { IPromptRegistry } from '../../core/interfaces/prompt-registry.interface.js';

// Tools
import {
  ReadFileTool,
  ListDirectoryTool,
  WriteFileToolWithConsent
} from '../../application/tools/file-operations.tool.js';
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

// New Workspace Tools
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

// Resources
import { ProjectFilesResource } from '../../application/resources/project-files.resource.js';

// Prompts
import { ContextSummaryPrompt } from '../../application/prompts/context-summary.prompt.js';

// UI Bridges
import { ConsentUIBridge } from '../../presentation/consent-ui-bridge.js'; // Added import

import { logger } from '../../utils/logger.js';

export class ContainerInitializer {
  static async initialize(container: Container): Promise<void> {
    logger.info('Initializing container with enhanced tools, resources, and prompts...');

    // Initialize consent UI bridge
    const consentUIBridge = container.get<ConsentUIBridge>(ConsentUIBridge);
    consentUIBridge.start();

    // Initialize and register tools
    await this.initializeTools(container);

    // Initialize and register resources
    await this.initializeResources(container);

    // Initialize and register prompts
    await this.initializePrompts(container);

    logger.info('Container initialization complete with consent and workspace management');
  }

  private static async initializeTools(container: Container): Promise<void> {
    const toolRegistry = container.get<IToolRegistry>('ToolRegistry');

    // File operations (enhanced with consent)
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileToolWithConsent()); // Enhanced version
    toolRegistry.register(new ListDirectoryTool());

    // Command execution (enhanced with consent)
    toolRegistry.register(new ExecuteCommandToolWithConsent()); // Enhanced version

    // Database operations
    toolRegistry.register(new StoreContextTool());
    toolRegistry.register(new GetContextTool());
    toolRegistry.register(new QueryContextTool());

    // Smart paths
    toolRegistry.register(new CreateSmartPathTool());
    toolRegistry.register(new ExecuteSmartPathTool());
    toolRegistry.register(new ListSmartPathsTool());

    // Workspace management tools
    toolRegistry.register(new CreateWorkspaceTool());
    toolRegistry.register(new ListWorkspacesTool());
    toolRegistry.register(new SwitchWorkspaceTool());
    toolRegistry.register(new SyncWorkspaceTool());
    toolRegistry.register(new TrackFileTool());
    toolRegistry.register(new GetWorkspaceStatsTool());
    toolRegistry.register(new DeleteWorkspaceTool());
    toolRegistry.register(new ExportWorkspaceTemplateTool());

    // File parsing
    toolRegistry.register(container.get(ParseFileTool));

    // Metrics and diagnostics
    toolRegistry.register(new GetMetricsTool());
    toolRegistry.register(new SecurityDiagnosticsTool());
    toolRegistry.register(new DatabaseHealthTool());

    logger.debug('Tools registered successfully including workspace management');
  }

  private static async initializeResources(container: Container): Promise<void> {
    const resourceRegistry = container.get<IResourceRegistry>('ResourceRegistry');

    // Project files resource
    resourceRegistry.register(container.get(ProjectFilesResource));

    logger.debug('Resources registered successfully');
  }

  private static async initializePrompts(container: Container): Promise<void> {
    const promptRegistry = container.get<IPromptRegistry>('PromptRegistry');

    // Context summary prompt
    promptRegistry.register(new ContextSummaryPrompt());

    logger.debug('Prompts registered successfully');
  }
}
