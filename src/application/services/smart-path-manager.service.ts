import { injectable, inject } from 'inversify';
import { randomUUID } from 'node:crypto';
import type { ISmartPathManager, SmartPathDefinition, SmartPathResult } from '@core/interfaces/smart-path.interface.js';
import type { IDatabaseHandler } from '@core/interfaces/database.interface.js';
import type { IFilesystemHandler } from '@core/interfaces/filesystem.interface.js';
import { logger } from '@utils/logger.js';

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
  metadata?: Record<string, unknown>;
}

interface FileSetDefinition {
  paths?: string[];
  metadata?: Record<string, unknown>;
}

type SmartPathDefinitionUnion = ItemBundleDefinition | QueryTemplateDefinition | FileSetDefinition;

@injectable()
export class SmartPathManager implements ISmartPathManager {
  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler,
    @inject('FilesystemHandler') private filesystem: IFilesystemHandler
  ) {}

  async create(definition: SmartPathDefinition): Promise<string> {
    const id = randomUUID();

    await this.db.executeCommand(
      `
      INSERT INTO smart_paths (id, name, type, definition, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
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
  ): Promise<{ query: string; items: unknown[]; count: number }> {
    if (!definition.query) {
      throw new Error('Query template requires a query definition');
    }

    // Replace template variables in query
    let query = definition.query;
    for (const [key, value] of Object.entries(params)) {
      query = query.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }

    // Execute database query (simplified - in real implementation, parse and execute safely)
    const items = await this.db.queryContext({ keyPattern: query, limit: 100 });
    return { query, items, count: items.length };
  }

  private async executeFileSet(
    definition: FileSetDefinition,
    params: Record<string, unknown>
  ): Promise<{ files: Array<{ path: string; content: string; truncated: boolean; size: number }>; count: number }> {
    const files: Array<{ path: string; content: string; truncated: boolean; size: number }> = [];

    if (definition.paths) {
      for (const filePath of definition.paths) {
        try {
          // Replace template variables in path
          let resolvedPath = filePath;
          for (const [key, value] of Object.entries(params)) {
            resolvedPath = resolvedPath.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
          }

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
