// Project Overview Tool for Comprehensive Project Analysis
// File: src/application/tools/project-overview.tool.ts

import { injectable } from 'inversify';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import type { IWorkspaceManager } from '@core/interfaces/workspace.interface.js';

const getProjectOverviewSchema = z.object({
  path: z.string().optional().describe('Project path to analyze (defaults to current workspace or working directory)'),
  includeFileTree: z.boolean().default(true).describe('Include file tree structure'),
  includeStats: z.boolean().default(true).describe('Include project statistics'),
  includeContext: z.boolean().default(true).describe('Include related context from database'),
  includeGitInfo: z.boolean().default(true).describe('Include Git repository information'),
  includePackageInfo: z.boolean().default(true).describe('Include package.json/dependency information'),
  includeTechnologies: z.boolean().default(true).describe('Analyze and detect technologies used'),
  maxDepth: z.number().int().min(1).default(3).describe('Maximum depth for file tree display'),
  maxFiles: z.number().int().min(1).default(50).describe('Maximum files to include in tree'),
  excludePatterns: z.array(z.string()).default(['node_modules', '.git', 'dist', 'build', '*.log']).describe('Patterns to exclude from analysis')
});

interface ProjectOverview {
  projectPath: string;
  projectName: string;
  overview: {
    description?: string;
    type: string;
    primaryLanguage?: string;
    technologies: string[];
    totalFiles: number;
    totalSize: number;
    lastModified: Date;
  };
  fileTree?: {
    structure: any;
    summary: {
      directories: number;
      files: number;
      fileTypes: Record<string, number>;
    };
  };
  statistics?: {
    fileCount: number;
    directoryCount: number;
    totalSize: string;
    averageFileSize: string;
    largestFiles: Array<{ path: string; size: number; sizeHuman: string }>;
    fileTypeDistribution: Record<string, { count: number; totalSize: number; percentage: number }>;
    codeMetrics?: {
      totalLines: number;
      estimatedCodeLines: number;
      commentLines: number;
      blankLines: number;
    };
  };
  contextInfo?: {
    relatedContextItems: number;
    recentContextKeys: string[];
    workspaceInfo?: any;
  };
  gitInfo?: {
    isGitRepo: boolean;
    currentBranch?: string;
    lastCommit?: {
      hash: string;
      message: string;
      author: string;
      date: Date;
    };
    status?: {
      modified: number;
      added: number;
      deleted: number;
      untracked: number;
    };
  };
  packageInfo?: {
    hasPackageJson: boolean;
    packageName?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    main?: string;
    type?: string;
  };
  recommendations: string[];
  generatedAt: Date;
}



@injectable()
export class GetProjectOverviewTool implements IMCPTool<z.infer<typeof getProjectOverviewSchema>> {
  name = 'get_project_overview';
  description = 'Get comprehensive overview and analysis of a project directory';
  schema = getProjectOverviewSchema as any;

  constructor() {
    // No dependencies needed for this tool
  }

  async execute(
    params: z.infer<typeof getProjectOverviewSchema>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const projectPath = await this.resolveProjectPath(params.path, context);
      const overview: ProjectOverview = {
        projectPath,
        projectName: path.basename(projectPath),
        overview: {
          type: 'unknown',
          technologies: [],
          totalFiles: 0,
          totalSize: 0,
          lastModified: new Date()
        },
        recommendations: [],
        generatedAt: new Date()
      };

      // Analyze project structure and gather information
      await this.analyzeProjectStructure(overview, params, context);

      if (params.includeFileTree) {
        overview.fileTree = await this.buildFileTree(projectPath, params);
      }

      if (params.includeStats) {
        overview.statistics = await this.gatherStatistics(projectPath, params);
        await this.analyzeCodeMetrics(overview, projectPath, params);
      }

      if (params.includeContext) {
        overview.contextInfo = await this.gatherContextInfo(projectPath, context);
      }

      if (params.includeGitInfo) {
        overview.gitInfo = await this.gatherGitInfo(projectPath);
      }

      if (params.includePackageInfo) {
        overview.packageInfo = await this.gatherPackageInfo(projectPath);
      }

      if (params.includeTechnologies) {
        await this.detectTechnologies(overview, projectPath);
      }

      // Generate recommendations
      this.generateRecommendations(overview);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(overview, this.jsonReplacer, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to generate project overview');
      throw error;
    }
  }

  private async resolveProjectPath(paramPath: string | undefined, context: ToolContext): Promise<string> {
    if (paramPath) {
      return path.resolve(paramPath);
    }

    // Try to get active workspace first
    try {
      const workspaceManager = context.container.get<IWorkspaceManager>('WorkspaceManager');
      const activeWorkspace = workspaceManager.getActiveWorkspace();
      if (activeWorkspace) {
        return activeWorkspace.config.rootPath;
      }
    } catch {
      // WorkspaceManager not available or no active workspace
    }

    // Fallback to current working directory
    return process.cwd();
  }

  private async analyzeProjectStructure(
    overview: ProjectOverview,
    _params: z.infer<typeof getProjectOverviewSchema>,
    context: ToolContext
  ): Promise<void> {
    const projectPath = overview.projectPath;

    try {
      const stats = await fs.stat(projectPath);
      overview.overview.lastModified = stats.mtime;

      // Read directory to get initial file count
      const items = await fs.readdir(projectPath, { withFileTypes: true });
      const files = items.filter(item => item.isFile());

      overview.overview.totalFiles = files.length;

      // Check for common project indicators
      const fileNames = files.map(f => f.name);
      
      if (fileNames.includes('package.json')) {
        overview.overview.type = 'Node.js/JavaScript';
      } else if (fileNames.includes('Cargo.toml')) {
        overview.overview.type = 'Rust';
      } else if (fileNames.includes('pom.xml') || fileNames.includes('build.gradle')) {
        overview.overview.type = 'Java';
      } else if (fileNames.includes('requirements.txt') || fileNames.includes('setup.py')) {
        overview.overview.type = 'Python';
      } else if (fileNames.includes('Gemfile')) {
        overview.overview.type = 'Ruby';
      } else if (fileNames.includes('composer.json')) {
        overview.overview.type = 'PHP';
      } else if (fileNames.includes('go.mod')) {
        overview.overview.type = 'Go';
      } else {
        overview.overview.type = 'General';
      }

      // Try to read project description from common files
      await this.extractProjectDescription(overview, projectPath);

    } catch (error) {
      context.logger.warn({ error, projectPath }, 'Failed to analyze project structure');
    }
  }

  private async extractProjectDescription(overview: ProjectOverview, projectPath: string): Promise<void> {
    const readmeFiles = ['README.md', 'README.txt', 'README.rst', 'README'];
    
    for (const readmeFile of readmeFiles) {
      try {
        const readmePath = path.join(projectPath, readmeFile);
        const content = await fs.readFile(readmePath, 'utf8');
        
        // Extract first paragraph or first meaningful line as description
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        const firstMeaningfulLine = lines.find(line => !line.startsWith('#') && line.length > 20);
        
        if (firstMeaningfulLine) {
          overview.overview.description = firstMeaningfulLine.substring(0, 200);
          break;
        }
      } catch {
        // Continue to next README file
      }
    }
  }

  private async buildFileTree(
    projectPath: string, 
    params: z.infer<typeof getProjectOverviewSchema>
  ): Promise<any> {
    const fileTree = {
      structure: {},
      summary: {
        directories: 0,
        files: 0,
        fileTypes: {} as Record<string, number>
      }
    };

    try {
      const excludePatterns = params.excludePatterns || [];
      const buildTree = async (dirPath: string, depth: number = 0): Promise<any> => {
        if (depth > (params.maxDepth || 3)) return null;

        const items = await fs.readdir(dirPath, { withFileTypes: true });
        const tree: any = {};
        let fileCount = 0;

        for (const item of items) {
          // Skip excluded patterns
          if (excludePatterns.some(pattern => item.name.match(new RegExp(pattern.replace('*', '.*'))))) {
            continue;
          }

          if (fileCount >= (params.maxFiles || 50)) break;

          const itemPath = path.join(dirPath, item.name);
          
          if (item.isDirectory()) {
            fileTree.summary.directories++;
            const subTree = await buildTree(itemPath, depth + 1);
            if (subTree && Object.keys(subTree).length > 0) {
              tree[item.name + '/'] = subTree;
            }
          } else {
            fileTree.summary.files++;
            const ext = path.extname(item.name).toLowerCase();
            fileTree.summary.fileTypes[ext] = (fileTree.summary.fileTypes[ext] || 0) + 1;
            
            try {
              const stats = await fs.stat(itemPath);
              tree[item.name] = {
                size: stats.size,
                modified: stats.mtime
              };
            } catch {
              tree[item.name] = { size: 0 };
            }
            fileCount++;
          }
        }

        return tree;
      };

      fileTree.structure = await buildTree(projectPath);
    } catch (error) {
      // Return empty tree on error
    }

    return fileTree;
  }

  private async gatherStatistics(
    projectPath: string,
    params: z.infer<typeof getProjectOverviewSchema>
  ): Promise<any> {
    const stats = {
      fileCount: 0,
      directoryCount: 0,
      totalSize: 0,
      averageFileSize: '0 B',
      largestFiles: [] as Array<{ path: string; size: number; sizeHuman: string }>,
      fileTypeDistribution: {} as Record<string, { count: number; totalSize: number; percentage: number }>
    };

    try {
      const excludePatterns = params.excludePatterns || [];
      const pattern = path.join(projectPath, '**/*');
      
      const files = await glob(pattern, {
        nodir: false,
        ignore: excludePatterns.map(p => path.join(projectPath, p))
      });

      const fileInfos: Array<{ path: string; size: number; isDir: boolean; ext: string }> = [];

      for (const file of files) {
        try {
          const fileStat = await fs.stat(file);
          const relativePath = path.relative(projectPath, file);
          const ext = path.extname(file).toLowerCase() || 'no-extension';

          if (fileStat.isDirectory()) {
            stats.directoryCount++;
          } else {
            stats.fileCount++;
            stats.totalSize += fileStat.size;
            
            fileInfos.push({
              path: relativePath,
              size: fileStat.size,
              isDir: false,
              ext
            });

            // Track file type distribution
            if (!stats.fileTypeDistribution[ext]) {
              stats.fileTypeDistribution[ext] = { count: 0, totalSize: 0, percentage: 0 };
            }
            stats.fileTypeDistribution[ext].count++;
            stats.fileTypeDistribution[ext].totalSize += fileStat.size;
          }
        } catch {
          // Skip files we can't stat
        }
      }

      // Calculate percentages and format sizes
      for (const ext in stats.fileTypeDistribution) {
        const typeInfo = stats.fileTypeDistribution[ext];
        if (typeInfo && stats.totalSize > 0) {
          typeInfo.percentage = Math.round((typeInfo.totalSize / stats.totalSize) * 100);
        }
      }

      // Get largest files
      stats.largestFiles = fileInfos
        .sort((a, b) => b.size - a.size)
        .slice(0, 10)
        .map(f => ({
          path: f.path,
          size: f.size,
          sizeHuman: this.formatBytes(f.size)
        }));

      const totalSizeFormatted = this.formatBytes(stats.totalSize);
      stats.averageFileSize = stats.fileCount > 0 
        ? this.formatBytes(fileInfos.reduce((sum, f) => sum + f.size, 0) / stats.fileCount)
        : '0 B';
      
      // Convert totalSize to formatted string after calculations
      (stats as any).totalSize = totalSizeFormatted;

    } catch (error) {
      // Return empty stats on error
    }

    return stats;
  }

  private async analyzeCodeMetrics(
    overview: ProjectOverview,
    projectPath: string,
    params: z.infer<typeof getProjectOverviewSchema>
  ): Promise<void> {
    if (!overview.statistics) return;

    const codeExtensions = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs', '.swift']);
    
    try {
      const pattern = path.join(projectPath, '**/*');
      const files = await glob(pattern, {
        nodir: true,
        ignore: (params.excludePatterns || []).map(p => path.join(projectPath, p))
      });

      let totalLines = 0;
      let estimatedCodeLines = 0;
      let commentLines = 0;
      let blankLines = 0;

      for (const file of files.slice(0, 100)) { // Limit to first 100 files for performance
        const ext = path.extname(file).toLowerCase();
        if (!codeExtensions.has(ext)) continue;

        try {
          const content = await fs.readFile(file, 'utf8');
          const lines = content.split('\n');
          totalLines += lines.length;

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '') {
              blankLines++;
            } else if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
              commentLines++;
            } else {
              estimatedCodeLines++;
            }
          }
        } catch {
          // Skip files we can't read
        }
      }

      overview.statistics.codeMetrics = {
        totalLines,
        estimatedCodeLines,
        commentLines,
        blankLines
      };
    } catch {
      // Skip code metrics on error
    }
  }

  private async gatherContextInfo(projectPath: string, context: ToolContext): Promise<any> {
    const contextInfo = {
      relatedContextItems: 0,
      recentContextKeys: [] as string[]
    };

    try {
      const db = context.container.get<IDatabaseHandler>('DatabaseHandler');
      const projectName = path.basename(projectPath);

      // Search for context items related to this project
      const searchQuery = `SELECT key FROM context_items WHERE key LIKE ? OR value LIKE ? ORDER BY updated_at DESC LIMIT 10`;
      const dbInstance = db.getDatabase();
      
      if (dbInstance) {
        const stmt = dbInstance.prepare(searchQuery);
        const results = stmt.all(`%${projectName}%`, `%${projectPath}%`);
        
        contextInfo.relatedContextItems = results.length;
        contextInfo.recentContextKeys = results.map((row: any) => row.key);
      }

      // Get workspace info if available
      try {
        const workspaceManager = context.container.get<IWorkspaceManager>('WorkspaceManager');
        const workspaces = await workspaceManager.listWorkspaces();
        const relatedWorkspace = workspaces.find(ws => ws.config.rootPath === projectPath);
        
        if (relatedWorkspace) {
          (contextInfo as any).workspaceInfo = {
            id: relatedWorkspace.id,
            name: relatedWorkspace.name,
            type: relatedWorkspace.config.type,
            createdAt: relatedWorkspace.createdAt
          };
        }
      } catch {
        // Workspace info not available
      }
    } catch {
      // Context info not available
    }

    return contextInfo;
  }

  private async gatherGitInfo(projectPath: string): Promise<any> {
    const gitInfo = { isGitRepo: false };

    try {
      const gitDir = path.join(projectPath, '.git');
      await fs.access(gitDir);
      gitInfo.isGitRepo = true;

      // This would require git commands which we can't execute
      // So we'll just mark it as a git repo for now
      return gitInfo;
    } catch {
      return gitInfo;
    }
  }

  private async gatherPackageInfo(projectPath: string): Promise<any> {
    const packageInfo = { hasPackageJson: false };

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const packageData = JSON.parse(content);

      return {
        hasPackageJson: true,
        packageName: packageData.name,
        version: packageData.version,
        dependencies: packageData.dependencies || {},
        devDependencies: packageData.devDependencies || {},
        scripts: packageData.scripts || {},
        main: packageData.main,
        type: packageData.type
      };
    } catch {
      return packageInfo;
    }
  }

  private async detectTechnologies(overview: ProjectOverview, projectPath: string): Promise<void> {
    const technologies = new Set<string>();

    try {
      const items = await fs.readdir(projectPath);
      
      // Detect by configuration files
      const techMap: Record<string, string[]> = {
        'package.json': ['Node.js', 'JavaScript'],
        'tsconfig.json': ['TypeScript'],
        'Cargo.toml': ['Rust'],
        'pom.xml': ['Java', 'Maven'],
        'build.gradle': ['Java', 'Gradle'],
        'requirements.txt': ['Python'],
        'setup.py': ['Python'],
        'Pipfile': ['Python', 'Pipenv'],
        'Gemfile': ['Ruby'],
        'composer.json': ['PHP'],
        'go.mod': ['Go'],
        'Dockerfile': ['Docker'],
        'docker-compose.yml': ['Docker', 'Docker Compose'],
        '.eslintrc.js': ['ESLint'],
        '.prettierrc': ['Prettier'],
        'webpack.config.js': ['Webpack'],
        'vite.config.js': ['Vite'],
        'next.config.js': ['Next.js'],
        'angular.json': ['Angular'],
        'vue.config.js': ['Vue.js']
      };

      for (const item of items) {
        if (techMap[item]) {
          techMap[item].forEach(tech => technologies.add(tech));
        }
      }

      // Detect by file extensions in the project
      try {
        const files = await glob(path.join(projectPath, '**/*'), { nodir: true });
        const extensions = new Set(files.map(f => path.extname(f).toLowerCase()));

        const extMap: Record<string, string[]> = {
          '.js': ['JavaScript'],
          '.ts': ['TypeScript'],
          '.jsx': ['React', 'JavaScript'],
          '.tsx': ['React', 'TypeScript'],
          '.vue': ['Vue.js'],
          '.py': ['Python'],
          '.rs': ['Rust'],
          '.java': ['Java'],
          '.cpp': ['C++'],
          '.c': ['C'],
          '.cs': ['C#'],
          '.php': ['PHP'],
          '.rb': ['Ruby'],
          '.go': ['Go'],
          '.swift': ['Swift'],
          '.kt': ['Kotlin'],
          '.dart': ['Dart'],
          '.scss': ['Sass'],
          '.less': ['Less'],
          '.sql': ['SQL']
        };

        for (const ext of extensions) {
          if (extMap[ext]) {
            extMap[ext].forEach(tech => technologies.add(tech));
          }
        }
      } catch {
        // Skip file extension detection on error
      }

      overview.overview.technologies = Array.from(technologies);

      // Determine primary language
      if (technologies.has('TypeScript')) {
        overview.overview.primaryLanguage = 'TypeScript';
      } else if (technologies.has('JavaScript')) {
        overview.overview.primaryLanguage = 'JavaScript';
      } else if (technologies.has('Python')) {
        overview.overview.primaryLanguage = 'Python';
      } else if (technologies.has('Java')) {
        overview.overview.primaryLanguage = 'Java';
      } else if (technologies.has('Rust')) {
        overview.overview.primaryLanguage = 'Rust';
      } else {
        overview.overview.primaryLanguage = Array.from(technologies)[0];
      }

    } catch {
      // Technology detection failed
    }
  }

  private generateRecommendations(overview: ProjectOverview): void {
    const recommendations: string[] = [];

    // General recommendations
    if (overview.overview.totalFiles > 100) {
      recommendations.push('📁 Large project detected - consider organizing with clear directory structure');
    }

    if (!overview.overview.description) {
      recommendations.push('📝 Add a README.md file with project description and setup instructions');
    }

    if (overview.packageInfo?.hasPackageJson && !overview.packageInfo.scripts?.test) {
      recommendations.push('🧪 Consider adding test scripts to package.json');
    }

    if (overview.gitInfo?.isGitRepo === false) {
      recommendations.push('📦 Initialize Git repository for version control');
    }

    if (overview.contextInfo?.relatedContextItems === 0) {
      recommendations.push('🤖 Start storing context about this project for better AI assistance');
    }

    if (overview.overview.technologies.includes('TypeScript') && !overview.overview.technologies.includes('ESLint')) {
      recommendations.push('🔍 Consider adding ESLint for TypeScript code quality');
    }

    if (overview.statistics?.codeMetrics && overview.statistics.codeMetrics.commentLines < overview.statistics.codeMetrics.estimatedCodeLines * 0.1) {
      recommendations.push('📄 Consider adding more code comments for maintainability');
    }

    if (overview.overview.technologies.includes('Node.js') && !overview.overview.technologies.includes('Docker')) {
      recommendations.push('🐳 Consider adding Docker for consistent deployment');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Project structure looks good - keep up the great work!');
    }

    overview.recommendations = recommendations;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private jsonReplacer(_key: string, value: any): any {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }
}
