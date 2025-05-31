import type { Container } from 'inversify';
import type { IToolRegistry } from '../../core/interfaces/tool-registry.interface.js';
import type { IResourceRegistry } from '../../core/interfaces/resource-registry.interface.js';
import type { IPromptRegistry } from '../../core/interfaces/prompt-registry.interface.js';

// Tools
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from '../../application/tools/file-operations.tool.js';
import { ExecuteCommandTool } from '../../application/tools/command-execution.tool.js';
import {
  StoreContextTool,
  GetContextTool,
  QueryContextTool
} from '../../application/tools/database-operations.tool.js';
import { CreateSmartPathTool, ExecuteSmartPathTool } from '../../application/tools/smart-path.tool.js';
import { ParseFileTool } from '../../application/tools/file-parsing.tool.js';
import { GetMetricsTool } from '../../application/tools/metrics.tool.js';

// Resources
import { ProjectFilesResource } from '../../application/resources/project-files.resource.js';

// Prompts
import { ContextSummaryPrompt } from '../../application/prompts/context-summary.prompt.js';

import { logger } from '../../utils/logger.js';

export class ContainerInitializer {
  static async initialize(container: Container): Promise<void> {
    logger.info('Initializing container with tools, resources, and prompts...');

    // Initialize and register tools
    await this.initializeTools(container);

    // Initialize and register resources
    await this.initializeResources(container);

    // Initialize and register prompts
    await this.initializePrompts(container);

    logger.info('Container initialization complete');
  }

  private static async initializeTools(container: Container): Promise<void> {
    const toolRegistry = container.get<IToolRegistry>('ToolRegistry');

    // File operations
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileTool());
    toolRegistry.register(new ListDirectoryTool());

    // Command execution
    toolRegistry.register(new ExecuteCommandTool());

    // Database operations
    toolRegistry.register(new StoreContextTool());
    toolRegistry.register(new GetContextTool());
    toolRegistry.register(new QueryContextTool());

    // Smart paths
    toolRegistry.register(new CreateSmartPathTool());
    toolRegistry.register(new ExecuteSmartPathTool());

    // File parsing
    toolRegistry.register(container.get(ParseFileTool));

    // Metrics
    toolRegistry.register(new GetMetricsTool());

    logger.debug('Tools registered successfully');
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
