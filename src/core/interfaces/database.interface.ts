import type Database from 'better-sqlite3'; // Import the type

export interface ContextItem {
  key: string;
  value: unknown;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

// Enhanced Context Entry with full metadata support
export interface EnhancedContextEntry {
  key: string;
  value: unknown;
  type: string;
  embedding?: number[];
  semanticTags?: string[];
  contextType?: string;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
  relationships?: ContextRelationship[];
  createdAt: Date;
  updatedAt: Date;
  accessedAt?: Date;
  accessCount?: number;
}

// Context relationship structure
export interface ContextRelationship {
  targetKey: string;
  relationshipType: string;
  strength?: number;
  createdAt?: Date;
}

// Token budget tracking
export interface TokenBudget {
  sessionId: string;
  totalTokens: number;
  usedTokens: number;
  remainingTokens: number;
  maxTokens: number;
  handoffThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

// Token usage log entry
export interface TokenUsageEntry {
  id?: number;
  sessionId: string;
  operation: string;
  contextKey?: string;
  tokensUsed: number;
  cumulativeTokens: number;
  timestamp: Date;
}

export interface QueryOptions {
  type?: string | undefined;
  keyPattern?: string | undefined;
  limit?: number | undefined;
}

// Enhanced query options with semantic and token filtering
export interface EnhancedQueryOptions extends QueryOptions {
  contextType?: string;
  hasEmbedding?: boolean;
  tags?: string[];
  minTokenCount?: number;
  maxTokenCount?: number;
  includeRelationships?: boolean;
  sortBy?: 'created' | 'updated' | 'accessed' | 'tokenCount' | 'accessCount';
  sortOrder?: 'asc' | 'desc';
}

export interface IDatabaseHandler {
  storeContext(key: string, value: unknown, type?: string): Promise<void>;
  getContext(key: string): Promise<unknown | null>;
  deleteContext(key: string): Promise<boolean>;
  queryContext(options: QueryOptions): Promise<ContextItem[]>;
  backup(backupPath: string): Promise<void>;
  close(): void;

  // Raw SQL methods for smart path management
  executeQuery(sql: string, params: unknown[]): Promise<unknown[]>;
  executeCommand(sql: string, params: unknown[]): Promise<{ changes: number }>;
  getSingle(sql: string, params: unknown[]): Promise<unknown | null>;

  // Method to get the raw database instance
  getDatabase(): Database.Database;

  // Enhanced context methods
  storeEnhancedContext(entry: EnhancedContextEntry): Promise<void>;
  getEnhancedContext(key: string): Promise<EnhancedContextEntry | null>;
  queryEnhancedContext(options: EnhancedQueryOptions): Promise<EnhancedContextEntry[]>;

  // Token tracking methods
  createTokenBudget(sessionId: string, maxTokens?: number): Promise<TokenBudget>;
  getTokenBudget(sessionId: string): Promise<TokenBudget | null>;
  updateTokenUsage(sessionId: string, operation: string, tokensUsed: number, contextKey?: string): Promise<void>;
  getTokenUsageHistory(sessionId: string, limit?: number): Promise<TokenUsageEntry[]>;
  checkHandoffThreshold(sessionId: string): Promise<{ needsHandoff: boolean; remainingTokens: number }>;

  // Context relationship methods
  createRelationship(sourceKey: string, targetKey: string, relationshipType: string, strength?: number): Promise<void>;
  getRelationships(key: string): Promise<ContextRelationship[]>;
  deleteRelationship(sourceKey: string, targetKey: string, relationshipType: string): Promise<boolean>;
}
