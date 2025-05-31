// src/application/services/workspace-manager.service.ts
import { injectable, inject } from 'inversify';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  IWorkspaceManager,
  Workspace,
  WorkspaceConfig,
  WorkspaceFile,
  WorkspaceStats,
  WorkspaceTemplate,
  FileStructure // Added import
} from '@core/interfaces/workspace.interface.js';
import type { IDatabaseHandler } from '@core/interfaces/database.interface.js';
import type { IFilesystemHandler } from '@core/interfaces/filesystem.interface.js';
import type { ISmartPathManager } from '@core/interfaces/smart-path.interface.js';
import { logger } from '../../utils/logger.js';

@injectable()
export class WorkspaceManager implements IWorkspaceManager {
  private activeWorkspace: Workspace | null = null;
  private workspaceCache = new Map<string, Workspace>();

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler,
    @inject('FilesystemHandler') private filesystem: IFilesystemHandler,
    @inject('SmartPathManager') private smartPathManager: ISmartPathManager
  ) {
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    // Ensure workspace tables exist (already in schema, but good to verify)
    await this.db.executeCommand(
      `
      CREATE TABLE IF NOT EXISTS workspace_metadata (
        workspace_id TEXT PRIMARY KEY,
        last_accessed_at TEXT,
        metadata TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `,
      []
    );
  }

  async createWorkspace(name: string, config: WorkspaceConfig): Promise<Workspace> {
    const id = randomUUID();
    const workspace: Workspace = {
      id,
      name,
      config,
      createdAt: new Date()
    };

    // Validate root path
    await this.filesystem.listDirectory(config.rootPath); // This will throw if invalid

    // Store in database
    await this.db.executeCommand('INSERT INTO workspaces (id, name, config, created_at) VALUES (?, ?, ?, ?)', [
      id,
      name,
      JSON.stringify(config),
      workspace.createdAt.toISOString()
    ]);

    // Auto-detect git repository
    if (config.gitEnabled !== false) {
      try {
        await fs.access(path.join(config.rootPath, '.git'));
        workspace.config.gitEnabled = true;
      } catch {
        workspace.config.gitEnabled = false;
      }
    }

    // Create default smart paths for the workspace
    await this.createDefaultSmartPaths(workspace);

    this.workspaceCache.set(id, workspace);
    logger.info({ workspaceId: id, name, rootPath: config.rootPath }, 'Workspace created');

    return workspace;
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    // Check cache first
    if (this.workspaceCache.has(id)) {
      return this.workspaceCache.get(id)!;
    }

    const row = (await this.db.getSingle('SELECT * FROM workspaces WHERE id = ?', [id])) as {
      id: string;
      name: string;
      config: string;
      created_at: string;
    } | null;

    if (!row) {
      return null;
    }

    const workspace: Workspace = {
      id: row.id,
      name: row.name,
      config: JSON.parse(row.config),
      createdAt: new Date(row.created_at)
    };

    // Get metadata
    const metaRow = (await this.db.getSingle('SELECT * FROM workspace_metadata WHERE workspace_id = ?', [id])) as {
      last_accessed_at: string;
      metadata: string;
    } | null;

    if (metaRow) {
      workspace.lastAccessedAt = new Date(metaRow.last_accessed_at);
      workspace.metadata = JSON.parse(metaRow.metadata);
    }

    this.workspaceCache.set(id, workspace);
    return workspace;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const rows = (await this.db.executeQuery('SELECT * FROM workspaces ORDER BY created_at DESC', [])) as Array<{
      id: string;
      name: string;
      config: string;
      created_at: string;
    }>;

    const workspaces = await Promise.all(rows.map(row => this.getWorkspace(row.id)));

    return workspaces.filter((ws): ws is Workspace => ws !== null);
  }

  async updateWorkspace(id: string, updates: Partial<WorkspaceConfig>): Promise<void> {
    const workspace = await this.getWorkspace(id);
    if (!workspace) {
      throw new Error(`Workspace not found: ${id}`);
    }

    workspace.config = { ...workspace.config, ...updates };

    await this.db.executeCommand('UPDATE workspaces SET config = ? WHERE id = ?', [
      JSON.stringify(workspace.config),
      id
    ]);

    this.workspaceCache.set(id, workspace);
    logger.info({ workspaceId: id, updates }, 'Workspace updated');
  }

  async deleteWorkspace(id: string): Promise<boolean> {
    // Delete all associated context items
    const prefix = `workspace:${id}:`;
    const contextItems = await this.db.queryContext({ keyPattern: prefix });

    for (const item of contextItems) {
      await this.db.deleteContext(item.key);
    }

    // Delete workspace
    const result = await this.db.executeCommand('DELETE FROM workspaces WHERE id = ?', [id]);

    this.workspaceCache.delete(id);

    if (this.activeWorkspace?.id === id) {
      this.activeWorkspace = null;
    }

    logger.info({ workspaceId: id, deleted: result.changes > 0 }, 'Workspace deleted');
    return result.changes > 0;
  }

  async setActiveWorkspace(id: string): Promise<void> {
    const workspace = await this.getWorkspace(id);
    if (!workspace) {
      throw new Error(`Workspace not found: ${id}`);
    }

    this.activeWorkspace = workspace;

    // Update last accessed time
    await this.db.executeCommand(
      `INSERT OR REPLACE INTO workspace_metadata (workspace_id, last_accessed_at, metadata)
       VALUES (?, ?, ?)`,
      [id, new Date().toISOString(), JSON.stringify(workspace.metadata || {})]
    );

    logger.info({ workspaceId: id, name: workspace.name }, 'Active workspace set');
  }

  getActiveWorkspace(): Workspace | null {
    return this.activeWorkspace;
  }

  async trackFile(workspaceId: string, filePath: string): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Get file metadata
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspace.config.rootPath, filePath);

    const stats = await fs.stat(absolutePath);
    const content = await fs.readFile(absolutePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    const metadata = {
      size: stats.size,
      modified: stats.mtime,
      hash,
      tracked: true
    };

    await this.db.executeCommand(
      `INSERT OR REPLACE INTO workspace_files (workspace_id, file_path, metadata, last_modified)
       VALUES (?, ?, ?, ?)`,
      [workspaceId, filePath, JSON.stringify(metadata), stats.mtime.toISOString()]
    );

    logger.debug({ workspaceId, filePath }, 'File tracked in workspace');
  }

  async untrackFile(workspaceId: string, filePath: string): Promise<void> {
    await this.db.executeCommand('DELETE FROM workspace_files WHERE workspace_id = ? AND file_path = ?', [
      workspaceId,
      filePath
    ]);

    logger.debug({ workspaceId, filePath }, 'File untracked from workspace');
  }

  async getWorkspaceFiles(workspaceId: string): Promise<WorkspaceFile[]> {
    const rows = (await this.db.executeQuery(
      'SELECT * FROM workspace_files WHERE workspace_id = ? ORDER BY file_path',
      [workspaceId]
    )) as Array<{
      workspace_id: string;
      file_path: string;
      metadata: string;
      last_modified: string;
    }>;

    return rows.map(row => ({
      workspaceId: row.workspace_id,
      filePath: row.file_path,
      metadata: JSON.parse(row.metadata),
      lastModified: new Date(row.last_modified)
    }));
  }

  async syncWorkspace(id: string): Promise<{ added: number; updated: number; removed: number }> {
    const workspace = await this.getWorkspace(id);
    if (!workspace) {
      throw new Error(`Workspace not found: ${id}`);
    }

    const stats = { added: 0, updated: 0, removed: 0 };
    const existingFiles = await this.getWorkspaceFiles(id);
    const existingFilesMap = new Map(existingFiles.map(f => [f.filePath, f]));

    // Scan workspace directory
    const currentFiles = await this.scanDirectory(workspace.config.rootPath, workspace.config.patterns);

    // Track new and updated files
    for (const filePath of currentFiles) {
      const relativePath = path.relative(workspace.config.rootPath, filePath);
      const existing = existingFilesMap.get(relativePath);

      if (!existing) {
        await this.trackFile(id, relativePath);
        stats.added++;
      } else {
        // Check if file has been modified
        const currentStats = await fs.stat(filePath);
        if (currentStats.mtime > existing.lastModified) {
          await this.trackFile(id, relativePath);
          stats.updated++;
        }
        existingFilesMap.delete(relativePath);
      }
    }

    // Remove files that no longer exist
    for (const [filePath] of existingFilesMap) {
      await this.untrackFile(id, filePath);
      stats.removed++;
    }

    logger.info({ workspaceId: id, stats }, 'Workspace synchronized');
    return stats;
  }

  async getWorkspaceStats(id: string): Promise<WorkspaceStats> {
    const workspace = await this.getWorkspace(id);
    if (!workspace) {
      throw new Error(`Workspace not found: ${id}`);
    }

    // Get file stats
    const files = await this.getWorkspaceFiles(id);
    const fileCount = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.metadata.size, 0);

    // Get context item count
    const prefix = workspace.config.contextPrefix || `workspace:${id}:`;
    const contextItems = await this.db.queryContext({ keyPattern: prefix });
    const contextItemCount = contextItems.length;

    // Get last activity
    const lastActivity = files.reduce((latest, file) => {
      return file.lastModified > latest ? file.lastModified : latest;
    }, workspace.createdAt);

    // Get git status if enabled
    let gitStatus;
    if (workspace.config.gitEnabled) {
      try {
        // const { _CLIHandler } = this.filesystem as any; // Type assertion for simplicity, CLIHandler unused
        // This would use the CLI handler to run git commands
        // Simplified for this example
        gitStatus = {
          branch: 'main',
          ahead: 0,
          behind: 0,
          modified: 0
        };
      } catch {
        // Git status failed
      }
    }

    return {
      fileCount,
      totalSize,
      contextItemCount,
      lastActivity,
      gitStatus
    };
  }

  async createFromTemplate(name: string, templateId: string): Promise<Workspace> {
    const template = await this.getTemplate(templateId);

    // Create workspace with template config
    const workspace = await this.createWorkspace(name, template.config);

    // Create file structure
    if (template.structure) {
      await this.createFileStructure(workspace, template.structure);
    }

    // Set initial context
    if (template.initialContext) {
      for (const { key, value } of template.initialContext) {
        const contextKey = workspace.config.contextPrefix
          ? `${workspace.config.contextPrefix}${key}`
          : `workspace:${workspace.id}:${key}`;
        await this.db.storeContext(contextKey, value);
      }
    }

    // Run setup commands
    if (template.setupCommands) {
      // This would use the CLI handler to run commands
      logger.info({ workspaceId: workspace.id, commands: template.setupCommands }, 'Running setup commands');
    }

    return workspace;
  }

  async exportAsTemplate(workspaceId: string): Promise<WorkspaceTemplate> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const files = await this.getWorkspaceFiles(workspaceId);
    const structure: FileStructure = {};

    // Build file structure
    for (const file of files) {
      const fullPath = path.join(workspace.config.rootPath, file.filePath);
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        structure[file.filePath] = { type: 'directory' };
      } else {
        // Only include small text files in template
        if (file.metadata.size < 100000) {
          // 100KB limit
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            structure[file.filePath] = { type: 'file', content };
          } catch {
            // Binary file or read error
            structure[file.filePath] = { type: 'file' };
          }
        }
      }
    }

    // Export context items
    const prefix = workspace.config.contextPrefix || `workspace:${workspace.id}:`;
    const contextItems = await this.db.queryContext({ keyPattern: prefix });
    const initialContext = contextItems.map(item => ({
      key: item.key.replace(prefix, ''),
      value: item.value
    }));

    return {
      id: randomUUID(),
      name: `${workspace.name} Template`,
      description: `Template created from workspace: ${workspace.name}`,
      config: workspace.config,
      structure,
      initialContext
    };
  }

  private async createDefaultSmartPaths(workspace: Workspace): Promise<void> {
    const smartPaths = [
      {
        name: `${workspace.name}_files`,
        type: 'file_set' as const,
        definition: {
          paths: [`${workspace.config.rootPath}/**/*.{js,ts,jsx,tsx,py,java,go}`],
          metadata: { workspace: workspace.id }
        }
      },
      {
        name: `${workspace.name}_context`,
        type: 'query_template' as const,
        definition: {
          queryType: 'key_pattern',
          allowedParams: ['keyPattern'],
          metadata: { workspace: workspace.id }
        }
      }
    ];

    for (const smartPath of smartPaths) {
      try {
        const id = await this.smartPathManager.create(smartPath);
        if (!workspace.config.smartPaths) {
          workspace.config.smartPaths = [];
        }
        workspace.config.smartPaths.push(id);
      } catch (error) {
        logger.warn({ error, smartPath }, 'Failed to create default smart path');
      }
    }
  }

  private async scanDirectory(
    rootPath: string,
    patterns?: { include?: string[]; exclude?: string[] }
  ): Promise<string[]> {
    const files: string[] = [];

    const scan = async (dir: string): Promise<void> => {
      const entries = await this.filesystem.listDirectory(dir, {
        includeHidden: false,
        includeMetadata: false
      });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(rootPath, fullPath);

        // Check exclude patterns
        if (patterns?.exclude) {
          const shouldExclude = patterns.exclude.some(pattern => this.matchesPattern(relativePath, pattern));
          if (shouldExclude) continue;
        }

        // Check include patterns
        if (patterns?.include) {
          const shouldInclude = patterns.include.some(pattern => this.matchesPattern(relativePath, pattern));
          if (!shouldInclude && entry.type === 'file') continue;
        }

        if (entry.type === 'file') {
          files.push(fullPath);
        } else if (entry.type === 'directory') {
          await scan(fullPath);
        }
      }
    };

    await scan(rootPath);
    return files;
  }

  private matchesPattern(path: string, pattern: string): boolean {
    // Simple glob matching
    const regex = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.');

    return new RegExp(`^${regex}$`).test(path);
  }

  private async createFileStructure(workspace: Workspace, structure: FileStructure): Promise<void> {
    for (const [filePath, spec] of Object.entries(structure)) {
      const fullPath = path.join(workspace.config.rootPath, filePath);

      if (spec.type === 'directory') {
        await fs.mkdir(fullPath, { recursive: true });
      } else if (spec.type === 'file' && spec.content) {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, spec.content);
        await this.trackFile(workspace.id, filePath);
      }
    }
  }

  private async getTemplate(templateId: string): Promise<WorkspaceTemplate> {
    // In a real implementation, this would load from a template registry
    // For now, return a simple template
    const templates: Record<string, WorkspaceTemplate> = {
      'node-typescript': {
        id: 'node-typescript',
        name: 'Node.js TypeScript Project',
        description: 'A basic Node.js project with TypeScript',
        config: {
          rootPath: '.',
          type: 'project',
          gitEnabled: true,
          patterns: {
            include: ['src/**/*.ts', 'package.json', 'tsconfig.json'],
            exclude: ['node_modules/**', 'dist/**', '*.log']
          }
        },
        structure: {
          src: { type: 'directory' },
          'src/index.ts': { type: 'file', content: 'console.log("Hello, World!");' },
          'package.json': {
            type: 'file',
            content: JSON.stringify(
              {
                name: 'my-project',
                version: '1.0.0',
                scripts: { dev: 'ts-node src/index.ts' }
              },
              null,
              2
            )
          },
          'tsconfig.json': {
            type: 'file',
            content: JSON.stringify(
              {
                compilerOptions: {
                  target: 'ES2022',
                  module: 'commonjs',
                  outDir: './dist',
                  rootDir: './src',
                  strict: true
                }
              },
              null,
              2
            )
          }
        },
        initialContext: [
          { key: 'project_type', value: 'node-typescript' },
          { key: 'setup_complete', value: false }
        ],
        setupCommands: ['npm init -y', 'npm install -D typescript ts-node @types/node']
      }
    };

    const template = templates[templateId];
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return template;
  }
}
