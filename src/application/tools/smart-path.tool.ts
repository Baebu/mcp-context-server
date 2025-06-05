// Replace src/application/tools/smart-path.tool.ts with this fixed version

import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
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
        keys: z.array(z.string()).optional(), // This 'keys' is part of the definition object
        metadata: z.record(z.unknown()).optional()
      }),
      z.string() // Allows definition to be a JSON string
    ])
    .optional()
    .describe('Smart path definition object or JSON string'),
  /**
   * @deprecated Use `name` instead. This parameter is for backward compatibility.
   */
  path_name: z.string().optional().describe('Alias for name (backward compatibility)'),
  /**
   * @deprecated Use `definition.items` instead. This parameter is for backward compatibility.
   */
  context_keys: z.string().optional().describe('JSON array of context keys (backward compatibility)'),
  /**
   * @deprecated Use `definition.metadata.description` instead. This parameter is for backward compatibility.
   */
  description: z.string().optional().describe('Description (stored in metadata)'),
  /**
   * @deprecated This parameter is for backward compatibility and is no longer actively processed for logic.
   */
  steps: z.string().optional().describe('Legacy steps parameter (backward compatibility)')
});
type CreateSmartPathParams = z.infer<typeof createSmartPathSchema>;

interface DefinitionWithKeys {
  paths?: string[];
  query?: string;
  items?: string[];
  keys?: string[]; // This 'keys' is part of the definition object
  metadata?: Record<string, unknown>;
}

@injectable()
export class CreateSmartPathTool implements IMCPTool<CreateSmartPathParams> {
  // Added export
  name = 'create_smart_path';
  description = 'Create a smart path for efficient context bundling';
  schema = createSmartPathSchema; // This assignment is fine

  async execute(params: CreateSmartPathParams, context: ToolContext): Promise<ToolResult> {
    const smartPathManager = context.container.get('SmartPathManager') as ISmartPathManager;

    try {
      let name = params.name;
      let type = params.type;
      let definition: {
        paths?: string[];
        query?: string;
        items?: string[];
        metadata?: Record<string, unknown>;
      } = {};

      // Handle 'definition' parameter
      if (typeof params.definition === 'string') {
        try {
          definition = JSON.parse(params.definition) as DefinitionWithKeys;
        } catch (error) {
          throw new Error(`Invalid JSON in definition: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else if (params.definition && typeof params.definition === 'object') {
        definition = { ...params.definition };
      }

      // Backward compatibility for 'path_name'
      if (params.path_name && !name) {
        name = params.path_name;
        context.logger.warn("Using deprecated 'path_name' parameter. Please use 'name' instead.");
      }

      // Backward compatibility for 'steps'
      if (params.steps && (!definition.items || definition.items.length === 0)) {
        try {
          const steps = JSON.parse(params.steps);
          if (Array.isArray(steps)) {
            const items = steps.filter(step => step.action === 'get' && step.key).map(step => step.key);
            definition.items = items;
            type = type || 'item_bundle';
            context.logger.warn("Using deprecated 'steps' parameter. Please use 'definition.items' directly.");
          }
        } catch {
          /* If steps isn't valid JSON, ignore */
        }
      }

      // Backward compatibility for 'context_keys'
      if (params.context_keys && (!definition.items || definition.items.length === 0)) {
        try {
          const keys = JSON.parse(params.context_keys);
          if (Array.isArray(keys)) {
            definition.items = keys;
            if (!type) {
              type = 'item_bundle';
            }
            context.logger.warn("Using deprecated 'context_keys' parameter. Please use 'definition.items' instead.");
          }
        } catch {
          // If not a JSON array, treat as single key
          definition.items = [params.context_keys];
          if (!type) {
            type = 'item_bundle';
          }
          context.logger.warn("Using deprecated 'context_keys' parameter. Please use 'definition.items' instead.");
        }
      }

      // Handle 'keys' within definition object (if it was used as an alias for items)
      const definitionWithKeys = definition as DefinitionWithKeys;
      if (definitionWithKeys.keys && Array.isArray(definitionWithKeys.keys) && !definition.items) {
        definition.items = definitionWithKeys.keys;
        // Reconstruct definition to ensure 'items' is the canonical property
        definition = {
          paths: definitionWithKeys.paths,
          query: definitionWithKeys.query,
          items: definition.items,
          metadata: definitionWithKeys.metadata
        };
        context.logger.warn("Using deprecated 'definition.keys' property. Please use 'definition.items' instead.");
      }

      // Backward compatibility for 'description'
      if (params.description) {
        definition.metadata = { ...definition.metadata, description: params.description };
        context.logger.warn(
          "Using deprecated 'description' parameter. Please use 'definition.metadata.description' instead."
        );
      }

      // Determine type if not explicitly provided
      if (!type) {
        if (definition.items && Array.isArray(definition.items) && definition.items.length > 0) {
          type = 'item_bundle';
        } else if (definition.query) {
          type = 'query_template';
        } else if (definition.paths && Array.isArray(definition.paths) && definition.paths.length > 0) {
          type = 'file_set';
        } else {
          // Default to item_bundle if no clear type is inferred and no items/query/paths
          type = 'item_bundle';
        }
      }

      if (!name) {
        throw new Error('Name is required for smart path');
      }
      if (!definition || (Object.keys(definition).length === 0 && !params.context_keys && !params.steps)) {
        throw new Error('Definition is required for smart path');
      }

      const id = await smartPathManager.create({ name, type, definition });
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

const executeSmartPathSchema = z.object({
  id: z.string().describe('ID of the smart path to execute'),
  params: z.record(z.unknown()).optional().describe('Parameters for the smart path')
});
type ExecuteSmartPathParams = z.infer<typeof executeSmartPathSchema>;

@injectable()
export class ExecuteSmartPathTool implements IMCPTool<ExecuteSmartPathParams> {
  // Added export
  name = 'execute_smart_path';
  description = 'Execute a smart path to retrieve bundled context';
  schema = executeSmartPathSchema; // This assignment is fine

  async execute(params: ExecuteSmartPathParams, context: ToolContext): Promise<ToolResult> {
    const smartPathManager = context.container.get('SmartPathManager') as ISmartPathManager;
    try {
      const result = await smartPathManager.execute(params.id, params.params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to execute smart path');
      throw error;
    }
  }
}

const listSmartPathsSchema = z.object({
  limit: z.number().describe('Maximum number of smart paths to return')
});
type ListSmartPathsParams = z.infer<typeof listSmartPathsSchema>;

@injectable()
export class ListSmartPathsTool implements IMCPTool<ListSmartPathsParams> {
  // Added export
  name = 'list_smart_paths';
  description = 'List all available smart paths';
  // Let TypeScript infer the type from the schema definition to avoid type incompatibility.
  schema = listSmartPathsSchema;

  async execute(params: ListSmartPathsParams, context: ToolContext): Promise<ToolResult> {
    const smartPathManager = context.container.get('SmartPathManager') as ISmartPathManager;
    try {
      const smartPaths = await smartPathManager.list();
      // Provide a default value for limit if not specified
      const limit = typeof params.limit === 'number' ? params.limit : 50;
      const limitedPaths = smartPaths.slice(0, limit);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ smart_paths: limitedPaths, total_count: smartPaths.length }, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to list smart paths');
      throw error;
    }
  }
}
