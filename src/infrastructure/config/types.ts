export interface ServerConfig {
  server: {
    name: string;
    version: string;
  };
  security: {
    allowedCommands: string[] | 'all';
    safezones: string[];
    maxExecutionTime: number;
    maxFileSize: number;
    unsafeArgumentPatterns?: string[]; // Added
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
