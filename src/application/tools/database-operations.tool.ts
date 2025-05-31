// src/application/tools/database-operations.tool.ts
import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '@core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '@core/interfaces/database.interface.js';

const storeContextSchema = z.object({
  key: z.string().describe('Unique key for the context item'),
  value: z.any().describe('Value to store (will be JSON serialized)'),
  type: z.string().optional().describe('Optional type hint for the value'),
  // Add backward compatibility
  content: z.any().optional().describe('Alias for value (backward compatibility)'),
  metadata: z.string().optional().describe('JSON metadata string (backward compatibility)')
});

@injectable()
export class StoreContextTool implements IMCPTool {
  name = 'store_context';
  description = 'Store a context item in the database for later retrieval';
  schema = storeContextSchema;

  async execute(params: z.infer<typeof storeContextSchema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get('DatabaseHandler') as IDatabaseHandler;

    try {
      // Handle backward compatibility
      let value = params.value;
      let type = params.type;

      // If using old parameter names, map them
      if (params.content !== undefined && params.value === undefined) {
        value = params.content;
      }

      if (params.metadata && !params.type) {
        try {
          const metadata = JSON.parse(params.metadata);
          type = metadata.type || 'generic';
          // Merge metadata into value if value is a string
          if (typeof value === 'string') {
            value = {
              content: value,
              metadata
            };
          }
        } catch {
          // If metadata isn't valid JSON, use as type
          type = params.metadata;
        }
      }

      await db.storeContext(params.key, value, type || 'generic');

      return {
        content: [
          {
            type: 'text',
            text: `Context stored successfully with key: ${params.key}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to store context');
      throw error;
    }
  }
}

const getContextSchema = z.object({
  key: z.string().describe('Key of the context item to retrieve')
});

@injectable()
export class GetContextTool implements IMCPTool {
  name = 'get_context';
  description = 'Retrieve a previously stored context item';
  schema = getContextSchema;

  async execute(params: z.infer<typeof getContextSchema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get('DatabaseHandler') as IDatabaseHandler;

    try {
      const value = await db.getContext(params.key);

      if (value === null) {
        return {
          content: [
            {
              type: 'text',
              text: `No context found for key: ${params.key}`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                key: params.key,
                value,
                retrieved_at: new Date().toISOString()
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to get context');
      throw error;
    }
  }
}

const queryContextSchema = z.object({
  type: z.string().optional().describe('Filter by type'),
  pattern: z.string().optional().describe('Key pattern to match'),
  keyPattern: z.string().optional().describe('Alias for pattern'),
  limit: z.number().optional().default(100),
  // Add backward compatibility for filters
  filters: z.string().optional().describe('JSON filters string (backward compatibility)')
});

@injectable()
export class QueryContextTool implements IMCPTool {
  name = 'query_context';
  description = 'Query stored context items with filters';
  schema = queryContextSchema;

  async execute(params: z.infer<typeof queryContextSchema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get('DatabaseHandler') as IDatabaseHandler;

    try {
      const queryOptions: { type?: string; keyPattern?: string; limit?: number } = {
        limit: params.limit
      };

      // Handle backward compatibility with filters parameter
      if (params.filters) {
        try {
          const filters = JSON.parse(params.filters);
          queryOptions.type = filters.type;
          queryOptions.keyPattern = filters.pattern || filters.keyPattern;
        } catch {
          // If filters isn't valid JSON, ignore
        }
      }

      // Direct parameters take precedence
      if (params.type) {
        queryOptions.type = params.type;
      }
      if (params.pattern) {
        queryOptions.keyPattern = params.pattern;
      }
      if (params.keyPattern) {
        queryOptions.keyPattern = params.keyPattern;
      }

      const items = await db.queryContext(queryOptions);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(items, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to query context');
      throw error;
    }
  }
}
