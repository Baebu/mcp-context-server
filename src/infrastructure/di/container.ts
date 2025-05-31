import { Container } from 'inversify';
import 'reflect-metadata';

// Interfaces
import type { IToolRegistry } from '@core/interfaces/tool-registry.interface.js';
import type { IResourceRegistry } from '@core/interfaces/resource-registry.interface.js';
import type { IPromptRegistry } from '@core/interfaces/prompt-registry.interface.js';
import type { IFilesystemHandler } from '@core/interfaces/filesystem.interface.js';
import type { IDatabaseHandler } from '@core/interfaces/database.interface.js';
import type { ICLIHandler } from '@core/interfaces/cli.interface.js';
import type { ISecurityValidator } from '@core/interfaces/security.interface.js';
import type { ISmartPathManager } from '@core/interfaces/smart-path.interface.js';

// Implementations
import { ToolRegistry } from '@application/services/tool-registry.service.js';
import { ResourceRegistry } from '@application/services/resource-registry.service.js';
import { PromptRegistry } from '@application/services/prompt-registry.service.js';
import { FilesystemAdapter } from '@infrastructure/adapters/filesystem.adapter.js';
import { DatabaseAdapter } from '@infrastructure/adapters/database.adapter.js';
import { CLIAdapter } from '@infrastructure/adapters/cli.adapter.js';
import { SecurityValidator } from '@application/services/security-validator.service.js';
import { SmartPathManager } from '@application/services/smart-path-manager.service.js';

// Tools
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from '@application/tools/file-operations.tool.js';
import { ExecuteCommandTool } from '@application/tools/command-execution.tool.js';
import { StoreContextTool, GetContextTool, QueryContextTool } from '@application/tools/database-operations.tool.js';
import { CreateSmartPathTool, ExecuteSmartPathTool } from '@application/tools/smart-path.tool.js';

export const container = new Container({ autoBindInjectable: true });

// Core services
container.bind<IToolRegistry>('ToolRegistry').to(ToolRegistry).inSingletonScope();
container.bind<IResourceRegistry>('ResourceRegistry').to(ResourceRegistry).inSingletonScope();
container.bind<IPromptRegistry>('PromptRegistry').to(PromptRegistry).inSingletonScope();

// Infrastructure adapters
container.bind<IFilesystemHandler>('FilesystemHandler').to(FilesystemAdapter).inSingletonScope();
container.bind<IDatabaseHandler>('DatabaseHandler').to(DatabaseAdapter).inSingletonScope();
container.bind<ICLIHandler>('CLIHandler').to(CLIAdapter).inSingletonScope();

// Application services
container.bind<ISecurityValidator>('SecurityValidator').to(SecurityValidator).inSingletonScope();
container.bind<ISmartPathManager>('SmartPathManager').to(SmartPathManager).inSingletonScope();

// Register tools
container.bind<ReadFileTool>('Tool:read_file').to(ReadFileTool);
container.bind<WriteFileTool>('Tool:write_file').to(WriteFileTool);
container.bind<ListDirectoryTool>('Tool:list_directory').to(ListDirectoryTool);
container.bind<ExecuteCommandTool>('Tool:execute_command').to(ExecuteCommandTool);
container.bind<StoreContextTool>('Tool:store_context').to(StoreContextTool);
container.bind<GetContextTool>('Tool:get_context').to(GetContextTool);
container.bind<QueryContextTool>('Tool:query_context').to(QueryContextTool);
container.bind<CreateSmartPathTool>('Tool:create_smart_path').to(CreateSmartPathTool);
container.bind<ExecuteSmartPathTool>('Tool:execute_smart_path').to(ExecuteSmartPathTool);
