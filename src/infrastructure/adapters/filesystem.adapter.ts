import { injectable, inject } from 'inversify';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IFilesystemHandler, FileContent, DirectoryEntry } from '@core/interfaces/filesystem.interface.js';
import type { ISecurityValidator } from '@core/interfaces/security.interface.js';
import { logger } from '@utils/logger.js';

@injectable()
export class FilesystemAdapter implements IFilesystemHandler {
  constructor(@inject('SecurityValidator') private security: ISecurityValidator) {}

  async readFileWithTruncation(
    filePath: string,
    maxSize: number = 1048576,
    encoding: 'utf8' | 'binary' = 'utf8'
  ): Promise<FileContent> {
    const validatedPath = await this.security.validatePath(filePath);
    const stats = await fs.stat(validatedPath);

    if (stats.size <= maxSize) {
      const content = await fs.readFile(validatedPath, encoding);
      return {
        content: content.toString(),
        truncated: false,
        actualSize: stats.size
      };
    }

    // Read only the specified amount
    const fileHandle = await fs.open(validatedPath, 'r');
    try {
      const buffer = Buffer.alloc(maxSize);
      const { bytesRead } = await fileHandle.read(buffer, 0, maxSize, 0);
      const content = buffer.subarray(0, bytesRead).toString(encoding);

      return {
        content: `${content}\n\n[Content truncated...]`,
        truncated: true,
        actualSize: stats.size
      };
    } finally {
      await fileHandle.close();
    }
  }

  async writeFile(
    filePath: string,
    content: string | Buffer,
    options: { append?: boolean; createDirs?: boolean } = {}
  ): Promise<void> {
    const validatedPath = await this.security.validatePath(filePath);

    if (options.createDirs) {
      const dirPath = path.dirname(validatedPath);
      await fs.mkdir(dirPath, { recursive: true });
    }

    if (options.append) {
      await fs.appendFile(validatedPath, content);
    } else {
      await fs.writeFile(validatedPath, content);
    }

    logger.debug({ path: filePath, append: options.append }, 'File written successfully');
  }

  async listDirectory(
    dirPath: string,
    options: { includeHidden?: boolean; includeMetadata?: boolean; limit?: number } = {}
  ): Promise<DirectoryEntry[]> {
    const validatedPath = await this.security.validatePath(dirPath);
    const entries: DirectoryEntry[] = [];
    const dirents = await fs.readdir(validatedPath, { withFileTypes: true });

    for (const dirent of dirents) {
      if (options.limit && entries.length >= options.limit) {
        break;
      }

      if (!options.includeHidden && dirent.name.startsWith('.')) {
        continue;
      }

      const entry: DirectoryEntry = {
        name: dirent.name,
        type: this.getEntryType(dirent),
        path: path.join(dirPath, dirent.name)
      };

      if (options.includeMetadata) {
        try {
          const fullPath = path.join(validatedPath, dirent.name);
          const stats = await fs.stat(fullPath);
          entry.size = stats.size;
          entry.modified = stats.mtime;
          entry.permissions = stats.mode.toString(8);
        } catch (error) {
          // Ignore permission errors for individual files
        }
      }

      entries.push(entry);
    }

    return entries;
  }

  async deleteFile(filePath: string): Promise<void> {
    const validatedPath = await this.security.validatePath(filePath);
    await fs.unlink(validatedPath);
    logger.debug({ path: filePath }, 'File deleted successfully');
  }

  async deleteDirectory(dirPath: string, recursive: boolean = false): Promise<void> {
    const validatedPath = await this.security.validatePath(dirPath);
    await fs.rm(validatedPath, { recursive, force: true });
    logger.debug({ path: dirPath, recursive }, 'Directory deleted successfully');
  }

  private getEntryType(dirent: import('fs').Dirent): 'file' | 'directory' | 'symlink' {
    if (dirent.isFile()) {
      return 'file';
    }
    if (dirent.isDirectory()) {
      return 'directory';
    }
    if (dirent.isSymbolicLink()) {
      return 'symlink';
    }
    return 'file';
  }
}
