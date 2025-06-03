// Enhanced File Operations Tool with Advanced Editing Capabilities
// File: src/application/tools/enhanced-file-operations.tool.ts

import { injectable } from 'inversify';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IFilesystemHandler } from '../../core/interfaces/filesystem.interface.js';

// Schema for EditFileTool
const editFileSchema = z.object({
  path: z.string().describe('Path to the file to edit'),
  operation: z.enum(['replace', 'insert', 'delete']).describe('Edit operation to perform'),
  line: z.number().describe('Line number to edit (1-based)'),
  content: z.string().optional().describe('Content for replace/insert operations'),
  endLine: z.number().optional().describe('End line for multi-line operations'),
  createBackup: z.boolean().optional().default(true).describe('Create backup before editing'),
  preview: z.boolean().optional().default(false).describe('Preview changes without applying')
});

@injectable()
export class EditFileTool implements IMCPTool {
  name = 'edit_file';
  description = 'Edit specific lines in a file with operations like replace, insert, delete';
  schema = editFileSchema;

  async execute(params: z.infer<typeof editFileSchema>, context: ToolContext): Promise<ToolResult> {
    const filesystem = context.container.get<IFilesystemHandler>('FilesystemHandler');

    try {
      // Read current file content
      const fileContent = await filesystem.readFileWithTruncation(params.path, 10485760); // 10MB limit
      const lines = fileContent.content.split('\n');

      // Validate line numbers
      if (params.line < 1 || params.line > lines.length + 1) {
        throw new Error(`Invalid line number: ${params.line}. File has ${lines.length} lines.`);
      }

      // Convert to 0-based indexing
      const lineIndex = params.line - 1;
      const endLineIndex = params.endLine ? params.endLine - 1 : lineIndex;

      // Preview mode - show what would change
      if (params.preview) {
        return this.generatePreview(lines, params);
      }

      // Create backup if requested
      if (params.createBackup) {
        const backupPath = `${params.path}.backup.${Date.now()}`;
        await filesystem.writeFile(backupPath, fileContent.content);
        context.logger.info(`Backup created: ${backupPath}`);
      }

      // Perform the operation
      let newLines = [...lines];
      let operationDescription = '';

      switch (params.operation) {
        case 'replace':
          if (params.content === undefined) {
            throw new Error('Content is required for replace operation');
          }
          if (params.endLine) {
            // Replace multiple lines
            newLines.splice(lineIndex, endLineIndex - lineIndex + 1, params.content);
            operationDescription = `Replaced lines ${params.line}-${params.endLine}`;
          } else {
            // Replace single line
            newLines[lineIndex] = params.content;
            operationDescription = `Replaced line ${params.line}`;
          }
          break;

        case 'insert':
          if (!params.content) {
            throw new Error('Content is required for insert operation');
          }
          newLines.splice(lineIndex, 0, params.content);
          operationDescription = `Inserted content at line ${params.line}`;
          break;

        case 'delete':
          if (params.endLine) {
            // Delete multiple lines
            newLines.splice(lineIndex, endLineIndex - lineIndex + 1);
            operationDescription = `Deleted lines ${params.line}-${params.endLine}`;
          } else {
            // Delete single line
            newLines.splice(lineIndex, 1);
            operationDescription = `Deleted line ${params.line}`;
          }
          break;
      }

      // Write the modified content
      const newContent = newLines.join('\n');
      await filesystem.writeFile(params.path, newContent);

      return {
        content: [
          {
            type: 'text',
            text: `File edited successfully: ${operationDescription}\nPath: ${params.path}\nLines before: ${lines.length}\nLines after: ${newLines.length}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to edit file');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to edit file: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generatePreview(lines: string[], params: z.infer<typeof editFileSchema>): ToolResult {
    const lineIndex = params.line - 1;
    const endLineIndex = params.endLine ? params.endLine - 1 : lineIndex;

    let preview = `Preview of ${params.operation} operation on line ${params.line}`;
    if (params.endLine) {
      preview += `-${params.endLine}`;
    }
    preview += ':\n\n';

    // Show context around the change
    const contextStart = Math.max(0, lineIndex - 2);
    const contextEnd = Math.min(lines.length - 1, Math.max(endLineIndex + 2, lineIndex + 2));

    preview += 'Before:\n';
    for (let i = contextStart; i <= contextEnd; i++) {
      const marker = i >= lineIndex && i <= endLineIndex ? '> ' : '  ';
      preview += `${marker}${i + 1}: ${lines[i]}\n`;
    }

    preview += '\nAfter:\n';

    // Simulate the operation for preview
    const newLines = [...lines];
    switch (params.operation) {
      case 'replace':
        if (params.endLine) {
          newLines.splice(lineIndex, endLineIndex - lineIndex + 1, params.content || '');
        } else {
          newLines[lineIndex] = params.content || '';
        }
        break;
      case 'insert':
        newLines.splice(lineIndex, 0, params.content || '');
        break;
      case 'delete':
        newLines.splice(lineIndex, params.endLine ? endLineIndex - lineIndex + 1 : 1);
        break;
    }

    const newContextEnd = Math.min(newLines.length - 1, contextEnd + (params.operation === 'insert' ? 1 : 0));
    for (let i = contextStart; i <= newContextEnd; i++) {
      if (i < newLines.length) {
        preview += `  ${i + 1}: ${newLines[i]}\n`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: preview
        }
      ]
    };
  }
}

// Schema for BatchEditFileTool
const batchEditFileSchema = z.object({
  path: z.string().describe('Path to the file to edit'),
  operations: z
    .array(
      z.object({
        operation: z.enum(['replace', 'insert', 'delete']),
        line: z.number().describe('Line number (1-based)'),
        content: z.string().optional(),
        endLine: z.number().optional()
      })
    )
    .describe('Array of edit operations to perform'),
  createBackup: z.boolean().optional().default(true).describe('Create backup before editing'),
  preview: z.boolean().optional().default(false).describe('Preview changes without applying')
});

@injectable()
export class BatchEditFileTool implements IMCPTool {
  name = 'batch_edit_file';
  description = 'Perform multiple edit operations on a file in a single transaction';
  schema = batchEditFileSchema;

  async execute(params: z.infer<typeof batchEditFileSchema>, context: ToolContext): Promise<ToolResult> {
    const filesystem = context.container.get<IFilesystemHandler>('FilesystemHandler');

    try {
      // Read current file content
      const fileContent = await filesystem.readFileWithTruncation(params.path, 10485760);
      let lines = fileContent.content.split('\n');
      const originalLines = [...lines];

      // Sort operations by line number in descending order to avoid index shifts
      const sortedOperations = [...params.operations].sort((a, b) => b.line - a.line);

      // Validate all operations first
      for (const op of sortedOperations) {
        if (op.line < 1 || op.line > lines.length + 1) {
          throw new Error(`Invalid line number in operation: ${op.line}. File has ${lines.length} lines.`);
        }
        if ((op.operation === 'replace' || op.operation === 'insert') && !op.content) {
          throw new Error(`Content is required for ${op.operation} operation on line ${op.line}`);
        }
      }

      // Preview mode
      if (params.preview) {
        return this.generateBatchPreview(originalLines, sortedOperations);
      }

      // Create backup if requested
      if (params.createBackup) {
        const backupPath = `${params.path}.backup.${Date.now()}`;
        await filesystem.writeFile(backupPath, fileContent.content);
        context.logger.info(`Backup created: ${backupPath}`);
      }

      // Apply operations in reverse order (highest line numbers first)
      const operationResults: string[] = [];

      for (const op of sortedOperations) {
        const lineIndex = op.line - 1;
        const endLineIndex = op.endLine ? op.endLine - 1 : lineIndex;

        switch (op.operation) {
          case 'replace':
            if (op.endLine) {
              lines.splice(lineIndex, endLineIndex - lineIndex + 1, op.content!);
              operationResults.push(`Replaced lines ${op.line}-${op.endLine}`);
            } else {
              lines[lineIndex] = op.content!;
              operationResults.push(`Replaced line ${op.line}`);
            }
            break;

          case 'insert':
            lines.splice(lineIndex, 0, op.content!);
            operationResults.push(`Inserted content at line ${op.line}`);
            break;

          case 'delete':
            if (op.endLine) {
              lines.splice(lineIndex, endLineIndex - lineIndex + 1);
              operationResults.push(`Deleted lines ${op.line}-${op.endLine}`);
            } else {
              lines.splice(lineIndex, 1);
              operationResults.push(`Deleted line ${op.line}`);
            }
            break;
        }
      }

      // Write the modified content
      const newContent = lines.join('\n');
      await filesystem.writeFile(params.path, newContent);

      return {
        content: [
          {
            type: 'text',
            text: `Batch edit completed successfully:\n${operationResults.reverse().join('\n')}\n\nPath: ${params.path}\nOperations: ${params.operations.length}\nLines before: ${originalLines.length}\nLines after: ${lines.length}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to batch edit file');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to batch edit file: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generateBatchPreview(lines: string[], operations: any[]): ToolResult {
    let preview = `Preview of ${operations.length} batch operations:\n\n`;

    // Apply operations to a copy for preview
    let previewLines = [...lines];
    const operationDescriptions: string[] = [];

    for (const op of operations) {
      const lineIndex = op.line - 1;
      const endLineIndex = op.endLine ? op.endLine - 1 : lineIndex;

      switch (op.operation) {
        case 'replace':
          if (op.endLine) {
            previewLines.splice(lineIndex, endLineIndex - lineIndex + 1, op.content);
            operationDescriptions.push(`Replace lines ${op.line}-${op.endLine}`);
          } else {
            previewLines[lineIndex] = op.content;
            operationDescriptions.push(`Replace line ${op.line}`);
          }
          break;
        case 'insert':
          previewLines.splice(lineIndex, 0, op.content);
          operationDescriptions.push(`Insert at line ${op.line}`);
          break;
        case 'delete':
          if (op.endLine) {
            previewLines.splice(lineIndex, endLineIndex - lineIndex + 1);
            operationDescriptions.push(`Delete lines ${op.line}-${op.endLine}`);
          } else {
            previewLines.splice(lineIndex, 1);
            operationDescriptions.push(`Delete line ${op.line}`);
          }
          break;
      }
    }

    preview += `Operations to be applied:\n${operationDescriptions.reverse().join('\n')}\n\n`;
    preview += `Lines before: ${lines.length}\n`;
    preview += `Lines after: ${previewLines.length}\n`;

    return {
      content: [
        {
          type: 'text',
          text: preview
        }
      ]
    };
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
export { ReadFileTool, WriteFileToolWithConsent, ListDirectoryTool } from './file-operations.tool.js';
