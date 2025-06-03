import { injectable, inject } from 'inversify';
import type { MCPResource } from '@core/interfaces/resource-registry.interface.js';
import type { IFilesystemHandler } from '../../core/interfaces/filesystem.interface.js';
import path from 'node:path';

@injectable()
export class ProjectFilesResource implements MCPResource {
  name = 'project-files';
  template = 'file:///{path}';
  description = 'Access project files with automatic discovery';

  constructor(@inject('FilesystemHandler') private filesystem: IFilesystemHandler) {}

  async read(uri: string, params?: Record<string, unknown>) {
    const urlParts = new URL(uri);
    const filePath = urlParts.pathname;

    try {
      if (filePath.endsWith('/')) {
        // Directory listing
        const entries = await this.filesystem.listDirectory(filePath, {
          includeMetadata: true,
          limit: (params?.limit as number) || 100
        });

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(entries, null, 2)
            }
          ]
        };
      } else {
        // File content
        const content = await this.filesystem.readFileWithTruncation(filePath, (params?.maxSize as number) || 1048576);

        return {
          contents: [
            {
              uri,
              mimeType: this.getMimeType(filePath),
              text: content.content
            }
          ]
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `Error reading ${uri}: ${errorMessage}`
          }
        ]
      };
    }
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.json': 'application/json',
      '.yaml': 'application/x-yaml',
      '.yml': 'application/x-yaml',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.py': 'text/x-python',
      '.java': 'text/x-java'
    };
    return mimeTypes[ext] || 'text/plain';
  }
}
