// src/application/tools/file-operations.tool.ts - Consent Removed
import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IFilesystemHandler, FileContent, DirectoryEntry } from '../../core/interfaces/filesystem.interface.js';
// IUserConsentService import removed

// Schema for ReadFileTool (remains unchanged)
const readFileSchema = z.object({
  path: z.string().describe('Path to the file to read'),
  maxSize: z.number().optional().default(1048576).describe('Maximum size in bytes to read'), // Default 1MB
  encoding: z.enum(['utf8', 'binary']).optional().default('utf8').describe('File encoding')
});

@injectable()
export class ReadFileTool implements IMCPTool {
  name = 'read_file';
  description = 'Read content from a file with optional truncation and encoding';
  schema = readFileSchema;

  async execute(params: z.infer<typeof readFileSchema>, context: ToolContext): Promise<ToolResult> {
    const filesystem = context.container.get<IFilesystemHandler>('FilesystemHandler');
    try {
      const fileContent: FileContent = await filesystem.readFileWithTruncation(
        params.path,
        params.maxSize,
        params.encoding
      );
      return {
        content: [
          {
            type: 'text',
            text: fileContent.content
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to read file');
      throw error;
    }
  }
}

const writeFileSchema = z.object({
  path: z.string().describe('Path where to write the file'),
  content: z.string().describe('Content to write to the file'),
  append: z.boolean().optional().default(false),
  createDirs: z.boolean().optional().default(true)
  // requireConsent parameter removed
});

@injectable()
export class WriteFileTool implements IMCPTool {
  // Renamed class
  name = 'write_file';
  description = 'Write content to a file with optional directory creation'; // Updated description
  schema = writeFileSchema;

  async execute(params: z.infer<typeof writeFileSchema>, context: ToolContext): Promise<ToolResult> {
    const filesystem = context.container.get<IFilesystemHandler>('FilesystemHandler');
    // consentService injection and usage removed

    try {
      // Consent checking logic removed

      await filesystem.writeFile(params.path, params.content, {
        append: params.append,
        createDirs: params.createDirs
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully wrote to file: ${params.path}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to write file');
      throw error;
    }
  }

  // Removed private methods: determineSeverity, identifyRisks
  // as they were specific to the consent flow.
}

// Schema for ListDirectoryTool (remains unchanged)
const listDirectorySchema = z.object({
  path: z.string().describe('Path to the directory to list'),
  includeHidden: z.boolean().optional().default(false).describe('Include hidden files/directories'),
  includeMetadata: z.boolean().optional().default(true).describe('Include metadata like size and modified date'),
  limit: z.number().optional().default(1000).describe('Maximum number of entries to return')
});

@injectable()
export class ListDirectoryTool implements IMCPTool {
  name = 'list_directory';
  description = 'List contents of a directory';
  schema = listDirectorySchema;

  async execute(params: z.infer<typeof listDirectorySchema>, context: ToolContext): Promise<ToolResult> {
    const filesystem = context.container.get<IFilesystemHandler>('FilesystemHandler');
    try {
      const entries: DirectoryEntry[] = await filesystem.listDirectory(params.path, {
        includeHidden: params.includeHidden,
        includeMetadata: params.includeMetadata,
        limit: params.limit
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(entries, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to list directory');
      throw error;
    }
  }
}
