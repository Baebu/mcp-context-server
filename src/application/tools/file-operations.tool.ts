// src/application/tools/file-operations.tool.ts - Enhanced with consent
import { injectable } from 'inversify'; // Removed unused 'inject'
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '@core/interfaces/tool-registry.interface.js';
import type { IFilesystemHandler, FileContent, DirectoryEntry } from '@core/interfaces/filesystem.interface.js';
import type { IUserConsentService } from '@core/interfaces/consent.interface.js';

// Schema for ReadFileTool
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
  createDirs: z.boolean().optional().default(true),
  requireConsent: z.boolean().optional().default(true) // New parameter
});

@injectable()
export class WriteFileToolWithConsent implements IMCPTool {
  name = 'write_file';
  description = 'Write content to a file with optional directory creation and consent';
  schema = writeFileSchema;

  async execute(params: z.infer<typeof writeFileSchema>, context: ToolContext): Promise<ToolResult> {
    const filesystem = context.container.get<IFilesystemHandler>('FilesystemHandler');
    const consentService = context.container.get<IUserConsentService>('UserConsentService');

    try {
      // Check if consent is required
      if (params.requireConsent) {
        const consentRequest = {
          operation: 'file_write' as const,
          severity: this.determineSeverity(params.path),
          details: {
            path: params.path,
            description: `Write ${params.content.length} bytes to ${params.path}${params.append ? ' (append mode)' : ''}`,
            risks: this.identifyRisks(params.path)
          }
        };

        const consentResponse = await consentService.requestConsent(consentRequest);

        if (consentResponse.decision !== 'allow') {
          return {
            content: [
              {
                type: 'text',
                text: `Operation denied by user consent: ${consentResponse.decision}`
              }
            ]
          };
        }
      }

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

  private determineSeverity(path: string): 'low' | 'medium' | 'high' | 'critical' {
    if (path.includes('.ssh') || path.includes('.key') || path.includes('.pem')) {
      return 'critical';
    }
    if (path.includes('/etc/') || path.includes('\\System32\\')) {
      return 'high';
    }
    if (path.includes('.env') || path.includes('config')) {
      return 'medium';
    }
    return 'low';
  }

  private identifyRisks(path: string): string[] {
    const risks = [];
    if (path.includes('.ssh')) risks.push('Modifying SSH configuration could affect system access');
    if (path.includes('.env')) risks.push('Environment variables may contain sensitive data');
    if (path.includes('/etc/')) risks.push('System configuration file - changes may affect system behavior');
    if (path.endsWith('.key') || path.endsWith('.pem')) risks.push('Security key file - handle with extreme care');
    return risks;
  }
}

// Schema for ListDirectoryTool
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
