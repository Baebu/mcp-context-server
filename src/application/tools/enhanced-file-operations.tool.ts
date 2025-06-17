// Enhanced File Operations Tool with Advanced Editing Capabilities
// File: src/application/tools/enhanced-file-operations.tool.ts

import { injectable } from 'inversify';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IFilesystemHandler } from '../../core/interfaces/filesystem.interface.js';
import { RollingBackupManager } from '../../utils/backup-manager.js';

// EditFileTool REMOVED - Functionality streamlined to use content_edit_file instead

// BatchEditFileTool REMOVED - Functionality streamlined to use content_edit_file for complex operations

// Schema for ContentEditFileTool
const contentEditFileSchema = z.object({
  path: z.string().describe('Path to the file to edit'),
  find: z.string().describe('Text or regex pattern to find'),
  replace: z.string().describe('Content to replace found instances with'),
  searchType: z.enum(['text', 'regex']).optional().default('text').describe('Type of search to perform'),
  caseSensitive: z.boolean().optional().default(false).describe('Case sensitive search'),
  allOccurrences: z.boolean().optional().default(true).describe('Replace all occurrences (false for first only)'),
  createBackup: z.boolean().optional().default(true).describe('Create backup before editing'),
  preview: z.boolean().optional().default(false).describe('Preview changes without applying')
});

@injectable()
export class ContentEditFileTool implements IMCPTool {
  name = 'content_edit_file';
  description = 'Find and replace content in a file using text or regex patterns';
  schema = contentEditFileSchema;

  async execute(params: z.infer<typeof contentEditFileSchema>, context: ToolContext): Promise<ToolResult> {
    const filesystem = context.container.get<IFilesystemHandler>('FilesystemHandler');

    try {
      const fileContent = await filesystem.readFileWithTruncation(params.path, 10485760); // 10MB limit
      const originalContent = fileContent.content;
      let newContent = originalContent;
      let replacementsMade = 0;

      const flags = params.caseSensitive ? 'g' : 'gi'; // 'g' for global, 'i' for case-insensitive
      const searchPattern = params.searchType === 'regex' ? params.find : this.escapeRegex(params.find);
      const regex = new RegExp(searchPattern, params.allOccurrences ? flags : flags.replace('g', ''));

      // Perform replacement and count changes
      newContent = originalContent.replace(regex, (_match: string, ..._args: any[]) => {
        replacementsMade++;
        // The replace function can receive matched groups,
        // so we need to correctly pass them to the replacement string.
        // For simple string replacement, this is fine. For regex with groups,
        // the replace string might use $1, $2 etc.
        // We'll just return the replace string as is, assuming it handles groups if regex is used.
        return params.replace;
      });

      if (params.preview) {
        return this.generateContentPreview(originalContent, newContent, params.find, params.replace, replacementsMade);
      }

      if (replacementsMade === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No occurrences of '${params.find}' found in ${params.path}. No changes made.`
            }
          ]
        };
      }

      // Create backup if requested
      if (params.createBackup) {
        const backupManager = new RollingBackupManager({
          maxBackupsPerDay: 15,
          keepDays: 14
        });
        const backupPath = await backupManager.createRollingBackup(params.path, originalContent, 'content-edit');
        const relativePath = path.relative(process.cwd(), backupPath);
        context.logger.info(`Organized backup created: ${relativePath}`);
      }

      // Write the modified content
      await filesystem.writeFile(params.path, newContent);

      return {
        content: [
          {
            type: 'text',
            text: `Content edited successfully in ${params.path}.\nReplaced '${params.find}' with '${params.replace}'.\nReplacements made: ${replacementsMade}.`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to edit file content');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to edit file content: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generateContentPreview(
    originalContent: string,
    newContent: string,
    findPattern: string,
    replaceContent: string,
    replacementsMade: number
  ): ToolResult {
    let preview = `Preview of content edit operation:\n\n`;
    preview += `File: ${findPattern}\n`;
    preview += `Replace with: ${replaceContent}\n`;
    preview += `Estimated replacements: ${replacementsMade}\n\n`;

    const originalLines = originalContent.split('\n');
    const newLines = newContent.split('\n');

    // Show a diff-like preview for the first few affected lines
    const maxPreviewLines = 20; // Limit preview output
    let previewText = '';
    let linesAdded = 0;
    let linesRemoved = 0;

    const diffLines: string[] = [];
    let originalIdx = 0;
    let newIdx = 0;

    while (originalIdx < originalLines.length || newIdx < newLines.length) {
      if (diffLines.length >= maxPreviewLines && originalIdx < originalLines.length && newIdx < newLines.length) {
        diffLines.push('... (truncated for brevity)');
        break;
      }

      if (originalLines[originalIdx] === newLines[newIdx]) {
        diffLines.push(`  ${originalLines[originalIdx]}`);
        originalIdx++;
        newIdx++;
      } else {
        let foundMatch = false;
        // Check if the new line exists further down in original (deletion)
        for (let i = originalIdx + 1; i < originalLines.length && i < originalIdx + 5; i++) {
          // Look ahead a few lines
          if (originalLines[i] === newLines[newIdx]) {
            diffLines.push(`- ${originalLines[originalIdx]}`);
            linesRemoved++;
            originalIdx++;
            foundMatch = true;
            break;
          }
        }
        if (!foundMatch) {
          // Check if original line exists further down in new (insertion)
          for (let i = newIdx + 1; i < newLines.length && i < newIdx + 5; i++) {
            // Look ahead a few lines
            if (newLines[i] === originalLines[originalIdx]) {
              diffLines.push(`+ ${newLines[newIdx]}`);
              linesAdded++;
              newIdx++;
              foundMatch = true;
              break;
            }
          }
        }

        if (!foundMatch) {
          // If no simple match found, assume it's a modification or a complex change
          if (originalIdx < originalLines.length) {
            diffLines.push(`- ${originalLines[originalIdx]}`);
            linesRemoved++;
            originalIdx++;
          }
          if (newIdx < newLines.length) {
            diffLines.push(`+ ${newLines[newIdx]}`);
            linesAdded++;
            newIdx++;
          }
        }
      }
    }

    previewText = diffLines.join('\n');

    preview += `\n--- Diff Preview (first ${maxPreviewLines} lines) ---\n`;
    preview += previewText;
    preview += `\n--- End Diff Preview ---\n`;
    preview += `\nSummary: Lines added: ${linesAdded}, Lines removed: ${linesRemoved}`;

    return {
      content: [
        {
          type: 'text',
          text: preview
        }
      ]
    };
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Schema for SearchFilesTool
const searchFilesSchema = z.object({
  directory: z.string().describe('Directory to search in'),
  pattern: z.string().describe('Text pattern or regex to search for'),
  searchType: z.enum(['text', 'regex']).optional().default('text').describe('Type of search to perform'),
  filePattern: z.string().optional().describe('File pattern to include (glob pattern)'),
  excludePattern: z.string().optional().describe('File pattern to exclude (glob pattern)'),
  maxDepth: z.number().optional().default(10).describe('Maximum directory depth'),
  maxResults: z.number().optional().default(100).describe('Maximum number of results'),
  contextLines: z.number().optional().default(2).describe('Number of context lines around matches'),
  caseSensitive: z.boolean().optional().default(false).describe('Case sensitive search')
});

@injectable()
export class SearchFilesTool implements IMCPTool {
  name = 'search_files';
  description = 'Search for text or patterns across multiple files in a directory tree';
  schema = searchFilesSchema;

  async execute(params: z.infer<typeof searchFilesSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Build file list using glob pattern
      const includePattern = params.filePattern || '**/*';
      const searchPath = path.join(params.directory, includePattern);

      const globOptions: any = {
        nodir: true,
        maxDepth: params.maxDepth
      };

      // Add ignore pattern if provided
      if (params.excludePattern) {
        globOptions.ignore = [params.excludePattern];
      }

      const files = await glob(searchPath, globOptions);

      const results: Array<{
        file: string;
        matches: Array<{
          line: number;
          content: string;
          context: { before: string[]; after: string[] };
        }>;
      }> = [];

      const searchRegex =
        params.searchType === 'regex'
          ? new RegExp(params.pattern, params.caseSensitive ? 'g' : 'gi')
          : new RegExp(this.escapeRegex(params.pattern), params.caseSensitive ? 'g' : 'gi');

      let totalMatches = 0;

      for (const filePath of files) {
        if (totalMatches >= params.maxResults!) break;

        try {
          const content = await fs.readFile(filePath, 'utf8');
          const lines = content.split('\n');
          const fileMatches: any[] = [];

          for (let i = 0; i < lines.length; i++) {
            if (totalMatches >= params.maxResults!) break;

            if (searchRegex.test(lines[i] ?? '')) {
              const contextBefore = lines.slice(Math.max(0, i - params.contextLines!), i);
              const contextAfter = lines.slice(i + 1, Math.min(lines.length, i + 1 + params.contextLines!));

              fileMatches.push({
                line: i + 1,
                content: lines[i],
                context: {
                  before: contextBefore,
                  after: contextAfter
                }
              });

              totalMatches++;
            }
          }

          if (fileMatches.length > 0) {
            results.push({
              file: path.relative(params.directory, filePath),
              matches: fileMatches
            });
          }
        } catch (err) {
          // Skip files that can't be read (binary files, permission issues, etc.)
          context.logger.debug(`Skipping file ${filePath}: ${err}`);
        }
      }

      const responseData = {
        searchPattern: params.pattern,
        searchType: params.searchType,
        directory: params.directory,
        filesSearched: files.length,
        filesWithMatches: results.length,
        totalMatches,
        results: results.slice(0, 50), // Limit response size
        truncated: results.length > 50,
        searchMetadata: {
          maxDepth: params.maxDepth,
          caseSensitive: params.caseSensitive,
          contextLines: params.contextLines,
          timestamp: new Date().toISOString()
        }
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to search files');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Schema for FindFilesTool
const findFilesSchema = z.object({
  directory: z.string().describe('Directory to search in'),
  namePattern: z.string().describe('File name pattern (supports wildcards)'),
  searchType: z.enum(['glob', 'regex']).optional().default('glob').describe('Type of pattern matching'),
  maxDepth: z.number().optional().default(10).describe('Maximum directory depth'),
  maxResults: z.number().optional().default(1000).describe('Maximum number of results'),
  includeDirectories: z.boolean().optional().default(false).describe('Include directories in results'),
  caseSensitive: z.boolean().optional().default(false).describe('Case sensitive matching'),
  sortBy: z.enum(['name', 'size', 'modified']).optional().default('name').describe('Sort results by')
});

@injectable()
export class FindFilesTool implements IMCPTool {
  name = 'find_files';
  description = 'Find files by name or pattern in a directory tree';
  schema = findFilesSchema;

  async execute(params: z.infer<typeof findFilesSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      let files: string[] = [];

      if (params.searchType === 'glob') {
        // Use glob for pattern matching
        const searchPath = path.join(params.directory, '**', params.namePattern);
        const globOptions: any = {
          nodir: !params.includeDirectories,
          maxDepth: params.maxDepth
        };

        files = await glob(searchPath, globOptions);
      } else {
        // Use regex for pattern matching
        const regex = new RegExp(params.namePattern, params.caseSensitive ? '' : 'i');
        const searchPath = path.join(params.directory, '**/*');
        const globOptions: any = {
          nodir: !params.includeDirectories,
          maxDepth: params.maxDepth
        };

        const allFiles = await glob(searchPath, globOptions);

        files = allFiles.filter(file => {
          const basename = path.basename(file);
          return regex.test(basename);
        });
      }

      // Get file stats for sorting and metadata
      const fileInfos = await Promise.all(
        files.slice(0, params.maxResults!).map(async file => {
          try {
            const stats = await fs.stat(file);
            return {
              path: path.relative(params.directory, file),
              absolutePath: file,
              name: path.basename(file),
              size: stats.size,
              isDirectory: stats.isDirectory(),
              modified: stats.mtime,
              permissions: stats.mode.toString(8)
            };
          } catch (err) {
            return {
              path: path.relative(params.directory, file),
              absolutePath: file,
              name: path.basename(file),
              size: 0,
              isDirectory: false,
              modified: new Date(0),
              permissions: '000000',
              error: 'Could not read file stats'
            };
          }
        })
      );

      // Sort results
      fileInfos.sort((a, b) => {
        switch (params.sortBy) {
          case 'size':
            return b.size - a.size;
          case 'modified':
            return b.modified.getTime() - a.modified.getTime();
          case 'name':
          default:
            return a.name.localeCompare(b.name);
        }
      });

      const responseData = {
        searchPattern: params.namePattern,
        searchType: params.searchType,
        directory: params.directory,
        filesFound: files.length,
        results: fileInfos,
        truncated: files.length > params.maxResults!,
        searchMetadata: {
          maxDepth: params.maxDepth,
          includeDirectories: params.includeDirectories,
          caseSensitive: params.caseSensitive,
          sortBy: params.sortBy,
          timestamp: new Date().toISOString()
        }
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to find files');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to find files: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Re-export existing tools for completeness
export { ReadFileTool, WriteFileTool, ListDirectoryTool } from './file-operations.tool.js';

// New File Operations - Move and Recycle System

// Schema for MoveFileTool
const moveFileSchema = z.object({
  sourcePath: z.string().describe('Source file path to move'),
  destinationPath: z.string().describe('Destination path for the file'),
  overwrite: z.boolean().optional().default(false).describe('Overwrite destination if it exists'),
  createDirectories: z.boolean().optional().default(true).describe('Create destination directories if needed')
});

@injectable()
export class MoveFileTool implements IMCPTool {
  name = 'move_file';
  description = 'Move a file from one location to another with safety checks';
  schema = moveFileSchema;

  async execute(params: z.infer<typeof moveFileSchema>, context: ToolContext): Promise<ToolResult> {
    // const filesystem = context.container.get<IFilesystemHandler>('FilesystemHandler'); // Removed unused variable

    try {
      // Check if source exists
      const sourceStats = await fs.stat(params.sourcePath);
      if (!sourceStats.isFile()) {
        return {
          content: [{ type: 'text', text: `Source path ${params.sourcePath} is not a file` }]
        };
      }

      // Check destination
      const destDir = path.dirname(params.destinationPath);
      if (params.createDirectories) {
        await fs.mkdir(destDir, { recursive: true });
      }

      try {
        await fs.access(params.destinationPath);
        if (!params.overwrite) {
          return {
            content: [
              {
                type: 'text',
                text: `Destination ${params.destinationPath} already exists. Use overwrite=true to replace.`
              }
            ]
          };
        }
      } catch {
        // Destination doesn't exist, which is fine
      }

      // Perform the move
      await fs.rename(params.sourcePath, params.destinationPath);

      return {
        content: [
          {
            type: 'text',
            text: `File moved successfully from ${params.sourcePath} to ${params.destinationPath}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to move file');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to move file: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Schema for RecycleFileTool
const recycleFileSchema = z.object({
  filePath: z.string().describe('Path to the file to recycle'),
  reason: z.string().optional().describe('Reason for recycling (for tracking)')
});

@injectable()
export class RecycleFileTool implements IMCPTool {
  name = 'recycle_file';
  description = 'Move a file to recycle bin for safe deletion';
  schema = recycleFileSchema;

  async execute(params: z.infer<typeof recycleFileSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const recycleDir = path.join(process.cwd(), '.recycle');
      await fs.mkdir(recycleDir, { recursive: true });

      const fileName = path.basename(params.filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const recycledName = `${timestamp}_${fileName}`;
      const recycledPath = path.join(recycleDir, recycledName);

      // Create metadata file
      const metadata = {
        originalPath: params.filePath,
        recycledAt: new Date().toISOString(),
        reason: params.reason || 'User requested',
        size: (await fs.stat(params.filePath)).size
      };

      await fs.writeFile(`${recycledPath}.meta`, JSON.stringify(metadata, null, 2));

      // Move file to recycle bin
      await fs.rename(params.filePath, recycledPath);

      return {
        content: [
          {
            type: 'text',
            text: `File recycled: ${params.filePath} → ${recycledName}\nReason: ${params.reason || 'User requested'}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to recycle file');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to recycle file: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Schema for RestoreFromRecycleTool
const restoreFromRecycleSchema = z.object({
  recycledFileName: z.string().describe('Name of the recycled file to restore'),
  customPath: z.string().optional().describe('Custom restore path (default: original location)')
});

@injectable()
export class RestoreFromRecycleTool implements IMCPTool {
  name = 'restore_from_recycle';
  description = 'Restore a file from the recycle bin to its original location or a custom path';
  schema = restoreFromRecycleSchema;

  async execute(params: z.infer<typeof restoreFromRecycleSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const recycleDir = path.join(process.cwd(), '.recycle');
      const recycledPath = path.join(recycleDir, params.recycledFileName);
      const metaPath = `${recycledPath}.meta`;

      // Read metadata
      const metaContent = await fs.readFile(metaPath, 'utf8');
      const metadata = JSON.parse(metaContent);

      const restorePath = params.customPath || metadata.originalPath;
      const restoreDir = path.dirname(restorePath);

      // Create directories if needed
      await fs.mkdir(restoreDir, { recursive: true });

      // Check if restore destination exists
      try {
        await fs.access(restorePath);
        return {
          content: [
            {
              type: 'text',
              text: `Cannot restore: ${restorePath} already exists. Please specify a different customPath.`
            }
          ]
        };
      } catch {
        // File doesn't exist, proceed with restore
      }

      // Restore the file
      await fs.rename(recycledPath, restorePath);
      await fs.unlink(metaPath); // Remove metadata

      return {
        content: [
          {
            type: 'text',
            text: `File restored successfully: ${params.recycledFileName} → ${restorePath}\nOriginal path: ${metadata.originalPath}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to restore file from recycle');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to restore file: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Schema for ListRecycleBinTool
const listRecycleBinSchema = z.object({
  showDetails: z.boolean().optional().default(false).describe('Show detailed metadata for each file')
});

@injectable()
export class ListRecycleBinTool implements IMCPTool {
  name = 'list_recycle_bin';
  description = 'List files in the recycle bin with metadata';
  schema = listRecycleBinSchema;

  async execute(params: z.infer<typeof listRecycleBinSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const recycleDir = path.join(process.cwd(), '.recycle');

      try {
        await fs.access(recycleDir);
      } catch {
        return {
          content: [{ type: 'text', text: 'Recycle bin is empty (directory does not exist)' }]
        };
      }

      const files = await fs.readdir(recycleDir);
      const recycledFiles = files.filter(f => !f.endsWith('.meta'));

      if (recycledFiles.length === 0) {
        return {
          content: [{ type: 'text', text: 'Recycle bin is empty' }]
        };
      }

      const fileInfos = await Promise.all(
        recycledFiles.map(async fileName => {
          const metaPath = path.join(recycleDir, `${fileName}.meta`);
          try {
            const metaContent = await fs.readFile(metaPath, 'utf8');
            const metadata = JSON.parse(metaContent);
            const stats = await fs.stat(path.join(recycleDir, fileName));

            return {
              fileName,
              originalPath: metadata.originalPath,
              recycledAt: metadata.recycledAt,
              reason: metadata.reason,
              size: stats.size,
              metadata: params.showDetails ? metadata : undefined
            };
          } catch {
            return {
              fileName,
              originalPath: 'Unknown',
              recycledAt: 'Unknown',
              reason: 'Metadata missing',
              size: 0
            };
          }
        })
      );

      const response = {
        recycledFiles: fileInfos.length,
        files: fileInfos,
        recycleBinPath: recycleDir
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to list recycle bin');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list recycle bin: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Schema for EmptyRecycleBinTool
const emptyRecycleBinSchema = z.object({
  confirm: z.boolean().describe('Confirmation flag - must be true to proceed'),
  olderThanDays: z.number().optional().describe('Only delete files older than X days (optional)')
});

@injectable()
export class EmptyRecycleBinTool implements IMCPTool {
  name = 'empty_recycle_bin';
  description = 'Permanently delete files from recycle bin (DESTRUCTIVE operation)';
  schema = emptyRecycleBinSchema;

  async execute(params: z.infer<typeof emptyRecycleBinSchema>, context: ToolContext): Promise<ToolResult> {
    if (!params.confirm) {
      return {
        content: [
          {
            type: 'text',
            text: 'Operation cancelled. Set confirm=true to proceed with emptying recycle bin.'
          }
        ]
      };
    }

    try {
      const recycleDir = path.join(process.cwd(), '.recycle');

      try {
        await fs.access(recycleDir);
      } catch {
        return {
          content: [{ type: 'text', text: 'Recycle bin is already empty (directory does not exist)' }]
        };
      }

      const files = await fs.readdir(recycleDir);
      let deletedCount = 0;
      let skippedCount = 0;

      for (const file of files) {
        const filePath = path.join(recycleDir, file);

        if (params.olderThanDays) {
          const stats = await fs.stat(filePath);
          const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

          if (ageInDays < params.olderThanDays) {
            skippedCount++;
            continue;
          }
        }

        await fs.unlink(filePath);
        deletedCount++;
      }

      return {
        content: [
          {
            type: 'text',
            text: `Recycle bin emptied. Files deleted: ${deletedCount}, Files skipped: ${skippedCount}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to empty recycle bin');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to empty recycle bin: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}
