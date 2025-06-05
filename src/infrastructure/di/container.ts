// src/infrastructure/di/container.ts - Updated with Enhanced Process Management
import { Container } from 'inversify';
import 'reflect-metadata';

// Interfaces
import type { IToolRegistry } from '../../core/interfaces/tool-registry.interface.js';
import type { IResourceRegistry } from '../../core/interfaces/resource-registry.interface.js';
import type { IPromptRegistry } from '../../core/interfaces/prompt-registry.interface.js';
import type { IFilesystemHandler } from '../../core/interfaces/filesystem.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import type { IEnhancedCLIHandler } from '../../core/interfaces/cli.interface.js'; // Only IEnhancedCLIHandler needed here
import type { ISmartPathManager } from '../../core/interfaces/smart-path.interface.js';
// IUserConsentService import removed
import type { IWorkspaceManager } from '../../core/interfaces/workspace.interface.js';
import type { IEmbeddingService } from '../../core/interfaces/semantic-context.interface.js';

// Implementations
import { ToolRegistry } from '../../application/services/tool-registry.service.js';
import { ResourceRegistry } from '../../application/services/resource-registry.service.js';
import { PromptRegistry } from '../../application/services/prompt-registry.service.js';
import { FilesystemAdapter } from '../adapters/filesystem.adapter.js';
import { DatabaseAdapter } from '../adapters/database.adapter.js';
import { EnhancedCLIAdapter } from '../adapters/enhanced-cli.adapter.js';
import { SmartPathManager } from '../../application/services/smart-path-manager.service.js';
// UserConsentService import removed
import { WorkspaceManager } from '../../application/services/workspace-manager.service.js';
import { EmbeddingService } from '../../application/services/embedding.service.js';

// Enhanced File Operations Tools
import {
  EditFileTool,
  BatchEditFileTool,
  SearchFilesTool,
  FindFilesTool
} from '../../application/tools/enhanced-file-operations.tool.js';

// Backup Management Tools
import {
  ListBackupsTool,
  BackupStatsTool,
  RestoreBackupTool,
  ViewBackupTool,
  CleanupBackupsTool
} from '../../application/tools/backup-management.tool.js';

// Tools, Resources, Prompts
import { ParseFileTool } from '../../application/tools/file-parsing.tool.js';
import { ProjectFilesResource } from '../../application/resources/project-files.resource.js';

// Process Management Tool (NEW)
import { ProcessManagementTool } from '../../application/tools/process-management.tool.js';

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

// UI Bridges
// ConsentUIBridge import removed

export const container = new Container({ autoBindInjectable: true });

// Core services
container.bind<IToolRegistry>('ToolRegistry').to(ToolRegistry).inSingletonScope();
container.bind<IResourceRegistry>('ResourceRegistry').to(ResourceRegistry).inSingletonScope();
container.bind<IPromptRegistry>('PromptRegistry').to(PromptRegistry).inSingletonScope();

// Infrastructure adapters
container.bind<IFilesystemHandler>('FilesystemHandler').to(FilesystemAdapter).inSingletonScope();
container.bind<IDatabaseHandler>('DatabaseHandler').to(DatabaseAdapter).inSingletonScope();
// Bind EnhancedCLIAdapter to IEnhancedCLIHandler for the 'CLIHandler' token
container.bind<IEnhancedCLIHandler>('CLIHandler').to(EnhancedCLIAdapter).inSingletonScope();
// Also bind to ICLIHandler if other components strictly need only the base interface
// container.bind<ICLIHandler>('CLIHandler').toService('EnhancedCLIAdapter'); // This is one way if EnhancedCLIAdapter is bound by its class
// Or, more simply, since IEnhancedCLIHandler extends ICLIHandler, the above binding should suffice.
// Enhanced File Operations Tools
container.bind<EditFileTool>(EditFileTool).to(EditFileTool).inSingletonScope();
container.bind<BatchEditFileTool>(BatchEditFileTool).to(BatchEditFileTool).inSingletonScope();
container.bind<SearchFilesTool>(SearchFilesTool).to(SearchFilesTool).inSingletonScope();
container.bind<FindFilesTool>(FindFilesTool).to(FindFilesTool).inSingletonScope();

// Backup Management Tools
container.bind<ListBackupsTool>(ListBackupsTool).to(ListBackupsTool).inSingletonScope();
container.bind<BackupStatsTool>(BackupStatsTool).to(BackupStatsTool).inSingletonScope();
container.bind<RestoreBackupTool>(RestoreBackupTool).to(RestoreBackupTool).inSingletonScope();
container.bind<ViewBackupTool>(ViewBackupTool).to(ViewBackupTool).inSingletonScope();
container.bind<CleanupBackupsTool>(CleanupBackupsTool).to(CleanupBackupsTool).inSingletonScope();
container.bind<ISmartPathManager>('SmartPathManager').to(SmartPathManager).inSingletonScope();
// UserConsentService binding removed
container.bind<IWorkspaceManager>('WorkspaceManager').to(WorkspaceManager).inSingletonScope();

// Semantic services
container.bind<IEmbeddingService>('EmbeddingService').to(EmbeddingService).inSingletonScope();

// UI Bridges
// ConsentUIBridge binding removed

// Enhanced File Operations Tools
container.bind<EditFileTool>(EditFileTool).to(EditFileTool).inSingletonScope();
container.bind<BatchEditFileTool>(BatchEditFileTool).to(BatchEditFileTool).inSingletonScope();
container.bind<SearchFilesTool>(SearchFilesTool).to(SearchFilesTool).inSingletonScope();
container.bind<FindFilesTool>(FindFilesTool).to(FindFilesTool).inSingletonScope();

// Process Management Tool (NEW)
container.bind<ProcessManagementTool>(ProcessManagementTool).to(ProcessManagementTool).inSingletonScope();

// Bind injectable tools and resources
container.bind<ParseFileTool>(ParseFileTool).to(ParseFileTool).inSingletonScope();
container.bind<ProjectFilesResource>(ProjectFilesResource).to(ProjectFilesResource).inSingletonScope();

// Semantic tools
container.bind<SemanticSearchTool>(SemanticSearchTool).to(SemanticSearchTool).inSingletonScope();
container.bind<FindRelatedContextTool>(FindRelatedContextTool).to(FindRelatedContextTool).inSingletonScope();
container
  .bind<CreateContextRelationshipTool>(CreateContextRelationshipTool)
  .to(CreateContextRelationshipTool)
  .inSingletonScope();
container.bind<UpdateEmbeddingsTool>(UpdateEmbeddingsTool).to(UpdateEmbeddingsTool).inSingletonScope();
container.bind<SemanticStatsTool>(SemanticStatsTool).to(SemanticStatsTool).inSingletonScope();

// Enhanced database operation tools
container.bind<EnhancedStoreContextTool>(EnhancedStoreContextTool).to(EnhancedStoreContextTool).inSingletonScope();
container.bind<EnhancedQueryContextTool>(EnhancedQueryContextTool).to(EnhancedQueryContextTool).inSingletonScope();
