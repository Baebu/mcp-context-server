// src/application/tools/database-operations.tool.ts
import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';

const storeContextSchema = z.object({
  key: z.string().describe('Unique key for the context item'),
  value: z.any().describe('Value to store (will be JSON serialized)'),
  type: z.string().optional().describe('Optional type hint for the value'),
  /**
   * @deprecated Use `value` instead. This parameter is for backward compatibility.
   */
  content: z.any().optional().describe('Alias for value (backward compatibility)'),
  /**
   * @deprecated Use `type` instead. This parameter is for backward compatibility.
   */
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
      // Prioritize new parameters, then fallback to deprecated ones
      let valueToStore = params.value;
      let typeToStore = params.type || 'generic';

      // Backward compatibility for 'content'
      if (valueToStore === undefined && params.content !== undefined) {
        valueToStore = params.content;
        context.logger.warn({ key: params.key }, "Using deprecated 'content' parameter. Please use 'value' instead.");
      }

      // Backward compatibility for 'metadata' influencing 'type'
      if (typeToStore === 'generic' && params.metadata) {
        try {
          const metadata = JSON.parse(params.metadata);
          if (metadata.type) {
            typeToStore = metadata.type;
            context.logger.warn(
              { key: params.key },
              "Using deprecated 'metadata' parameter for type. Please use 'type' directly."
            );
          }
          // If valueToStore is a string and metadata is parsed, merge them
          if (typeof valueToStore === 'string' && typeof metadata === 'object') {
            valueToStore = {
              content: valueToStore,
              metadata
            };
          }
        } catch {
          // If metadata isn't valid JSON, treat it as a string type
          typeToStore = params.metadata;
          context.logger.warn(
            { key: params.key },
            "Using deprecated 'metadata' parameter as type. Please use 'type' directly."
          );
        }
      }

      await db.storeContext(params.key, valueToStore, typeToStore);

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
  keyPattern: z.string().optional().describe('Key pattern to match'),
  limit: z.number().optional().default(100),
  /**
   * @deprecated Use `keyPattern` instead. This parameter is for backward compatibility.
   */
  pattern: z.string().optional().describe('Alias for keyPattern'),
  /**
   * @deprecated Use `type` and `keyPattern` directly. This parameter is for backward compatibility.
   */
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
          if (filters.type) {
            queryOptions.type = filters.type;
            context.logger.warn("Using deprecated 'filters' parameter for type. Please use 'type' directly.");
          }
          if (filters.pattern || filters.keyPattern) {
            queryOptions.keyPattern = filters.pattern || filters.keyPattern;
            context.logger.warn("Using deprecated 'filters' parameter for pattern. Please use 'keyPattern' directly.");
          }
        } catch (error) {
          context.logger.warn({ error }, "Failed to parse deprecated 'filters' parameter. Ignoring.");
        }
      }

      // Direct parameters take precedence
      if (params.type) {
        queryOptions.type = params.type;
      }
      // Prioritize keyPattern, then fallback to pattern
      if (params.keyPattern) {
        queryOptions.keyPattern = params.keyPattern;
      } else if (params.pattern) {
        queryOptions.keyPattern = params.pattern;
        context.logger.warn("Using deprecated 'pattern' parameter. Please use 'keyPattern' instead.");
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
