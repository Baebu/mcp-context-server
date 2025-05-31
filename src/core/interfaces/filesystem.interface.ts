export interface FileContent {
  content: string;
  truncated: boolean;
  actualSize: number;
}

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  path: string;
  size?: number;
  modified?: Date;
  permissions?: string;
}

export interface IFilesystemHandler {
  readFileWithTruncation(filePath: string, maxSize?: number, encoding?: 'utf8' | 'binary'): Promise<FileContent>;
  writeFile(
    filePath: string,
    content: string | Buffer,
    options?: { append?: boolean; createDirs?: boolean }
  ): Promise<void>;
  listDirectory(
    dirPath: string,
    options?: {
      includeHidden?: boolean;
      includeMetadata?: boolean;
      limit?: number;
    }
  ): Promise<DirectoryEntry[]>;
  deleteFile(filePath: string): Promise<void>;
  deleteDirectory(dirPath: string, recursive?: boolean): Promise<void>;
}
