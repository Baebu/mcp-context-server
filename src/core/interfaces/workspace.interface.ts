// src/core/interfaces/workspace.interface.ts
export interface Workspace {
  id: string;
  name: string;
  config: WorkspaceConfig;
  createdAt: Date;
  lastAccessedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceConfig {
  rootPath: string;
  type?: 'project' | 'scratch' | 'shared';
  gitEnabled?: boolean;
  patterns?: {
    include?: string[];
    exclude?: string[];
  };
  environment?: Record<string, string>;
  smartPaths?: string[]; // IDs of associated smart paths
  contextPrefix?: string; // Prefix for context keys in this workspace
}

export interface WorkspaceFile {
  workspaceId: string;
  filePath: string;
  metadata: {
    size: number;
    modified: Date;
    hash?: string;
    tracked: boolean;
  };
  lastModified: Date;
}

export interface WorkspaceStats {
  fileCount: number;
  totalSize: number;
  contextItemCount: number;
  lastActivity: Date;
  gitStatus?: {
    branch: string;
    ahead: number;
    behind: number;
    modified: number;
  };
}

export interface IWorkspaceManager {
  createWorkspace(name: string, config: WorkspaceConfig): Promise<Workspace>;
  getWorkspace(id: string): Promise<Workspace | null>;
  listWorkspaces(): Promise<Workspace[]>;
  updateWorkspace(id: string, updates: Partial<WorkspaceConfig>): Promise<void>;
  deleteWorkspace(id: string): Promise<boolean>;

  // Active workspace management
  setActiveWorkspace(id: string): Promise<void>;
  getActiveWorkspace(): Workspace | null;

  // File tracking
  trackFile(workspaceId: string, filePath: string): Promise<void>;
  untrackFile(workspaceId: string, filePath: string): Promise<void>;
  getWorkspaceFiles(workspaceId: string): Promise<WorkspaceFile[]>;

  // Workspace operations
  syncWorkspace(id: string): Promise<{ added: number; updated: number; removed: number }>;
  getWorkspaceStats(id: string): Promise<WorkspaceStats>;

  // Template operations
  createFromTemplate(name: string, templateId: string): Promise<Workspace>;
  exportAsTemplate(workspaceId: string): Promise<WorkspaceTemplate>;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  config: WorkspaceConfig;
  structure?: FileStructure;
  initialContext?: Array<{ key: string; value: unknown }>;
  setupCommands?: string[];
}

export interface FileStructure {
  [path: string]: {
    type: 'file' | 'directory';
    content?: string;
    template?: string; // Template name for content generation
  };
}
