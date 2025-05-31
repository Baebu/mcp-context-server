import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '@core/interfaces/tool-registry.interface.js';
import type { IFilesystemHandler } from '@core/interfaces/filesystem.interface.js';

const readFileSchema = z.object({
  path: z.string().describe('Path to the file to read'),
  encoding: z.enum(['utf8', 'binary']).optional().default('utf8'),
  maxSize: z.number().optional().default(1048576) // 1MB default
});

@injectable()
export class ReadFileTool implements IMCPTool {
  name = 'read_file';
  description = 'Read the contents of a file with automatic truncation for large files';
  schema = readFileSchema;

  async execute(params: z.infer<typeof readFileSchema>, context: ToolContext): Promise<ToolResult> {
    const filesystem = context.container.get('FilesystemHandler') as IFilesystemHandler;

    try {
      const result = await filesystem.readFileWithTruncation(params.path, params.maxSize, params.encoding);

      return {
        content: [
          {
            type: 'text',
            text: result.content
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
});

@injectable()
export class WriteFileTool implements IMCPTool {
  name = 'write_file';
  description = 'Write content to a file with optional directory creation';
  schema = writeFileSchema;

  async execute(params: z.infer<typeof writeFileSchema>, context: ToolContext): Promise<ToolResult> {
    const filesystem = context.container.get('FilesystemHandler') as IFilesystemHandler;

    try {
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
}

const listDirectorySchema = z.object({
  path: z.string().describe('Directory path to list'),
  includeHidden: z.boolean().optional().default(false),
  includeMetadata: z.boolean().optional().default(true),
  limit: z.number().optional().default(1000)
});

@injectable()
export class ListDirectoryTool implements IMCPTool {
  name = 'list_directory';
  description = 'List contents of a directory with metadata';
  schema = listDirectorySchema;

  async execute(params: z.infer<typeof listDirectorySchema>, context: ToolContext): Promise<ToolResult> {
    const filesystem = context.container.get('FilesystemHandler') as IFilesystemHandler;

    try {
      const entries = await filesystem.listDirectory(params.path, {
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
