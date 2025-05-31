export interface ServerConfig {
  server: {
    name: string;
    version: string;
    workingDirectory?: string; // Added: override working directory
  };
  security: {
    allowedCommands: string[] | 'all';
    safezones: string[];
    maxExecutionTime: number;
    maxFileSize: number;
    unsafeArgumentPatterns?: string[];
    autoExpandSafezones?: boolean; // Added: automatically include common dev directories
  };
  database: {
    path: string;
    backupInterval: number;
  };
  logging: {
    level: string;
    pretty: boolean;
  };
  performance: {
    maxConcurrency: number;
    queueSize: number;
  };
}
