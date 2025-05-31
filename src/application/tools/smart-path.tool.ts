import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '@core/interfaces/tool-registry.interface.js';
import type { ISmartPathManager } from '@core/interfaces/smart-path.interface.js';

const createSmartPathSchema = z.object({
  name: z.string().describe('Name for the smart path'),
  type: z.enum(['item_bundle', 'query_template', 'file_set']),
  definition: z.object({
    paths: z.array(z.string()).optional(),
    query: z.string().optional(),
    items: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional()
  })
});

@injectable()
export class CreateSmartPathTool implements IMCPTool {
  name = 'create_smart_path';
  description = 'Create a smart path for efficient context bundling';
  schema = createSmartPathSchema;

  async execute(params: z.infer<typeof createSmartPathSchema>, context: ToolContext): Promise<ToolResult> {
    const smartPathManager = context.container.get('SmartPathManager') as ISmartPathManager;

    try {
      const id = await smartPathManager.create({
        name: params.name,
        type: params.type,
        definition: params.definition
      });

      return {
        content: [
          {
            type: 'text',
            text: `Smart path created with ID: ${id}`
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
  params: z.record(z.any()).optional().describe('Parameters for the smart path')
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
