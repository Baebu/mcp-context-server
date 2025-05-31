// Replace src/application/tools/smart-path.tool.ts with this fixed version

import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '@core/interfaces/tool-registry.interface.js';
import type { ISmartPathManager } from '@core/interfaces/smart-path.interface.js';

const createSmartPathSchema = z.object({
  name: z.string().describe('Name for the smart path'),
  type: z.enum(['item_bundle', 'query_template', 'file_set']).optional(),
  definition: z
    .union([
      z.object({
        paths: z.array(z.string()).optional(),
        query: z.string().optional(),
        items: z.array(z.string()).optional(),
        keys: z.array(z.string()).optional(), // Alias for items
        metadata: z.record(z.unknown()).optional()
      }),
      z.string() // JSON string that will be parsed
    ])
    .optional()
    .describe('Smart path definition object or JSON string'),
  // Backward compatibility fields
  path_name: z.string().optional().describe('Alias for name (backward compatibility)'),
  context_keys: z.string().optional().describe('JSON array of context keys (backward compatibility)'),
  description: z.string().optional().describe('Description (stored in metadata)'),
  steps: z.string().optional().describe('Legacy steps parameter (backward compatibility)')
});

// Type for definition that might include legacy 'keys' property
interface DefinitionWithKeys {
  paths?: string[];
  query?: string;
  items?: string[];
  keys?: string[]; // Legacy property
  metadata?: Record<string, unknown>;
}

@injectable()
export class CreateSmartPathTool implements IMCPTool {
  name = 'create_smart_path';
  description = 'Create a smart path for efficient context bundling';
  schema = createSmartPathSchema;

  async execute(params: z.infer<typeof createSmartPathSchema>, context: ToolContext): Promise<ToolResult> {
    const smartPathManager = context.container.get('SmartPathManager') as ISmartPathManager;

    try {
      // Handle backward compatibility
      let name = params.name;
      let type = params.type;

      // Initialize definition as a proper object
      let definition: {
        paths?: string[];
        query?: string;
        items?: string[];
        metadata?: Record<string, unknown>;
      } = {};

      // Parse definition if it's a string, otherwise use the object directly
      if (typeof params.definition === 'string') {
        try {
          definition = JSON.parse(params.definition) as DefinitionWithKeys;
        } catch (error) {
          throw new Error(`Invalid JSON in definition: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else if (params.definition && typeof params.definition === 'object') {
        definition = { ...params.definition };
      }

      // Map old parameter names
      if (params.path_name && !name) {
        name = params.path_name;
      }

      // Handle legacy steps parameter
      if (params.steps && (!definition.items || definition.items.length === 0)) {
        try {
          const steps = JSON.parse(params.steps);
          if (Array.isArray(steps)) {
            // Convert steps to items array
            const items = steps.filter(step => step.action === 'get' && step.key).map(step => step.key);
            definition.items = items;
            type = type || 'item_bundle';
          }
        } catch {
          // If steps isn't valid JSON, ignore
        }
      }

      // Handle context_keys parameter
      if (params.context_keys && (!definition.items || definition.items.length === 0)) {
        try {
          const keys = JSON.parse(params.context_keys);
          if (Array.isArray(keys)) {
            definition.items = keys;
            if (!type) {
              type = 'item_bundle';
            }
          }
        } catch {
          // If not JSON, treat as single key
          definition.items = [params.context_keys];
          if (!type) {
            type = 'item_bundle';
          }
        }
      }

      // Handle keys vs items (keys is an alias for items) - using type assertion
      const definitionWithKeys = definition as DefinitionWithKeys;
      if (definitionWithKeys.keys && Array.isArray(definitionWithKeys.keys) && !definition.items) {
        definition.items = definitionWithKeys.keys;
        // Clean up by creating a new object without the keys property
        definition = {
          paths: definitionWithKeys.paths,
          query: definitionWithKeys.query,
          items: definition.items,
          metadata: definitionWithKeys.metadata
        };
      }

      // Add description to metadata
      if (params.description) {
        definition.metadata = {
          ...definition.metadata,
          description: params.description
        };
      }

      // Auto-detect type if not provided
      if (!type) {
        if (definition.items && Array.isArray(definition.items)) {
          type = 'item_bundle';
        } else if (definition.query) {
          type = 'query_template';
        } else if (definition.paths && Array.isArray(definition.paths)) {
          type = 'file_set';
        } else {
          type = 'item_bundle'; // Default
        }
      }

      // Validate required fields
      if (!name) {
        throw new Error('Name is required for smart path');
      }
      if (!definition || Object.keys(definition).length === 0) {
        throw new Error('Definition is required for smart path');
      }

      const id = await smartPathManager.create({
        name,
        type,
        definition
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                smart_path_id: id,
                name,
                type,
                definition,
                message: `Smart path '${name}' created successfully`
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to create smart path');
      throw error;
    }
  }
}

// Keep the other tools the same...
const executeSmartPathSchema = z.object({
  id: z.string().describe('ID of the smart path to execute'),
  params: z.record(z.unknown()).optional().describe('Parameters for the smart path')
});

@injectable()
export class ExecuteSmartPathTool implements IMCPTool {
  name = 'execute_smart_path';
  description = 'Execute a smart path to retrieve bundled context';
  schema = executeSmartPathSchema;

  async execute(params: z.infer<typeof executeSmartPathSchema>, context: ToolContext): Promise<ToolResult> {
    const smartPathManager = context.container.get('SmartPathManager') as ISmartPathManager;

    try {
      const result = await smartPathManager.execute(params.id, params.params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to execute smart path');
      throw error;
    }
  }
}

const listSmartPathsSchema = z.object({
  limit: z.number().optional().default(50).describe('Maximum number of smart paths to return')
});

@injectable()
export class ListSmartPathsTool implements IMCPTool {
  name = 'list_smart_paths';
  description = 'List all available smart paths';
  schema = listSmartPathsSchema;

  async execute(params: z.infer<typeof listSmartPathsSchema>, context: ToolContext): Promise<ToolResult> {
    const smartPathManager = context.container.get('SmartPathManager') as ISmartPathManager;

    try {
      const smartPaths = await smartPathManager.list();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                smart_paths: smartPaths.slice(0, params.limit),
                total_count: smartPaths.length
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to list smart paths');
      throw error;
    }
  }
}
