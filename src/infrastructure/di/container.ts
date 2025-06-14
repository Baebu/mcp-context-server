// src/infrastructure/di/container.ts - Updated with Enhanced Process Management
import { Container } from 'inversify';
import 'reflect-metadata';

// Interfaces
import type { IToolRegistry } from '../../core/interfaces/tool-registry.interface.js';
import type { IResourceRegistry } from '../../core/interfaces/resource-registry.interface.js';
import type { IPromptRegistry } from '../../core/interfaces/prompt-registry.interface.js';
import type { IFilesystemHandler } from '../../core/interfaces/filesystem.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import type { IEnhancedCLIHandler } from '../../core/interfaces/cli.interface.js';
import type { ISmartPathManager } from '../../core/interfaces/smart-path.interface.js';
import type { IWorkspaceManager } from '../../core/interfaces/workspace.interface.js';
import type { IEmbeddingService } from '../../core/interfaces/semantic-context.interface.js';
import type { ISecurityValidator } from '../../core/interfaces/security.interface.js';

// Implementations
import { ToolRegistry } from '../../application/services/tool-registry.service.js';
import { ResourceRegistry } from '../../application/services/resource-registry.service.js';
import { PromptRegistry } from '../../application/services/prompt-registry.service.js';
import { FilesystemAdapter } from '../adapters/filesystem.adapter.js';
import { DatabaseAdapter } from '../adapters/database.adapter.js';
import { EnhancedCLIAdapter } from '../adapters/enhanced-cli.adapter.js';
import { SmartPathManager } from '../../application/services/smart-path-manager.service.js';
import { WorkspaceManager } from '../../application/services/workspace-manager.service.js';
import { EmbeddingService } from '../../application/services/embedding.service.js';
import { SecurityValidatorService } from '../../application/services/security-validator.service.js';
import { ConfigManagerService } from '../../application/services/config-manager.service.js';

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

// Database operation tools (now consolidated and enhanced)
import {
  StoreContextTool, // Now represents the enhanced version
  GetContextTool
} from '../../application/tools/database-operations.tool.js'; // Consolidated path

// Tools, Resources, Prompts
import { ParseFileTool } from '../../application/tools/file-parsing.tool.js';
import { ProjectFilesResource } from '../../application/resources/project-files.resource.js';

// Process Management Tool (NEW)
import { ProcessManagementTool } from '../../application/tools/process-management.tool.js';

// New Consolidated Tools
import { GetSystemHealthTool } from '../../application/tools/system-health.tool.js';
import { GetProjectOverviewTool } from '../../application/tools/project-overview.tool.js';

// Enhanced Security Diagnostics Tool (NEW)
import { EnhancedSecurityDiagnosticsTool } from '../../application/tools/enhanced-security-diagnostics.tool.js';
import { ConfigManagementTool } from '../../application/tools/config-management.tool.js';

// Semantic Tools
import {
  SemanticSearchTool,
  FindRelatedContextTool,
  CreateContextRelationshipTool,
  UpdateEmbeddingsTool
} from '../../application/tools/semantic-search.tool.js';

export const container = new Container({ autoBindInjectable: true });

// Core services
container.bind<IToolRegistry>('ToolRegistry').to(ToolRegistry).inSingletonScope();
container.bind<IResourceRegistry>('ResourceRegistry').to(ResourceRegistry).inSingletonScope();
container.bind<IPromptRegistry>('PromptRegistry').to(PromptRegistry).inSingletonScope();

// Infrastructure adapters
container.bind<IFilesystemHandler>('FilesystemHandler').to(FilesystemAdapter).inSingletonScope();
container.bind<IDatabaseHandler>('DatabaseHandler').to(DatabaseAdapter).inSingletonScope();
container.bind<IEnhancedCLIHandler>('CLIHandler').to(EnhancedCLIAdapter).inSingletonScope();
container.bind<ISecurityValidator>('SecurityValidator').to(SecurityValidatorService).inSingletonScope();
container.bind<ConfigManagerService>(ConfigManagerService).to(ConfigManagerService).inSingletonScope();

// Enhanced File Operations Tools
container.bind<SearchFilesTool>(SearchFilesTool).to(SearchFilesTool).inSingletonScope();
container.bind<FindFilesTool>(FindFilesTool).to(FindFilesTool).inSingletonScope();
container.bind<ContentEditFileTool>(ContentEditFileTool).to(ContentEditFileTool).inSingletonScope();

// Backup Management Tools
container.bind<ListBackupsTool>(ListBackupsTool).to(ListBackupsTool).inSingletonScope();
container.bind<BackupStatsTool>(BackupStatsTool).to(BackupStatsTool).inSingletonScope();
container.bind<RestoreBackupTool>(RestoreBackupTool).to(RestoreBackupTool).inSingletonScope();
container.bind<ViewBackupTool>(ViewBackupTool).to(ViewBackupTool).inSingletonScope();
container.bind<CleanupBackupsTool>(CleanupBackupsTool).to(CleanupBackupsTool).inSingletonScope();

// Database Operation Tools (now consolidated and enhanced)
container.bind<StoreContextTool>(StoreContextTool).to(StoreContextTool).inSingletonScope(); // Binding the renamed class
container.bind<GetContextTool>(GetContextTool).to(GetContextTool).inSingletonScope(); // Keep GetContextTool binding

// Removed: QueryContextTool, EnhancedStoreContextTool and EnhancedQueryContextTool bindings

container.bind<ISmartPathManager>('SmartPathManager').to(SmartPathManager).inSingletonScope();
container.bind<IWorkspaceManager>('WorkspaceManager').to(WorkspaceManager).inSingletonScope();

// Semantic services
container.bind<IEmbeddingService>('EmbeddingService').to(EmbeddingService).inSingletonScope();

// Process Management Tool (NEW)
container.bind<ProcessManagementTool>(ProcessManagementTool).to(ProcessManagementTool).inSingletonScope();

// New Consolidated Tools
container.bind<GetSystemHealthTool>(GetSystemHealthTool).to(GetSystemHealthTool).inSingletonScope();
container.bind<GetProjectOverviewTool>(GetProjectOverviewTool).to(GetProjectOverviewTool).inSingletonScope();

// Enhanced Security Diagnostics Tool (NEW)
container
  .bind<EnhancedSecurityDiagnosticsTool>(EnhancedSecurityDiagnosticsTool)
  .to(EnhancedSecurityDiagnosticsTool)
  .inSingletonScope();
container.bind<ConfigManagementTool>(ConfigManagementTool).to(ConfigManagementTool).inSingletonScope();

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
// SemanticStatsTool removed - functionality consolidated into system-health.tool.ts
