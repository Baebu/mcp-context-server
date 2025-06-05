import type Database from 'better-sqlite3'; // Import the type

export interface ContextItem {
  key: string;
  value: unknown; // Changed from any
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueryOptions {
  type?: string | undefined;
  keyPattern?: string | undefined;
  limit?: number | undefined;
}

export interface IDatabaseHandler {
  storeContext(key: string, value: unknown, type?: string): Promise<void>; // Changed from any
  getContext(key: string): Promise<unknown | null>; // Changed from any
  deleteContext(key: string): Promise<boolean>;
  queryContext(options: QueryOptions): Promise<ContextItem[]>;
  backup(backupPath: string): Promise<void>;
  close(): void;

  // Raw SQL methods for smart path management
  executeQuery(sql: string, params: unknown[]): Promise<unknown[]>; // Changed from any[]
  executeCommand(sql: string, params: unknown[]): Promise<{ changes: number }>; // Changed from any[]
  getSingle(sql: string, params: unknown[]): Promise<unknown | null>; // Changed from any[]

  // Method to get the raw database instance
  getDatabase(): Database.Database;
}
