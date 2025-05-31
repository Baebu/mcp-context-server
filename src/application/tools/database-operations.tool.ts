import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '@core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '@core/interfaces/database.interface.js';

const storeContextSchema = z.object({
  key: z.string().describe('Unique key for the context item'),
  value: z.any().describe('Value to store (will be JSON serialized)'),
  type: z.string().optional().describe('Optional type hint for the value')
});

@injectable()
export class StoreContextTool implements IMCPTool {
  name = 'store_context';
  description = 'Store a context item in the database for later retrieval';
  schema = storeContextSchema;

  async execute(params: z.infer<typeof storeContextSchema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get('DatabaseHandler') as IDatabaseHandler;

    try {
      await db.storeContext(params.key, params.value, params.type);

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
            text: JSON.stringify(value, null, 2)
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
  limit: z.number().optional().default(100)
});

@injectable()
export class QueryContextTool implements IMCPTool {
  name = 'query_context';
  description = 'Query stored context items with filters';
  schema = queryContextSchema;

  async execute(params: z.infer<typeof queryContextSchema>, context: ToolContext): Promise<ToolResult> {
    const db = context.container.get('DatabaseHandler') as IDatabaseHandler;

    try {
      const items = await db.queryContext({
        type: params.type,
        keyPattern: params.pattern,
        limit: params.limit
      });

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
