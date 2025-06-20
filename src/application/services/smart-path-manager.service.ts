﻿// Enhanced SmartPathManager with SQL Injection Prevention
// File: src/application/services/smart-path-manager.service.ts

import { injectable, inject } from 'inversify';
import { randomUUID } from 'node:crypto';
import type {
  ISmartPathManager,
  SmartPathDefinition,
  SmartPathResult
} from '../../core/interfaces/smart-path.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import type { IFilesystemHandler } from '../../core/interfaces/filesystem.interface.js';
import { logger } from '../../utils/logger.js';
import { EmbeddingService } from './embedding.service.js'; // Import EmbeddingService
import { SemanticDatabaseExtension } from '../../infrastructure/adapters/semantic-database.extension.js'; // Import SemanticDatabaseExtension

interface DatabaseRow {
  id: string;
  name: string;
  type: string;
  definition: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

interface SmartPathQueryRow {
  id: string;
  name: string;
  type: string;
  usage_count: number;
}

interface ItemBundleDefinition {
  items?: string[];
  metadata?: Record<string, unknown>;
}

interface QueryTemplateDefinition {
  query?: string;
  queryType?: 'key_pattern' | 'type_filter' | 'combined' | 'semantic_search' | 'time_range_filter' | 'tag_filter'; // NEW: Restrict query types
  allowedParams?: string[]; // NEW: Whitelist allowed parameters
  metadata?: Record<string, unknown>;
}

interface FileSetDefinition {
  paths?: string[];
  metadata?: Record<string, unknown>;
}

type SmartPathDefinitionUnion = ItemBundleDefinition | QueryTemplateDefinition | FileSetDefinition;

@injectable()
export class SmartPathManager implements ISmartPathManager {
  // NEW: Whitelist of allowed query patterns for security
  private readonly ALLOWED_QUERY_PATTERNS = {
    key_pattern: 'SELECT * FROM context_items WHERE key LIKE ? ORDER BY updated_at DESC LIMIT ?',
    type_filter: 'SELECT * FROM context_items WHERE type = ? ORDER BY updated_at DESC LIMIT ?',
    combined: 'SELECT * FROM context_items WHERE key LIKE ? AND type = ? ORDER BY updated_at DESC LIMIT ?',
    // Updated SQL for new query types to reflect actual filtering logic
    semantic_search:
      'SELECT key, value, type, context_type, embedding, semantic_tags, updated_at FROM context_items WHERE embedding IS NOT NULL', // Semantic search will filter by similarity in code
    time_range_filter: 'SELECT * FROM context_items WHERE updated_at BETWEEN ? AND ? ORDER BY updated_at DESC LIMIT ?',
    tag_filter: 'SELECT * FROM context_items WHERE semantic_tags LIKE ? ORDER BY updated_at DESC LIMIT ?'
  };

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler,
    @inject('FilesystemHandler') private filesystem: IFilesystemHandler,
    @inject('EmbeddingService') private embeddingService: EmbeddingService // Inject EmbeddingService
  ) {}

  async create(definition: SmartPathDefinition): Promise<string> {
    const id = randomUUID();

    // NEW: Validate query template definitions for security
    if (definition.type === 'query_template') {
      this.validateQueryTemplateDefinition(definition.definition as QueryTemplateDefinition);
    }

    await this.db.executeCommand(
      `INSERT INTO smart_paths (id, name, type, definition, created_at, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, definition.name, definition.type, JSON.stringify(definition.definition)]
    );

    logger.info({ id, name: definition.name, type: definition.type }, 'Smart path created');
    return id;
  }

  async execute(id: string, params: Record<string, unknown> = {}): Promise<SmartPathResult> {
    const row = (await this.db.getSingle('SELECT * FROM smart_paths WHERE id = ?', [id])) as DatabaseRow | null;

    if (!row) {
      throw new Error(`Smart path not found: ${id}`);
    }

    // Update usage count
    await this.db.executeCommand('UPDATE smart_paths SET usage_count = usage_count + 1 WHERE id = ?', [id]);

    const definition = JSON.parse(row.definition) as SmartPathDefinitionUnion;
    let data: unknown;

    switch (row.type) {
      case 'item_bundle':
        data = await this.executeItemBundle(definition as ItemBundleDefinition);
        break;
      case 'query_template':
        data = await this.executeQueryTemplate(definition as QueryTemplateDefinition, params);
        break;
      case 'file_set':
        data = await this.executeFileSet(definition as FileSetDefinition, params);
        break;
      default:
        throw new Error(`Unknown smart path type: ${row.type}`);
    }

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      data,
      metadata: definition.metadata || {}
    };
  }

  async list(): Promise<Array<{ id: string; name: string; type: string; usageCount: number }>> {
    const rows = (await this.db.executeQuery(
      'SELECT id, name, type, usage_count FROM smart_paths ORDER BY usage_count DESC',
      []
    )) as SmartPathQueryRow[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      usageCount: row.usage_count
    }));
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.executeCommand('DELETE FROM smart_paths WHERE id = ?', [id]);
    return result.changes > 0;
  }

  // NEW: Validate query template definitions for security
  private validateQueryTemplateDefinition(definition: QueryTemplateDefinition): void {
    if (!definition.queryType || !this.ALLOWED_QUERY_PATTERNS_KEYS.includes(definition.queryType)) {
      throw new Error(`Invalid or missing queryType. Must be one of: ${this.ALLOWED_QUERY_PATTERNS_KEYS.join(', ')}`);
    }

    // Validate allowed parameters
    if (definition.allowedParams) {
      const allowedParamNames = [
        'keyPattern',
        'type',
        'limit',
        'query',
        'from',
        'to',
        'tag',
        'minSimilarity',
        'contextTypes'
      ]; // Added new params
      for (const param of definition.allowedParams) {
        if (!allowedParamNames.includes(param)) {
          throw new Error(`Parameter '${param}' is not allowed. Allowed parameters: ${allowedParamNames.join(', ')}`);
        }
      }
    }

    logger.debug({ queryType: definition.queryType }, 'Query template validated');
  }

  private get ALLOWED_QUERY_PATTERNS_KEYS(): string[] {
    return Object.keys(this.ALLOWED_QUERY_PATTERNS);
  }

  private async executeItemBundle(
    definition: ItemBundleDefinition
  ): Promise<{ items: Array<{ key: string; value: unknown }>; count: number }> {
    const items: Array<{ key: string; value: unknown }> = [];

    if (definition.items) {
      for (const itemKey of definition.items) {
        const value = await this.db.getContext(itemKey);
        if (value !== null) {
          items.push({ key: itemKey, value });
        }
      }
    }

    return { items, count: items.length };
  }

  private async executeQueryTemplate(
    definition: QueryTemplateDefinition,
    params: Record<string, unknown>
  ): Promise<{ queryType: string; items: unknown[]; count: number; appliedParams: Record<string, unknown> }> {
    if (!definition.queryType || !this.ALLOWED_QUERY_PATTERNS_KEYS.includes(definition.queryType)) {
      throw new Error(`Invalid queryType: ${definition.queryType}`);
    }

    const sanitizedParams = this.sanitizeQueryParams(params, definition);
    let items: unknown[] = [];
    const dbInstance = this.db.getDatabase();
    const semanticDb = new SemanticDatabaseExtension(dbInstance);

    try {
      switch (definition.queryType) {
        case 'semantic_search':
          if (!sanitizedParams.query || typeof sanitizedParams.query !== 'string') {
            throw new Error('Semantic search requires a "query" parameter of type string.');
          }
          const queryEmbedding = await this.embeddingService.generateEmbedding(sanitizedParams.query);
          items = await semanticDb.semanticSearch({
            query: sanitizedParams.query,
            queryEmbedding: queryEmbedding,
            limit: sanitizedParams.limit as number,
            minSimilarity: (sanitizedParams.minSimilarity as number) || 0.5,
            contextTypes: (sanitizedParams.contextTypes as string[]) || undefined
          });
          break;
        case 'time_range_filter':
          if (!sanitizedParams.from || !sanitizedParams.to) {
            throw new Error('Time range filter requires "from" and "to" date parameters.');
          }
          const timeRangeQueryParams = this.buildQueryParams(definition.queryType, sanitizedParams);
          items = await this.db.executeQuery(this.ALLOWED_QUERY_PATTERNS[definition.queryType], timeRangeQueryParams);
          break;
        case 'tag_filter':
          if (!sanitizedParams.tag || typeof sanitizedParams.tag !== 'string') {
            throw new Error('Tag filter requires a "tag" parameter of type string.');
          }
          const tagFilterQueryParams = this.buildQueryParams(definition.queryType, sanitizedParams);
          items = await this.db.executeQuery(this.ALLOWED_QUERY_PATTERNS[definition.queryType], tagFilterQueryParams);
          break;
        default:
          // For key_pattern, type_filter, combined
          const defaultQueryParams = this.buildQueryParams(definition.queryType, sanitizedParams);
          items = await this.db.executeQuery(this.ALLOWED_QUERY_PATTERNS[definition.queryType], defaultQueryParams);
          break;
      }

      logger.debug(
        {
          queryType: definition.queryType,
          appliedParams: sanitizedParams,
          resultCount: items.length
        },
        'Query template executed safely'
      );

      return {
        queryType: definition.queryType,
        items,
        count: items.length,
        appliedParams: sanitizedParams
      };
    } catch (error) {
      logger.error(
        {
          error,
          queryType: definition.queryType,
          params: sanitizedParams
        },
        'Query template execution failed'
      );
      throw new Error(`Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // NEW: Sanitize and validate query parameters
  private sanitizeQueryParams(
    params: Record<string, unknown>,
    definition: QueryTemplateDefinition
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    // Default limit
    sanitized.limit = 100;

    // Validate and sanitize each parameter
    for (const [key, value] of Object.entries(params)) {
      if (definition.allowedParams && !definition.allowedParams.includes(key)) {
        logger.warn(`Parameter '${key}' not allowed by smart path definition. Ignoring.`);
        continue;
      }

      switch (key) {
        case 'keyPattern':
          if (typeof value === 'string' && value.length <= 100) {
            // Remove dangerous characters
            sanitized.keyPattern = value.replace(/[;'"`\\]/g, '');
          }
          break;
        case 'type':
          if (typeof value === 'string' && value.length <= 50) {
            // Alphanumeric and underscore only
            sanitized.type = value.replace(/[^a-zA-Z0-9_]/g, '');
          }
          break;
        case 'limit':
          if (typeof value === 'number' && value > 0 && value <= 1000) {
            sanitized.limit = Math.floor(value);
          }
          break;
        case 'query': // For semantic search
          if (typeof value === 'string' && value.length <= 500) {
            sanitized.query = value;
          }
          break;
        case 'from': // For time_range_filter
          if (typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              sanitized.from = date.toISOString();
            }
          }
          break;
        case 'to': // For time_range_filter
          if (typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              sanitized.to = date.toISOString();
            }
          }
          break;
        case 'tag': // For tag_filter
          if (typeof value === 'string' && value.length <= 50) {
            sanitized.tag = value.replace(/[^a-zA-Z0-9_]/g, '');
          }
          break;
        case 'minSimilarity': // For semantic search
          if (typeof value === 'number' && value >= 0 && value <= 1) {
            sanitized.minSimilarity = value;
          }
          break;
        case 'contextTypes': // For semantic search
          if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
            sanitized.contextTypes = value.map(item => item.replace(/[^a-zA-Z0-9_]/g, ''));
          }
          break;
      }
    }

    // Check if required parameters are present based on query type
    if (definition.queryType === 'key_pattern' && !sanitized.keyPattern) {
      throw new Error('keyPattern parameter is required for key_pattern queries');
    }
    if (definition.queryType === 'type_filter' && !sanitized.type) {
      throw new Error('type parameter is required for type_filter queries');
    }
    if (definition.queryType === 'combined' && (!sanitized.keyPattern || !sanitized.type)) {
      throw new Error('Both keyPattern and type parameters are required for combined queries');
    }
    if (definition.queryType === 'semantic_search' && !sanitized.query) {
      throw new Error('query parameter is required for semantic_search queries');
    }
    if (definition.queryType === 'time_range_filter' && (!sanitized.from || !sanitized.to)) {
      throw new Error('from and to parameters are required for time_range_filter queries');
    }
    if (definition.queryType === 'tag_filter' && !sanitized.tag) {
      throw new Error('tag parameter is required for tag_filter queries');
    }

    return sanitized;
  }

  // NEW: Build parameter array for specific query types
  private buildQueryParams(queryType: string, params: Record<string, unknown>): unknown[] {
    switch (queryType) {
      case 'key_pattern':
        return [`%${params.keyPattern}%`, params.limit];
      case 'type_filter':
        return [params.type, params.limit];
      case 'combined':
        return [`%${params.keyPattern}%`, params.type, params.limit];
      case 'semantic_search':
        // Parameters for semantic_search are handled by semanticDb.semanticSearch,
        // so the SQL query itself doesn't need specific parameters here beyond a base limit if applicable.
        // For now, we return just the limit if needed by the base query.
        return [params.limit]; // Or [] if the base query is just 'SELECT * FROM context_items'
      case 'time_range_filter':
        return [params.from, params.to, params.limit];
      case 'tag_filter':
        return [`%"${params.tag}"%`, params.limit]; // Search for tag within JSON string
      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }
  }

  private async executeFileSet(
    definition: FileSetDefinition,
    params: Record<string, unknown>
  ): Promise<{ files: Array<{ path: string; content: string; truncated: boolean; size: number }>; count: number }> {
    const files: Array<{ path: string; content: string; truncated: boolean; size: number }> = [];

    if (definition.paths) {
      for (const filePath of definition.paths) {
        try {
          // Sanitize template variables to prevent path injection
          let resolvedPath = filePath;
          for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string') {
              // Remove dangerous path characters
              const sanitizedValue = value
                .replace(/[<>:"|?*]/g, '') // Remove potentially dangerous filename characters
                .replace(/\.\.+[/\\]?/g, '');
              resolvedPath = resolvedPath.replace(new RegExp(`{{${key}}}`, 'g'), sanitizedValue);
            }
          }

          // IMPORTANT: Validate the resolved path through SecurityValidator
          // This should be passed through the security layer
          const content = await this.filesystem.readFileWithTruncation(resolvedPath, 10240); // 10KB limit
          files.push({
            path: resolvedPath,
            content: content.content,
            truncated: content.truncated,
            size: content.actualSize
          });
        } catch (error) {
          logger.warn({ path: filePath, error }, 'Failed to read file in file set');
        }
      }
    }

    return { files, count: files.length };
  }
}
