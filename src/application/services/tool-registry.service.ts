import { injectable } from 'inversify';
import type { IToolRegistry, IMCPTool } from '../../core/interfaces/tool-registry.interface.js';
import { logger } from '../../utils/logger.js';

@injectable()
export class ToolRegistry implements IToolRegistry {
  private tools = new Map<string, IMCPTool>();

  register(tool: IMCPTool): void {
    this.tools.set(tool.name, tool);
    logger.debug({ toolName: tool.name }, 'Tool registered');
  }

  get(name: string): IMCPTool | undefined {
    return this.tools.get(name);
  }

  async getAllTools(): Promise<IMCPTool[]> {
    return Array.from(this.tools.values());
  }
}
