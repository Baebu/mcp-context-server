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
